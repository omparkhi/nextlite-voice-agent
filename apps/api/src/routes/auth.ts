import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, refreshTokens, verificationTokens } from '../db/schema';
import { comparePassword, hashPassword } from '../lib/password';
import { generateTokenPair, generateAccessToken, verifyAccessToken, generateRefreshToken, getRefreshTokenExpiry } from '../lib/tokens';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginRateLimit, forgotPasswordRateLimit, authRateLimit } from '../middleware/rateLimit';
import { createChildLogger } from '../lib/logger';
import { getEmailService } from '../services/email';

const logger = createChildLogger({ module: 'auth-routes' });
const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

// POST /api/auth/login
router.post('/login', loginRateLimit, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    if (!user.emailVerified) {
      res.status(401).json({ error: 'Email not verified' });
      return;
    }
    
    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    const tokenPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER',
    };
    
    const { accessToken, refreshToken, expiresIn } = generateTokenPair(tokenPayload);
    
    // Store refresh token in database
    const tokenNow = new Date();
    await db.insert(refreshTokens).values({
      userId: user.id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
      createdAt: tokenNow,
    });
    
    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
    
    logger.info({ userId: user.id }, 'User logged in');
    
    res.json({ accessToken, expiresIn });
  } catch (error) {
    logger.error(error, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    
    if (refreshToken) {
      // Revoke refresh token from database
      await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
    }
    
    // Clear cookie
    res.clearCookie('refreshToken', { path: '/' });
    
    logger.info({ userId: req.user?.userId }, 'User logged out');
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error(error, 'Logout error');
    res.status(500).json({ error: 'Logout failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', authRateLimit, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }
    
    // Find refresh token in database
    const tokenRecord = await db.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.token, refreshToken),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    });
    
    if (!tokenRecord) {
      res.clearCookie('refreshToken', { path: '/' });
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }
    
    // Get user for token payload
    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenRecord.userId),
    });
    
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    
    // Generate new access token
    const tokenPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER',
    };
    
    const accessToken = generateAccessToken(tokenPayload);
    
    res.json({ accessToken, expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
  } catch (error) {
    logger.error(error, 'Token refresh error');
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'email_verification'),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    });
    
    if (!tokenRecord || tokenRecord.usedAt) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }
    
    res.json({ valid: true, userId: tokenRecord.userId });
  } catch (error) {
    logger.error(error, 'Email verification check error');
    res.status(500).json({ error: 'Verification check failed' });
  }
});

// POST /api/auth/set-password
router.post('/set-password', authRateLimit, validate(setPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    
    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'email_verification'),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    });
    
    if (!tokenRecord || tokenRecord.usedAt) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Update user: set password and mark email as verified
    await db.update(users)
      .set({
        passwordHash,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, tokenRecord.userId));
    
    // Mark token as used
    await db.update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));
    
    logger.info({ userId: tokenRecord.userId }, 'Password set and email verified');
    
    res.json({ message: 'Password set successfully' });
  } catch (error) {
    logger.error(error, 'Set password error');
    res.status(500).json({ error: 'Failed to set password' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPasswordRateLimit, validate(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    // Always return success to prevent email enumeration
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    
    if (user) {
      // Generate reset token
      const resetToken = generateRefreshToken();
      
      const resetNow = new Date();
      await db.insert(verificationTokens).values({
        userId: user.id,
        token: resetToken,
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        createdAt: resetNow,
      });
      
      // Send reset email
      const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
      
      try {
        const emailService = getEmailService();
        await emailService.sendPasswordResetEmail(user.email, resetLink);
      } catch (error) {
        logger.error({ userId: user.id }, 'Failed to send reset email');
        // Don't fail the request - token is still valid
      }
      
      logger.info({ userId: user.id }, 'Password reset token generated');
    }
    
    res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    logger.error(error, 'Forgot password error');
    res.status(500).json({ error: 'Password reset request failed' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authRateLimit, validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    
    const tokenRecord = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, token),
        eq(verificationTokens.type, 'password_reset'),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    });
    
    if (!tokenRecord || tokenRecord.usedAt) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }
    
    // Hash new password
    const passwordHash = await hashPassword(password);
    
    // Update password
    await db.update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, tokenRecord.userId));
    
    // Invalidate all refresh tokens for this user (security)
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, tokenRecord.userId));
    
    // Mark token as used
    await db.update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));
    
    logger.info({ userId: tokenRecord.userId }, 'Password reset completed');
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error(error, 'Reset password error');
    res.status(500).json({ error: 'Password reset failed' });
  }
});

export default router;
