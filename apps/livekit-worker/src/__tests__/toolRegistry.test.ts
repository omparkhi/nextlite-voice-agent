import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import { ToolRegistry, knowledgeToolFactory, isValidToolName, type ToolRuntimeContext, type ToolFactory } from '../tools/index.ts';
import { createAgent } from '../agent.ts';

describe('ToolRegistry — Module 1C-A Unit Tests', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    vi.clearAllMocks();
  });

  const createMockConfig = (overrides: Partial<RuntimeAgentConfig> = {}): RuntimeAgentConfig => ({
    tenant: { tenantId: 'tenant-123' },
    agent: { agentId: 'agent-456', agentName: 'Test Assistant', status: 'LIVE' },
    deployment: { deploymentId: 'deploy-789', versionId: 'ver-001' },
    prompt: { compiledSystemPrompt: 'You are a test assistant.' },
    voice: { provider: 'sarvam', voiceId: 'priya' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
    runtime: { modelProvider: 'sarvam', llmModel: 'sarvam-105b-conversations' },
    knowledge: { enabled: false },
    tools: { enabled: true, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
    ...overrides,
  });

  // TEST 1: tools globally disabled → zero tools
  it('TEST 1: returns zero tools when tools and knowledge are disabled', () => {
    const config = createMockConfig({
      knowledge: { enabled: false },
      tools: {
        enabled: false,
        tools: [
          {
            toolId: 'query_knowledge_base',
            name: 'query_knowledge_base',
            description: 'Query knowledge base',
            enabled: true,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(0);

    const agent = createAgent(config, 'en-IN', 'deploy-789');
    expect(agent).toBeDefined();
  });

  // TEST 2: tools enabled → query_knowledge_base enabled → exactly one tool
  it('TEST 2: resolves exactly one tool when query_knowledge_base is enabled in tools list', () => {
    const config = createMockConfig({
      knowledge: { enabled: false },
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'query_knowledge_base',
            name: 'query_knowledge_base',
            description: 'Query knowledge base for business facts',
            enabled: true,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('query_knowledge_base');
    expect(tools[0].description).toBe('Query knowledge base for business facts');
  });

  // TEST 3: query_knowledge_base disabled → zero tools
  it('TEST 3: returns zero tools when query_knowledge_base is disabled in tools list', () => {
    const config = createMockConfig({
      knowledge: { enabled: false },
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'query_knowledge_base',
            name: 'query_knowledge_base',
            description: 'Query knowledge base',
            enabled: false,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(0);
  });

  // TEST 4: unknown tool ID → controlled deterministic behavior (warn and skip safely)
  it('TEST 4: handles unknown tool ID gracefully by skipping and logging warning without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = createMockConfig({
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'unknown_external_tool_v99',
            name: 'unknown_external_tool_v99',
            description: 'Arbitrary tool',
            enabled: true,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown toolId 'unknown_external_tool_v99'"),
    );

    warnSpy.mockRestore();
  });

  // TEST 5: custom description → preserved
  it('TEST 5: preserves custom description configured in RuntimeToolDefinition', () => {
    const customDesc = 'Search specific real estate listings and pricing';
    const config = createMockConfig({
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'query_knowledge_base',
            name: 'query_knowledge_base',
            description: customDesc,
            enabled: true,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(1);
    expect(tools[0].description).toBe(customDesc);
  });

  // TEST 6: duplicate tool names → controlled deterministic behavior (deduplicated)
  it('TEST 6: deduplicates duplicate tool names deterministically', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = createMockConfig({
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'query_knowledge_base',
            name: 'query_knowledge_base',
            description: 'First definition',
            enabled: true,
          },
          {
            toolId: 'query_knowledge_base',
            name: 'query_knowledge_base',
            description: 'Duplicate definition',
            enabled: true,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(1);
    expect(tools[0].description).toBe('First definition');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Duplicate tool name 'query_knowledge_base' detected"),
    );

    warnSpy.mockRestore();
  });

  // TEST 7: runtime context → trusted deployment/session context is passed into the factory
  it('TEST 7: passes trusted deployment context securely to factory', () => {
    const customFactory: ToolFactory = {
      toolId: 'mock_context_tool',
      create: (context: ToolRuntimeContext) => {
        expect(context.deploymentId).toBe('trusted-dep-999');
        expect(context.callSessionId).toBe('call-session-abc');
        expect(context.callerPhone).toBe('+919876543210');
        return knowledgeToolFactory.create(context);
      },
    };

    registry.register(customFactory);

    const config = createMockConfig({
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'mock_context_tool',
            name: 'mock_context_tool',
            description: 'Context verification tool',
            enabled: true,
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, {
      deploymentId: 'trusted-dep-999',
      callSessionId: 'call-session-abc',
      callerPhone: '+919876543210',
    });

    expect(tools).toHaveLength(1);
  });

  // TEST 8: no arbitrary endpoint execution
  it('TEST 8: does not execute arbitrary endpoints or unregistered tools from configuration', () => {
    const fetchSpy = vi.fn();

    const config = createMockConfig({
      tools: {
        enabled: true,
        tools: [
          {
            toolId: 'arbitrary_webhook_tool',
            name: 'arbitrary_webhook_tool',
            description: 'Attempts to hit external endpoint',
            enabled: true,
            parameters: {
              endpoint: 'https://malicious-site.com/hook',
            },
          },
        ],
      },
    });

    const tools = registry.resolveTools(config, {
      deploymentId: 'deploy-789',
      fetchFn: fetchSpy as unknown as typeof fetch,
    });

    expect(tools).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Additional edge-case validation
  it('validates tool names rejecting invalid characters or empty strings', () => {
    expect(isValidToolName('')).toBe(false);
    expect(isValidToolName('   ')).toBe(false);
    expect(isValidToolName('invalid tool with spaces')).toBe(false);
    expect(isValidToolName('123startWithNumber')).toBe(false);
    expect(isValidToolName('valid_tool_name')).toBe(true);
    expect(isValidToolName('queryKnowledgeBase')).toBe(true);
  });

  it('resolves query_knowledge_base when top-level knowledge.enabled is true for backward-compatibility', () => {
    const config = createMockConfig({
      knowledge: { enabled: true, retrievalConfig: { topK: 7 } },
      tools: { enabled: true, tools: [] },
    });

    const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('query_knowledge_base');
  });

  it('returns empty array if runtimeConfig is undefined', () => {
    const tools = registry.resolveTools(undefined, 'deploy-123');
    expect(tools).toEqual([]);
  });
});
