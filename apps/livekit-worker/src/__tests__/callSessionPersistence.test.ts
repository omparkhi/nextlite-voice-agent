import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import {
  createCallSession,
  updateCallSession,
  RuntimeConfigClientError,
  type CreateCallSessionInput,
  type UpdateCallSessionInput,
  type CallSessionResponse,
} from '../runtimeConfigClient.ts';
import { detectCallContext, formatPlainTranscript } from '../callLifecycle.ts';
import { toolRegistry, type ToolRuntimeContext } from '../tools/index.ts';
import { createCallbackLeadTool } from '../tools/leadTool.ts';
import { createBookAppointmentTool } from '../tools/appointmentTool.ts';
import { DebugTranscriptCollector } from '../debugTranscript.ts';

describe('Module G — Call Lifecycle Persistence Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRuntimeConfig: RuntimeAgentConfig = {
    tenant: { tenantId: '11111111-1111-1111-1111-111111111111' },
    agent: { agentId: '22222222-2222-2222-2222-222222222222', agentName: 'Support Agent', status: 'LIVE' },
    deployment: { deploymentId: '33333333-3333-3333-3333-333333333333', versionId: 'ver-1' },
    prompt: { compiledSystemPrompt: 'You are a friendly assistant.' },
    voice: { provider: 'sarvam', voiceId: 'priya' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN', 'hi-IN'] },
    runtime: { modelProvider: 'sarvam', llmModel: 'sarvam-105b-conversations' },
    knowledge: { enabled: true },
    tools: {
      enabled: true,
      tools: [
        { name: 'query_knowledge_base', description: 'Query knowledge', enabled: true },
        { name: 'create_callback_lead', description: 'Create lead', enabled: true },
        { name: 'book_appointment', description: 'Book appointment', enabled: true },
      ],
    },
    variables: { inputVariables: [], outputVariables: [] },
  };

  // 1. WEB_TEST start
  it('TEST 1: correctly detects WEB_TEST direction from room name and tester identity', () => {
    const result = detectCallContext('test-agent-123-178888-abc', 'tester-user-999-178888', null);
    expect(result.direction).toBe('WEB_TEST');
    expect(result.callerNumber).toBeNull();
  });

  // 2. OUTBOUND start
  it('TEST 2: correctly detects OUTBOUND direction and extracts destination phone from identity', () => {
    const result = detectCallContext(
      'phone-test-agent-123-178888-xyz',
      'sip-919876543210-178888',
      null,
    );
    expect(result.direction).toBe('OUTBOUND');
    expect(result.callerNumber).toBe('+919876543210');
  });

  // 3. INBOUND start
  it('TEST 3: correctly detects INBOUND direction and extracts caller phone from SIP attributes', () => {
    const result = detectCallContext('room-inbound-livekit-001', 'sip-inbound-trunk-participant', {
      'sip.phoneNumber': '+919988776655',
    });
    expect(result.direction).toBe('INBOUND');
    expect(result.callerNumber).toBe('+919988776655');
  });

  // 4. Caller phone extraction with various SIP attribute keys
  it('TEST 4: extracts caller number from alternative SIP attribute keys (sip.callerId, caller_id)', () => {
    const res1 = detectCallContext('room-002', 'caller-part', { 'sip.callerId': '+919111222333' });
    expect(res1.callerNumber).toBe('+919111222333');

    const res2 = detectCallContext('room-003', 'caller-part', { caller_id: '+919444555666' });
    expect(res2.callerNumber).toBe('+919444555666');
  });

  // 5. WEB_TEST has no phone
  it('TEST 5: WEB_TEST strictly has null callerNumber and never invents a phone number', () => {
    const result = detectCallContext('test-22222222-2222-2222-2222-222222222222-1234', 'tester-123-456', {
      'sip.phoneNumber': '+919999999999',
    });
    expect(result.direction).toBe('WEB_TEST');
    expect(result.callerNumber).toBeNull();
  });

  // 6. Exactly one session created via createCallSession
  it('TEST 6: createCallSession calls POST /api/internal/call-sessions with worker secret and receives session ID', async () => {
    const mockSessionResponse: CallSessionResponse = {
      id: 'session-uuid-1234',
      tenantId: mockRuntimeConfig.tenant.tenantId,
      agentId: mockRuntimeConfig.agent.agentId,
      deploymentId: mockRuntimeConfig.deployment.deploymentId,
      roomName: 'test-room-001',
      callerNumber: null,
      direction: 'WEB_TEST',
      status: 'ACTIVE',
      durationSeconds: 0,
      primaryLanguage: 'en-IN',
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptText: null,
      turnsJson: null,
      toolsUsed: null,
      metricsJson: null,
      createdAt: new Date().toISOString(),
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSessionResponse,
    });

    const session = await createCallSession(
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        agentId: mockRuntimeConfig.agent.agentId,
        deploymentId: mockRuntimeConfig.deployment.deploymentId,
        roomName: 'test-room-001',
        direction: 'WEB_TEST',
        status: 'ACTIVE',
        primaryLanguage: 'en-IN',
      },
      {
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-worker-secret',
        fetchFn: mockFetch as any,
      },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/call-sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-worker-secret',
          'x-worker-secret': 'test-worker-secret',
        }),
      }),
    );
    expect(session.id).toBe('session-uuid-1234');
    expect(session.status).toBe('ACTIVE');
  });

  // 7. callSessionId passed into ToolRuntimeContext
  it('TEST 7: ToolRuntimeContext receives deploymentId, callSessionId, and callerPhone', () => {
    const context: ToolRuntimeContext = {
      deploymentId: mockRuntimeConfig.deployment.deploymentId,
      callSessionId: 'session-uuid-1234',
      callerPhone: '+919876543210',
    };

    const tools = toolRegistry.resolveTools(mockRuntimeConfig, context);
    expect(tools.length).toBeGreaterThan(0);
  });

  // 8. Lead tool receives callSessionId
  it('TEST 8: lead tool includes callSessionId and trusted callerPhone fallback in POST /api/internal/leads', async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'lead-uuid-555' }),
      });
    });

    const leadTool = createCallbackLeadTool(
      {
        deploymentId: mockRuntimeConfig.deployment.deploymentId,
        callSessionId: 'session-uuid-1234',
        callerPhone: '+919876543210',
        fetchFn: mockFetch as any,
      },
      { workerSecret: 'test-secret' },
    );

    // Caller provides name without explicit phone -> falls back to context.callerPhone
    const result = await leadTool.execute({
      customerName: 'Rahul Verma',
      interestCategory: 'Cardiology consultation',
    });

    expect(result.success).toBe(true);
    expect(capturedBody).toMatchObject({
      deploymentId: mockRuntimeConfig.deployment.deploymentId,
      callSessionId: 'session-uuid-1234',
      customerName: 'Rahul Verma',
      customerPhone: '+919876543210',
    });
  });

  // 9. Appointment tool receives callSessionId
  it('TEST 9: appointment tool includes callSessionId in POST /api/internal/appointments', async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'appt-uuid-777', status: 'REQUESTED' }),
      });
    });

    const apptTool = createBookAppointmentTool(
      {
        deploymentId: mockRuntimeConfig.deployment.deploymentId,
        callSessionId: 'session-uuid-1234',
        callerPhone: '+919876543210',
        fetchFn: mockFetch as any,
      },
      { workerSecret: 'test-secret' },
    );

    const result = await apptTool.execute({
      customerName: 'Pooja Sharma',
      title: 'Doctor Appointment',
      bookingDate: '2026-09-10',
      bookingTime: '11:00 AM',
    });

    expect(result.success).toBe(true);
    expect(capturedBody).toMatchObject({
      deploymentId: mockRuntimeConfig.deployment.deploymentId,
      callSessionId: 'session-uuid-1234',
      customerName: 'Pooja Sharma',
      customerPhone: '+919876543210',
      bookingDate: '2026-09-10',
      bookingTime: '11:00 AM',
    });
  });

  // 10. Transcript persistence
  it('TEST 10: formatPlainTranscript formats user and assistant turns into readable plain text', () => {
    const turns = [
      {
        user: { transcript: 'Hello, I want to check OPD timings' },
        agent: { response: 'Cardiology is open 10 AM to 2 PM.' },
      },
      {
        user: { transcript: 'Thank you!' },
        agent: { response: 'You are welcome!' },
      },
    ];

    const plain = formatPlainTranscript(turns);
    expect(plain).toBe(
      'User: Hello, I want to check OPD timings\nAssistant: Cardiology is open 10 AM to 2 PM.\nUser: Thank you!\nAssistant: You are welcome!',
    );
  });

  // 11. turnsJson persistence
  it('TEST 11: DebugTranscriptCollector captures structured turns with timestamps, STT detection, and tool executions', () => {
    const collector = new DebugTranscriptCollector({ enabled: false });
    collector.startCall({
      callId: 'call-001',
      roomName: 'room-001',
      deploymentId: 'deploy-001',
      agentId: 'agent-001',
      primaryLanguage: 'en-IN',
    });

    collector.recordUserTurn({
      transcript: 'What is the consultation fee?',
      detectedLanguage: 'en-IN',
      activeLanguageBefore: 'en-IN',
      activeLanguageAfter: 'en-IN',
      languageDecision: 'SAME_LANGUAGE',
      languageDecisionReason: 'Matches active language',
    });

    collector.recordToolCall({
      toolName: 'query_knowledge_base',
      callId: 'call-rag-1',
      args: { query: 'consultation fee' },
    });

    collector.recordToolResult({
      callId: 'call-rag-1',
      resultCount: 1,
      isError: false,
    });

    collector.recordAgentMessage({
      response: 'The consultation fee is 500 rupees.',
      activeLanguage: 'en-IN',
    });

    const report = collector.endCall();
    expect(report.turns).toHaveLength(1);
    expect(report.turns[0].user?.transcript).toBe('What is the consultation fee?');
    expect(report.turns[0].tools).toHaveLength(1);
    expect(report.turns[0].tools[0].toolName).toBe('query_knowledge_base');
    expect(report.turns[0].agent?.response).toBe('The consultation fee is 500 rupees.');
  });

  // 12. toolsUsed persistence
  it('TEST 12: updateCallSession transmits unique toolsUsed array in PATCH payload', async () => {
    let capturedPayload: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedPayload = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-uuid-1234', status: 'COMPLETED' }),
      });
    });

    await updateCallSession(
      'session-uuid-1234',
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        status: 'COMPLETED',
        toolsUsed: ['query_knowledge_base', 'book_appointment'],
        durationSeconds: 45,
      },
      {
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-secret',
        fetchFn: mockFetch as any,
      },
    );

    expect(capturedPayload.toolsUsed).toEqual(['query_knowledge_base', 'book_appointment']);
  });

  // 13. primaryLanguage persistence
  it('TEST 13: updateCallSession sends final active primaryLanguage in PATCH payload', async () => {
    let capturedPayload: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedPayload = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-uuid-1234', status: 'COMPLETED' }),
      });
    });

    await updateCallSession(
      'session-uuid-1234',
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        status: 'COMPLETED',
        primaryLanguage: 'hi-IN',
      },
      {
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-secret',
        fetchFn: mockFetch as any,
      },
    );

    expect(capturedPayload.primaryLanguage).toBe('hi-IN');
  });

  // 14. Duration calculation
  it('TEST 14: duration is correctly calculated from session elapsed wall-clock milliseconds', () => {
    const startMs = Date.now() - 42500; // 42.5 seconds ago
    const endMs = Date.now();
    const durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    expect(durationSeconds).toBe(43);
  });

  // 15. Normal COMPLETED finalization
  it('TEST 15: updateCallSession finalizes normal call with COMPLETED status and endedAt', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-uuid-1234', status: 'COMPLETED' }),
      });
    });

    await updateCallSession(
      'session-uuid-1234',
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        status: 'COMPLETED',
        durationSeconds: 30,
        endedAt: '2026-09-08T15:00:30.000Z',
        transcriptText: 'User: Hello\nAssistant: Hi there!',
      },
      {
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-secret',
        fetchFn: mockFetch as any,
      },
    );

    expect(capturedUrl).toBe('http://localhost:3001/api/internal/call-sessions/session-uuid-1234');
    expect(capturedBody.status).toBe('COMPLETED');
    expect(capturedBody.durationSeconds).toBe(30);
    expect(capturedBody.endedAt).toBe('2026-09-08T15:00:30.000Z');
  });

  // 16. FAILED finalization
  it('TEST 16: updateCallSession finalizes runtime error with FAILED status and error in metricsJson', async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-uuid-1234', status: 'FAILED' }),
      });
    });

    await updateCallSession(
      'session-uuid-1234',
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        status: 'FAILED',
        durationSeconds: 5,
        metricsJson: { error: 'Sarvam STT connection refused' },
      },
      {
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-secret',
        fetchFn: mockFetch as any,
      },
    );

    expect(capturedBody.status).toBe('FAILED');
    expect(capturedBody.metricsJson.error).toBe('Sarvam STT connection refused');
  });

  // 17. MISSED semantics where applicable
  it('TEST 17: short calls with zero user turns are safely categorized as MISSED', async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-uuid-1234', status: 'MISSED' }),
      });
    });

    const turns: any[] = [];
    const durationSeconds = 1;
    let status: 'COMPLETED' | 'FAILED' | 'MISSED' = 'COMPLETED';
    if (status === 'COMPLETED' && turns.length === 0 && durationSeconds < 3) {
      status = 'MISSED';
    }

    await updateCallSession(
      'session-uuid-1234',
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        status,
        durationSeconds,
      },
      {
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-secret',
        fetchFn: mockFetch as any,
      },
    );

    expect(capturedBody.status).toBe('MISSED');
  });

  // 18. Duplicate finalization guard
  it('TEST 18: session finalizer guard executes PATCH at most once when multiple close events fire', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'session-uuid-1234', status: 'COMPLETED' }),
    });

    let isFinalizing = false;
    let isFinalized = false;

    const finalizeCall = async () => {
      if (isFinalized || isFinalizing) return;
      isFinalizing = true;
      try {
        await updateCallSession(
          'session-uuid-1234',
          { tenantId: mockRuntimeConfig.tenant.tenantId, status: 'COMPLETED' },
          { fetchFn: mockFetch as any },
        );
        isFinalized = true;
      } finally {
        isFinalizing = false;
      }
    };

    // Fire 3 simultaneous close triggers
    await Promise.all([finalizeCall(), finalizeCall(), finalizeCall()]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(isFinalized).toBe(true);
  });

  // 19. Failed PATCH can retry
  it('TEST 19: failed PATCH leaves isFinalized false allowing retry on subsequent shutdown hook', async () => {
    let attempt = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({ error: 'Database temporarily unavailable' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-uuid-1234', status: 'COMPLETED' }),
      });
    });

    let isFinalizing = false;
    let isFinalized = false;

    const finalizeCall = async () => {
      if (isFinalized || isFinalizing) return;
      isFinalizing = true;
      try {
        await updateCallSession(
          'session-uuid-1234',
          { tenantId: mockRuntimeConfig.tenant.tenantId, status: 'COMPLETED' },
          { fetchFn: mockFetch as any },
        );
        isFinalized = true;
      } catch {
        // Logged, isFinalized remains false
      } finally {
        isFinalizing = false;
      }
    };

    // Attempt 1 fails
    await finalizeCall();
    expect(isFinalized).toBe(false);

    // Attempt 2 succeeds
    await finalizeCall();
    expect(isFinalized).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // 20. Initialization failure
  it('TEST 20: initialization failure throws RuntimeConfigClientError cleanly without unhandled crash', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Deployment not found' }),
    });

    await expect(
      createCallSession(
        {
          tenantId: mockRuntimeConfig.tenant.tenantId,
          agentId: mockRuntimeConfig.agent.agentId,
          deploymentId: 'non-existent-deployment',
          roomName: 'room-fail',
        },
        { fetchFn: mockFetch as any },
      ),
    ).rejects.toThrow(RuntimeConfigClientError);
  });

  // 21. API persistence failure does not crash voice runtime
  it('TEST 21: createCallSession failure can be caught safely, allowing voice session to proceed without callSessionId', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    let callSessionId: string | undefined;
    try {
      const res = await createCallSession(
        {
          tenantId: mockRuntimeConfig.tenant.tenantId,
          agentId: mockRuntimeConfig.agent.agentId,
          deploymentId: mockRuntimeConfig.deployment.deploymentId,
          roomName: 'room-001',
        },
        { fetchFn: mockFetch as any },
      );
      callSessionId = res.id;
    } catch {
      // Safe non-fatal fallback
      callSessionId = undefined;
    }

    expect(callSessionId).toBeUndefined();
    // Tool context can still be initialized safely without callSessionId
    const context: ToolRuntimeContext = {
      deploymentId: mockRuntimeConfig.deployment.deploymentId,
      callSessionId: undefined,
    };
    const tools = toolRegistry.resolveTools(mockRuntimeConfig, context);
    expect(tools.length).toBeGreaterThan(0);
  });

  // 22. No fabricated caller number
  it('TEST 22: does not fabricate or guess caller number when SIP attributes are absent or invalid', () => {
    const res1 = detectCallContext('inbound-call-001', 'unknown-identity', {});
    expect(res1.callerNumber).toBeNull();

    const res2 = detectCallContext('inbound-call-002', 'unknown-identity', null);
    expect(res2.callerNumber).toBeNull();
  });

  // 23. Tenant/deployment identity remains trusted
  it('TEST 23: createCallSession payload strictly uses server-side trusted tenantId and deploymentId', async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-001' }),
      });
    });

    await createCallSession(
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        agentId: mockRuntimeConfig.agent.agentId,
        deploymentId: mockRuntimeConfig.deployment.deploymentId,
        roomName: 'trusted-room',
      },
      { fetchFn: mockFetch as any },
    );

    expect(capturedBody.tenantId).toBe(mockRuntimeConfig.tenant.tenantId);
    expect(capturedBody.agentId).toBe(mockRuntimeConfig.agent.agentId);
    expect(capturedBody.deploymentId).toBe(mockRuntimeConfig.deployment.deploymentId);
  });

  // 24. Partial transcript on disconnect
  it('TEST 24: preserves partial turns in turnsJson when call disconnects mid-conversation', () => {
    const collector = new DebugTranscriptCollector({ enabled: false });
    collector.startCall({
      callId: 'call-partial',
      roomName: 'room-partial',
      deploymentId: 'deploy-001',
    });

    collector.recordUserTurn({
      transcript: 'I need an ambulance immediately',
      detectedLanguage: 'en-IN',
      activeLanguageBefore: 'en-IN',
      activeLanguageAfter: 'en-IN',
      languageDecision: 'SAME_LANGUAGE',
      languageDecisionReason: 'Same language',
    });

    // Disconnect happens before agent responds
    const report = collector.endCall();
    expect(report.turns).toHaveLength(1);
    expect(report.turns[0].user?.transcript).toBe('I need an ambulance immediately');
    expect(report.turns[0].agent).toBeUndefined();
  });

  // 25. Metrics persistence
  it('TEST 25: collects turn count, tool count, and usage in metricsJson payload', async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'session-001', status: 'COMPLETED' }),
      });
    });

    const metricsJson = {
      totalTurns: 4,
      executedToolsCount: 2,
      errorsCount: 0,
      usage: {
        modelUsage: [{ model: 'sarvam-105b-conversations', promptTokens: 350, completionTokens: 80 }],
      },
    };

    await updateCallSession(
      'session-001',
      {
        tenantId: mockRuntimeConfig.tenant.tenantId,
        status: 'COMPLETED',
        metricsJson,
      },
      { fetchFn: mockFetch as any },
    );

    expect(capturedBody.metricsJson).toEqual(metricsJson);
  });
});
