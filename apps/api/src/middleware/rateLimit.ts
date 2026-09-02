import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests' } = options;
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.route?.path || req.path}`;
    const now = Date.now();
    
    if (!store[key] || now > store[key].resetAt) {
      store[key] = { count: 1, resetAt: now + windowMs };
      next();
      return;
    }
    
    store[key].count++;
    
    if (store[key].count > max) {
      res.status(429).json({ error: message });
      return;
    }
    
    next();
  };
}

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts',
});

export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many login attempts',
});

export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: 'Too many password reset requests',
});
