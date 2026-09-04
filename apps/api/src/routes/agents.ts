import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants } from '../db/schema';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createChildLogger } from '../lib/logger';
import { templateService } from '../services/template';
import { agentService } from '../services/agent';

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

const saveConfigSchema = z.object({
  configuration: z.object({
    identity: z.object({ name: z.string(), greeting: z.string() }),
    role: z.object({ description: z.string() }),
    goal: z.object({ primaryObjective: z.string() }),
    voice: z.object({ voiceId: z.string(), provider: z.string(), gender: z.enum(['male', 'female']).optional() }),
    language: z.object({ primary: z.string(), supported: z.array(z.string()) }),
    personality: z.object({ tone: z.string(), style: z.string(), formality: z.string() }),
    businessInformation: z.object({
      businessName: z.string(),
      businessType: z.string(),
      hours: z.string(),
      location: z.string(),
      description: z.string(),
    }),
    conversationRules: z.object({
      maxTurns: z.number(),
      greetingStyle: z.string(),
      fallbackBehavior: z.string(),
    }),
    appointmentRules: z.object({
      slotDuration: z.number(),
      bufferTime: z.number(),
      workingHours: z.string(),
      bookingRules: z.string(),
    }),
    leadRules: z.object({
      requiredFields: z.array(z.string()),
      qualificationCriteria: z.string(),
    }),
    escalationRules: z.object({
      triggerConditions: z.array(z.string()),
      transferNumber: z.string(),
      timeout: z.number(),
    }),
    systemInstructions: z.string(),
  }),
  notes: z.string().optional(),
});

// Helper: verify client exists
async function verifyClient(clientId: string): Promise<boolean> {
  const client = await db.query.tenants.findFirst({ where: eq(tenants.id, clientId) });
  return !!client;
}

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

// GET /api/admin/clients/:clientId/agents/:agentId/runtime-config
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

export default router;
