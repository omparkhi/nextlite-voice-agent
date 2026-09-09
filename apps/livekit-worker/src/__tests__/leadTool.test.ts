import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import {
  createCallbackLeadTool,
  createCallbackLeadArgsSchema,
  toolRegistry,
  type ToolRuntimeContext,
  type LeadToolFailureResult,
} from '../tools/index.ts';

describe('create_callback_lead Native Tool — Module 1C-B', () => {
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

  // TEST 1: Valid lead input → API request is sent correctly
  it('1. sends correctly formatted API request for valid lead input', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'lead-uuid-12345', customerName: 'Aarav Patel' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, {
      fetchFn: fetchSpy as unknown as typeof fetch,
    });

    const result = await tool.execute({
      customerName: 'Aarav Patel',
      customerPhone: '+919988776655',
      customerEmail: 'aarav@example.com',
      interestCategory: '3BHK Villa Inquiry',
      notes: 'Please call after 5 PM',
      metadata: { preferredTime: 'evening' },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3001/api/internal/leads',
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
          callSessionId: mockCallSessionId,
          customerEmail: 'aarav@example.com',
          interestCategory: '3BHK Villa Inquiry',
          notes: 'Please call after 5 PM',
          metadata: { preferredTime: 'evening' },
        }),
      }),
    );

    expect(result).toEqual({
      success: true,
      leadId: 'lead-uuid-12345',
      message: 'Callback request recorded successfully. Our team will contact the customer.',
    });
  });

  // TEST 2: Missing customerName → validation failure
  it('2. returns INVALID_ARGUMENTS failure when customerName is missing or empty', async () => {
    const fetchSpy = vi.fn();
    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: '   ',
      customerPhone: '+919876543210',
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 3: Missing customerPhone without callerPhone fallback → validation failure
  it('3. returns INVALID_ARGUMENTS failure when customerPhone is omitted and no callerPhone in context', async () => {
    const fetchSpy = vi.fn();
    const contextWithoutPhone: ToolRuntimeContext = {
      deploymentId: mockDeploymentId,
    };
    const tool = createCallbackLeadTool(contextWithoutPhone, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect((result as LeadToolFailureResult).message).toContain('Customer phone number is required');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 4: Invalid email → validation failure
  it('4. returns INVALID_ARGUMENTS failure when email is malformed', async () => {
    const fetchSpy = vi.fn();
    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      customerPhone: '+919876543210',
      customerEmail: 'invalid-email-address',
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 5: Long notes → validation failure
  it('5. returns INVALID_ARGUMENTS failure when notes exceed 2000 characters', async () => {
    const fetchSpy = vi.fn();
    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Rohan Sharma',
      customerPhone: '+919876543210',
      notes: 'a'.repeat(2001),
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('INVALID_ARGUMENTS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // TEST 6: Caller phone fallback → trusted runtimeContext.callerPhone is used
  it('6. falls back to trusted callerPhone when customerPhone is not provided in args', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'lead-fallback-123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Pooja Hegde',
      interestCategory: 'Dental Checkup',
    });

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining(`"customerPhone":"${mockCallerPhone}"`),
      }),
    );
  });

  // TEST 7: Explicit customerPhone takes precedence over callerPhone
  it('7. uses explicit customerPhone rather than callerPhone when both are available', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'lead-explicit-123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    await tool.execute({
      customerName: 'Pooja Hegde',
      customerPhone: '+911122334455', // Explicit phone different from caller phone
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"customerPhone":"+911122334455"'),
      }),
    );
  });

  // TEST 8: deploymentId comes from runtime context, never from LLM input
  it('8. locks deploymentId to trusted runtime context', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'lead-dep-123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    await tool.execute({
      customerName: 'Anil Kumar',
      customerPhone: '+919876543210',
    });

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.deploymentId).toBe(mockDeploymentId);
  });

  // TEST 9: callSessionId comes from runtime context
  it('9. includes trusted callSessionId from runtime context', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'lead-session-123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    await tool.execute({
      customerName: 'Anil Kumar',
      customerPhone: '+919876543210',
    });

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.callSessionId).toBe(mockCallSessionId);
  });

  // TEST 10: API success → returns success:true and leadId
  it('10. returns success:true and leadId upon successful API response', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'lead-success-999' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
    });

    expect(result).toEqual({
      success: true,
      leadId: 'lead-success-999',
      message: 'Callback request recorded successfully. Our team will contact the customer.',
    });
  });

  // TEST 11: API 4xx → structured failure
  it('11. returns structured failure on 4xx API response', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'Deployment is inactive', code: 'DEPLOYMENT_INACTIVE' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('DEPLOYMENT_INACTIVE');
    expect((result as LeadToolFailureResult).message).toContain('Unable to record the callback request');
  });

  // TEST 12: API 5xx → structured failure
  it('12. returns structured failure on 500 server error', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('LEAD_CREATION_FAILED');
    expect((result as LeadToolFailureResult).message).toContain('Unable to record the callback request');
  });

  // TEST 13: Network/timeout → structured SERVICE_UNAVAILABLE failure without throwing
  it('13. returns structured SERVICE_UNAVAILABLE failure on network abort/timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const fetchSpy = vi.fn().mockRejectedValue(abortError);

    const tool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const result = await tool.execute({
      customerName: 'Suresh Raina',
      customerPhone: '+919876543210',
    });

    expect(result.success).toBe(false);
    expect((result as LeadToolFailureResult).error).toBe('SERVICE_UNAVAILABLE');
    expect((result as LeadToolFailureResult).message).toContain('temporary network issue');
  });

  // TEST 14: Tool resolution through ToolRegistry
  it('14. resolves create_callback_lead through ToolRegistry when enabled in RuntimeAgentConfig', () => {
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
            toolId: 'create_callback_lead',
            name: 'create_callback_lead',
            description: 'Custom lead tool description',
            enabled: true,
          },
        ],
      },
      variables: { inputVariables: [], outputVariables: [] },
    };

    const resolvedTools = toolRegistry.resolveTools(config, defaultContext);
    expect(resolvedTools).toHaveLength(1);
    expect(resolvedTools[0].name).toBe('create_callback_lead');
    expect(resolvedTools[0].description).toBe('Custom lead tool description');
  });

  // TEST 15: Schema validation unit checks
  it('15. validates schema edge cases (empty strings vs valid formats)', () => {
    expect(createCallbackLeadArgsSchema.safeParse({ customerName: 'John', customerPhone: '123' }).success).toBe(true);
    expect(
      createCallbackLeadArgsSchema.safeParse({
        customerName: 'John',
        customerPhone: '123',
        customerEmail: '',
      }).success,
    ).toBe(true);
    expect(
      createCallbackLeadArgsSchema.safeParse({
        customerName: 'John',
        customerPhone: '123',
        customerEmail: 'john@example.com',
      }).success,
    ).toBe(true);
    expect(
      createCallbackLeadArgsSchema.safeParse({
        customerName: '',
      }).success,
    ).toBe(false);
  });
});
