import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants, users, subscriptions } from '../db/schema';
import { authenticateToken, requireRole, requireTenantContext } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  callSessionService,
  leadService,
  appointmentService,
  phoneNumberService,
} from '../services';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'client-routes' });
const router = Router();

// All client routes require authentication and CLIENT or ADMIN role
router.use(authenticateToken);
router.use(requireRole('ADMIN', 'CLIENT_OWNER', 'CLIENT_VIEWER'));
router.use(requireTenantContext);

/**
 * Helper to resolve the authenticated tenant ID safely.
 * Non-admins are strictly bound to their token's tenantId.
 */
function resolveTenantId(req: Request): string | null {
  if (req.user?.role === 'ADMIN' && req.query.tenantId) {
    return req.query.tenantId as string;
  }
  return req.user?.tenantId || null;
}

const updateProfileSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
});

// GET /api/client/profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
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
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    // Only CLIENT_OWNER and ADMIN can update profile
    if (req.user?.role !== 'CLIENT_OWNER' && req.user?.role !== 'ADMIN') {
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

// ==========================================
// Module 1A: Client Read Endpoints
// ==========================================

// GET /api/client/calls
router.get('/calls', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const agentId = req.query.agentId as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await callSessionService.listCallSessions(tenantId, {
      limit,
      offset,
      agentId,
      status,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing call sessions');
    res.status(500).json({ error: 'Failed to list call sessions' });
  }
});

// GET /api/client/calls/:id
router.get('/calls/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const { id } = req.params;
    const session = await callSessionService.getCallSession(id, tenantId);
    if (!session) {
      res.status(404).json({ error: 'Call session not found' });
      return;
    }

    res.json(session);
  } catch (error: any) {
    logger.error({ err: error }, 'Error retrieving call session');
    res.status(500).json({ error: 'Failed to retrieve call session' });
  }
});

// GET /api/client/leads
router.get('/leads', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const agentId = req.query.agentId as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await leadService.listLeads(tenantId, {
      limit,
      offset,
      agentId,
      status,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing leads');
    res.status(500).json({ error: 'Failed to list leads' });
  }
});

// GET /api/client/leads/:id
router.get('/leads/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const { id } = req.params;
    const lead = await leadService.getLead(id, tenantId);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(lead);
  } catch (error: any) {
    logger.error({ err: error }, 'Error retrieving lead');
    res.status(500).json({ error: 'Failed to retrieve lead' });
  }
});

// GET /api/client/appointments
router.get('/appointments', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const agentId = req.query.agentId as string | undefined;
    const status = req.query.status as string | undefined;
    const bookingDate = req.query.bookingDate as string | undefined;

    const result = await appointmentService.listAppointments(tenantId, {
      limit,
      offset,
      agentId,
      status,
      bookingDate,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing appointments');
    res.status(500).json({ error: 'Failed to list appointments' });
  }
});

// GET /api/client/appointments/:id
router.get('/appointments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const { id } = req.params;
    const appointment = await appointmentService.getAppointment(id, tenantId);
    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json(appointment);
  } catch (error: any) {
    logger.error({ err: error }, 'Error retrieving appointment');
    res.status(500).json({ error: 'Failed to retrieve appointment' });
  }
});

// GET /api/client/phone-numbers
router.get('/phone-numbers', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const phoneNumbers = await phoneNumberService.listPhoneNumbers(tenantId);
    res.json({ phoneNumbers });
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing phone numbers');
    res.status(500).json({ error: 'Failed to list phone numbers' });
  }
});

export default router;
