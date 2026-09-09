import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService, RuntimeConfigError } from '../services/runtimeAgentConfig';
import {
  getKnowledgeService,
  callSessionService,
  leadService,
  appointmentService,
  phoneNumberService,
} from '../services';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'internal-routes' });
const router = Router();

// Apply internal worker authentication to all /api/internal routes
router.use(authenticateWorkerSecret);

/**
 * GET /api/internal/runtime-config/:deploymentId
 * 
 * Internal control-plane endpoint for resolving RuntimeAgentConfig for a deployment.
 * Authoritative tenant context is derived directly from the database deployment relationship.
 */
router.get('/runtime-config/:deploymentId', async (req: Request, res: Response): Promise<void> => {
  const { deploymentId } = req.params;

  if (!deploymentId) {
    res.status(400).json({ error: 'Deployment ID is required', code: 'RUNTIME_CONFIG_CONFIG_INVALID' });
    return;
  }

  try {
    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId);
    res.json(runtimeConfig);
  } catch (error: any) {
    if (error instanceof RuntimeConfigError) {
      switch (error.code) {
        case 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(404).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE':
        case 'RUNTIME_CONFIG_AGENT_INVALID':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(409).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_VERSION_INVALID':
        case 'RUNTIME_CONFIG_CONFIG_INVALID':
          logger.error({ deploymentId, code: error.code }, error.message);
          res.status(400).json({ error: error.message, code: error.code });
          return;
      }
    }

    logger.error({ deploymentId, err: error }, 'Unexpected internal error resolving runtime configuration');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const retrieveKnowledgeSchema = z.object({
  deploymentId: z.string().uuid('Invalid deployment ID: Must be a valid UUID'),
  query: z.string().trim().min(1, 'Query must not be empty').max(5000, 'Query exceeds maximum length of 5000 characters'),
  topK: z.number().int('topK must be an integer').positive('topK must be positive').max(50, 'topK cannot exceed 50').optional(),
});

/**
 * POST /api/internal/knowledge/retrieve
 * 
 * Internal control-plane endpoint for querying knowledge retrieval on behalf of a voice agent session.
 * Derives authoritative tenantId and agentId strictly from the validated deploymentId.
 */
router.post('/knowledge/retrieve', async (req: Request, res: Response): Promise<void> => {
  const parseResult = retrieveKnowledgeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { deploymentId, query, topK } = parseResult.data;

  try {
    // 1. Authoritatively resolve runtime configuration & deployment metadata
    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId);

    // 2. Check if knowledge is enabled for this agent
    if (!runtimeConfig.knowledge?.enabled) {
      res.json({ results: [] });
      return;
    }

    // 3. Resolve effective topK from request or runtime configuration (defaulting to 5)
    const effectiveTopK = topK ?? runtimeConfig.knowledge.retrievalConfig?.topK ?? 5;
    const scoreThreshold = runtimeConfig.knowledge.retrievalConfig?.scoreThreshold;

    // 4. Retrieve relevant knowledge strictly within the tenant & agent boundary
    const knowledgeService = getKnowledgeService();
    let results = await knowledgeService.retrieveRelevant(
      runtimeConfig.tenant.tenantId,
      runtimeConfig.agent.agentId,
      query,
      effectiveTopK,
    );

    // 5. Apply score threshold filter if configured
    if (typeof scoreThreshold === 'number') {
      results = results.filter((r) => r.score >= scoreThreshold);
    }

    res.json({
      results: results.map((r) => ({
        content: r.content,
        score: r.score,
        sourceId: r.sourceId,
      })),
    });
  } catch (error: any) {
    if (error instanceof RuntimeConfigError) {
      switch (error.code) {
        case 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(404).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE':
        case 'RUNTIME_CONFIG_AGENT_INVALID':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(409).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_VERSION_INVALID':
        case 'RUNTIME_CONFIG_CONFIG_INVALID':
          logger.error({ deploymentId, code: error.code }, error.message);
          res.status(400).json({ error: error.message, code: error.code });
          return;
      }
    }

    logger.error({ deploymentId, err: error }, 'Unexpected internal error retrieving knowledge');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// Module 1A: Internal Persistence Endpoints
// ==========================================

const createCallSessionSchema = z.object({
  tenantId: z.string().uuid('Invalid tenantId: Must be a valid UUID'),
  agentId: z.string().uuid('Invalid agentId: Must be a valid UUID'),
  deploymentId: z.string().uuid('Invalid deploymentId: Must be a valid UUID'),
  roomName: z.string().min(1, 'Room name is required').max(255),
  callerNumber: z.string().max(50).nullable().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'WEB_TEST']).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'FAILED', 'MISSED']).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  primaryLanguage: z.string().max(50).optional(),
  startedAt: z.union([z.string().datetime(), z.string(), z.date()]).optional(),
  endedAt: z.union([z.string().datetime(), z.string(), z.date()]).nullable().optional(),
  transcriptText: z.string().nullable().optional(),
  turnsJson: z.any().optional(),
  toolsUsed: z.any().optional(),
  metricsJson: z.any().optional(),
});

