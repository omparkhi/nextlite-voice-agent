import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants } from '../db/schema';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createChildLogger } from '../lib/logger';
import { getConfigAssistantService } from '../services';

const logger = createChildLogger({ module: 'config-assistant-routes' });
const router = Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const proposeSchema = z.object({
  message: z.string().min(1).max(2000),
});

async function verifyClient(clientId: string): Promise<boolean> {
  const client = await db.query.tenants.findFirst({ where: eq(tenants.id, clientId) });
  return !!client;
}

router.post('/clients/:clientId/agents/:agentId/config-assistant/propose', validate(proposeSchema), async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const { message } = req.body;
    const proposal = await getConfigAssistantService().proposeChange(
      clientId,
      agentId,
      req.user!.userId,
      message,
    );

    res.status(201).json(proposal);
  } catch (error: any) {
    if (error?.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (error?.name === 'ZodError') {
      res.status(400).json({ error: 'Invalid configuration proposed', details: error.errors });
      return;
    }
    logger.error(error, 'Propose config change error');
    res.status(500).json({ error: 'Failed to propose config change' });
  }
});

router.get('/clients/:clientId/agents/:agentId/config-assistant/proposals', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const proposals = await getConfigAssistantService().listProposals(clientId, agentId);
    res.json(proposals);
  } catch (error) {
    logger.error(error, 'List config proposals error');
    res.status(500).json({ error: 'Failed to list config proposals' });
  }
});

router.post('/clients/:clientId/agents/:agentId/config-assistant/proposals/:proposalId/approve', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId, proposalId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const result = await getConfigAssistantService().approve(
      clientId,
      agentId,
      proposalId,
      req.user!.userId,
    );

    res.json(result);
  } catch (error: any) {
    if (error?.message === 'Proposal not found') {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }
    if (error?.message === 'Proposal already reviewed') {
      res.status(409).json({ error: 'Proposal already reviewed' });
      return;
    }
    logger.error(error, 'Approve config proposal error');
    res.status(500).json({ error: 'Failed to approve config proposal' });
  }
});

router.post('/clients/:clientId/agents/:agentId/config-assistant/proposals/:proposalId/reject', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId, proposalId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    await getConfigAssistantService().reject(
      clientId,
      agentId,
      proposalId,
      req.user!.userId,
    );

    res.status(204).send();
  } catch (error: any) {
    if (error?.message === 'Proposal not found') {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }
    if (error?.message === 'Proposal already reviewed') {
      res.status(409).json({ error: 'Proposal already reviewed' });
      return;
    }
    logger.error(error, 'Reject config proposal error');
    res.status(500).json({ error: 'Failed to reject config proposal' });
  }
});

export default router;
