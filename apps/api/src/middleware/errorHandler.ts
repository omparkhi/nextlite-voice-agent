import { Request, Response, NextFunction } from 'express';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'error-handler' });

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';
  
  if (err instanceof AppError) {
    logger.warn({
      correlationId,
      error: err.message,
      statusCode: err.statusCode,
    }, 'Application error');
    
    res.status(err.statusCode).json({
      error: err.message,
      correlationId,
    });
    return;
  }
  
  logger.error({
    correlationId,
    error: err.message,
    stack: err.stack,
  }, 'Unexpected error');
  
  res.status(500).json({
    error: 'Internal server error',
    correlationId,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
}
