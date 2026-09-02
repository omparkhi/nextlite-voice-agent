import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants } from '../db/schema';
import { authenticateToken, requireRole } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { getKnowledgeService } from '../services';

const logger = createChildLogger({ module: 'knowledge-routes' });
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const ALLOWED_TYPES = ['txt', 'md'];

async function verifyClient(clientId: string): Promise<boolean> {
  const client = await db.query.tenants.findFirst({ where: eq(tenants.id, clientId) });
  return !!client;
}

router.get('/clients/:clientId/agents/:agentId/knowledge', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const sources = await getKnowledgeService().listSources(clientId, agentId);
    res.json(sources);
  } catch (error) {
    logger.error(error, 'List knowledge sources error');
    res.status(500).json({ error: 'Failed to list knowledge sources' });
  }
});

router.get('/clients/:clientId/agents/:agentId/knowledge/:sourceId', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId, sourceId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const source = await getKnowledgeService().getSource(clientId, agentId, sourceId);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    res.json(source);
  } catch (error) {
    logger.error(error, 'Get knowledge source error');
    res.status(500).json({ error: 'Failed to get knowledge source' });
  }
});

router.post('/clients/:clientId/agents/:agentId/knowledge', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const { clientId, agentId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const results: { sourceId: string; fileName: string; status: string }[] = [];

    for (const file of files) {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_TYPES.includes(ext)) {
        results.push({ sourceId: '', fileName: file.originalname, status: 'rejected' });
        continue;
      }

      try {
        const sourceId = await getKnowledgeService().uploadDocument(
          clientId,
          agentId,
          file.originalname,
          file.buffer,
          ext,
        );
        results.push({ sourceId, fileName: file.originalname, status: 'uploaded' });
      } catch (error) {
        logger.error(error, `Upload failed for ${file.originalname}`);
        results.push({ sourceId: '', fileName: file.originalname, status: 'error' });
      }
    }

    res.status(201).json({ results });
  } catch (error) {
    logger.error(error, 'Upload knowledge error');
    res.status(500).json({ error: 'Failed to upload knowledge' });
  }
});

router.delete('/clients/:clientId/agents/:agentId/knowledge/:sourceId', async (req: Request, res: Response) => {
  try {
    const { clientId, agentId, sourceId } = req.params;
    if (!(await verifyClient(clientId))) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    await getKnowledgeService().deleteSource(clientId, agentId, sourceId);
    res.status(204).send();
  } catch (error: any) {
    if (error?.message === 'Source not found') {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    logger.error(error, 'Delete knowledge source error');
    res.status(500).json({ error: 'Failed to delete knowledge source' });
  }
});

export default router;