/**
 * POST /api/internal/call-sessions
 * Persist or create a new call session record.
 */
router.post('/call-sessions', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createCallSessionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const session = await callSessionService.createCallSession(parseResult.data as any);
    res.status(201).json(session);
  } catch (error: any) {
    logger.error({ err: error }, 'Error creating call session');
    res.status(400).json({ error: error.message || 'Failed to create call session' });
  }
});

const updateCallSessionSchema = z.object({
  tenantId: z.string().uuid('Invalid tenantId: Must be a valid UUID'),
  status: z.enum(['ACTIVE', 'COMPLETED', 'FAILED', 'MISSED']).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  primaryLanguage: z.string().max(50).optional(),
  endedAt: z.union([z.string().datetime(), z.string(), z.date()]).nullable().optional(),
  transcriptText: z.string().nullable().optional(),
  turnsJson: z.any().optional(),
  toolsUsed: z.any().optional(),
  metricsJson: z.any().optional(),
});

/**
 * PATCH /api/internal/call-sessions/:id
 * Update an existing call session upon completion or state transition.
 */
router.patch('/call-sessions/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const parseResult = updateCallSessionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const { tenantId, ...updates } = parseResult.data;
    const session = await callSessionService.updateCallSession(id, tenantId, updates as any);
    res.json(session);
  } catch (error: any) {
    logger.error({ sessionId: id, err: error }, 'Error updating call session');
    res.status(400).json({ error: error.message || 'Failed to update call session' });
  }
});

const createLeadSchema = z
  .object({
    deploymentId: z.string().uuid('Invalid deploymentId: Must be a valid UUID').optional(),
    tenantId: z.string().uuid('Invalid tenantId: Must be a valid UUID').optional(),
    agentId: z.string().uuid('Invalid agentId: Must be a valid UUID').optional(),
    callSessionId: z.string().uuid('Invalid callSessionId: Must be a valid UUID').nullable().optional(),
    customerName: z.string().trim().min(1, 'Customer name is required').max(255),
    customerPhone: z.string().trim().min(1, 'Customer phone is required').max(50),
    customerEmail: z.string().trim().email('Invalid email address').max(255).nullable().optional().or(z.literal('')),
    interestCategory: z.string().trim().max(255).nullable().optional(),
    status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED']).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
  })
  .refine((data) => Boolean(data.deploymentId || (data.tenantId && data.agentId)), {
    message: 'Either deploymentId or both tenantId and agentId must be provided',
    path: ['deploymentId'],
  });

/**
 * POST /api/internal/leads
 * Create a generic industry-neutral lead.
 * Derives authoritative tenantId and agentId from deploymentId when provided.
 */
router.post('/leads', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createLeadSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { deploymentId, tenantId: bodyTenantId, agentId: bodyAgentId, ...rest } = parseResult.data;

  try {
    let effectiveTenantId = bodyTenantId;
    let effectiveAgentId = bodyAgentId;

    // If deploymentId is provided, authoritatively derive tenantId and agentId from deployment relationship
    if (deploymentId) {
      const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId);
      effectiveTenantId = runtimeConfig.tenant.tenantId;
      effectiveAgentId = runtimeConfig.agent.agentId;
    }

    if (!effectiveTenantId || !effectiveAgentId) {
      res.status(400).json({ error: 'Tenant and agent could not be determined for lead creation' });
      return;
    }

    const lead = await leadService.createLead({
      tenantId: effectiveTenantId,
      agentId: effectiveAgentId,
      ...rest,
      status: rest.status || 'NEW',
    });

    res.status(201).json(lead);
  } catch (error: any) {
    if (error instanceof RuntimeConfigError) {
      switch (error.code) {
        case 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(404).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE':
        case 'RUNTIME_CONFIG_AGENT_INVALID':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(409).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_VERSION_INVALID':
        case 'RUNTIME_CONFIG_CONFIG_INVALID':
          logger.error({ deploymentId, code: error.code }, error.message);
          res.status(400).json({ error: error.message, code: error.code });
          return;
      }
    }

    logger.error({ err: error }, 'Error creating lead');
    res.status(400).json({ error: error.message || 'Failed to create lead' });
  }
});

