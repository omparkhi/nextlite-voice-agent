import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants } from '../db/schema';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createChildLogger } from '../lib/logger';
import { templateService, KNOWN_PLATFORM_TOOL_IDS } from '../services/template';
import { agentService } from '../services/agent';
import { livekitService, isValidE164 } from '../services/livekit';
import { plivoService } from '../services/plivo';
import { env } from '../config/env';
import { getPlatformToolCatalog } from '../services/toolCatalog';

const logger = createChildLogger({ module: 'agent-routes' });
const router = Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  templateId: z.string().uuid(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

export const inputVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional().default(''),
  description: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'phone', 'email', 'enum']).optional().default('string'),
  required: z.boolean().optional().default(false),
  defaultValue: z.unknown().optional(),
  source: z.enum(['STATIC', 'RUNTIME', 'CALLER', 'SYSTEM', 'INTEGRATION']).optional(),
  scope: z.enum(['CALL', 'TENANT', 'GLOBAL']).optional(),
  sensitive: z.boolean().optional(),
});

export const outputVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional().default(''),
  description: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'phone', 'email', 'enum']).optional().default('string'),
  required: z.boolean().optional().default(false),
  extractionStrategy: z.enum(['TURN', 'CALL_END', 'TOOL_RESULT', 'SYSTEM']).optional().default('CALL_END'),
  sensitive: z.boolean().optional(),
});

export const conversationPhaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  objective: z.string().optional().default(''),
  instructions: z.array(z.string()).optional(),
  requiredInformation: z.array(z.string()).optional(),
  optionalInformation: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
  completionCriteria: z.array(z.string()).optional(),
  transitionConditions: z.array(z.string()).optional(),
  failureBehavior: z.string().optional(),
  nextPhase: z.string().optional(),
});

