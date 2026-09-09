
import { describe, it, expect, beforeAll, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeLogger, llm } from '@livekit/agents';
import type { RuntimeAgentConfig, RuntimeToolDefinition } from '@nextlite/shared';
import { SarvamLLM } from '../sarvamLlm.ts';
import {
  toolRegistry,
  createCallbackLeadTool,
  createBookAppointmentTool,
  type ToolRuntimeContext,
  type LeadToolSuccessResult,
  type LeadToolFailureResult,
  type AppointmentToolFailureResult,
} from '../tools/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

beforeAll(() => {
  initializeLogger({ pretty: true, level: 'warn' });
});

describe('Module 1C-E — Controlled Real Tool-Calling Validation', () => {
  const sarvamApiKey = process.env.SARVAM_API_KEY;
  const mockDeploymentId = '11111111-2222-3333-4444-555555555555';
  const mockCallSessionId = '99999999-8888-7777-6666-555555555555';
  const mockCallerPhone = '+919876543210';

  interface CapturedPayload {
    deploymentId?: string;
    callSessionId?: string;
    customerName?: string;
    customerPhone?: string;
    status?: string;
    title?: string;
    bookingDate?: string;
    bookingTime?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }

  const defaultContext: ToolRuntimeContext = {
    deploymentId: mockDeploymentId,
    callSessionId: mockCallSessionId,
    callerPhone: mockCallerPhone,
    apiUrl: 'http://localhost:3001',
    workerSecret: 'test-worker-secret',
  };

  const createMockConfig = (toolsList: RuntimeToolDefinition[] = [], knowledgeEnabled = false): RuntimeAgentConfig => ({
    tenant: { tenantId: 'tenant-123' },
    agent: { agentId: 'agent-456', agentName: 'Test Assistant', status: 'LIVE' },
    deployment: { deploymentId: mockDeploymentId, versionId: 'ver-001' },
    prompt: {
      compiledSystemPrompt:
        'You are a helpful assistant. Use tools when appropriate. Never claim an appointment is confirmed; it is only REQUESTED.',
    },
    voice: { provider: 'sarvam', voiceId: 'priya' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'] },
    runtime: { modelProvider: 'sarvam', llmModel: 'sarvam-105b-conversations', temperature: 0.1 },
    knowledge: { enabled: knowledgeEnabled },
    tools: { enabled: true, tools: toolsList },
    variables: { inputVariables: [], outputVariables: [] },
  });

  // =========================================================================
  // SCENARIO A — KNOWLEDGE TOOL ONLY
  // =========================================================================
  it('Scenario A: Sarvam-105B selects query_knowledge_base, retrieves facts, and answers without mutating records', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let knowledgeFetched = false;
    const config = createMockConfig([], true); // knowledge only

    const tools = toolRegistry.resolveTools(config, {
      ...defaultContext,
      fetchFn: (async (url: string) => {
        if (url.includes('/api/internal/knowledge/retrieve')) {
          knowledgeFetched = true;
          return new Response(
            JSON.stringify({
              results: [{ content: 'We offer Python Fullstack, Data Science, and AI Engineering courses.', score: 0.95 }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected call to ${url}`);
      }) as unknown as typeof fetch,
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('query_knowledge_base');

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content: 'You are an institute counselor. When asked about available courses, use query_knowledge_base.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'What courses do you offer?',
    });

    const stream = sarvamLlm.chat({ chatCtx, toolCtx: tools });

    let toolCallReceived: llm.FunctionCall | undefined;
    for await (const chunk of stream) {
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallReceived = chunk.delta.toolCalls[0];
      }
    }

    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived?.name).toBe('query_knowledge_base');

    const toolContext = new llm.ToolContext(tools);
    const toolOutput = await llm.executeToolCall(toolCallReceived!, toolContext);
    expect(toolOutput.isError).toBe(false);
    expect(knowledgeFetched).toBe(true);

    chatCtx.insert([toolCallReceived!, toolOutput]);

    const secondStream = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let finalAnswer = '';
    for await (const chunk of secondStream) {
      if (chunk.delta?.content) {
        finalAnswer += chunk.delta.content;
      }
    }

    expect(finalAnswer.toLowerCase()).toMatch(/python|data science|courses/i);
  });

  // =========================================================================
  // SCENARIO B — LEAD TOOL ONLY
  // =========================================================================
  it('Scenario B: Sarvam-105B selects create_callback_lead, extracts customer info, and records lead', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let leadCreated = false;
    let receivedPayload: CapturedPayload | null = null;

    const config = createMockConfig([
      { toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Record a callback request', enabled: true },
    ]);

    const tools = toolRegistry.resolveTools(config, {
      ...defaultContext,
      fetchFn: (async (url: string, init?: RequestInit) => {
        if (url.includes('/api/internal/leads')) {
          leadCreated = true;
          receivedPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ id: 'lead-real-123' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected call to ${url}`);
      }) as unknown as typeof fetch,
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('create_callback_lead');

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content:
        'You are an admissions assistant. When a user asks for a callback or contact from the team, use create_callback_lead.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'I am interested in admission. My name is Rohan Sharma, please have someone call me.',
    });

    const stream = sarvamLlm.chat({ chatCtx, toolCtx: tools });

    let toolCallReceived: llm.FunctionCall | undefined;
    for await (const chunk of stream) {
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallReceived = chunk.delta.toolCalls[0];
      }
    }

    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived?.name).toBe('create_callback_lead');

    const toolContext = new llm.ToolContext(tools);
    const toolOutput = await llm.executeToolCall(toolCallReceived!, toolContext);
    expect(toolOutput.isError).toBe(false);
    expect(leadCreated).toBe(true);

    expect(receivedPayload.deploymentId).toBe(mockDeploymentId);
    expect(receivedPayload.callSessionId).toBe(mockCallSessionId);
    expect(receivedPayload.customerName.toLowerCase()).toContain('rohan');
    expect(receivedPayload.customerPhone).toBe(mockCallerPhone); // Fallback to trusted caller phone

    chatCtx.insert([toolCallReceived!, toolOutput]);

    const secondStream = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let finalAnswer = '';
    for await (const chunk of secondStream) {
      if (chunk.delta?.content) {
        finalAnswer += chunk.delta.content;
      }
    }

    expect(finalAnswer.toLowerCase()).toMatch(/call|team|contact|rohan/i);
  });

  // =========================================================================
  // SCENARIO C — APPOINTMENT TOOL ONLY
  // =========================================================================
  it('Scenario C: Sarvam-105B selects book_appointment, records REQUESTED status, and never claims confirmed slot', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let appointmentCreated = false;
    let receivedPayload: CapturedPayload | null = null;

    const config = createMockConfig([
      { toolId: 'book_appointment', name: 'book_appointment', description: 'Record an appointment request', enabled: true },
    ]);

    const tools = toolRegistry.resolveTools(config, {
      ...defaultContext,
      fetchFn: (async (url: string, init?: RequestInit) => {
        if (url.includes('/api/internal/appointments')) {
          appointmentCreated = true;
          receivedPayload = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ id: 'apt-real-456', status: 'REQUESTED' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected call to ${url}`);
      }) as unknown as typeof fetch,
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('book_appointment');

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content:
        'You are a clinic assistant. When the user requests an appointment, use book_appointment. ' +
        'Remember: an appointment request is recorded with REQUESTED status; never claim the appointment is confirmed.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'I want an appointment tomorrow at 3 PM for doctor consultation. My name is Aarav Patel.',
    });

    const stream = sarvamLlm.chat({ chatCtx, toolCtx: tools });

    let toolCallReceived: llm.FunctionCall | undefined;
    for await (const chunk of stream) {
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallReceived = chunk.delta.toolCalls[0];
      }
    }

    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived?.name).toBe('book_appointment');

    const toolContext = new llm.ToolContext(tools);
    const toolOutput = await llm.executeToolCall(toolCallReceived!, toolContext);
    expect(toolOutput.isError).toBe(false);
    expect(appointmentCreated).toBe(true);

    expect(receivedPayload.deploymentId).toBe(mockDeploymentId);
    expect(receivedPayload.customerName.toLowerCase()).toContain('aarav');
    expect(receivedPayload.status).toBe('REQUESTED');

    chatCtx.insert([toolCallReceived!, toolOutput]);

    const secondStream = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let finalAnswer = '';
    for await (const chunk of secondStream) {
      if (chunk.delta?.content) {
        finalAnswer += chunk.delta.content;
      }
    }

    // Must communicate that request is recorded and not claim immediate confirmation
    expect(finalAnswer.toLowerCase()).toMatch(/request|recorded|team|verify|confirm/i);
    expect(finalAnswer.toLowerCase()).not.toContain('your slot is confirmed');
  });

  // =========================================================================
  // SCENARIO D — KNOWLEDGE + LEAD MULTI-TURN CONVERSATION
  // =========================================================================
  it('Scenario D: handles multi-turn conversation (Knowledge retrieval followed by Callback Lead creation)', { timeout: 60000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let knowledgeCalled = false;
    let leadCalled = false;

    const config = createMockConfig([
      { toolId: 'query_knowledge_base', name: 'query_knowledge_base', description: 'Query knowledge facts', enabled: true },
      { toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Record callback request', enabled: true },
    ]);

    const tools = toolRegistry.resolveTools(config, {
      ...defaultContext,
      fetchFn: (async (url: string) => {
        if (url.includes('/api/internal/knowledge/retrieve')) {
          knowledgeCalled = true;
          return new Response(
            JSON.stringify({ results: [{ content: 'Python Fullstack batches start every Monday at 10 AM.', score: 0.95 }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/internal/leads')) {
          leadCalled = true;
          return new Response(JSON.stringify({ id: 'lead-multi-turn-1' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected call to ${url}`);
      }) as unknown as typeof fetch,
    });

    expect(tools).toHaveLength(2);

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content:
        'You are an educational assistant. Use query_knowledge_base for course details and create_callback_lead when the user asks for a callback.',
    });

    // Turn 1: Knowledge query
    chatCtx.addMessage({ role: 'user', content: 'When do Python batches start?' });
    const stream1 = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let toolCall1: llm.FunctionCall | undefined;
    for await (const chunk of stream1) {
      if (chunk.delta?.toolCalls?.[0]) toolCall1 = chunk.delta.toolCalls[0];
    }
    expect(toolCall1?.name).toBe('query_knowledge_base');

    const toolOutput1 = await llm.executeToolCall(toolCall1!, new llm.ToolContext(tools));
    expect(knowledgeCalled).toBe(true);
    chatCtx.insert([toolCall1!, toolOutput1]);

    const ansStream1 = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let ans1 = '';
    for await (const chunk of ansStream1) {
      if (chunk.delta?.content) ans1 += chunk.delta.content;
    }
    chatCtx.addMessage({ role: 'assistant', content: ans1 });

    // Turn 2: Callback request
    chatCtx.addMessage({
      role: 'user',
      content: 'Okay, I am interested. My name is Vikram Mehta, please have someone call me.',
    });
    const stream2 = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let toolCall2: llm.FunctionCall | undefined;
    for await (const chunk of stream2) {
      if (chunk.delta?.toolCalls?.[0]) toolCall2 = chunk.delta.toolCalls[0];
    }
    expect(toolCall2?.name).toBe('create_callback_lead');

    const toolOutput2 = await llm.executeToolCall(toolCall2!, new llm.ToolContext(tools));
    expect(leadCalled).toBe(true);
    chatCtx.insert([toolCall2!, toolOutput2]);

    const ansStream2 = sarvamLlm.chat({ chatCtx, toolCtx: tools });
    let ans2 = '';
    for await (const chunk of ansStream2) {
      if (chunk.delta?.content) ans2 += chunk.delta.content;
    }
    expect(ans2.toLowerCase()).toMatch(/vikram|call|team|recorded/i);
  });

  // =========================================================================
  // SCENARIO F — FAILURE ISOLATION & RESILIENCE
  // =========================================================================
  it('Scenario F: Appointment failure (500) propagates safely without corrupting session, allowing subsequent Lead tool call', async () => {
    let appointmentAttempted = false;
    let leadAttempted = false;

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/internal/appointments')) {
        appointmentAttempted = true;
        return Promise.resolve(new Response(JSON.stringify({ error: 'Database error' }), { status: 500 }));
      }
      if (url.includes('/api/internal/leads')) {
        leadAttempted = true;
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'lead-fallback-success' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const appointmentTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
    const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    // 1. Appointment fails
    const aResult = await appointmentTool.execute({
      customerName: 'Aarav',
      customerPhone: '+919876543210',
      title: 'Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    });

    expect(appointmentAttempted).toBe(true);
    expect(aResult.success).toBe(false);
    expect((aResult as AppointmentToolFailureResult).error).toBe('APPOINTMENT_REQUEST_FAILED');

    // 2. Lead succeeds in the same session context
    const lResult = await leadTool.execute({
      customerName: 'Aarav',
      customerPhone: '+919876543210',
      interestCategory: 'Consultation callback',
    });

    expect(leadAttempted).toBe(true);
    expect(lResult.success).toBe(true);
    expect((lResult as LeadToolSuccessResult).leadId).toBe('lead-fallback-success');
  });

  // =========================================================================
  // SCENARIO G — BOUNDED TIMEOUT
  // =========================================================================
  it('Scenario G: Bounded timeout produces SERVICE_UNAVAILABLE structured failure without process crash', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const fetchSpy = vi.fn().mockRejectedValue(abortError);

    const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
    const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    const lResult = await leadTool.execute({ customerName: 'Aarav', customerPhone: '+919876543210' });
    expect(lResult.success).toBe(false);
    expect((lResult as LeadToolFailureResult).error).toBe('SERVICE_UNAVAILABLE');

    const aResult = await aptTool.execute({
      customerName: 'Aarav',
      customerPhone: '+919876543210',
      title: 'Site Visit',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    });
    expect(aResult.success).toBe(false);
    expect((aResult as AppointmentToolFailureResult).error).toBe('SERVICE_UNAVAILABLE');
  });

  // =========================================================================
  // SCENARIO H — MALFORMED TOOL ARGUMENTS
  // =========================================================================
  it('Scenario H: Malformed tool arguments return INVALID_ARGUMENTS without calling backend', async () => {
    const fetchSpy = vi.fn();

    const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
    const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    // Missing customerName in lead
    const lResult = await leadTool.execute({ customerName: '', customerPhone: '+919876543210' });
    expect(lResult.success).toBe(false);
    expect((lResult as LeadToolFailureResult).error).toBe('INVALID_ARGUMENTS');

    // Missing bookingDate in appointment
    const aResult = await aptTool.execute({
      customerName: 'Aarav',
      customerPhone: '+919876543210',
      title: 'Site Visit',
      bookingDate: '',
      bookingTime: '15:00',
    });
    expect(aResult.success).toBe(false);
    expect((aResult as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // SCENARIO I & J — TRUSTED CONTEXT SECURITY & CALLER PHONE FALLBACK
  // =========================================================================
  it('Scenario I & J: Preserves explicit phone, falls back to callerPhone, and locks deploymentId/callSessionId to trusted context', async () => {
    let capturedLeadBody: CapturedPayload | null = null;
    let capturedAptBody: CapturedPayload | null = null;

    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/internal/leads')) {
        capturedLeadBody = JSON.parse(init?.body as string);
        return Promise.resolve(new Response(JSON.stringify({ id: 'lead-sec-1' }), { status: 201 }));
      }
      if (url.includes('/api/internal/appointments')) {
        capturedAptBody = JSON.parse(init?.body as string);
        return Promise.resolve(new Response(JSON.stringify({ id: 'apt-sec-1', status: 'REQUESTED' }), { status: 201 }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
    const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    // 1. Explicit phone
    await leadTool.execute({
      customerName: 'Sunil',
      customerPhone: '+911122334455', // Explicit phone
    });
    expect(capturedLeadBody.customerPhone).toBe('+911122334455');
    expect(capturedLeadBody.deploymentId).toBe(mockDeploymentId);
    expect(capturedLeadBody.callSessionId).toBe(mockCallSessionId);

    // 2. Caller phone fallback
    await aptTool.execute({
      customerName: 'Sunil',
      title: 'Site Visit',
      bookingDate: '2026-09-09',
      bookingTime: '15:00',
    });
    expect(capturedAptBody.customerPhone).toBe(mockCallerPhone);
    expect(capturedAptBody.deploymentId).toBe(mockDeploymentId);
    expect(capturedAptBody.callSessionId).toBe(mockCallSessionId);
  });

  // =========================================================================
  // SCENARIO K — MULTI-INDUSTRY UNIFORM EXECUTION
  // =========================================================================
  it('Scenario K: Multi-industry execution works seamlessly across Healthcare, Real Estate, Education, and Finance', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'res-industry-ok', status: 'REQUESTED' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
    const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

    // Healthcare
    const hc = await aptTool.execute({
      customerName: 'Patient Kumar',
      title: 'Doctor Consultation',
      resourceName: 'Dr. Sharma',
      bookingDate: '2026-09-09',
      bookingTime: '10:00',
    });
    expect(hc.success).toBe(true);

    // Real Estate
    const re = await aptTool.execute({
      customerName: 'Buyer Anita',
      title: 'Property Site Visit',
      resourceName: '3BHK Villa',
      bookingDate: '2026-09-10',
      bookingTime: '16:00',
    });
    expect(re.success).toBe(true);

    // Education
    const edu = await aptTool.execute({
      customerName: 'Student Rajesh',
      title: 'Demo Class',
      resourceName: 'JEE Batch',
      bookingDate: '2026-09-11',
      bookingTime: '11:00',
    });
    expect(edu.success).toBe(true);

    // Finance
    const fin = await leadTool.execute({
      customerName: 'Borrower Sameer',
      interestCategory: 'Home Loan Pre-approval',
    });
    expect(fin.success).toBe(true);
  });

  // =========================================================================
  // SCENARIO L — MULTILINGUAL TOOL INTENT
  // =========================================================================
  it('Scenario L: Sarvam-105B recognizes tool intent across Hindi, Hinglish, and Marathi', { timeout: 60000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    const leadTool = createCallbackLeadTool(defaultContext, {
      fetchFn: (async () =>
        new Response(JSON.stringify({ id: 'lead-multi-lang' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    });

    const prompts = [
      { lang: 'Hindi', text: 'मुझे वापस कॉल करवा दीजिए, मेरा नाम राहुल वर्मा है।' },
      { lang: 'Hinglish', text: 'Mujhe admission ke liye callback karwa do, my name is Rahul Verma.' },
      { lang: 'Marathi', text: 'मला ॲडमिशनसाठी परत फोन करायला सांगा, माझं नाव राहुल वर्मा आहे.' },
    ];

    for (const p of prompts) {
      const chatCtx = new llm.ChatContext();
      chatCtx.addMessage({
        role: 'system',
        content: 'You are an assistant. When the user requests a callback in any language, use create_callback_lead.',
      });
      chatCtx.addMessage({ role: 'user', content: p.text });

      const stream = sarvamLlm.chat({ chatCtx, toolCtx: [leadTool] });
      let toolCall: llm.FunctionCall | undefined;
      for await (const chunk of stream) {
        if (chunk.delta?.toolCalls?.[0]) {
          toolCall = chunk.delta.toolCalls[0];
        }
      }

      console.log(`[Scenario L - ${p.lang}] Tool call received:`, toolCall?.name);
      expect(toolCall).toBeDefined();
      expect(toolCall?.name).toBe('create_callback_lead');
    }
  });
});
