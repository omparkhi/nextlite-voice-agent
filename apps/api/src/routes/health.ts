import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { redis } from '../db/redis';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
    },
  };
  
  try {
    await db.execute(sql`SELECT 1`);
    health.services.database = 'connected';
  } catch {
    health.services.database = 'disconnected';
    health.status = 'degraded';
  }
  
  try {
    await redis.ping();
    health.services.redis = 'connected';
  } catch {
    health.services.redis = 'disconnected';
    health.status = 'degraded';
  }
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
