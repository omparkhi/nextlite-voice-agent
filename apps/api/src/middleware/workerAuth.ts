import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'worker-auth-middleware' });

/**
 * Middleware authenticating internal LiveKit Worker -> NextLite API requests.
 * Accepts credentials via Bearer token or `x-worker-secret` header.
 * Rejects unauthenticated or invalid requests with 401.
 */
export function authenticateWorkerSecret(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const workerSecretHeader = req.headers['x-worker-secret'] as string | undefined;

  let providedSecret: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedSecret = authHeader.substring(7).trim();
  } else if (workerSecretHeader) {
    providedSecret = workerSecretHeader.trim();
  }

  if (!providedSecret) {
    logger.debug('Worker authentication failed: missing credentials');
    res.status(401).json({ error: 'Internal worker authentication required' });
    return;
  }

  const expectedSecret = env.LIVEKIT_WORKER_SECRET;
  if (!expectedSecret || providedSecret !== expectedSecret) {
    logger.warn('Worker authentication failed: invalid secret provided');
    res.status(401).json({ error: 'Invalid internal worker credential' });
    return;
  }

  next();
}
