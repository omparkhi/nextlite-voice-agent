import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import {
  toolRegistry,
  createCallbackLeadTool,
  createBookAppointmentTool,
  type ToolRuntimeContext,
  type LeadToolSuccessResult,
  type LeadToolFailureResult,
  type AppointmentToolSuccessResult,
  type AppointmentToolFailureResult,
} from '../tools/index.ts';
import { createKnowledgeTool } from '../knowledgeTool.ts';

describe('Module 1C-D — Multi-Tool Integration & Failure Safety', () => {
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

  const createBaseConfig = (overrides: Partial<RuntimeAgentConfig> = {}): RuntimeAgentConfig => ({
    tenant: { tenantId: 'tenant-123' },
    agent: { agentId: 'agent-456', agentName: 'Multi-Tool Voice Assistant', status: 'LIVE' },
    deployment: { deploymentId: mockDeploymentId, versionId: 'ver-001' },
    prompt: { compiledSystemPrompt: 'System prompt' },
    voice: { provider: 'sarvam', voiceId: 'priya' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
    runtime: { modelProvider: 'sarvam', llmModel: 'sarvam-105b-conversations' },
    knowledge: { enabled: false },
    tools: { enabled: true, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. TOOL COMBINATION MATRIX
  // =========================================================================
  describe('Tool Combination Matrix', () => {
    // CASE 1: No tools
    it('Case 1: resolves empty list when no tools are configured or enabled', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: { enabled: false, tools: [] },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(0);
    });

    // CASE 2: Knowledge only
    it('Case 2: resolves exactly query_knowledge_base when only knowledge is enabled', () => {
      const config = createBaseConfig({
        knowledge: { enabled: true },
        tools: { enabled: true, tools: [] },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(1);
      expect(resolved.map((t) => t.name)).toEqual(['query_knowledge_base']);
    });

    // CASE 3: Lead only
    it('Case 3: resolves exactly create_callback_lead when only lead tool is enabled', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [{ toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Lead', enabled: true }],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(1);
      expect(resolved.map((t) => t.name)).toEqual(['create_callback_lead']);
    });

    // CASE 4: Appointment only
    it('Case 4: resolves exactly book_appointment when only appointment tool is enabled', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [{ toolId: 'book_appointment', name: 'book_appointment', description: 'Appointment', enabled: true }],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(1);
      expect(resolved.map((t) => t.name)).toEqual(['book_appointment']);
    });

    // CASE 5: Knowledge + Lead
    it('Case 5: resolves exactly query_knowledge_base and create_callback_lead', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [
            { toolId: 'query_knowledge_base', name: 'query_knowledge_base', description: 'Knowledge', enabled: true },
            { toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Lead', enabled: true },
          ],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(2);
      expect(resolved.map((t) => t.name)).toEqual(['query_knowledge_base', 'create_callback_lead']);
    });

    // CASE 6: Knowledge + Appointment
    it('Case 6: resolves exactly query_knowledge_base and book_appointment', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [
            { toolId: 'query_knowledge_base', name: 'query_knowledge_base', description: 'Knowledge', enabled: true },
            { toolId: 'book_appointment', name: 'book_appointment', description: 'Appointment', enabled: true },
          ],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(2);
      expect(resolved.map((t) => t.name)).toEqual(['query_knowledge_base', 'book_appointment']);
    });

    // CASE 7: Lead + Appointment
    it('Case 7: resolves exactly create_callback_lead and book_appointment', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [
            { toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Lead', enabled: true },
            { toolId: 'book_appointment', name: 'book_appointment', description: 'Appointment', enabled: true },
          ],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(2);
      expect(resolved.map((t) => t.name)).toEqual(['create_callback_lead', 'book_appointment']);
    });

    // CASE 8: All three tools
    it('Case 8: resolves all three tools when configured and enabled', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [
            { toolId: 'query_knowledge_base', name: 'query_knowledge_base', description: 'Knowledge', enabled: true },
            { toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Lead', enabled: true },
            { toolId: 'book_appointment', name: 'book_appointment', description: 'Appointment', enabled: true },
          ],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(3);
      expect(resolved.map((t) => t.name)).toEqual([
        'query_knowledge_base',
        'create_callback_lead',
        'book_appointment',
      ]);
    });

    // CASE 9: All three configured but one disabled
    it('Case 9: omits disabled tool when all three are configured but one has enabled: false', () => {
      const config = createBaseConfig({
        knowledge: { enabled: false },
        tools: {
          enabled: true,
          tools: [
            { toolId: 'query_knowledge_base', name: 'query_knowledge_base', description: 'Knowledge', enabled: true },
            { toolId: 'create_callback_lead', name: 'create_callback_lead', description: 'Lead', enabled: false }, // Disabled
            { toolId: 'book_appointment', name: 'book_appointment', description: 'Appointment', enabled: true },
          ],
        },
      });
      const resolved = toolRegistry.resolveTools(config, defaultContext);
      expect(resolved).toHaveLength(2);
      expect(resolved.map((t) => t.name)).toEqual(['query_knowledge_base', 'book_appointment']);
    });
  });

  // =========================================================================
  // 2. TOOL EXECUTION ISOLATION
  // =========================================================================
  describe('Tool Execution Isolation', () => {
    it('ensures each tool only calls its dedicated endpoint with authoritative payload', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/internal/knowledge/retrieve')) {
          return Promise.resolve(
            new Response(JSON.stringify({ results: [{ content: 'Business hours: 9-5', score: 0.9 }] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (url.endsWith('/api/internal/leads')) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: 'lead-iso-123' }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (url.endsWith('/api/internal/appointments')) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: 'apt-iso-123', status: 'REQUESTED' }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const knowledgeTool = createKnowledgeTool(mockDeploymentId, { fetchFn: fetchSpy as unknown as typeof fetch });
      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const appointmentTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      // Execute knowledge tool
      const kResult = await knowledgeTool.execute({ query: 'timing' });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'http://localhost:3001/api/internal/knowledge/retrieve',
        expect.anything(),
      );
      expect(kResult.results[0].content).toContain('Business hours: 9-5');

      // Execute lead tool
      const lResult = await leadTool.execute({ customerName: 'Aarav', customerPhone: '+919876543210' });
      expect(fetchSpy).toHaveBeenLastCalledWith('http://localhost:3001/api/internal/leads', expect.anything());
      expect(lResult.success).toBe(true);

      // Execute appointment tool
      const aResult = await appointmentTool.execute({
        customerName: 'Aarav',
        customerPhone: '+919876543210',
        title: 'Site Visit',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });
      expect(fetchSpy).toHaveBeenLastCalledWith('http://localhost:3001/api/internal/appointments', expect.anything());
      expect(aResult.success).toBe(true);
      expect((aResult as AppointmentToolSuccessResult).status).toBe('REQUESTED');
    });
  });

  // =========================================================================
  // 3. MULTI-TOOL CONVERSATION WORKFLOW
  // =========================================================================
  describe('Multi-Tool Conversation Workflow', () => {
    it('executes knowledge retrieval followed by callback lead creation in the same session', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/internal/knowledge/retrieve')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                results: [{ content: '3BHK Villas start at 1.5 Cr with private clubhouse.', score: 0.95 }],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (url.endsWith('/api/internal/leads')) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: 'lead-workflow-999' }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const knowledgeTool = createKnowledgeTool(mockDeploymentId, { fetchFn: fetchSpy as unknown as typeof fetch });
      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      // Turn 1: Caller asks about 3BHK villas -> query knowledge base
      const knowledgeOutput = await knowledgeTool.execute({ query: '3BHK villa price' });
      expect(knowledgeOutput.results[0].content).toContain('1.5 Cr');

      // Turn 2: Caller requests a callback from sales team -> create callback lead
      const leadResult = await leadTool.execute({
        customerName: 'Vikram Mehta',
        interestCategory: '3BHK Villa Inquiry',
        notes: 'Interested in clubhouse amenities and pricing',
      });

      expect(leadResult.success).toBe(true);
      expect((leadResult as LeadToolSuccessResult).leadId).toBe('lead-workflow-999');
      expect((leadResult as LeadToolSuccessResult).message).toContain('Callback request recorded successfully');
    });
  });

  // =========================================================================
  // 4. FAILURE PROPAGATION & SESSION RESILIENCE
  // =========================================================================
  describe('Failure Propagation & Session Resilience', () => {
    // Knowledge failure does not crash
    it('handles knowledge API 500 failure gracefully without throwing', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
      const knowledgeTool = createKnowledgeTool(mockDeploymentId, { fetchFn: fetchSpy as unknown as typeof fetch });

      const result = await knowledgeTool.execute({ query: 'pricing' });
      expect(result.results).toHaveLength(0);
      expect(result.error).toBe('Knowledge base retrieval is temporarily unavailable.');
    });

    // Lead API failure returns structured error
    it('handles lead API 409 conflict gracefully with structured failure', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Deployment is inactive', code: 'DEPLOYMENT_INACTIVE' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      const result = await leadTool.execute({
        customerName: 'Aarav',
        customerPhone: '+919876543210',
      });

      expect(result.success).toBe(false);
      expect((result as LeadToolFailureResult).error).toBe('DEPLOYMENT_INACTIVE');
      expect((result as LeadToolFailureResult).message).toContain('Unable to record the callback request');
    });

    // Appointment API failure returns structured error
    it('handles appointment API 500 error gracefully with structured failure', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Database connection failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const appointmentTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      const result = await appointmentTool.execute({
        customerName: 'Aarav',
        customerPhone: '+919876543210',
        title: 'Doctor Consultation',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });

      expect(result.success).toBe(false);
      expect((result as AppointmentToolFailureResult).error).toBe('APPOINTMENT_REQUEST_FAILED');
      expect((result as AppointmentToolFailureResult).message).toContain('Unable to record the appointment request');
    });

    // Timeout / abort returns SERVICE_UNAVAILABLE
    it('handles network abort/timeout as SERVICE_UNAVAILABLE structured failure', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const fetchSpy = vi.fn().mockRejectedValue(abortError);

      const appointmentTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      const result = await appointmentTool.execute({
        customerName: 'Aarav',
        customerPhone: '+919876543210',
        title: 'Doctor Consultation',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });

      expect(result.success).toBe(false);
      expect((result as AppointmentToolFailureResult).error).toBe('SERVICE_UNAVAILABLE');
    });

    // Validation failure returns INVALID_ARGUMENTS
    it('returns INVALID_ARGUMENTS on missing required arguments without calling backend', async () => {
      const fetchSpy = vi.fn();
      const appointmentTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      const result = await appointmentTool.execute({
        customerName: '',
        title: 'Doctor Consultation',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });

      expect(result.success).toBe(false);
      expect((result as AppointmentToolFailureResult).error).toBe('INVALID_ARGUMENTS');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    // Cross-tool recovery: Failure in one tool does not corrupt subsequent tool execution
    it('allows successful tool execution after a previous tool failure in the same session', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/internal/appointments')) {
          return Promise.resolve(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }));
        }
        if (url.endsWith('/api/internal/leads')) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: 'lead-recovery-123' }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const appointmentTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      // Step 1: Appointment booking fails
      const aptResult = await appointmentTool.execute({
        customerName: 'Aarav',
        customerPhone: '+919876543210',
        title: 'Doctor Consultation',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });
      expect(aptResult.success).toBe(false);

      // Step 2: Caller opts for callback instead -> Lead creation succeeds cleanly
      const leadResult = await leadTool.execute({
        customerName: 'Aarav',
        customerPhone: '+919876543210',
        interestCategory: 'Doctor Consultation Callback',
      });
      expect(leadResult.success).toBe(true);
      expect((leadResult as LeadToolSuccessResult).leadId).toBe('lead-recovery-123');
    });
  });

  // =========================================================================
  // 5. ANTI-HALLUCINATION & SUCCESS SEMANTICS
  // =========================================================================
  describe('Anti-Hallucination & Success Semantics', () => {
    it('book_appointment success guarantees status is REQUESTED and disclaims final confirmation', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'apt-sem-123', status: 'REQUESTED' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const tool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const result = await tool.execute({
        customerName: 'Rohan Sharma',
        customerPhone: '+919876543210',
        title: 'Doctor Consultation',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });

      expect(result.success).toBe(true);
      const successResult = result as AppointmentToolSuccessResult;
      expect(successResult.status).toBe('REQUESTED');
      expect(successResult.message).toContain('The team will verify availability and confirm it');
      expect(successResult.message).not.toContain('confirmed');
    });

    it('failed tool executions return success: false preventing false success claims', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response('Error', { status: 500 }));
      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      const lResult = await leadTool.execute({ customerName: 'Rohan', customerPhone: '+919876543210' });
      expect(lResult.success).toBe(false);

      const aResult = await aptTool.execute({
        customerName: 'Rohan',
        customerPhone: '+919876543210',
        title: 'Visit',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });
      expect(aResult.success).toBe(false);
    });
  });

  // =========================================================================
  // 6. CALLER PHONE FALLBACK & TRUSTED CONTEXT
  // =========================================================================
  describe('Caller Phone Fallback & Trusted Context', () => {
    it('prioritizes explicit customerPhone over trusted callerPhone for both mutation tools', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'res-explicit-123', status: 'REQUESTED' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      await leadTool.execute({
        customerName: 'Sunil',
        customerPhone: '+911122334455', // Explicit phone
      });
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body).customerPhone).toBe('+911122334455');

      await aptTool.execute({
        customerName: 'Sunil',
        customerPhone: '+911122334455', // Explicit phone
        title: 'Demo Class',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });
      expect(JSON.parse(fetchSpy.mock.calls[1][1].body).customerPhone).toBe('+911122334455');
    });

    it('falls back to trusted callerPhone when customerPhone is omitted', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'res-fallback-123', status: 'REQUESTED' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      await leadTool.execute({ customerName: 'Sunil' });
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body).customerPhone).toBe(mockCallerPhone);

      await aptTool.execute({
        customerName: 'Sunil',
        title: 'Demo Class',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });
      expect(JSON.parse(fetchSpy.mock.calls[1][1].body).customerPhone).toBe(mockCallerPhone);
    });

    it('injects trusted deploymentId and callSessionId from context without allowing LLM overrides', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'res-context-123', status: 'REQUESTED' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      await aptTool.execute({
        customerName: 'Sunil',
        title: 'Site Visit',
        bookingDate: '2026-09-09',
        bookingTime: '15:00',
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.deploymentId).toBe(mockDeploymentId);
      expect(body.callSessionId).toBe(mockCallSessionId);
    });
  });

  // =========================================================================
  // 7. MULTI-INDUSTRY SCENARIOS
  // =========================================================================
  describe('Multi-Industry Scenarios', () => {
    it('executes mutation tools across Healthcare, Real Estate, Education, and Finance without branching', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'res-industry-123', status: 'REQUESTED' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const aptTool = createBookAppointmentTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });
      const leadTool = createCallbackLeadTool(defaultContext, { fetchFn: fetchSpy as unknown as typeof fetch });

      // Healthcare Appointment
      const hcResult = await aptTool.execute({
        customerName: 'Patient Kumar',
        title: 'Doctor Consultation',
        resourceName: 'Dr. Sharma',
        bookingDate: '2026-09-09',
        bookingTime: '10:00',
        metadata: { specialization: 'Cardiology' },
      });
      expect(hcResult.success).toBe(true);

      // Real Estate Appointment
      const reResult = await aptTool.execute({
        customerName: 'Buyer Anita',
        title: 'Property Site Visit',
        resourceName: '3BHK Villa',
        bookingDate: '2026-09-10',
        bookingTime: '16:00',
        metadata: { budget: '2Cr' },
      });
      expect(reResult.success).toBe(true);

      // Education Appointment
      const eduResult = await aptTool.execute({
        customerName: 'Student Rajesh',
        title: 'Demo Class',
        resourceName: 'JEE Batch',
        bookingDate: '2026-09-11',
        bookingTime: '11:00',
        metadata: { grade: '12th' },
      });
      expect(eduResult.success).toBe(true);

      // Finance Lead
      const finResult = await leadTool.execute({
        customerName: 'Borrower Sameer',
        interestCategory: 'Home Loan Pre-approval',
        notes: 'Requested 75L loan consultation',
        metadata: { requestedAmount: '75L' },
      });
      expect(finResult.success).toBe(true);
    });
  });
});
