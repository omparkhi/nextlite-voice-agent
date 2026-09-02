import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  authenticateToken,
  requireRole,
  requireTenantContext,
  requireSameTenant,
} from '../middleware/auth';
import { generateAccessToken } from '../lib/tokens';

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn() as unknown as NextFunction;
  });

  describe('authenticateToken', () => {
    it('should return 401 when no token provided', () => {
      authenticateToken(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      
      authenticateToken(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next and set user for valid token', () => {
      const payload = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'ADMIN' as const,
      };
      const token = generateAccessToken(payload);
      mockReq.headers = { authorization: `Bearer ${token}` };
      
      authenticateToken(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe(payload.userId);
    });
  });

  describe('requireRole', () => {
    it('should return 401 when user not authenticated', () => {
      const middleware = requireRole('ADMIN');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user has wrong role', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'CLIENT_VIEWER',
      };
      const middleware = requireRole('ADMIN');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when user has correct role', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'ADMIN',
      };
      const middleware = requireRole('ADMIN');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireTenantContext', () => {
    it('should return 401 when user not authenticated', () => {
      requireTenantContext(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should allow admin without tenant context', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: null,
        role: 'ADMIN',
      };
      
      requireTenantContext(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for non-admin without tenant', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: null,
        role: 'CLIENT_OWNER',
      };
      
      requireTenantContext(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should allow non-admin with tenant context', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'CLIENT_OWNER',
      };
      
      requireTenantContext(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireSameTenant', () => {
    it('should allow admin to access any tenant', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'ADMIN',
      };
      mockReq.params = { tenantId: 'different-tenant' };
      
      requireSameTenant(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for non-admin accessing different tenant', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'CLIENT_OWNER',
      };
      mockReq.params = { tenantId: 'different-tenant' };
      
      requireSameTenant(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should allow non-admin to access own tenant', () => {
      mockReq.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        role: 'CLIENT_OWNER',
      };
      mockReq.params = { tenantId: 'tenant-123' };
      
      requireSameTenant(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
