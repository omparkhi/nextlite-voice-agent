import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Hoisted mocks for LiveKit SDK and DB/Services
const {
  mockCreateRoom,
  mockCreateDispatch,
  mockToJwt,
  mockAddGrant,
  mockAccessTokenOptions,
  mockRoomServiceClientConstructor,
  mockAgentDispatchClientConstructor,
} = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
  mockCreateDispatch: vi.fn(),
  mockToJwt: vi.fn().mockResolvedValue('mock-livekit-jwt-token-xyz'),
  mockAddGrant: vi.fn(),
  mockAccessTokenOptions: [] as any[],
  mockRoomServiceClientConstructor: vi.fn(),
  mockAgentDispatchClientConstructor: vi.fn(),
}));

vi.mock('livekit-server-sdk', () => {
  return {
    RoomServiceClient: vi.fn().mockImplementation((host, apiKey, apiSecret) => {
      mockRoomServiceClientConstructor(host, apiKey, apiSecret);
      return {
        createRoom: mockCreateRoom,
      };
    }),
    AgentDispatchClient: vi.fn().mockImplementation((host, apiKey, apiSecret) => {
      mockAgentDispatchClientConstructor(host, apiKey, apiSecret);
      return {
        createDispatch: mockCreateDispatch,
      };
    }),
    AccessToken: vi.fn().mockImplementation((apiKey, apiSecret, options) => {
      mockAccessTokenOptions.push({ apiKey, apiSecret, options });
      return {
        addGrant: mockAddGrant,
        toJwt: mockToJwt,
      };
    }),
    TrackSource: {
      MICROPHONE: 0,
      CAMERA: 1,
      SCREEN_SHARE: 2,
      SCREEN_SHARE_AUDIO: 3,
    },
  };
});

// Mock environment variables
vi.mock('../config/env', () => ({
  env: {
    LIVEKIT_URL: 'wss://test.livekit.cloud',
    LIVEKIT_API_KEY: 'test-api-key',
    LIVEKIT_API_SECRET: 'test-api-secret-12345678901234567890',
    LIVEKIT_AGENT_NAME: 'my-agent',
  },
}));

