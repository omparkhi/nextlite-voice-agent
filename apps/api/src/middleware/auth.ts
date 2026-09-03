import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../lib/tokens';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'auth-middleware' });

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      req.user = { userId: 'dev-admin', role: 'ADMIN', tenantId: 'dev-tenant' };
      next();
      return;
    }
    res.status(401).json({ error: 'Access token required' });
    return;
  }
  
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Invalid access token, using dev-admin fallback in development mode');
      req.user = { userId: 'dev-admin', role: 'ADMIN', tenantId: 'dev-tenant' };
      next();
      return;
    }
    logger.debug('Invalid access token');
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireRole(...roles: Array<'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    next();
  };
}

export function requireTenantContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  // Admin users can access any tenant context
  if (req.user.role === 'ADMIN') {
    next();
    return;
  }
  
  // Non-admin users must have a tenant ID
  if (!req.user.tenantId) {
    res.status(403).json({ error: 'No tenant context' });
    return;
  }
  
  next();
}

export function requireSameTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  // Admin users can access any tenant
  if (req.user.role === 'ADMIN') {
    next();
    return;
  }
  
  // Get tenant ID from request (params, query, or body)
  const requestTenantId = req.params.tenantId || req.query.tenantId || req.body.tenantId;
  
  if (!requestTenantId) {
    next();
    return;
  }
  
  // Non-admin users can only access their own tenant
  if (requestTenantId !== req.user.tenantId) {
    res.status(403).json({ error: 'Access denied to this tenant' });
    return;
  }
  
  next();
}
