import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies before imports
vi.mock('../services/runtimeAgentConfig', () => ({
  runtimeAgentConfigService: {
    resolveRuntimeAgentConfig: vi.fn(),
  },
  RuntimeAgentConfigService: vi.fn(),
}));

import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService } from '../services/runtimeAgentConfig';
import internalRouter from '../routes/internal';
import { env } from '../config/env';

describe('Internal Runtime Config Access Boundary (Module A5 Correction)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {},
      params: {},
      query: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn() as unknown as NextFunction;
  });

  describe('authenticateWorkerSecret Middleware', () => {
    it('should return 401 when no worker authentication header is provided', () => {
      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal worker authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when invalid worker secret is provided', () => {
      mockReq.headers = { authorization: 'Bearer wrong-secret-key' };

      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid internal worker credential' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow valid Bearer token authentication', () => {
      mockReq.headers = { authorization: `Bearer ${env.LIVEKIT_WORKER_SECRET}` };

      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow valid x-worker-secret header authentication', () => {
      mockReq.headers = { 'x-worker-secret': env.LIVEKIT_WORKER_SECRET };

      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('GET /api/internal/runtime-config/:deploymentId Route Handler', () => {
    const mockRuntimeConfig = {
      tenant: { tenantId: 'tenant-db-authoritative' },
      agent: { agentId: 'agent-456', agentName: 'Test Agent', status: 'LIVE' },
      deployment: { deploymentId: 'deploy-789', versionId: 'ver-1', versionNumber: 1 },
      prompt: { compiledSystemPrompt: 'System Prompt Test', greeting: 'Hello' },
      voice: { provider: 'sarvam', voiceId: 'rahul' },
      language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
      runtime: { temperature: 0.7 },
      knowledge: { enabled: false },
      tools: { enabled: false, tools: [] },
      variables: { inputVariables: [], outputVariables: [] },
    };

    function getRouteHandler() {
      const routeLayer = internalRouter.stack.find(
        (layer: any) => layer.route && layer.route.path === '/runtime-config/:deploymentId'
      );
      if (!routeLayer || !routeLayer.route) {
        throw new Error('Route /runtime-config/:deploymentId not found');
      }
      return routeLayer.route.stack[0].handle;
    }

    it('should succeed without x-tenant-id header when deploymentId and worker auth are valid', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-789' };
      // No x-tenant-id header or query param provided

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith('deploy-789');
      expect(mockRes.json).toHaveBeenCalledWith(mockRuntimeConfig);
      expect(mockRuntimeConfig.tenant.tenantId).toBe('tenant-db-authoritative');
    });

    it('should ignore tenantId query parameter and resolve via database relationship', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-789' };
      mockReq.query = { tenantId: 'tenant-caller-attempt' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      // Verify route handler passes ONLY deploymentId
      expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith('deploy-789');
      expect(mockRes.json).toHaveBeenCalledWith(mockRuntimeConfig);
    });

    it('should ignore x-tenant-id header and resolve via database relationship', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-789' };
      mockReq.headers = { 'x-tenant-id': 'tenant-caller-attempt' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      // Verify route handler passes ONLY deploymentId
      expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith('deploy-789');
      expect(mockRes.json).toHaveBeenCalledWith(mockRuntimeConfig);
    });

    it('should return 404 when deployment is not found in database', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(new Error('Deployment not found'));

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'unknown-deployment' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Deployment not found' });
    });

    it('should return 409 when deployment is inactive', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(new Error('Deployment is not active (status: INACTIVE)'));

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-inactive' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Deployment is not active (status: INACTIVE)' });
    });
  });
});
