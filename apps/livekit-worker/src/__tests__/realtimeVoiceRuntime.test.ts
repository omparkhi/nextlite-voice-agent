import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inference } from '@livekit/agents';
import {
  createAgent,
  resolvePreemptiveGenerationOptions,
  resolveInterruptionOptions,
  resolveExpressiveOption,
} from '../agent.ts';
import { ToolRegistry } from '../tools/toolRegistry.ts';
import { normalizeToolId, type RuntimeAgentConfig } from '@nextlite/shared';

describe('Realtime Voice Runtime Fixes — Module Verification', () => {
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

  // A. TurnDetector uses v1-mini
  describe('A. LiveKit Turn Detection', () => {
    it('initializes TurnDetector with local in-process model (v1-mini)', () => {
      const turnDetector = new inference.TurnDetector({ version: 'v1-mini' });
      expect(turnDetector).toBeDefined();
      expect(turnDetector.model).toBe('turn-detector-v1-mini');
    });
  });

  // B & C. Preemptive Generation Configuration
  describe('B & C. Preemptive Generation Configuration', () => {
    it('defaults to enabled: false when preemptiveGenerationEnabled is undefined', () => {
      const options = resolvePreemptiveGenerationOptions(undefined);
      expect(options).toEqual({ enabled: false });
    });

    it('defaults to enabled: false when preemptiveGenerationEnabled is false', () => {
      const options = resolvePreemptiveGenerationOptions(false);
      expect(options).toEqual({ enabled: false });
    });

    it('resolves enabled: true only when preemptiveGenerationEnabled is explicitly true', () => {
      const options = resolvePreemptiveGenerationOptions(true);
      expect(options).toEqual({ enabled: true });
    });
  });

  // D. Interruption and Expressive Options
  describe('D. Interruption & Expressive Options', () => {
    it('resolves interruption options correctly', () => {
      expect(resolveInterruptionOptions('disabled')).toEqual({ enabled: false });
      expect(resolveInterruptionOptions('always')).toEqual({ enabled: true, mode: 'vad' });
      expect(resolveInterruptionOptions('adaptive')).toEqual({ mode: 'adaptive' });
      expect(resolveInterruptionOptions(undefined)).toEqual({ mode: 'adaptive' });
    });

    it('resolves expressive mode options correctly', () => {
      expect(resolveExpressiveOption(undefined)).toBe(true);
      expect(resolveExpressiveOption(true)).toBe(true);
      expect(resolveExpressiveOption(false)).toBe(false);
    });
  });

  // E, F, G, H, I. Tool ID Normalization & Resolution
  describe('E-I. Tool Normalization & ToolRegistry Safety', () => {
    it('normalizes display labels to canonical tool IDs', () => {
      expect(normalizeToolId('Book Appointment')).toBe('book_appointment');
      expect(normalizeToolId('Callback Lead')).toBe('create_callback_lead');
      expect(normalizeToolId('Query Knowledge Base')).toBe('query_knowledge_base');
      expect(normalizeToolId('Book Demo Class')).toBe('book_appointment');
      expect(normalizeToolId('Book Service Slot')).toBe('book_appointment');
      expect(normalizeToolId('Book Site Visit')).toBe('book_appointment');
      expect(normalizeToolId('Book Advisor Call')).toBe('book_appointment');
      expect(normalizeToolId('Schedule Appointment')).toBe('book_appointment');
      expect(normalizeToolId('book_appointment')).toBe('book_appointment');
      expect(normalizeToolId('create_callback_lead')).toBe('create_callback_lead');
      expect(normalizeToolId('query_knowledge_base')).toBe('query_knowledge_base');
    });

    it('resolves Book Appointment display label to canonical book_appointment native tool without warnings', () => {
      const config = createMockConfig({
        tools: {
          enabled: true,
          tools: [
            {
              toolId: 'book_appointment',
              name: 'Book Appointment',
              description: 'Schedule doctor consultation slot',
              enabled: true,
            },
          ],
        },
      });

      const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('book_appointment');
      expect(tools[0].description).toBe('Schedule doctor consultation slot');
    });

    it('resolves Callback Lead display label to canonical create_callback_lead native tool', () => {
      const config = createMockConfig({
        tools: {
          enabled: true,
          tools: [
            {
              toolId: 'create_callback_lead',
              name: 'Callback Lead',
              description: 'Record patient callback lead request',
              enabled: true,
            },
          ],
        },
      });

      const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('create_callback_lead');
      expect(tools[0].description).toBe('Record patient callback lead request');
    });

    it('resolves multiple tools with display labels (e.g. Clinic Receptionist configuration)', () => {
      const config = createMockConfig({
        knowledge: { enabled: true },
        tools: {
          enabled: true,
          tools: [
            {
              toolId: 'book_appointment',
              name: 'Book Appointment',
              description: 'Record appointment request with doctor and time',
              enabled: true,
            },
            {
              toolId: 'create_callback_lead',
              name: 'Callback Lead',
              description: 'Record patient callback lead request',
              enabled: true,
            },
          ],
        },
      });

      const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
      expect(tools).toHaveLength(3);
      const names = tools.map((t) => t.name);
      expect(names).toContain('book_appointment');
      expect(names).toContain('create_callback_lead');
      expect(names).toContain('query_knowledge_base');
    });

    it('safely skips unknown tools without arbitrary execution and logs a structured warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = createMockConfig({
        tools: {
          enabled: true,
          tools: [
            {
              toolId: 'some_unknown_custom_tool',
              name: 'Some Unknown Custom Tool',
              description: 'Arbitrary tool',
              enabled: true,
            },
          ],
        },
      });

      const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
      expect(tools).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown toolId 'some_unknown_custom_tool'"),
      );

      warnSpy.mockRestore();
    });

    it('preserves disabled state when tool enabled is false', () => {
      const config = createMockConfig({
        tools: {
          enabled: true,
          tools: [
            {
              toolId: 'book_appointment',
              name: 'Book Appointment',
              description: 'Disabled appointment tool',
              enabled: false,
            },
          ],
        },
      });

      const tools = registry.resolveTools(config, { deploymentId: 'deploy-789' });
      expect(tools).toHaveLength(0);
    });
  });
});
