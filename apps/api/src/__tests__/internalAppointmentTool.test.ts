import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies
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
    appointmentService: {
      createAppointment: vi.fn(),
    },
    leadService: {
      createLead: vi.fn(),
    },
    getKnowledgeService: vi.fn(),
    callSessionService: {
      createCallSession: vi.fn(),
      updateCallSession: vi.fn(),
    },
    phoneNumberService: {
      lookupPhoneNumber: vi.fn(),
      createPhoneNumber: vi.fn(),
    },
  };
});

import { authenticateWorkerSecret } from '../middleware/workerAuth';
import { runtimeAgentConfigService, RuntimeConfigError } from '../services/runtimeAgentConfig';
import { appointmentService } from '../services';
import internalRouter from '../routes/internal';
import { env } from '../config/env';

describe('Internal Appointment Creation Endpoint (POST /api/internal/appointments)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  const validDeploymentId = '11111111-1111-4111-8111-111111111111';
  const authoritativeTenantId = '22222222-2222-4222-8222-222222222222';
  const authoritativeAgentId = '33333333-3333-4333-8333-333333333333';
  const validCallSessionId = '44444444-4444-4444-8444-444444444444';

  const mockRuntimeConfig = {
    tenant: { tenantId: authoritativeTenantId },
    agent: { agentId: authoritativeAgentId, agentName: 'Multi-Industry Voice Agent', status: 'LIVE' },
    deployment: { deploymentId: validDeploymentId, versionId: 'ver-100', versionNumber: 1 },
    prompt: { compiledSystemPrompt: 'Test prompt' },
    voice: { provider: 'sarvam', voiceId: 'priya' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
    runtime: {},
    knowledge: { enabled: false },
    tools: { enabled: true, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

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

    (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockResolvedValue(mockRuntimeConfig);
    (appointmentService.createAppointment as any).mockImplementation((data: any) =>
      Promise.resolve({
        id: 'apt-created-12345',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  function getRouteHandler() {
    const routeLayer = internalRouter.stack.find(
      (layer: any) => layer.route && layer.route.path === '/appointments' && layer.route.methods.post,
    );
    if (!routeLayer || !routeLayer.route) {
      throw new Error('Route POST /appointments not found');
    }
    return routeLayer.route.stack[0].handle;
  }

  // TEST 1: Valid authenticated worker request with deploymentId -> appointment created
  it('1. creates appointment with authoritative tenantId and agentId derived from deploymentId', async () => {
    mockReq.body = {
      deploymentId: validDeploymentId,
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      resourceName: 'Dr. Sharma',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
      notes: 'First time consultation for dental checkup',
      metadata: { department: 'Dental', source: 'voice_call' },
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(runtimeAgentConfigService.resolveRuntimeAgentConfig).toHaveBeenCalledWith(validDeploymentId);
    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: authoritativeTenantId,
        agentId: authoritativeAgentId,
        customerName: 'Aarav Patel',
        customerPhone: '+919876543210',
        title: 'Doctor Consultation',
        resourceName: 'Dr. Sharma',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
        notes: 'First time consultation for dental checkup',
        metadata: { department: 'Dental', source: 'voice_call' },
        status: 'REQUESTED',
      }),
    );
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'apt-created-12345',
        customerName: 'Aarav Patel',
        status: 'REQUESTED',
      }),
    );
  });

  // TEST 2: Missing deploymentId and missing tenant/agent -> rejected
  it('2. rejects request when neither deploymentId nor (tenantId + agentId) is provided', async () => {
    mockReq.body = {
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid request body',
      }),
    );
  });

  // TEST 3: Invalid deploymentId format -> rejected
  it('3. rejects request when deploymentId is not a valid UUID', async () => {
    mockReq.body = {
      deploymentId: 'not-a-valid-uuid',
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid request body',
      }),
    );
  });

  // TEST 4: Inactive deployment -> 409 Conflict
  it('4. returns 409 Conflict when deployment is inactive', async () => {
    (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
      new RuntimeConfigError(
        'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
        'Deployment is inactive and cannot accept calls',
      ),
    );

    mockReq.body = {
      deploymentId: validDeploymentId,
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(409);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
      }),
    );
  });

  // TEST 5: Deployment not found -> 404 Not Found
  it('5. returns 404 Not Found when deployment is not found', async () => {
    (runtimeAgentConfigService.resolveRuntimeAgentConfig as any).mockRejectedValue(
      new RuntimeConfigError('RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND', 'Deployment not found'),
    );

    mockReq.body = {
      deploymentId: validDeploymentId,
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
      }),
    );
  });

  // TEST 6: Invalid worker secret -> 401 Unauthorized
  it('6. rejects request when worker authentication secret is missing or invalid', async () => {
    mockReq.headers = { 'x-worker-secret': 'wrong-secret-value' };

    authenticateWorkerSecret(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  // TEST 7: Tenant/Agent spoofing protection -> overrides spoofed tenantId/agentId with derived ones
  it('7. derives tenantId and agentId strictly from deploymentId, ignoring spoofed values', async () => {
    mockReq.body = {
      deploymentId: validDeploymentId,
      tenantId: '99999999-9999-4999-8999-999999999999', // Spoofed attacker tenant
      agentId: '88888888-8888-4888-8888-888888888888', // Spoofed attacker agent
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Site Visit',
      bookingDate: '2026-09-10',
      bookingTime: '11:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: authoritativeTenantId,
        agentId: authoritativeAgentId,
      }),
    );
  });

  // TEST 8: Appointment fields persisted correctly
  it('8. trims and stores all fields properly', async () => {
    mockReq.body = {
      deploymentId: validDeploymentId,
      customerName: '  Priya Sharma  ',
      customerPhone: '  +919876543210  ',
      title: '  Demo Class  ',
      resourceName: '  JEE Physics Batch  ',
      bookingDate: '  2026-09-11  ',
      bookingTime: '  17:00  ',
      notes: '  Student needs demo session for mechanics  ',
      metadata: { grade: '12th', mode: 'offline' },
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Priya Sharma',
        customerPhone: '+919876543210',
        title: 'Demo Class',
        resourceName: 'JEE Physics Batch',
        bookingDate: '2026-09-11',
        bookingTime: '17:00',
        notes: 'Student needs demo session for mechanics',
        metadata: { grade: '12th', mode: 'offline' },
      }),
    );
  });

  // TEST 9: Default status remains REQUESTED
  it('9. sets default status to REQUESTED when not explicitly provided', async () => {
    mockReq.body = {
      deploymentId: validDeploymentId,
      customerName: 'Rahul Verma',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'REQUESTED',
      }),
    );
  });

  // TEST 10: callSessionId persisted when supplied
  it('10. passes through valid callSessionId when provided', async () => {
    mockReq.body = {
      deploymentId: validDeploymentId,
      callSessionId: validCallSessionId,
      customerName: 'Rahul Verma',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        callSessionId: validCallSessionId,
      }),
    );
  });

  // TEST 11: Database failure -> returns 400 with error message
  it('11. handles appointmentService error gracefully and returns 400', async () => {
    (appointmentService.createAppointment as any).mockRejectedValue(new Error('PostgreSQL connection timeout'));

    mockReq.body = {
      deploymentId: validDeploymentId,
      customerName: 'Rahul Verma',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    };

    const handler = getRouteHandler();
    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'PostgreSQL connection timeout',
      }),
    );
  });

  // Multi-industry tests: Same endpoint handles Healthcare, Real Estate, Education, Finance
  it('12. handles multi-industry payloads identically without branching', async () => {
    const industries = [
      {
        title: 'Doctor Consultation',
        resourceName: 'Dr. Sharma',
        bookingDate: '2026-09-09',
        bookingTime: '10:00',
        meta: { clinic: 'Apollo Dental', specialization: 'Orthodontics' },
      },
      {
        title: 'Property Site Visit',
        resourceName: '3BHK Villa',
        bookingDate: '2026-09-10',
        bookingTime: '16:00',
        meta: { propertyId: 'PROP-902', location: 'Whitefield' },
      },
      {
        title: 'Demo Class',
        resourceName: 'JEE Batch',
        bookingDate: '2026-09-11',
        bookingTime: '11:00',
        meta: { course: 'Physics JEE Advanced', center: 'Indiranagar' },
      },
      {
        title: 'Loan Consultation',
        resourceName: 'Home Loan',
        bookingDate: '2026-09-12',
        bookingTime: '14:30',
        meta: { loanType: 'Home Loan', requestedAmount: '80L' },
      },
    ];

    const handler = getRouteHandler();

    for (const ind of industries) {
      mockReq.body = {
        deploymentId: validDeploymentId,
        customerName: 'Client Contact',
        customerPhone: '+919876543210',
        title: ind.title,
        resourceName: ind.resourceName,
        bookingDate: ind.bookingDate,
        bookingTime: ind.bookingTime,
        metadata: ind.meta,
      };

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(appointmentService.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: ind.title,
          resourceName: ind.resourceName,
          bookingDate: ind.bookingDate,
          bookingTime: ind.bookingTime,
          metadata: ind.meta,
        }),
      );
    }
  });
});
