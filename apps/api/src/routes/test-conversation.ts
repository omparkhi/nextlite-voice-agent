import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { tenants, agents, agentVersions } from '../db/schema';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createChildLogger } from '../lib/logger';
import { getTestConversationService } from '../services';
import type { AgentConfiguration } from '../services/template';
import type { TestMessage } from '../services/test-conversation';

const logger = createChildLogger({ module: 'test-conversation-routes' });
const router = Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const sendMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    knowledgeUsed: z.array(z.object({
      content: z.string(),
      score: z.number(),
      sourceId: z.string(),
    })).optional(),
  })).optional().default([]),
});

async function verifyClient(clientId: string): Promise<boolean> {
  const client = await db.query.tenants.findFirst({ where: eq(tenants.id, clientId) });
  return !!client;
}

async function getAgentConfig(agentId: string, tenantId: string): Promise<AgentConfiguration | null> {
  const agentResults = await db.select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)))
    .limit(1);

  if (agentResults.length === 0) return null;

  const versionResults = await db.select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, agentId))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(1);

  if (versionResults.length === 0) return null;

  return versionResults[0].configuration as AgentConfiguration;
}

router.post('/clients/:clientId/agents/:agentId/test', validate(sendMessageSchema), async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const config = await getAgentConfig(agentId, clientId);
    if (!config) {
      res.status(404).json({ error: 'Agent not found or no configuration' });
      return;
    }

    const { message, history } = req.body;
    const result = await getTestConversationService().sendMessage(
      clientId,
      agentId,
      message,
      history as TestMessage[],
      config,
    );

    res.json(result);
  } catch (error) {
    logger.error(error, 'Send test message error');
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

export default router;
