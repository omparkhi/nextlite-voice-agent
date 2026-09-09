import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import {
  createBookAppointmentTool,
  createBookAppointmentArgsSchema,
  toolRegistry,
  type ToolRuntimeContext,
  type AppointmentToolSuccessResult,
  type AppointmentToolFailureResult,
} from '../tools/index.ts';

describe('book_appointment Native Tool — Module 1C-C', () => {
  const mockDeploymentId = '11111111-2222-3333-4444-555555555555';
  const mockCallSessionId = '99999999-8888-7777-6666-555555555555';
  const mockCallerPhone = '+919876543210';

  const defaultContext: ToolRuntimeContext = {
    deploymentId: mockDeploymentId,
    callSessionId: mockCallSessionId,
    callerPhone: mockCallerPhone,
    apiUrl: 'http://localhost:3001',
    workerSecret: 'test-worker-secret',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TEST 1: Valid appointment input → API request is sent correctly
  it('1. sends correctly formatted API request for valid appointment input and returns appointmentNumber without UUID in message', async () => {
    const mockResponse = new Response(
      JSON.stringify({ id: 'apt-uuid-12345', appointmentNumber: 'A-001', customerName: 'Aarav Patel', status: 'REQUESTED' }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, {
      fetchFn: fetchSpy as unknown as typeof fetch,
    });

    const result = await tool.execute({
      customerName: 'Aarav Patel',
      customerPhone: '+919988776655',
      title: 'Doctor Consultation',
      resourceName: 'Dr. Sharma',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
      notes: 'First time consultation for dental checkup',
      metadata: { department: 'Dental', source: 'voice_call' },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/appointments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-worker-secret': 'test-worker-secret',
          'Authorization': 'Bearer test-worker-secret',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          deploymentId: mockDeploymentId,
          customerName: 'Aarav Patel',
          customerPhone: '+919988776655',
          title: 'Doctor Consultation',
          bookingDate: '2026-09-09',
          bookingTime: '15:00',
          status: 'REQUESTED',
          callSessionId: mockCallSessionId,
          resourceName: 'Dr. Sharma',
          notes: 'First time consultation for dental checkup',
          metadata: { department: 'Dental', source: 'voice_call' },
        }),
      }),
    );

    expect(result).toEqual({
      success: true,
      appointmentId: 'apt-uuid-12345',
      appointmentNumber: 'A-001',
      status: 'REQUESTED',
      message: 'Your appointment request has been recorded with appointment number A-001. The team will verify availability and confirm it.',
    });
    expect((result as AppointmentToolSuccessResult).message).not.toContain('apt-uuid-12345');
    expect((result as AppointmentToolSuccessResult).message).toContain('A-001');
  });

  // TEST 2: Missing customerName → validation failure
  it('2. returns INVALID_ARGUMENTS failure when customerName is missing or empty', async () => {
    const fetchSpy = vi.fn();
    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: '   ',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 3: Missing customerPhone without callerPhone fallback → validation failure
  it('3. returns INVALID_ARGUMENTS failure when customerPhone is omitted and no callerPhone in context', async () => {
    const fetchSpy = vi.fn();
    const contextWithoutPhone: ToolRuntimeContext = {
      deploymentId: mockDeploymentId,
    };
    const tool = createBookAppointmentTool(contextWithoutPhone, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect((result as AppointmentToolFailureResult).message).toContain('Customer phone number is required');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 4: Missing title → validation failure
  it('4. returns INVALID_ARGUMENTS failure when title is missing or empty', async () => {
    const fetchSpy = vi.fn();
    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      customerPhone: '+919876543210',
      title: '   ',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 5: Missing bookingDate → validation failure
  it('5. returns INVALID_ARGUMENTS failure when bookingDate is missing or empty', async () => {
    const fetchSpy = vi.fn();
    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '',
      bookingTime: '15:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 6: Missing bookingTime → validation failure
  it('6. returns INVALID_ARGUMENTS failure when bookingTime is missing or empty', async () => {
    const fetchSpy = vi.fn();
    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '   ',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 7: Excessively long fields → validation failure
  it('7. returns INVALID_ARGUMENTS failure when fields exceed length limits', async () => {
    const fetchSpy = vi.fn();
    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
      notes: 'a'.repeat(2001),
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 8: Caller phone fallback → trusted runtimeContext.callerPhone is used
  it('8. falls back to trusted callerPhone when customerPhone is omitted in args', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'apt-fallback-123', status: 'REQUESTED' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Pooja Hegde',
      title: 'Property Site Visit',
      bookingDate: '2026-09-10',
      bookingTime: '11:00',
    });

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining(`"customerPhone":"${mockCallerPhone}"`),
      }),
    );
  });

  // TEST 9: Explicit customerPhone takes precedence over callerPhone
  it('9. uses explicit customerPhone rather than callerPhone when both are available', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'apt-explicit-123', status: 'REQUESTED' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    await tool.execute({
      customerName: 'Pooja Hegde',
      customerPhone: '+911122334455', // Explicit phone different from caller phone
      title: 'Property Site Visit',
      bookingDate: '2026-09-10',
      bookingTime: '11:00',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"customerPhone":"+911122334455"'),
      }),
    );
  });

  // TEST 10: deploymentId comes from runtime context, never from LLM input
  it('10. locks deploymentId to trusted runtime context', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'apt-dep-123', status: 'REQUESTED' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    await tool.execute({
      customerName: 'Anil Kumar',
      customerPhone: '+919876543210',
      title: 'Demo Class',
      bookingDate: '2026-09-11',
      bookingTime: '16:00',
    });

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.deploymentId).toBe(mockDeploymentId);
  });

  // TEST 11: callSessionId comes from runtime context
  it('11. includes trusted callSessionId from runtime context', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'apt-session-123', status: 'REQUESTED' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    await tool.execute({
      customerName: 'Anil Kumar',
      customerPhone: '+919876543210',
      title: 'Demo Class',
      bookingDate: '2026-09-11',
      bookingTime: '16:00',
    });

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.callSessionId).toBe(mockCallSessionId);
  });

  // TEST 12: API success → returns success:true, appointmentId, appointmentNumber, status:REQUESTED
  it('12. returns success:true, appointmentId, appointmentNumber, and status:REQUESTED upon successful API response', async () => {
    const mockResponse = new Response(
      JSON.stringify({ id: 'apt-success-999', appointmentNumber: 'A-042', status: 'REQUESTED' }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    });

    expect(result).toEqual({
      success: true,
      appointmentId: 'apt-success-999',
      appointmentNumber: 'A-042',
      status: 'REQUESTED',
      message: 'Your appointment request has been recorded with appointment number A-042. The team will verify availability and confirm it.',
    });
    expect((result as AppointmentToolSuccessResult).message).not.toContain('apt-success-999');
    expect((result as AppointmentToolSuccessResult).message).toContain('A-042');
  });

  // TEST 13: API 4xx → structured failure
  it('13. returns structured failure on 4xx API response', async () => {
    const mockResponse = new Response(
      JSON.stringify({ error: 'Deployment is inactive', code: 'DEPLOYMENT_INACTIVE' }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('DEPLOYMENT_INACTIVE');
    expect((result as AppointmentToolFailureResult).message).toContain('Unable to record the appointment request');
  });

  // TEST 14: API 5xx → structured failure
  it('14. returns structured failure on 500 server error', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('APPOINTMENT_REQUEST_FAILED');
    expect((result as AppointmentToolFailureResult).message).toContain('Unable to record the appointment request');
  });

  // TEST 15: Network/timeout → structured SERVICE_UNAVAILABLE failure without throwing
  it('15. returns structured SERVICE_UNAVAILABLE failure on network abort/timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const fetchSpy = vi.fn().mockRejectedValue(abortError);

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
      title: 'Loan Consultation',
      bookingDate: '2026-09-12',
      bookingTime: '14:00',
    });

    expect(result.success).toBe(false);
    expect((result as AppointmentToolFailureResult).error).toBe('SERVICE_UNAVAILABLE');
    expect((result as AppointmentToolFailureResult).message).toContain('temporary network issue');
  });

  // TEST 16: Tool resolution through ToolRegistry
  it('16. resolves book_appointment through ToolRegistry when enabled in RuntimeAgentConfig', () => {
    const config: RuntimeAgentConfig = {
      tenant: { tenantId: 'tenant-1' },
      agent: { agentId: 'agent-1', agentName: 'Test Agent', status: 'LIVE' },
      deployment: { deploymentId: mockDeploymentId, versionId: 'ver-1' },
      prompt: { compiledSystemPrompt: 'Prompt' },
      voice: { provider: 'sarvam', voiceId: 'priya' },
      language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
      runtime: {},
      knowledge: { enabled: false },
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'book_appointment',
            name: 'book_appointment',
            description: 'Custom appointment tool description',
            enabled: true,
          },
        ],
      },
      variables: { inputVariables: [], outputVariables: [] },
    };

    const resolvedTools = toolRegistry.resolveTools(config, defaultContext);
    expect(resolvedTools).toHaveLength(1);
    expect(resolvedTools[0].name).toBe('book_appointment');
    expect(resolvedTools[0].description).toBe('Custom appointment tool description');
  });

  // TEST 17: Disabled tool is not exposed by ToolRegistry
  it('17. omits book_appointment when enabled is false in RuntimeAgentConfig', () => {
    const config: RuntimeAgentConfig = {
      tenant: { tenantId: 'tenant-1' },
      agent: { agentId: 'agent-1', agentName: 'Test Agent', status: 'LIVE' },
      deployment: { deploymentId: mockDeploymentId, versionId: 'ver-1' },
      prompt: { compiledSystemPrompt: 'Prompt' },
      voice: { provider: 'sarvam', voiceId: 'priya' },
      language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
      runtime: {},
      knowledge: { enabled: false },
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'book_appointment',
            name: 'book_appointment',
            description: 'Custom appointment tool description',
            enabled: false,
          },
        ],
      },
      variables: { inputVariables: [], outputVariables: [] },
    };

    const resolvedTools = toolRegistry.resolveTools(config, defaultContext);
    expect(resolvedTools).toHaveLength(0);
  });

  // TEST 18: Multi-industry payloads work seamlessly
  it('18. supports multi-industry appointment payloads without branching', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'apt-multi-123', status: 'REQUESTED' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const industries = [
      {
        title: 'Doctor Consultation',
        resourceName: 'Dr. Sharma',
        bookingDate: '2026-09-09',
        bookingTime: '10:00',
        metadata: { clinic: 'Apollo Dental', specialization: 'Orthodontics' },
      },
      {
        title: 'Property Site Visit',
        resourceName: '3BHK Villa',
        bookingDate: '2026-09-10',
        bookingTime: '16:00',
        metadata: { propertyId: 'PROP-902', location: 'Whitefield' },
      },
      {
        title: 'Demo Class',
        resourceName: 'JEE Batch',
        bookingDate: '2026-09-11',
        bookingTime: '11:00',
        metadata: { course: 'Physics JEE Advanced', center: 'Indiranagar' },
      },
      {
        title: 'Loan Consultation',
        resourceName: 'Home Loan',
        bookingDate: '2026-09-12',
        bookingTime: '14:30',
        metadata: { loanType: 'Home Loan', requestedAmount: '80L' },
      },
    ];

    for (const ind of industries) {
      const result = await tool.execute({
        customerName: 'Client Contact',
        customerPhone: '+919876543210',
        title: ind.title,
        resourceName: ind.resourceName,
        bookingDate: ind.bookingDate,
        bookingTime: ind.bookingTime,
        metadata: ind.metadata,
      });

      expect(result.success).toBe(true);
      expect((result as AppointmentToolSuccessResult).status).toBe('REQUESTED');
    }
  });

  // TEST 19: Schema validation unit checks
  it('19. validates schema edge cases (optional fields vs required fields)', () => {
    expect(
      createBookAppointmentArgsSchema.safeParse({
        customerName: 'John Doe',
        title: 'Consultation',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      }).success,
    ).toBe(true);

    expect(
      createBookAppointmentArgsSchema.safeParse({
        customerName: 'John Doe',
        customerPhone: '+919876543210',
        title: 'Consultation',
        resourceName: 'Dr. John',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
        notes: 'Some notes',
        metadata: { key: 'value' },
      }).success,
    ).toBe(true);

    // Missing title -> false
    expect(
      createBookAppointmentArgsSchema.safeParse({
        customerName: 'John Doe',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      }).success,
    ).toBe(false);

    // Missing bookingDate -> false
    expect(
      createBookAppointmentArgsSchema.safeParse({
        customerName: 'John Doe',
        title: 'Consultation',
        bookingTime: '15:00',
      }).success,
    ).toBe(false);

    // Missing bookingTime -> false
    expect(
      createBookAppointmentArgsSchema.safeParse({
        customerName: 'John Doe',
        title: 'Consultation',
        bookingDate: '2026-09-09',
      }).success,
    ).toBe(false);
  });
});