export const agentConfigurationSchema = z.object({
  identity: z.object({
    displayName: z.string().optional(),
    agentName: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    greeting: z.string().min(1),
    introduction: z.string().optional(),
    businessName: z.string().optional(),
    avatar: z.string().optional(),
  }),
  persona: z.object({
    role: z.string().optional().default(''),
    personality: z.string().optional().default(''),
    tone: z.string().optional().default(''),
    style: z.string().optional().default(''),
    formality: z.enum(['formal', 'informal', 'mixed']).or(z.string()).optional().default('mixed'),
    aiIdentityBehavior: z.string().optional(),
  }).optional(),
  environment: z.object({
    situation: z.string().optional(),
    channel: z.enum(['voice', 'chat', 'omnichannel']).or(z.string()).optional(),
    audience: z.string().optional(),
    businessContext: z.string().optional(),
    callerContext: z.string().optional(),
  }).optional(),
  objective: z.object({
    primaryObjective: z.string().optional().default(''),
    secondaryObjectives: z.array(z.string()).optional(),
    successCriteria: z.array(z.string()).optional(),
    failureConditions: z.array(z.string()).optional(),
  }).optional(),
  speakingStyle: z.object({
    maxSentences: z.number().optional(),
    maxWords: z.number().optional(),
    oneQuestionAtATime: z.boolean().optional(),
    conciseResponses: z.boolean().optional(),
    fillerStyle: z.string().optional(),
    acknowledgementStyle: z.string().optional(),
    reaskStyle: z.string().optional(),
    avoidMarkdown: z.boolean().optional(),
    avoidSymbols: z.boolean().optional(),
    codeSwitchingStyle: z.string().optional(),
  }).optional(),
  businessInformation: z.object({
    businessName: z.string().optional().default(''),
    businessType: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    address: z.string().optional(),
    hours: z.string().optional(),
    timezone: z
      .string()
      .refine(
        (tz) => {
          if (!tz || tz.trim() === '') return true;
          try {
            Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
            return true;
          } catch {
            return false;
          }
        },
        {
          message: 'Invalid IANA timezone identifier',
        },
      )
      .optional(),
    contactInformation: z.string().optional(),
    customFacts: z.record(z.string(), z.unknown()).optional(),
  }).optional().default({ businessName: '' }),
  conversation: z.object({
    phases: z.array(conversationPhaseSchema).optional().default([]),
  }).optional(),
  businessRules: z.object({
    appointmentRules: z.record(z.string(), z.unknown()).optional(),
    leadRules: z.record(z.string(), z.unknown()).optional(),
    pricingRules: z.record(z.string(), z.unknown()).optional(),
    cancellationRules: z.record(z.string(), z.unknown()).optional(),
    customRules: z.array(z.string()).optional(),
  }).optional(),
  guardrails: z.object({
    prohibitedTopics: z.array(z.string()).optional(),
    prohibitedClaims: z.array(z.string()).optional(),
    hallucinationRules: z.array(z.string()).optional(),
    escalationRules: z.array(z.string()).optional(),
    emergencyRules: z.array(z.string()).optional(),
    humanHandoffRules: z.array(z.string()).optional(),
    competitorHandling: z.string().optional(),
    abuseHandling: z.string().optional(),
    fallbackBehavior: z.string().optional(),
  }).optional(),
  language: z.object({
    primary: z.string().min(1),
    supported: z.array(z.string()).optional().default([]),
    startingLanguage: z.string().optional(),
    autoDetect: z.boolean().optional(),
    languageSwitchEnabled: z.boolean().optional(),
    switchSensitivity: z.string().optional(),
    outputNumbersInIndic: z.boolean().optional(),
  }),
  voice: z.object({
    provider: z.string().min(1),
    voiceId: z.string().min(1),
    gender: z.enum(['male', 'female', 'neutral']).optional(),
    speakingSpeed: z.number().optional(),
    pitch: z.number().optional(),
    sttModel: z.string().optional(),
    ttsModel: z.string().optional(),
  }),
  runtimeSettings: z.object({
    modelProvider: z.string().optional(),
    llmModel: z.string().optional(),
    modelTemperature: z.number().min(0).max(2).optional(),
    allowCallerInterruptions: z.boolean().optional(),
    interruptionMode: z.enum(['adaptive', 'always', 'disabled']).or(z.string()).optional(),
    preemptiveGenerationEnabled: z.boolean().optional(),
    eagernessToRespond: z.enum(['low', 'medium', 'high']).or(z.string()).optional(),
    noiseCancellationModel: z.string().optional(),
    expressiveModeEnabled: z.boolean().optional(),
    volumeThreshold: z.number().optional(),
    backgroundSound: z.enum(['none', 'office', 'clinic', 'call_center']).or(z.string()).optional(),
    nudges: z.object({
      enabled: z.boolean(),
      delaySeconds: z.number(),
      messages: z.array(z.string()),
      maxUnansweredNudges: z.number(),
    }).optional(),
    voicemail: z.object({
      detectionEnabled: z.boolean(),
      message: z.string().optional(),
    }).optional(),
    maxCallLengthSeconds: z.number().optional(),
  }).optional(),
  variables: z.object({
    input: z.array(inputVariableSchema).optional().default([]),
    output: z.array(outputVariableSchema).optional().default([]),
  }).optional(),
  knowledge: z.object({
    enabled: z.boolean().optional().default(false),
    retrievalConfig: z.object({
      topK: z.number().int().positive().optional().default(3),
      similarityThreshold: z.number().min(0).max(1).optional(),
    }).optional(),
    attachedSourceIds: z.array(z.string()).optional(),
  }).optional(),
  tools: z.object({
    enabled: z.boolean().optional().default(false),
    bindings: z.array(
      z.object({
        toolId: z.string().refine((id) => (KNOWN_PLATFORM_TOOL_IDS as readonly string[]).includes(id), {
          message: 'Unknown platform tool ID',
        }),
        name: z.string().min(1),
        description: z.string(),
        enabled: z.boolean(),
        confirmationRequired: z.boolean().optional(),
      }).passthrough(),
    )
    .refine((bindings) => {
      const ids = bindings.map((b) => b.toolId);
      return new Set(ids).size === ids.length;
    }, {
      message: 'Duplicate toolId detected in tool bindings',
    })
    .optional()
    .default([]),
  }).optional(),

  // Backward compatibility legacy fields
  modelProvider: z.string().optional(),
  llmModel: z.string().optional(),
  role: z.object({ description: z.string() }).optional(),
  goal: z.object({ primaryObjective: z.string() }).optional(),
  personality: z.object({ tone: z.string(), style: z.string(), formality: z.string() }).optional(),
  conversationRules: z.object({ maxTurns: z.number(), greetingStyle: z.string(), fallbackBehavior: z.string() }).optional(),
  appointmentRules: z.object({ slotDuration: z.number(), bufferTime: z.number(), workingHours: z.string(), bookingRules: z.string() }).optional(),
  leadRules: z.object({ requiredFields: z.array(z.string()), qualificationCriteria: z.string() }).optional(),
  escalationRules: z.object({ triggerConditions: z.array(z.string()), transferNumber: z.string(), timeout: z.number() }).optional(),
  systemInstructions: z.string().optional(),
});

export const saveConfigSchema = z.object({
  configuration: agentConfigurationSchema,
  notes: z.string().optional(),
});

// Helper: verify client exists
async function verifyClient(clientId: string): Promise<boolean> {
  const client = await db.query.tenants.findFirst({ where: eq(tenants.id, clientId) });
  return !!client;
}

