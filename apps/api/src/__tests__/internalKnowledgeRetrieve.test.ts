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

vi.mock('../services', async () => {
  return {
    getKnowledgeService: vi.fn(),
  };
});

import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService, RuntimeConfigError } from '../services/runtimeAgentConfig';
import { getKnowledgeService } from '../services';
import internalRouter from '../routes/internal';
import { env } from '../config/env';

describe('Internal Knowledge Retrieval Endpoint (POST /api/internal/knowledge/retrieve)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockKnowledgeService: {
    retrieveRelevant: ReturnType<typeof vi.fn>;
  };

  const validDeploymentId = '11111111-1111-4111-8111-111111111111';

  const mockRuntimeConfig = {
    tenant: { tenantId: 'tenant-authoritative-123' },
    agent: { agentId: 'agent-authoritative-456', agentName: 'Hospital Voice Assistant', status: 'LIVE' },
    deployment: { deploymentId: validDeploymentId, versionId: 'ver-1', versionNumber: 1 },
    prompt: { compiledSystemPrompt: 'Hospital prompt', greeting: 'Hello' },
    voice: { provider: 'sarvam', voiceId: 'priya' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN', 'hi-IN'] },
    runtime: { temperature: 0.7 },
    knowledge: {
      enabled: true,
      retrievalConfig: {
        topK: 4,
        scoreThreshold: 0.5,
      },
    },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  const mockChunks = [
    { content: 'Cardiology OPD is open Monday to Friday from 9 AM to 1 PM.', score: 0.92, sourceId: 'src-1' },
    { content: 'General Medicine consultation fee is Rs 500.', score: 0.85, sourceId: 'src-1' },
    { content: 'Emergency services are available 24/7.', score: 0.42, sourceId: 'src-2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {
        'x-worker-secret': env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3',
      },
      params: {},
      query: {},
      body: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn() as unknown as NextFunction;

    mockKnowledgeService = {
      retrieveRelevant: vi.fn().mockResolvedValue(mockChunks),
    };
    (getKnowledgeService as any).mockReturnValue(mockKnowledgeService);
  });

  function getRouteHandler() {
    const routeLayer = internalRouter.stack.find(
      (layer: any) => layer.route && layer.route.path === '/knowledge/retrieve' && layer.route.methods.post
    );
    if (!routeLayer || !routeLayer.route) {
      throw new Error('Route POST /knowledge/retrieve not found');
    }
    return routeLayer.route.stack[0].handle;
  }

  describe('1. Worker Authentication', () => {
    it('should reject unauthenticated request when credentials are missing', () => {
      mockReq.headers = {};
      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal worker authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request when invalid worker secret is provided', () => {
      mockReq.headers = { 'x-worker-secret': 'invalid-secret-token' };
      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid internal worker credential' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow valid worker secret via x-worker-secret', () => {
      mockReq.headers = { 'x-worker-secret': env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3' };
      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow valid worker secret via Authorization Bearer token', () => {
      mockReq.headers = { authorization: `Bearer ${env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3'}` };
      authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('2. Request Body Validation', () => {
    it('should return 400 when body is missing deploymentId', async () => {
      const handler = getRouteHandler();
      mockReq.body = { query: 'OPD timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });

    it('should return 400 when deploymentId is not a valid UUID', async () => {
      const handler = getRouteHandler();
      mockReq.body = { deploymentId: 'not-a-uuid', query: 'OPD timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });

    it('should return 400 when query is missing', async () => {
      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });

    it('should return 400 when query is empty or only whitespace', async () => {
      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: '   ' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });

    it('should return 400 when topK is negative or non-integer', async () => {
      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'OPD timings', topK: -3 };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });
  });

  describe('3. Deployment Security & Tenant Isolation Boundary', () => {
    it('should authoritatively resolve tenantId and agentId from deployment and call KnowledgeService', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const handler = getRouteHandler();
      mockReq.body = {
        deploymentId: validDeploymentId,
        query: 'What are cardiology timings?',
        topK: 3,
      };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith(validDeploymentId);
      expect(mockKnowledgeService.retrieveRelevant).toHaveBeenCalledWith(
        'tenant-authoritative-123',
        'agent-authoritative-456',
        'What are cardiology timings?',
        3
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        results: [
          { content: 'Cardiology OPD is open Monday to Friday from 9 AM to 1 PM.', score: 0.92, sourceId: 'src-1' },
          { content: 'General Medicine consultation fee is Rs 500.', score: 0.85, sourceId: 'src-1' },
        ],
      });
    });

    it('should ignore caller-supplied tenantId or agentId in body/headers/query', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const handler = getRouteHandler();
      mockReq.body = {
        deploymentId: validDeploymentId,
        query: 'Emergency timings',
        tenantId: 'attacker-tenant',
        agentId: 'attacker-agent',
      };
      mockReq.headers = {
        ...mockReq.headers,
        'x-tenant-id': 'attacker-header-tenant',
      };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockKnowledgeService.retrieveRelevant).toHaveBeenCalledWith(
        'tenant-authoritative-123',
        'agent-authoritative-456',
        'Emergency timings',
        4 // from runtimeConfig.knowledge.retrievalConfig.topK
      );
    });

    it('should return 404 when deployment is not found', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new RuntimeConfigError('RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND', 'Deployment not found')
      );

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Deployment not found',
        code: 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
      });
      expect(mockKnowledgeService.retrieveRelevant).not.toHaveBeenCalled();
    });

    it('should return 409 when deployment is inactive', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new RuntimeConfigError('RUNTIME_CONFIG_DEPLOYMENT_INACTIVE', 'Deployment is not active (status: INACTIVE)')
      );

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Deployment is not active (status: INACTIVE)',
        code: 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
      });
      expect(mockKnowledgeService.retrieveRelevant).not.toHaveBeenCalled();
    });

    it('should return 409 when deployment has invalid agent relationship', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
        new RuntimeConfigError('RUNTIME_CONFIG_AGENT_INVALID', 'Invalid deployment agent relationship')
      );

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid deployment agent relationship',
        code: 'RUNTIME_CONFIG_AGENT_INVALID',
      });
    });
  });

  describe('4. Knowledge Configuration & Filtering Behavior', () => {
    it('should return empty results when knowledge is disabled on the agent', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue({
        ...mockRuntimeConfig,
        knowledge: { enabled: false },
      });

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockKnowledgeService.retrieveRelevant).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ results: [] });
    });

    it('should fallback topK to runtimeConfig.knowledge.retrievalConfig.topK when topK is omitted in request', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Doctors list' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockKnowledgeService.retrieveRelevant).toHaveBeenCalledWith(
        'tenant-authoritative-123',
        'agent-authoritative-456',
        'Doctors list',
        4 // configured topK
      );
    });

    it('should fallback topK to 5 when retrievalConfig.topK is undefined and request topK is omitted', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue({
        ...mockRuntimeConfig,
        knowledge: { enabled: true },
      });

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Doctors list' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockKnowledgeService.retrieveRelevant).toHaveBeenCalledWith(
        'tenant-authoritative-123',
        'agent-authoritative-456',
        'Doctors list',
        5 // default fallback
      );
    });

    it('should filter chunks by scoreThreshold if configured in runtimeConfig', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue({
        ...mockRuntimeConfig,
        knowledge: {
          enabled: true,
          retrievalConfig: {
            topK: 5,
            scoreThreshold: 0.9,
          },
        },
      });

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Cardiology' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Only chunk with score >= 0.9 is returned
      expect(mockRes.json).toHaveBeenCalledWith({
        results: [
          { content: 'Cardiology OPD is open Monday to Friday from 9 AM to 1 PM.', score: 0.92, sourceId: 'src-1' },
        ],
      });
    });
  });

  describe('5. Error Handling & Privacy', () => {
    it('should return 500 without leaking internal database or provider details on unexpected error', async () => {
      (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);
      mockKnowledgeService.retrieveRelevant.mockRejectedValue(
        new Error('NVIDIA embedding API key expired or connection timeout to postgres://user:pass@secret-db')
      );

      const handler = getRouteHandler();
      mockReq.body = { deploymentId: validDeploymentId, query: 'Timings' };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