const createAppointmentSchema = z
  .object({
    deploymentId: z.string().uuid('Invalid deploymentId: Must be a valid UUID').optional(),
    tenantId: z.string().uuid('Invalid tenantId: Must be a valid UUID').optional(),
    agentId: z.string().uuid('Invalid agentId: Must be a valid UUID').optional(),
    callSessionId: z.string().uuid('Invalid callSessionId: Must be a valid UUID').nullable().optional(),
    customerName: z.string().trim().min(1, 'Customer name is required').max(255),
    customerPhone: z.string().trim().min(1, 'Customer phone is required').max(50),
    title: z.string().trim().min(1, 'Title is required').max(255),
    resourceName: z.string().trim().max(255).nullable().optional(),
    bookingDate: z.string().trim().min(1, 'Booking date is required').max(50),
    bookingTime: z.string().trim().min(1, 'Booking time is required').max(50),
    appointmentNumber: z.string().trim().max(50).optional(),
    status: z.enum(['REQUESTED', 'CONFIRMED', 'CANCELLED']).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
  })
  .refine((data) => Boolean(data.deploymentId || (data.tenantId && data.agentId)), {
    message: 'Either deploymentId or both tenantId and agentId must be provided',
    path: ['deploymentId'],
  });

/**
 * POST /api/internal/appointments
 * Create a generic business booking/appointment.
 * Derives authoritative tenantId and agentId from deploymentId when provided.
 */
router.post('/appointments', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createAppointmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { deploymentId, tenantId: bodyTenantId, agentId: bodyAgentId, ...rest } = parseResult.data;

  try {
    let effectiveTenantId = bodyTenantId;
    let effectiveAgentId = bodyAgentId;

    // If deploymentId is provided, authoritatively derive tenantId and agentId from deployment relationship
    if (deploymentId) {
      const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId);
      effectiveTenantId = runtimeConfig.tenant.tenantId;
      effectiveAgentId = runtimeConfig.agent.agentId;
    }

    if (!effectiveTenantId || !effectiveAgentId) {
      res.status(400).json({ error: 'Tenant and agent could not be determined for appointment creation' });
      return;
    }

    const appointment = await appointmentService.createAppointment({
      tenantId: effectiveTenantId,
      agentId: effectiveAgentId,
      ...rest,
      status: rest.status || 'REQUESTED',
    });

    res.status(201).json(appointment);
  } catch (error: any) {
    if (error instanceof RuntimeConfigError) {
      switch (error.code) {
        case 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(404).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE':
        case 'RUNTIME_CONFIG_AGENT_INVALID':
          logger.warn({ deploymentId, code: error.code }, error.message);
          res.status(409).json({ error: error.message, code: error.code });
          return;

        case 'RUNTIME_CONFIG_VERSION_INVALID':
        case 'RUNTIME_CONFIG_CONFIG_INVALID':
          logger.error({ deploymentId, code: error.code }, error.message);
          res.status(400).json({ error: error.message, code: error.code });
          return;
      }
    }

    logger.error({ err: error }, 'Error creating appointment');
    res.status(400).json({ error: error.message || 'Failed to create appointment' });
  }
});

/**
 * GET /api/internal/phone-numbers/lookup
 * Look up tenant and routing metadata for a given phone number.
 */
router.get('/phone-numbers/lookup', async (req: Request, res: Response): Promise<void> => {
  const phoneNumber = req.query.phoneNumber as string;
  if (!phoneNumber) {
    res.status(400).json({ error: 'Query parameter phoneNumber is required' });
    return;
  }

  try {
    const record = await phoneNumberService.lookupPhoneNumber(phoneNumber);
    if (!record) {
      res.status(404).json({ error: `Phone number ${phoneNumber} not found` });
      return;
    }

    res.json(record);
  } catch (error: any) {
    logger.error({ phoneNumber, err: error }, 'Error looking up phone number');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const createPhoneNumberSchema = z.object({
  tenantId: z.string().uuid('Invalid tenantId: Must be a valid UUID'),
  agentId: z.string().uuid('Invalid agentId: Must be a valid UUID').nullable().optional(),
  deploymentId: z.string().uuid('Invalid deploymentId: Must be a valid UUID').nullable().optional(),
  phoneNumber: z.string().min(1, 'Phone number is required').max(50),
  provider: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
});

/**
 * POST /api/internal/phone-numbers
 * Provision or register a phone number for a tenant.
 */
router.post('/phone-numbers', async (req: Request, res: Response): Promise<void> => {
  const parseResult = createPhoneNumberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const record = await phoneNumberService.createPhoneNumber(parseResult.data as any);
    res.status(201).json(record);
  } catch (error: any) {
    logger.error({ err: error }, 'Error creating phone number');
    res.status(400).json({ error: error.message || 'Failed to create phone number' });
  }
});

export default router;

