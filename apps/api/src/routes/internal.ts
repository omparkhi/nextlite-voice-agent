import { Router, Request, Response } from 'express';
import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService } from '../services/runtimeAgentConfig';
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
    res.status(400).json({ error: 'Deployment ID is required' });
    return;
  }

  try {
    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId);
    res.json(runtimeConfig);
  } catch (error: any) {
    const message = error?.message || 'Failed to resolve runtime configuration';

    if (message.includes('Deployment not found')) {
      logger.warn({ deploymentId }, 'Internal runtime config lookup failed: deployment not found');
      res.status(404).json({ error: 'Deployment not found' });
      return;
    }

    if (message.includes('not active') || message.includes('archived') || message.includes('paused')) {
      logger.warn({ deploymentId, error: message }, 'Internal runtime config lookup failed: deployment inactive');
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('Invalid deployment')) {
      logger.error({ deploymentId, error: message }, 'Internal runtime config lookup failed: invalid configuration');
      res.status(400).json({ error: message });
      return;
    }

    logger.error({ deploymentId, err: error }, 'Internal error resolving runtime configuration');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
