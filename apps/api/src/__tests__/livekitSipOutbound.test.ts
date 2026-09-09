import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Hoisted mocks for LiveKit SDK
const {
  mockCreateRoom,
  mockCreateDispatch,
  mockCreateSipParticipant,
  mockRoomServiceClientConstructor,
  mockAgentDispatchClientConstructor,
  mockSipClientConstructor,
} = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
  mockCreateDispatch: vi.fn(),
  mockCreateSipParticipant: vi.fn(),
  mockRoomServiceClientConstructor: vi.fn(),
  mockAgentDispatchClientConstructor: vi.fn(),
  mockSipClientConstructor: vi.fn(),
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
    SipClient: vi.fn().mockImplementation((host, apiKey, apiSecret) => {
      mockSipClientConstructor(host, apiKey, apiSecret);
      return {
        createSipParticipant: mockCreateSipParticipant,
      };
    }),
    AccessToken: vi.fn().mockImplementation(() => ({
      addGrant: vi.fn(),
      toJwt: vi.fn().mockResolvedValue('mock-jwt'),
    })),
    TrackSource: {
      MICROPHONE: 0,
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
    LIVEKIT_SIP_DOMAIN: 'nextlite-test.sip.livekit.cloud',
    LIVEKIT_SIP_TRUNK_ID: 'ST_test_trunk_123',
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

// Mock DB for verifyClient
vi.mock('../db', () => ({
  db: {
    query: {
      tenants: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { livekitService, isValidE164 } from '../services/livekit';
import { agentService } from '../services/agent';
import { db } from '../db';
import agentRouter from '../routes/agents';

describe('V3 SIP Module 2 — Outbound LiveKit SIP Phone Test', () => {
  const tenantId = 'tenant-uuid-111';
  const agentId = 'agent-uuid-222';
  const validPhoneNumber = '+919876543210';
  const mockTestDeployment = {
    id: 'deploy-test-uuid-999',
    tenantId,
    agentId,
    versionId: 'ver-draft-1',
    environment: 'TEST',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock returns
    vi.mocked(agentService.getAgent).mockResolvedValue({
      id: agentId,
      tenantId,
      name: 'Support Agent',
      status: 'DRAFT',
    } as any);

    vi.mocked(agentService.getActiveDeployment).mockResolvedValue(mockTestDeployment as any);

    mockCreateRoom.mockResolvedValue({ name: 'mock-room' });
    mockCreateDispatch.mockResolvedValue({ id: 'dispatch-uuid-456' });
    mockCreateSipParticipant.mockResolvedValue({
      participantId: 'PA_sip_participant_123',
      participantIdentity: 'sip-919876543210-123',
      roomName: 'phone-test-room',
      sipCallId: 'SIP_call_789',
    });

    vi.mocked(db.query.tenants.findFirst).mockResolvedValue({
      id: tenantId,
      name: 'Acme Corp',
    } as any);
  });

  describe('Helper: isValidE164', () => {
    it('should validate standard E.164 phone numbers', () => {
      expect(isValidE164('+919876543210')).toBe(true);
      expect(isValidE164('+14155552671')).toBe(true);
      expect(isValidE164('+442071838750')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidE164('9876543210')).toBe(false); // missing +
      expect(isValidE164('+0123456789')).toBe(false); // starts with +0
      expect(isValidE164('invalid-phone')).toBe(false);
      expect(isValidE164('')).toBe(false);
      expect(isValidE164('+91-9876-543210')).toBe(false); // contains hyphens
    });
  });

  describe('A. Successful outbound phone test', () => {
    it('should resolve ACTIVE TEST deployment, create room with metadata, dispatch worker, and dial via SipClient', async () => {
      const result = await livekitService.createOutboundPhoneCall(agentId, tenantId, validPhoneNumber);

      // 1. Verifies agent ownership
      expect(agentService.getAgent).toHaveBeenCalledWith(agentId, tenantId);

      // 2. Resolves TEST deployment (NOT PRODUCTION)
      expect(agentService.getActiveDeployment).toHaveBeenCalledWith(agentId, tenantId, 'TEST');

      // 3. RoomServiceClient creates room with deploymentId in metadata
      expect(mockCreateRoom).toHaveBeenCalledTimes(1);
      const roomCall = mockCreateRoom.mock.calls[0][0];
      expect(roomCall.name).toContain(`phone-test-${agentId}`);
      expect(JSON.parse(roomCall.metadata)).toEqual({ deploymentId: 'deploy-test-uuid-999' });

      // 4. Dispatches my-agent
      expect(mockCreateDispatch).toHaveBeenCalledWith(
        roomCall.name,
        'my-agent',
        { metadata: roomCall.metadata }
      );

      // 5. Calls SipClient.createSipParticipant with trunk ID and phone number
      expect(mockCreateSipParticipant).toHaveBeenCalledWith(
        'ST_test_trunk_123',
        validPhoneNumber,
        roomCall.name,
        expect.objectContaining({
          participantName: 'Phone Tester',
          playDialtone: true,
          waitUntilAnswered: false,
        })
      );

      // 6. Returns structured response without secrets
      expect(result).toEqual({
        success: true,
        roomName: roomCall.name,
        callId: 'SIP_call_789',
        participantId: 'PA_sip_participant_123',
        participantIdentity: expect.stringContaining('sip-919876543210'),
        deploymentId: 'deploy-test-uuid-999',
        dispatchId: 'dispatch-uuid-456',
      });
    });
  });

  describe('B. Production isolation', () => {
    it('should explicitly request TEST environment and never fall back to PRODUCTION', async () => {
      vi.mocked(agentService.getActiveDeployment).mockImplementation(async (_aId, _tId, envType) => {
        if (envType === 'PRODUCTION') {
          return { id: 'deploy-prod-id', environment: 'PRODUCTION' } as any;
        }
        return undefined as any;
      });

      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, validPhoneNumber)
      ).rejects.toThrow('No active TEST deployment found for this agent');

      // Ensure PRODUCTION was never queried
      expect(agentService.getActiveDeployment).toHaveBeenCalledWith(agentId, tenantId, 'TEST');
      expect(agentService.getActiveDeployment).not.toHaveBeenCalledWith(agentId, tenantId, 'PRODUCTION');
      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });
  });

  describe('C. Tenant isolation', () => {
    it('should reject call when agent belongs to another tenant', async () => {
      vi.mocked(agentService.getAgent).mockResolvedValue(undefined as any);

      await expect(
        livekitService.createOutboundPhoneCall(agentId, 'other-tenant-999', validPhoneNumber)
      ).rejects.toThrow('Agent not found');

      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockCreateDispatch).not.toHaveBeenCalled();
      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });
  });

  describe('D. No active TEST deployment', () => {
    it('should fail safely when agent has no active TEST deployment', async () => {
      vi.mocked(agentService.getActiveDeployment).mockResolvedValue(null as any);

      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, validPhoneNumber)
      ).rejects.toThrow('No active TEST deployment found for this agent');

      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });
  });

  describe('E. Invalid phone number', () => {
    it('should reject invalid phone numbers before room or SIP creation', async () => {
      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, 'not-a-number')
      ).rejects.toThrow('Invalid phone number');

      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockCreateDispatch).not.toHaveBeenCalled();
      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });

    it('should reject local number without country code', async () => {
      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, '9876543210')
      ).rejects.toThrow('Invalid phone number');

      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });
  });

  describe('F. SIP failure & safe error handling', () => {
    it('should return safe error when SipClient fails, without leaking API secrets', async () => {
      mockCreateSipParticipant.mockRejectedValue(new Error('LiveKit SIP Gateway internal timeout'));

      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, validPhoneNumber)
      ).rejects.toThrow('Failed to initiate SIP outbound call');

      expect(mockCreateRoom).toHaveBeenCalledTimes(1);
    });

    it('should return safe error when LiveKit RoomServiceClient fails', async () => {
      mockCreateRoom.mockRejectedValue(new Error('Connection refused to LiveKit'));

      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, validPhoneNumber)
      ).rejects.toThrow('Failed to create LiveKit room for phone test');

      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });

    it('should return safe error when LiveKit AgentDispatchClient fails', async () => {
      mockCreateDispatch.mockRejectedValue(new Error('Worker queue offline'));

      await expect(
        livekitService.createOutboundPhoneCall(agentId, tenantId, validPhoneNumber)
      ).rejects.toThrow('Failed to dispatch LiveKit agent worker');

      expect(mockCreateSipParticipant).not.toHaveBeenCalled();
    });
  });

  describe('Route: POST /api/admin/clients/:clientId/agents/:agentId/phone-test', () => {
    it('should return 200 and call details on successful request', async () => {
      // Find the route handler in agentRouter
      const routeLayer = (agentRouter.stack as any[]).find(
        (layer) =>
          layer.route?.path === '/clients/:clientId/agents/:agentId/phone-test' &&
          layer.route?.methods?.post
      );

      expect(routeLayer).toBeDefined();

      const handlers = routeLayer.route.stack.map((s: any) => s.handle);
      const mainHandler = handlers[handlers.length - 1];

      const req = {
        params: { clientId: tenantId, agentId },
        body: { phoneNumber: validPhoneNumber },
        user: { userId: 'admin-user-1', role: 'ADMIN', tenantId },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await mainHandler(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          deploymentId: 'deploy-test-uuid-999',
          callId: 'SIP_call_789',
        })
      );
    });

    it('should return 400 when phone number is invalid', async () => {
      const routeLayer = (agentRouter.stack as any[]).find(
        (layer) =>
          layer.route?.path === '/clients/:clientId/agents/:agentId/phone-test' &&
          layer.route?.methods?.post
      );

      const handlers = routeLayer.route.stack.map((s: any) => s.handle);
      const mainHandler = handlers[handlers.length - 1];

      const req = {
        params: { clientId: tenantId, agentId },
        body: { phoneNumber: 'invalid-number' },
        user: { userId: 'admin-user-1', role: 'ADMIN', tenantId },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await mainHandler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid phone number'),
        })
      );
    });

    it('should return 404 when client does not exist', async () => {
      vi.mocked(db.query.tenants.findFirst).mockResolvedValue(null as any);

      const routeLayer = (agentRouter.stack as any[]).find(
        (layer) =>
          layer.route?.path === '/clients/:clientId/agents/:agentId/phone-test' &&
          layer.route?.methods?.post
      );

      const handlers = routeLayer.route.stack.map((s: any) => s.handle);
      const mainHandler = handlers[handlers.length - 1];

      const req = {
        params: { clientId: 'non-existent-client', agentId },
        body: { phoneNumber: validPhoneNumber },
        user: { userId: 'admin-user-1', role: 'ADMIN' },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await mainHandler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Client not found' });
    });
  });
});
