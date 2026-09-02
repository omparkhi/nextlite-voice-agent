import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants, users, subscriptions, verificationTokens } from '../db/schema';
import { hashPassword } from '../lib/password';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authRateLimit } from '../middleware/rateLimit';
import { createChildLogger } from '../lib/logger';
import { getEmailService } from '../services/email';
import { generateRefreshToken } from '../lib/tokens';

const logger = createChildLogger({ module: 'admin-routes' });
const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  businessName: z.string().min(1).max(255),
});

const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  businessName: z.string().min(1).max(255).optional(),
});

// POST /api/admin/clients
router.post('/clients', authRateLimit, validate(createClientSchema), async (req: Request, res: Response) => {
  try {
    const { name, email, businessName } = req.body;
    
    // Check if user with this email already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    
    if (existingUser) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }
    
    // Create unique tenant slug
    const baseSlug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'tenant';
    let slug = baseSlug;
    let counter = 1;
    while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    const now = new Date();
    const [tenant] = await db.insert(tenants).values({
      name: businessName,
      slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    // Create user with placeholder password (will be set during verification)
    const placeholderHash = await hashPassword('placeholder-password-change-me');
    const userNow = new Date();
    const [user] = await db.insert(users).values({
      tenantId: tenant.id,
      email,
      passwordHash: placeholderHash,
      role: 'CLIENT_OWNER',
      emailVerified: false,
      createdAt: userNow,
      updatedAt: userNow,
    }).returning();
    
    // Create subscription record
    const subNow = new Date();
    await db.insert(subscriptions).values({
      tenantId: tenant.id,
      status: 'PENDING',
      createdAt: subNow,
      updatedAt: subNow,
    });
    
    // Generate verification token
    const verificationToken = generateRefreshToken();
    const tokenNow = new Date();
    await db.insert(verificationTokens).values({
      userId: user.id,
      token: verificationToken,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: tokenNow,
    });
    
    // Send onboarding email
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    let emailSent = false;
    
    try {
      const emailService = getEmailService();
      await emailService.sendVerificationEmail(email, name, verificationLink);
      emailSent = true;
    } catch (error: any) {
      logger.error({ userId: user.id, error: error?.message || error }, 'Failed to send onboarding email');
      // Don't fail the request - client is created, email can be retried
    }
    
    logger.info({ tenantId: tenant.id, userId: user.id, emailSent }, 'Client created');
    
    res.status(201).json({
      id: tenant.id,
      name: businessName,
      email,
      status: tenant.status,
      createdAt: tenant.createdAt,
      emailSent,
      verificationLink,
    });
  } catch (error: any) {
    logger.error(error, 'Create client error');
    if (error?.code === '23505') {
      res.status(409).json({ error: 'A client with this email or business name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// GET /api/admin/clients
router.get('/clients', async (req: Request, res: Response) => {
  try {
    const clients = await db.query.tenants.findMany({
      with: {
        users: {
          columns: {
            id: true,
            email: true,
            role: true,
            emailVerified: true,
          },
        },
        subscriptions: {
          columns: {
            status: true,
            planName: true,
          },
        },
      },
    });
    
    res.json(clients);
  } catch (error) {
    logger.error(error, 'List clients error');
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

// GET /api/admin/clients/:id
router.get('/clients/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const client = await db.query.tenants.findFirst({
      where: eq(tenants.id, id),
      with: {
        users: {
          columns: {
            id: true,
            email: true,
            role: true,
            emailVerified: true,
            createdAt: true,
          },
        },
        subscriptions: {
          columns: {
            id: true,
            status: true,
            planName: true,
            currentPeriodEnd: true,
          },
        },
      },
    });
    
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    
    res.json(client);
  } catch (error) {
    logger.error(error, 'Get client error');
    res.status(500).json({ error: 'Failed to get client' });
  }
});

// PUT /api/admin/clients/:id
router.put('/clients/:id', validate(updateClientSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if client exists
    const client = await db.query.tenants.findFirst({
      where: eq(tenants.id, id),
    });
    
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    
    // Build update object for tenant
    const tenantUpdates: Record<string, unknown> = {};
    if (updates.businessName) {
      tenantUpdates.name = updates.businessName;
    }
    if (updates.status) {
      tenantUpdates.status = updates.status;
    }
    
    // Update tenant if needed
    if (Object.keys(tenantUpdates).length > 0) {
      tenantUpdates.updatedAt = new Date();
      await db.update(tenants)
        .set(tenantUpdates)
        .where(eq(tenants.id, id));
    }
    
    // Update user email if provided (requires re-verification)
    if (updates.email || updates.name) {
      const clientUser = await db.query.users.findFirst({
        where: eq(users.tenantId, id),
      });
      
      if (clientUser) {
        const userUpdates: Record<string, unknown> = {};
        if (updates.email && updates.email !== clientUser.email) {
          // Check if email is already taken
          const existingUser = await db.query.users.findFirst({
            where: eq(users.email, updates.email),
          });
          
          if (existingUser) {
            res.status(409).json({ error: 'Email already in use' });
            return;
          }
          
          userUpdates.email = updates.email;
          userUpdates.emailVerified = false;
          
          // Generate new verification token
          const verificationToken = generateRefreshToken();
          const verifyNow = new Date();
          await db.insert(verificationTokens).values({
            userId: clientUser.id,
            token: verificationToken,
            type: 'email_verification',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: verifyNow,
          });
          
          // Send verification email
          const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
          try {
            const emailService = getEmailService();
            await emailService.sendVerificationEmail(updates.email, updates.name || clientUser.email, verificationLink);
          } catch (error) {
            logger.error({ userId: clientUser.id }, 'Failed to send verification email');
          }
        }
        
        if (Object.keys(userUpdates).length > 0) {
          userUpdates.updatedAt = new Date();
          await db.update(users)
            .set(userUpdates)
            .where(eq(users.id, clientUser.id));
        }
      }
    }
    
    logger.info({ tenantId: id }, 'Client updated');
    
    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    logger.error(error, 'Update client error');
    res.status(500).json({ error: 'Failed to update client' });
  }
});

export default router;
