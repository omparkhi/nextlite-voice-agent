import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants, users, subscriptions } from '../db/schema';
import { authenticateToken, requireRole, requireTenantContext } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'client-routes' });
const router = Router();

// All client routes require authentication and CLIENT role
router.use(authenticateToken);
router.use(requireRole('CLIENT_OWNER', 'CLIENT_VIEWER'));
router.use(requireTenantContext);

const updateProfileSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
});

// GET /api/client/profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }
    
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
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
    
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        createdAt: tenant.createdAt,
      },
      user: tenant.users[0] || null,
      subscription: tenant.subscriptions[0] || null,
    });
  } catch (error) {
    logger.error(error, 'Get profile error');
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PUT /api/client/profile
router.put('/profile', validate(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }
    
    // Only CLIENT_OWNER can update profile
    if (req.user?.role !== 'CLIENT_OWNER') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    const { businessName } = req.body;
    
    if (businessName) {
      await db.update(tenants)
        .set({
          name: businessName,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
    }
    
    logger.info({ tenantId }, 'Profile updated');
    
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    logger.error(error, 'Update profile error');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
