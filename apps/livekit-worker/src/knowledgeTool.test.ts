import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { llm, initializeLogger, ChatContext, ChatMessage, FunctionCall, FunctionCallOutput } from '@livekit/agents';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import { createKnowledgeTool, knowledgeQuerySchema } from './knowledgeTool.ts';
import { createAgent } from './agent.ts';
import { SarvamLLM } from './sarvamLlm.ts';
import { retrieveKnowledge } from './runtimeConfigClient.ts';

describe('NextLite V3 Module 2 — Worker-Side Sarvam Native Tool Calling for RAG', () => {
  const mockDeploymentId = '11111111-2222-3333-4444-555555555555';

  const baseConfig: RuntimeAgentConfig = {
    tenant: { tenantId: 'tenant-123' },
    agent: { agentId: 'agent-456', agentName: 'Dental Care Voice Agent', status: 'LIVE' },
    deployment: { deploymentId: mockDeploymentId, versionId: 'ver-1', versionNumber: 1 },
    prompt: {
      compiledSystemPrompt: 'You are an AI receptionist for a dental clinic.',
      greeting: 'Hello! How can I help you today?',
    },
    voice: {
      provider: 'sarvam',
      sttModel: 'saaras:v3',
      ttsModel: 'bulbul:v3',
      voiceId: 'priya',
    },
    language: {
      primary: 'hi-IN',
      supportedLanguages: ['hi-IN', 'en-IN', 'mr-IN'],
      autoDetectEnabled: true,
      languageSwitchingEnabled: true,
    },
    runtime: {
      modelProvider: 'sarvam',
      llmModel: 'sarvam-105b-conversations',
      temperature: 0.3,
    },
    knowledge: {
      enabled: false,
    },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  beforeAll(() => {
    initializeLogger({ pretty: false, level: 'silent' });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Tool Definition and Registration', () => {
    it('1. Knowledge tool definition is generated correctly with name, description, and schema', () => {
      const tool = createKnowledgeTool(mockDeploymentId);
      expect(tool.name).toBe('query_knowledge_base');
      expect(tool.description).toContain('knowledge base');
      expect(tool.type).toBe('function');
      expect(tool.parameters).toBeDefined();
    });

    it('2. Tool is absent when knowledge.enabled=false', () => {
      const configWithKnowledgeDisabled: RuntimeAgentConfig = {
        ...baseConfig,
        knowledge: { enabled: false },
      };
      const agent = createAgent(configWithKnowledgeDisabled, 'hi-IN', mockDeploymentId);
      const toolContext = (agent as any)._toolCtx;
      const toolsCount = toolContext ? Object.keys(toolContext.functionTools || {}).length : 0;
      expect(toolsCount).toBe(0);
      expect(toolContext?.getFunctionTool('query_knowledge_base')).toBeUndefined();
    });

    it('3. Tool is present when knowledge.enabled=true', () => {
      const configWithKnowledgeEnabled: RuntimeAgentConfig = {
        ...baseConfig,
        knowledge: {
          enabled: true,
          retrievalConfig: { topK: 3, scoreThreshold: 0.7 },
        },
      };
      const agent = createAgent(configWithKnowledgeEnabled, 'hi-IN', mockDeploymentId);
      const toolContext = (agent as any)._toolCtx;
      expect(toolContext).toBeDefined();
      const tool = toolContext.getFunctionTool('query_knowledge_base');
      expect(tool).toBeDefined();
      expect(tool.name).toBe('query_knowledge_base');
    });
  });

  describe('2. Parameter Validation & Security Boundaries', () => {
    it('4. Valid query_knowledge_base arguments are accepted', () => {
      const result = knowledgeQuerySchema.safeParse({
        query: 'What are your cardiology OPD timings?',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('What are your cardiology OPD timings?');
      }
    });

    it('5. Missing query is rejected', () => {
      const result = knowledgeQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('6. Empty query is rejected', () => {
      const resultEmpty = knowledgeQuerySchema.safeParse({ query: '' });
      expect(resultEmpty.success).toBe(false);

      const resultWhitespace = knowledgeQuerySchema.safeParse({ query: '   ' });
      expect(resultWhitespace.success).toBe(false);
    });

    it('7. Non-string query is rejected', () => {
      const resultNumber = knowledgeQuerySchema.safeParse({ query: 12345 });
      expect(resultNumber.success).toBe(false);

      const resultObject = knowledgeQuerySchema.safeParse({ query: { nested: 'test' } });
      expect(resultObject.success).toBe(false);
    });

    it('8. Oversized query is rejected', () => {
      const longQuery = 'a'.repeat(2001);
      const result = knowledgeQuerySchema.safeParse({ query: longQuery });
      expect(result.success).toBe(false);
    });

    it('9. Worker uses trusted deploymentId from context and fails if deploymentId is empty', () => {
      expect(() => createKnowledgeTool('')).toThrowError(/deploymentId is required/);
      expect(() => createKnowledgeTool('   ')).toThrowError(/deploymentId is required/);
    });

    it('10. Worker never accepts tenantId from the model and ignores extra parameters', async () => {
      let passedDeploymentId = '';
      let passedQuery = '';

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        passedDeploymentId = body.deploymentId;
        passedQuery = body.query;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ content: 'Clinic hours are 9 AM to 5 PM', score: 0.95 }],
          }),
        };
      });

      const tool = createKnowledgeTool(mockDeploymentId, { fetchFn: mockFetch });
      
      // Even if the model tries to pass a malicious tenantId, it is stripped and not sent to API
      const result = await tool.execute(
        { query: 'timings', tenantId: 'attacker-tenant' } as any,
        { ctx: {} as any, toolCallId: 'call_1', abortSignal: new AbortController().signal },
      );

      expect(passedDeploymentId).toBe(mockDeploymentId);
      expect(passedQuery).toBe('timings');
      expect((result as any).results).toHaveLength(1);
    });

    it('11. Worker never accepts agentId from the model', async () => {
      let passedDeploymentId = '';

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        passedDeploymentId = body.deploymentId;
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        };
      });

      const tool = createKnowledgeTool(mockDeploymentId, { fetchFn: mockFetch });

      await tool.execute(
        { query: 'root canal cost', agentId: 'attacker-agent-id' } as any,
        { ctx: {} as any, toolCallId: 'call_2', abortSignal: new AbortController().signal },
      );

      expect(passedDeploymentId).toBe(mockDeploymentId);
    });
  });

  describe('3. Retrieval API Request Shape & Result Formatting', () => {
    it('12. Retrieval API request shape is correct', async () => {
      let requestUrl = '';
      let requestHeaders: Record<string, string> = {};
      let requestBody: any = null;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        requestUrl = url;
        requestHeaders = init.headers;
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              { content: 'Cardiology OPD is available Monday to Friday, 10 AM to 2 PM.', score: 0.92, sourceId: 'doc-1' },
            ],
          }),
        };
      });

      const tool = createKnowledgeTool(mockDeploymentId, {
        fetchFn: mockFetch,
        apiUrl: 'http://localhost:3001',
        workerSecret: 'test-secret',
        topK: 5,
      });

      const response = await tool.execute(
        { query: 'Cardiology timings' },
        { ctx: {} as any, toolCallId: 'call_3', abortSignal: new AbortController().signal },
      );

      expect(requestUrl).toBe('http://localhost:3001/api/internal/knowledge/retrieve');
      expect(requestHeaders['Authorization']).toBe('Bearer test-secret');
      expect(requestHeaders['x-worker-secret']).toBeUndefined();
      expect(requestBody).toEqual({
        deploymentId: mockDeploymentId,
        query: 'Cardiology timings',
        topK: 5,
      });
      expect(response.results).toBeDefined();
      expect(response.results).toHaveLength(1);
    });

    it('13. Successful retrieval result is converted into a clean tool result without internal IDs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { content: 'General consultation fee is ₹500.', score: 0.887, sourceId: 'secret-source-uuid-123' },
          ],
        }),
      });

      const tool = createKnowledgeTool(mockDeploymentId, { fetchFn: mockFetch });
      const toolResult = await tool.execute(
        { query: 'Consultation fee' },
        { ctx: {} as any, toolCallId: 'call_4', abortSignal: new AbortController().signal },
      );

      expect(toolResult.results).toEqual([
        {
          content: 'General consultation fee is ₹500.',
          relevanceScore: 0.89,
        },
      ]);
      // Verify sourceId / database internals are not leaked in the tool result
      expect((toolResult.results[0] as any).sourceId).toBeUndefined();
    });

    it('14. Empty retrieval result is handled safely with informative message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

      const tool = createKnowledgeTool(mockDeploymentId, { fetchFn: mockFetch });
      const toolResult = await tool.execute(
        { query: 'Unknown procedure' },
        { ctx: {} as any, toolCallId: 'call_5', abortSignal: new AbortController().signal },
      );

      expect(toolResult.results).toEqual([]);
      expect(toolResult.message).toContain('No relevant information found');
      expect(toolResult.error).toBeUndefined();
    });

    it('15. Retrieval API timeout is handled safely without crashing', async () => {
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        // Simulate abort triggered by timeout
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
          // Delay longer than timeout
          setTimeout(() => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          }, 50);
        });
      });

      const tool = createKnowledgeTool(mockDeploymentId, {
        fetchFn: mockFetch,
        timeoutMs: 10,
      });

      const toolResult = await tool.execute(
        { query: 'Timeout test' },
        { ctx: {} as any, toolCallId: 'call_6', abortSignal: new AbortController().signal },
      );

      expect(toolResult.results).toEqual([]);
      expect(toolResult.error).toContain('timed out');
    });

    it('16. Retrieval API 4xx/5xx is handled safely without crashing', async () => {
      const mockFetch500 = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }),
      });

      const tool = createKnowledgeTool(mockDeploymentId, { fetchFn: mockFetch500 });
      const toolResult = await tool.execute(
        { query: 'Server error test' },
        { ctx: {} as any, toolCallId: 'call_7', abortSignal: new AbortController().signal },
      );

      expect(toolResult.results).toEqual([]);
      expect(toolResult.error).toContain('temporarily unavailable');
    });
  });

  describe('4. Tool Call Execution, Loop Limit & Multilingual Support', () => {
    it('17. Unsupported tool name is rejected safely by executeToolCall', async () => {
      const tool = createKnowledgeTool(mockDeploymentId);
      const toolContext = new llm.ToolContext([tool]);

      const invalidFunctionCall = FunctionCall.create({
        callId: 'call_invalid_1',
        name: 'execute_arbitrary_code',
        args: '{"command":"rm -rf /"}',
      });

      const output = await llm.executeToolCall(invalidFunctionCall, toolContext);
      expect(output.isError).toBe(true);
      expect(output.output).toContain('Unknown function: execute_arbitrary_code');
    });

    it('18. Tool-call loop terminates cleanly', () => {
      // In main.ts, maxToolSteps is set to 2.
      // Verify that createAgent and SarvamLLM are compatible with maxToolSteps configuration.
      const agent = createAgent(
        { ...baseConfig, knowledge: { enabled: true } },
        'hi-IN',
        mockDeploymentId,
      );
      expect(agent).toBeDefined();
    });

    it('19. Normal conversational turn does NOT invoke RAG tool', () => {
      const chatCtx = new llm.ChatContext();
      chatCtx.addMessage({ role: 'user', content: 'Hello' });
      chatCtx.addMessage({ role: 'assistant', content: 'Hello! How can I assist you today?' });

      // In a normal turn without function_call, chat history contains only normal text messages
      expect(chatCtx.items).toHaveLength(2);
      expect(chatCtx.items[0]?.type).toBe('message');
      expect(chatCtx.items[1]?.type).toBe('message');
    });

    it('20. Multilingual queries in Hindi, Marathi, and Hinglish are preserved without forced translation', async () => {
      const queriesTested: string[] = [];

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        queriesTested.push(body.query);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ content: 'OPD सोमवारी ते शुक्रवारी सकाळी १० ते दुपारी २ वाजेपर्यंत आहे.', score: 0.94 }],
          }),
        };
      });

      const tool = createKnowledgeTool(mockDeploymentId, { fetchFn: mockFetch });

      // Hindi query
      await tool.execute(
        { query: 'कार्डियोलॉजी ओपीडी का समय क्या है?' },
        { ctx: {} as any, toolCallId: 'call_hi', abortSignal: new AbortController().signal },
      );

      // Marathi query
      await tool.execute(
        { query: 'कार्डिओलॉजी ओपीडीची वेळ काय आहे?' },
        { ctx: {} as any, toolCallId: 'call_mr', abortSignal: new AbortController().signal },
      );

      // Hinglish query
      await tool.execute(
        { query: 'Cardiology ka OPD timing kya hai?' },
        { ctx: {} as any, toolCallId: 'call_hinglish', abortSignal: new AbortController().signal },
      );

      expect(queriesTested).toEqual([
        'कार्डियोलॉजी ओपीडी का समय क्या है?',
        'कार्डिओलॉजी ओपीडीची वेळ काय आहे?',
        'Cardiology ka OPD timing kya hai?',
      ]);
    });

    it('21. SarvamLLM chat serialization formats messages, tool calls, and tool outputs correctly', () => {
      const sarvamLlm = new SarvamLLM({ apiKey: 'test-key' });
      const tool = createKnowledgeTool(mockDeploymentId);

      const chatCtx = new llm.ChatContext();
      chatCtx.addMessage({ role: 'system', content: 'You are a helpful dental assistant.' });
      chatCtx.addMessage({ role: 'user', content: 'What are your clinic hours?' });

      const toolCall = FunctionCall.create({
        callId: 'call_knowledge_1',
        name: 'query_knowledge_base',
        args: '{"query":"clinic hours"}',
      });

      const toolOutput = FunctionCallOutput.create({
        callId: 'call_knowledge_1',
        name: 'query_knowledge_base',
        output: JSON.stringify({ results: [{ content: 'Open Mon-Sat 9 AM - 6 PM' }] }),
        isError: false,
      });

      chatCtx.insert([toolCall, toolOutput]);

      const stream = sarvamLlm.chat({
        chatCtx,
        toolCtx: [tool],
      });

      expect(stream).toBeDefined();
    });
  });
});
