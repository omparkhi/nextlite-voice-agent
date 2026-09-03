import { Router, Request, Response } from 'express';
import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService, RuntimeConfigError } from '../services/runtimeAgentConfig';
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

export default router;