// GET /api/admin/tools (Platform Tool Catalog)
router.get('/tools', async (_req: Request, res: Response) => {
  try {
    const catalog = getPlatformToolCatalog();
    res.json(catalog);
  } catch (error) {
    logger.error(error, 'Get platform tool catalog error');
    res.status(500).json({ error: 'Failed to retrieve platform tool catalog' });
  }
});

// GET /api/admin/templates
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await templateService.listTemplates();
    res.json(templates);
  } catch (error) {
    logger.error(error, 'List templates error');
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/admin/templates/:id
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await templateService.getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (error) {
    logger.error(error, 'Get template error');
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// GET /api/admin/clients/:clientId/agents
router.get('/clients/:clientId/agents', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const agents = await agentService.listAgents(clientId);
    res.json(agents);
  } catch (error) {
    logger.error(error, 'List agents error');
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// POST /api/admin/clients/:clientId/agents
router.post('/clients/:clientId/agents', validate(createAgentSchema), async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const { name, templateId } = req.body;
    const agent = await agentService.createAgent(clientId, templateId, name, req.user!.userId);
    res.status(201).json(agent);
  } catch (error: any) {
    if (error?.message === 'Template not found') {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    logger.error(error, 'Create agent error');
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// GET /api/admin/clients/:clientId/agents/:agentId
router.get('/clients/:clientId/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    let agent = await agentService.getAgent(agentId, clientId);
    if (!agent) {
      const clientAgents = await agentService.listAgents(clientId);
      if (clientAgents.length > 0) {
        agent = await agentService.getAgent(clientAgents[0].id, clientId);
      }
    }
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error) {
    logger.error(error, 'Get agent error');
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// PUT /api/admin/clients/:clientId/agents/:agentId
router.put('/clients/:clientId/agents/:agentId', validate(updateAgentSchema), async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const agent = await agentService.updateAgent(agentId, clientId, req.body);
    res.json(agent);
  } catch (error: any) {
    if (error?.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    logger.error(error, 'Update agent error');
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// PUT /api/admin/clients/:clientId/agents/:agentId/config
router.put('/clients/:clientId/agents/:agentId/config', validate(saveConfigSchema), async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const { configuration, notes } = req.body;
    const version = await agentService.saveConfiguration(agentId, clientId, configuration, req.user!.userId, notes);
    res.json(version);
  } catch (error: any) {
    if (error?.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    logger.error(error, 'Save configuration error');
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// GET /api/admin/clients/:clientId/agents/:agentId/versions
router.get('/clients/:clientId/agents/:agentId/versions', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const versions = await agentService.getVersions(agentId, clientId);
    res.json(versions);
  } catch (error: any) {
    if (error?.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    logger.error(error, 'List versions error');
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// GET /api/admin/clients/:clientId/agents/:agentId/versions/:versionId
router.get('/clients/:clientId/agents/:agentId/versions/:versionId', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId, versionId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const version = await agentService.getVersion(versionId, agentId, clientId);
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(version);
  } catch (error) {
    logger.error(error, 'Get version error');
    res.status(500).json({ error: 'Failed to get version' });
  }
});

/**
 * @deprecated Legacy V1/V2 compatibility endpoint.
 *
 * NOTE: The production V3 voice agent worker does NOT use this route.
 * Authoritative V3 worker runtime configuration is resolved via the deployment-scoped
 * endpoint: GET /api/internal/runtime-config/:deploymentId
 *
 * This route is retained strictly for backward compatibility and should not be used
 * for production worker execution.
 *
 * GET /api/admin/clients/:clientId/agents/:agentId/runtime-config
 */
router.get('/clients/:clientId/agents/:agentId/runtime-config', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const runtimeConfig = await agentService.generateRuntimeConfig(agentId, clientId);
    if (!runtimeConfig) {
      res.status(404).json({ error: 'Agent not found or no configuration' });
      return;
    }
    res.json(runtimeConfig);
  } catch (error) {
    logger.error(error, 'Get runtime config error');
    res.status(500).json({ error: 'Failed to get runtime config' });
  }
});

// POST /api/admin/clients/:clientId/agents/:agentId/compile-prompt
router.post('/clients/:clientId/agents/:agentId/compile-prompt', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const config = req.body.configuration || (await agentService.getCurrentConfig(agentId, clientId));
    if (!config) {
      res.status(404).json({ error: 'Agent configuration not found' });
      return;
    }

    const { promptCompiler } = await import('../services/promptCompiler.js');
    const compiledPrompt = promptCompiler.compileAgentPrompt({ configuration: config });
    res.json({ compiledPrompt });
  } catch (error) {
    logger.error(error, 'Compile prompt preview error');
    res.status(500).json({ error: 'Failed to compile prompt preview' });
  }
});

// GET /api/admin/clients/:clientId/agents/:agentId/checklist
router.get('/clients/:clientId/agents/:agentId/checklist', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const config = await agentService.getCurrentConfig(agentId, clientId);
    if (!config) {
      res.status(404).json({ error: 'Agent configuration not found' });
      return;
    }

    const { agentChecklistService } = await import('../services/agentChecklist.js');
    const checklist = agentChecklistService.evaluateAgent(config as any);
    res.json(checklist);
  } catch (error) {
    logger.error(error, 'Get agent checklist error');
    res.status(500).json({ error: 'Failed to evaluate agent checklist' });
  }
});

// POST /api/admin/clients/:clientId/agents/:agentId/publish
router.post('/clients/:clientId/agents/:agentId/publish', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const result = await agentService.publishAgent(agentId, clientId, req.user!.userId);
    res.json({
      message: 'Agent published successfully',
      agent: result.agent,
      checklist: result.checklist,
      deployment: result.deployment,
    });
  } catch (error: any) {
    if (error?.message === 'Agent not found' || error?.message === 'No agent version available to publish') {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error?.checklist && !error.checklist.canPublish) {
      res.status(400).json({
        error: error.message || 'Cannot publish agent with critical validation errors',
        checklist: error.checklist,
      });
      return;
    }
    logger.error(error, 'Publish agent error');
    res.status(500).json({ error: 'Failed to publish agent' });
  }
});

// POST /api/admin/clients/:clientId/agents/:agentId/test-token
router.post('/clients/:clientId/agents/:agentId/test-token', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const result = await livekitService.createTestToken(agentId, clientId, req.user!.userId);
    res.json(result);
  } catch (error: any) {
    if (error?.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (error?.message === 'No active TEST deployment found for this agent') {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error?.message === 'LiveKit service is not configured' || error?.message === 'LiveKit credentials are not configured') {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error?.message === 'Failed to dispatch LiveKit agent worker' || error?.message === 'Failed to create LiveKit test room') {
      res.status(502).json({ error: error.message });
      return;
    }
    logger.error(error, 'Generate test token error');
    res.status(500).json({ error: 'Failed to generate test token' });
  }
});

const phoneTestSchema = z.object({
  phoneNumber: z.string().min(1).max(30),
});

// POST /api/admin/clients/:clientId/agents/:agentId/phone-test
router.post('/clients/:clientId/agents/:agentId/phone-test', validate(phoneTestSchema), async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    const { phoneNumber } = req.body;

    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const normalizedPhone = (phoneNumber || '').trim();
    if (!isValidE164(normalizedPhone)) {
      res.status(400).json({ error: 'Invalid phone number: Must be in E.164 format (e.g. +919876543210)' });
      return;
    }

    // Phase 8A: Pipecat Plivo Direct Outbound Path
    if (env.PIPECAT_URL) {
      const agent = await agentService.getAgent(agentId, clientId);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const testDeployment = await agentService.getActiveDeployment(agentId, clientId, 'TEST');
      if (!testDeployment) {
        res.status(400).json({ error: 'No active TEST deployment found for this agent' });
        return;
      }

      const answerUrl = `${env.PIPECAT_URL}/plivo/test-xml?deploymentId=${testDeployment.id}`;
      
      const result = await plivoService.createOutboundPhoneCall(normalizedPhone, answerUrl);
      
      res.json({
        success: true,
        callId: result.request_uuid,
        deploymentId: testDeployment.id,
      });
      return;
    }

    // Fallback: LiveKit SIP Outbound Path
    const result = await livekitService.createOutboundPhoneCall(agentId, clientId, phoneNumber);
    res.json(result);
  } catch (error: any) {
    if (error?.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (error?.message?.startsWith('Invalid phone number')) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error?.message === 'No active TEST deployment found for this agent') {
      res.status(400).json({ error: error.message });
      return;
    }
    if (
      error?.message === 'LiveKit service is not configured' ||
      error?.message === 'LiveKit credentials are not configured' ||
      error?.message === 'LiveKit SIP trunk is not configured' ||
      error?.message === 'Plivo credentials (PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN) are not configured' ||
      error?.message === 'Plivo AUTH_ID is required to create a call' ||
      error?.message === 'Plivo Caller ID is not configured (env.PLIVO_CALLER_ID)'
    ) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (
      error?.message === 'Failed to dispatch LiveKit agent worker' ||
      error?.message === 'Failed to create LiveKit room for phone test' ||
      error?.message === 'Failed to initiate SIP outbound call' ||
      error?.message === 'Failed to initiate outbound phone call.' ||
      error?.name === 'PlivoServiceError'
    ) {
      res.status(502).json({ error: error.message });
      return;
    }
    logger.error(error, 'Initiate outbound phone test error');
    res.status(500).json({ error: 'Failed to initiate phone test call' });
  }
});

export default router;

