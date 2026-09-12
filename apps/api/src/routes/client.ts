import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { tenants, users, subscriptions, agents } from '../db/schema';
import { authenticateToken, requireRole, requireTenantContext } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  callSessionService,
  leadService,
  appointmentService,
  phoneNumberService,
  whatsAppService,
  followUpService,
  analyticsService,
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

/**
 * Helper middleware to restrict mutations to CLIENT_OWNER and ADMIN only.
 */
function requireMutationRole(req: Request, res: Response, next: () => void) {
  if (req.user?.role !== 'CLIENT_OWNER' && req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Permission denied: Read-only access for CLIENT_VIEWER' });
    return;
  }
  next();
}

const updateProfileSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
});

const updateLeadSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  customerPhone: z.string().min(1).max(50).optional(),
  customerEmail: z.string().email().optional().nullable(),
  interestCategory: z.string().max(255).optional().nullable(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED']).optional(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const updateAppointmentSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  customerPhone: z.string().min(1).max(50).optional(),
  title: z.string().min(1).max(255).optional(),
  resourceName: z.string().max(255).optional().nullable(),
  bookingDate: z.string().max(50).optional(),
  bookingTime: z.string().max(50).optional(),
  status: z.enum(['REQUESTED', 'CONFIRMED', 'CANCELLED']).optional(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const sendWhatsAppSchema = z.object({
  leadId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  callSessionId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().min(5).max(50),
  message: z.string().min(1).max(2000),
  messageType: z.enum(['APPOINTMENT_REQUEST', 'APPOINTMENT_CONFIRMATION', 'LEAD_CALLBACK', 'CUSTOM']).optional(),
  provider: z.enum(['DEMO', 'META', 'TWILIO']).optional(),
});

// ==========================================
// Profile Endpoints
// ==========================================

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
router.put('/profile', requireMutationRole, validate(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
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
// Calls Endpoints
// ==========================================

// GET /api/client/calls
router.get('/calls', async (req: Request, res: Response): Promise<void> => {
  try {
    let tenantId = resolveTenantId(req);
    if (!tenantId && req.user?.role === 'ADMIN' && req.query.agentId) {
      const [agent] = await db
        .select({ tenantId: agents.tenantId })
        .from(agents)
        .where(eq(agents.id, req.query.agentId as string))
        .limit(1);
      if (agent?.tenantId) {
        tenantId = agent.tenantId;
      }
    }

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
    let tenantId = resolveTenantId(req);
    const { id } = req.params;

    if (!tenantId && req.user?.role === 'ADMIN') {
      const existing = await db.query.callSessions.findFirst({
        where: eq(callSessions.id, id),
      });
      if (existing?.tenantId) {
        tenantId = existing.tenantId;
      }
    }

    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

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

// ==========================================
// Leads Endpoints
// ==========================================

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

// PATCH /api/client/leads/:id
router.patch('/leads/:id', requireMutationRole, validate(updateLeadSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const { id } = req.params;
    const updated = await leadService.updateLead(id, tenantId, req.body);
    res.json(updated);
  } catch (error: any) {
    logger.error({ err: error }, 'Error updating lead');
    res.status(500).json({ error: error.message || 'Failed to update lead' });
  }
});

// ==========================================
// Appointments Endpoints
// ==========================================

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

// PATCH /api/client/appointments/:id
router.patch('/appointments/:id', requireMutationRole, validate(updateAppointmentSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const { id } = req.params;
    const updated = await appointmentService.updateAppointment(id, tenantId, req.body);
    res.json(updated);
  } catch (error: any) {
    logger.error({ err: error }, 'Error updating appointment');
    res.status(500).json({ error: error.message || 'Failed to update appointment' });
  }
});

// ==========================================
// Phone Numbers & Agents Endpoints
// ==========================================

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

// GET /api/client/agents
router.get('/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const agentList = await db.query.agents.findMany({
      where: eq(agents.tenantId, tenantId),
      orderBy: [desc(agents.createdAt)],
      with: {
        template: {
          columns: { id: true, name: true, industry: true, description: true },
        },
        deployments: {
          orderBy: [desc(agents.createdAt)],
          limit: 1,
          columns: { id: true, environment: true, status: true, versionId: true, createdAt: true },
        },
        versions: {
          orderBy: [desc(agents.createdAt)],
          limit: 1,
          columns: { id: true, versionNumber: true, configuration: true, createdAt: true },
        },
      },
    });

    res.json({ agents: agentList });
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing client agents');
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ==========================================
// Follow-ups & WhatsApp Endpoints
// ==========================================

// GET /api/client/follow-ups
router.get('/follow-ups', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const status = req.query.status as string | undefined;
    const channel = req.query.channel as string | undefined;

    const result = await followUpService.listFollowUps(tenantId, {
      limit,
      offset,
      status,
      channel,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing follow-ups');
    res.status(500).json({ error: 'Failed to list follow-ups' });
  }
});

// GET /api/client/follow-ups/:id
router.get('/follow-ups/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const { id } = req.params;
    const record = await followUpService.getFollowUp(id, tenantId);
    if (!record) {
      res.status(404).json({ error: 'Follow-up not found' });
      return;
    }

    res.json(record);
  } catch (error: any) {
    logger.error({ err: error }, 'Error retrieving follow-up');
    res.status(500).json({ error: 'Failed to retrieve follow-up' });
  }
});

// POST /api/client/follow-ups/send-whatsapp
router.post(
  '/follow-ups/send-whatsapp',
  requireMutationRole,
  validate(sendWhatsAppSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        res.status(403).json({ error: 'No tenant context' });
        return;
      }

      const result = await whatsAppService.sendWhatsApp(tenantId, req.body);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error sending WhatsApp follow-up');
      res.status(500).json({ error: error.message || 'Failed to send WhatsApp follow-up' });
    }
  },
);

// ==========================================
// Analytics Endpoints
// ==========================================

// GET /api/client/analytics/overview
router.get('/analytics/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'No tenant context' });
      return;
    }

    const overview = await analyticsService.getOverview(tenantId);
    res.json(overview);
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching analytics overview');
    res.status(500).json({ error: 'Failed to retrieve analytics overview' });
  }
});

export default router;
