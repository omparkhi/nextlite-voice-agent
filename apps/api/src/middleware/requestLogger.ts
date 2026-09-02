import { Request, Response, NextFunction } from 'express';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'http' });

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[level]({
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  
  next();
}