// Mock logger
vi.mock('../lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock agentService
vi.mock('../services/agent', () => ({
  agentService: {
    getAgent: vi.fn(),
    getActiveDeployment: vi.fn(),
  },
}));

// Mock verifyClient in routes/agents
vi.mock('../db', () => ({
  db: {
    query: {
      tenants: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { livekitService } from '../services/livekit';
import { agentService } from '../services/agent';
import { db } from '../db';
import { authenticateToken, requireRole } from '../middleware/auth';
import agentRouter from '../routes/agents';

describe('Module 3 — LiveKit Control Plane & Test Token Service', () => {
  const tenantId = 'client-uuid-111';
  const agentId = 'agent-uuid-222';
  const userId = 'user-admin-333';

  const mockTestDeployment = {
    id: 'deploy-test-uuid-999',
    tenantId,
    agentId,
    versionId: 'version-uuid-v1',
    environment: 'TEST',
    status: 'ACTIVE',
  };

  const mockProdDeployment = {
    id: 'deploy-prod-uuid-888',
    tenantId,
    agentId,
    versionId: 'version-uuid-v1',
    environment: 'PRODUCTION',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessTokenOptions.length = 0;
    mockCreateDispatch.mockResolvedValue({ id: 'dispatch-123', agentName: 'my-agent' });
  });

  describe('LiveKitService.createTestToken', () => {
    it('1. rejects when agent is not found or does not belong to tenant', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue(undefined);

      await expect(
        livekitService.createTestToken(agentId, tenantId, userId),
      ).rejects.toThrow('Agent not found');
    });

    it('2. rejects when no active TEST deployment exists for agent', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId, name: 'Support Bot' } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(null as any);

      await expect(
        livekitService.createTestToken(agentId, tenantId, userId),
      ).rejects.toThrow('No active TEST deployment found for this agent');
    });

    it('3. active TEST deployment is correctly resolved, room is created, agent worker is explicitly dispatched', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId, name: 'Support Bot' } as any);
      vi.mocked(agentService.getActiveDeployment).mockImplementation(async (_aId, _tId, env) => {
        if (env === 'TEST') return mockTestDeployment as any;
        if (env === 'PRODUCTION') return mockProdDeployment as any;
        return null as any;
      });

      mockCreateRoom.mockResolvedValue({ name: 'test-room' });
      mockCreateDispatch.mockResolvedValue({ id: 'dispatch-xyz', agentName: 'my-agent' });

      const result = await livekitService.createTestToken(agentId, tenantId, userId);

      // Verify getActiveDeployment was called with 'TEST' environment only
      expect(agentService.getActiveDeployment).toHaveBeenCalledWith(agentId, tenantId, 'TEST');
      expect(agentService.getActiveDeployment).not.toHaveBeenCalledWith(agentId, tenantId, 'PRODUCTION');

      // Verify RoomServiceClient & AgentDispatchClient was initialized with http/https url
      expect(mockRoomServiceClientConstructor).toHaveBeenCalledWith(
        'https://test.livekit.cloud',
        'test-api-key',
        'test-api-secret-12345678901234567890',
      );
      expect(mockAgentDispatchClientConstructor).toHaveBeenCalledWith(
        'https://test.livekit.cloud',
        'test-api-key',
        'test-api-secret-12345678901234567890',
      );

      // Verify createRoom was called with deploymentId in metadata
      expect(mockCreateRoom).toHaveBeenCalledTimes(1);
      const roomArg = mockCreateRoom.mock.calls[0][0];
      expect(roomArg.name).toContain(`test-${agentId}`);
      expect(JSON.parse(roomArg.metadata)).toEqual({
        deploymentId: 'deploy-test-uuid-999',
      });

      // Verify createDispatch was called with roomName, agentName 'my-agent', and roomMetadata
      expect(mockCreateDispatch).toHaveBeenCalledTimes(1);
      expect(mockCreateDispatch).toHaveBeenCalledWith(roomArg.name, 'my-agent', {
        metadata: roomArg.metadata,
      });

      // Verify token grant
      expect(mockAddGrant).toHaveBeenCalledWith({
        roomJoin: true,
        room: roomArg.name,
        canPublish: true,
        canPublishSources: [0], // TrackSource.MICROPHONE
        canSubscribe: true,
        canPublishData: true,
      });

      // Verify response structure
      expect(result).toEqual({
        livekitUrl: 'wss://test.livekit.cloud',
        token: 'mock-livekit-jwt-token-xyz',
        roomName: roomArg.name,
        dispatchId: 'dispatch-xyz',
      });
    });

    it('4. token contains short TTL and does not grant unnecessary admin permissions', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId, name: 'Support Bot' } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(mockTestDeployment as any);
      mockCreateRoom.mockResolvedValue({ name: 'test-room' });

      await livekitService.createTestToken(agentId, tenantId, userId);

      expect(mockAccessTokenOptions.length).toBe(1);
      const { options } = mockAccessTokenOptions[0];
      expect(options.ttl).toBe('15m');
      expect(options.identity).toContain(`tester-${userId}`);
    });

    it('5. PRODUCTION deployment is never selected', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId, name: 'Support Bot' } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(null as any);

      await expect(
        livekitService.createTestToken(agentId, tenantId, userId),
      ).rejects.toThrow('No active TEST deployment found for this agent');
    });

    it('6. throws when AgentDispatchClient fails to dispatch', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId, name: 'Support Bot' } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(mockTestDeployment as any);
      mockCreateRoom.mockResolvedValue({ name: 'test-room' });
      mockCreateDispatch.mockRejectedValue(new Error('LiveKit Cloud dispatch service unavailable'));

      await expect(
        livekitService.createTestToken(agentId, tenantId, userId),
      ).rejects.toThrow('Failed to dispatch LiveKit agent worker');
    });
  });

  describe('API Route: POST /api/admin/clients/:clientId/agents/:agentId/test-token', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        params: { clientId: tenantId, agentId },
        user: { userId, role: 'ADMIN', tenantId },
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn() as unknown as NextFunction;
    });

    function getTestTokenRouteHandler() {
      const routeLayer = agentRouter.stack.find(
        (layer: any) => layer.route && layer.route.path === '/clients/:clientId/agents/:agentId/test-token',
      );
      if (!routeLayer || !routeLayer.route) {
        throw new Error('Route /clients/:clientId/agents/:agentId/test-token not found');
      }
      return routeLayer.route.stack[0].handle;
    }

    it('7. rejected with 401 when unauthenticated', () => {
      const unauthReq: Partial<Request> = { headers: {} };
      const nextFn = vi.fn();
      authenticateToken(unauthReq as Request, mockRes as Response, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('8. rejected with 403 when non-admin user attempts access', () => {
      const clientUserReq: Partial<Request> = {
        user: { userId: 'client-user-1', role: 'CLIENT_OWNER' as const, tenantId },
      };
      const nextFn = vi.fn();
      const requireAdmin = requireRole('ADMIN');
      requireAdmin(clientUserReq as Request, mockRes as Response, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('9. returns 404 when client does not exist', async () => {
      vi.mocked(db.query.tenants.findFirst).mockResolvedValue(null as any);
      const handler = getTestTokenRouteHandler();

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Client not found' });
    });

    it('10. returns 404 when agent is not found', async () => {
      vi.mocked(db.query.tenants.findFirst).mockResolvedValue({ id: tenantId } as any);
      vi.mocked(agentService.getAgent).mockResolvedValue(undefined);
      const handler = getTestTokenRouteHandler();

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Agent not found' });
    });

    it('11. returns 400 when agent has no active TEST deployment', async () => {
      vi.mocked(db.query.tenants.findFirst).mockResolvedValue({ id: tenantId } as any);
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(null as any);
      const handler = getTestTokenRouteHandler();

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No active TEST deployment found for this agent' });
    });

    it('12. returns 502 when agent dispatch fails', async () => {
      vi.mocked(db.query.tenants.findFirst).mockResolvedValue({ id: tenantId } as any);
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(mockTestDeployment as any);
      mockCreateRoom.mockResolvedValue({ name: 'test-room' });
      mockCreateDispatch.mockRejectedValue(new Error('LiveKit Cloud error'));

      const handler = getTestTokenRouteHandler();
      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to dispatch LiveKit agent worker' });
    });

    it('13. returns 200 with livekitUrl, token, roomName, and dispatchId on success', async () => {
      vi.mocked(db.query.tenants.findFirst).mockResolvedValue({ id: tenantId } as any);
      vi.mocked(agentService.getAgent).mockResolvedValue({ id: agentId, tenantId } as any);
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(mockTestDeployment as any);
      mockCreateRoom.mockResolvedValue({ name: 'test-room' });
      mockCreateDispatch.mockResolvedValue({ id: 'dispatch-777', agentName: 'my-agent' });

      const handler = getTestTokenRouteHandler();
      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        livekitUrl: 'wss://test.livekit.cloud',
        token: 'mock-livekit-jwt-token-xyz',
        roomName: expect.stringContaining(`test-${agentId}`),
        dispatchId: 'dispatch-777',
      });
    });
  });
});
