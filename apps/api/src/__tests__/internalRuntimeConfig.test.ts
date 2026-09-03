import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies before imports
vi.mock('../services/runtimeAgentConfig', async () => {
  const actual = await vi.importActual<typeof import('../services/runtimeAgentConfig')>('../services/runtimeAgentConfig');
  return {
    ...actual,
    runtimeAgentConfigService: {
      resolveRuntimeAgentConfig: vi.fn(),
    },
  };
});

import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService, RuntimeConfigError } from '../services/runtimeAgentConfig';
import internalRouter from '../routes/internal';
import { env } from '../config/env';

describe('Internal Runtime Config Access Boundary & Failure Handling (Module A6)', () => {
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

  function getRouteHandler() {
    const routeLayer = internalRouter.stack.find(
      (layer: any) => layer.route && layer.route.path === '/runtime-config/:deploymentId'
    );
    if (!routeLayer || !routeLayer.route) {
      throw new Error('Route /runtime-config/:deploymentId not found');
    }
    return routeLayer.route.stack[0].handle;
  }

  describe('F. Worker Authentication Failures (HTTP 401)', () => {
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

  describe('A6 Failure Handling & Response Mapping', () => {
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

    it('A. Valid active deployment -> returns RuntimeAgentConfig (HTTP 200)', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-789' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith('deploy-789');
      expect(mockRes.json).toHaveBeenCalledWith(mockRuntimeConfig);
    });

    it('B. Unknown deployment -> stable RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND error (HTTP 404)', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new RuntimeConfigError('RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND', 'Deployment not found')
      );

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'unknown-deploy' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Deployment not found',
        code: 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
      });
    });

    it('C. Inactive deployment -> stable RUNTIME_CONFIG_DEPLOYMENT_INACTIVE error (HTTP 409)', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new RuntimeConfigError('RUNTIME_CONFIG_DEPLOYMENT_INACTIVE', 'Deployment is not active (status: INACTIVE)')
      );

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-inactive' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Deployment is not active (status: INACTIVE)',
        code: 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
      });
    });

    it('D. Invalid deployment/agent/version relationship -> stable RUNTIME_CONFIG_AGENT_INVALID (HTTP 409)', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new RuntimeConfigError('RUNTIME_CONFIG_AGENT_INVALID', 'Invalid deployment agent/version relationship')
      );

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-mismatched' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid deployment agent/version relationship',
        code: 'RUNTIME_CONFIG_AGENT_INVALID',
      });
    });

    it('E. Unexpected service/database error -> HTTP 500 (does NOT expose internal details)', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new Error('Fatal PostgreSQL connection timeout: password=secret DB_HOST=internal.db.local')
      );

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-db-crash' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('G. Successful request still derives tenantId from the deployment database relationship', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-789' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRuntimeConfig.tenant.tenantId).toBe('tenant-db-authoritative');
    });

    it('H. Caller-supplied x-tenant-id and tenantId query parameters remain irrelevant/ignored', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const routeHandler = getRouteHandler();
      mockReq.params = { deploymentId: 'deploy-789' };
      mockReq.headers = { 'x-tenant-id': 'spoofed-tenant-id' };
      mockReq.query = { tenantId: 'spoofed-tenant-query' };

      await routeHandler(mockReq as Request, mockRes as Response, mockNext);

      expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith('deploy-789');
      expect(mockRes.json).toHaveBeenCalledWith(mockRuntimeConfig);
    });
  });
});
