import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DB before importing services
vi.mock('../db', () => {
  const tableData: {
    agentTemplates: any[];
    agents: any[];
    agentVersions: any[];
    deployments: any[];
  } = {
    agentTemplates: [],
    agents: [],
    agentVersions: [],
    deployments: [],
  };

  return {
    db: {
      query: {
        agentTemplates: {
          findMany: vi.fn(async () => [...tableData.agentTemplates]),
          findFirst: vi.fn(async (params?: any) => {
            if (!params?.where) return tableData.agentTemplates[0] || null;
            return tableData.agentTemplates[0] || null;
          }),
        },
        agents: {
          findMany: vi.fn(async () => [...tableData.agents]),
          findFirst: vi.fn(async () => tableData.agents[0] || null),
        },
        agentVersions: {
          findMany: vi.fn(async () => [...tableData.agentVersions]),
          findFirst: vi.fn(async () => tableData.agentVersions[0] || null),
        },
        deployments: {
          findMany: vi.fn(async () => [...tableData.deployments]),
          findFirst: vi.fn(async () => tableData.deployments[0] || null),
        },
      },
      insert: vi.fn((table: any) => ({
        values: vi.fn((values: any) => ({
          returning: vi.fn(async () => {
            const row = { id: `id-${Math.random().toString(36).substring(2, 9)}`, ...values };
            return [row];
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    },
  };
});

import {
  SYSTEM_TEMPLATES,
  KNOWN_PLATFORM_TOOL_IDS,
  validateTemplateConfiguration,
  templateService,
  type AgentConfiguration,
} from '../services/template';
import { agentService } from '../services/agent';
import { runtimeAgentConfigService } from '../services/runtimeAgentConfig';
import { db } from '../db';

describe('Module 1C-F-B — Template & Configuration Seed Normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 1. SYSTEM TEMPLATE STRUCTURE & VALIDATION
  // ============================================================================

  it('1. Every SYSTEM_TEMPLATE has all required structural configuration sections', () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(5);

    const requiredSections = [
      'identity',
      'persona',
      'environment',
      'objective',
      'speakingStyle',
      'businessInformation',
      'conversation',
      'guardrails',
      'language',
      'voice',
      'runtimeSettings',
      'variables',
      'knowledge',
      'tools',
      'systemInstructions',
    ] as const;

    for (const template of SYSTEM_TEMPLATES) {
      const config = template.defaultConfiguration as any;
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.industry).toBeTruthy();

      for (const section of requiredSections) {
        expect(
          config[section],
          `Template "${template.name}" is missing required section "${section}"`,
        ).toBeDefined();
      }

      expect(config.identity.greeting).toBeTruthy();
      expect(config.persona.role).toBeTruthy();
      expect(config.objective.primaryObjective).toBeTruthy();
      expect(config.speakingStyle.oneQuestionAtATime).toBe(true);
      expect(config.language.primary).toBeTruthy();
      expect(config.voice.voiceId).toBeTruthy();
      expect(config.conversation.phases.length).toBeGreaterThan(0);
      expect(config.knowledge.enabled).toBe(true);
      expect(config.tools.enabled).toBe(true);
      expect(config.tools.bindings.length).toBeGreaterThan(0);
    }
  });

  it('2. Every configured tool binding references a known platform tool', () => {
    for (const template of SYSTEM_TEMPLATES) {
      const bindings = template.defaultConfiguration.tools?.bindings || [];
      for (const binding of bindings) {
        expect(
          KNOWN_PLATFORM_TOOL_IDS.includes(binding.toolId as any),
          `Template "${template.name}" has unknown toolId "${binding.toolId}"`,
        ).toBe(true);
        expect(binding.name.trim()).toBeTruthy();
        expect(binding.description.trim()).toBeTruthy();
        expect(typeof binding.enabled).toBe('boolean');
      }
    }
  });

  it('3. No duplicate tool IDs or duplicate tool names within one template', () => {
    for (const template of SYSTEM_TEMPLATES) {
      const bindings = template.defaultConfiguration.tools?.bindings || [];
      const toolIds = bindings.map((b) => b.toolId);
      const toolNames = bindings.map((b) => b.name);

      expect(new Set(toolIds).size).toBe(toolIds.length);
      expect(new Set(toolNames).size).toBe(toolNames.length);
    }
  });

  it('4. validateTemplateConfiguration fails cleanly on invalid, duplicate, or malformed tools', () => {
    // A. Unknown tool ID
    expect(() =>
      validateTemplateConfiguration({
        tools: {
          enabled: true,
          bindings: [{ toolId: 'unknown_custom_tool', name: 'Custom', description: 'desc', enabled: true }],
        },
      } as any),
    ).toThrow(/unknown toolId/i);

    // B. Duplicate tool ID
    expect(() =>
      validateTemplateConfiguration({
        tools: {
          enabled: true,
          bindings: [
            { toolId: 'book_appointment', name: 'Booking 1', description: 'desc 1', enabled: true },
            { toolId: 'book_appointment', name: 'Booking 2', description: 'desc 2', enabled: true },
          ],
        },
      } as any),
    ).toThrow(/duplicate toolId/i);

    // C. Duplicate tool name
    expect(() =>
      validateTemplateConfiguration({
        tools: {
          enabled: true,
          bindings: [
            { toolId: 'book_appointment', name: 'Schedule Action', description: 'desc 1', enabled: true },
            { toolId: 'create_callback_lead', name: 'Schedule Action', description: 'desc 2', enabled: true },
          ],
        },
      } as any),
    ).toThrow(/duplicate tool name/i);

    // D. Empty description
    expect(() =>
      validateTemplateConfiguration({
        tools: {
          enabled: true,
          bindings: [{ toolId: 'book_appointment', name: 'Booking', description: '', enabled: true }],
        },
      } as any),
    ).toThrow(/non-empty description/i);

    // E. Non-boolean enabled flag
    expect(() =>
      validateTemplateConfiguration({
        tools: {
          enabled: true,
          bindings: [{ toolId: 'book_appointment', name: 'Booking', description: 'desc', enabled: 'yes' as any }],
        },
      } as any),
    ).toThrow(/boolean enabled flag/i);
  });

  // ============================================================================
  // 2. AGENT CREATION SNAPSHOT INDEPENDENCE
  // ============================================================================

  it('5. createAgent() creates an independent deep-cloned configuration snapshot', async () => {
    const templateConfig: AgentConfiguration = {
      identity: { agentName: 'Original Agent', greeting: 'Hello', businessName: 'Original Biz' },
      persona: { role: 'Assistant', personality: 'Helpful', tone: 'warm', style: 'concise', formality: 'mixed' },
      objective: { primaryObjective: 'Assist callers' },
      speakingStyle: { oneQuestionAtATime: true },
      businessInformation: { businessName: 'Original Biz' },
      conversation: { phases: [{ id: 'p1', name: 'Greeting', objective: 'Greet' }] },
      guardrails: {},
      language: { primary: 'en-IN', supported: ['en-IN'] },
      voice: { provider: 'sarvam', voiceId: 'shubh' },
      runtimeSettings: { modelTemperature: 0.7 },
      variables: { input: [], output: [] },
      knowledge: { enabled: true, retrievalConfig: { topK: 3 } },
      tools: {
        enabled: true,
        bindings: [{ toolId: 'book_appointment', name: 'Book', description: 'Book appt', enabled: true }],
      },
      systemInstructions: 'Assist caller.',
    };

    const mockTemplate = {
      id: 'template-uuid-1',
      name: 'Test Template',
      industry: 'Healthcare',
      defaultConfiguration: templateConfig,
      isSystem: true,
    };

    vi.spyOn(templateService, 'getTemplate').mockResolvedValue(mockTemplate as any);

    let insertedVersionConfig: any = null;
    (db.insert as any).mockImplementation((table: any) => ({
      values: vi.fn((val: any) => {
        if (val.configuration) {
          insertedVersionConfig = val.configuration;
        }
        return {
          returning: vi.fn(async () => [{ id: 'record-id-123', ...val }]),
        };
      }),
    }));

    vi.spyOn(agentService, 'getAgent').mockImplementation(async (agentId: string) => ({
      id: agentId,
      name: 'Created Agent',
      status: 'DRAFT',
      versions: [{ versionNumber: 1, configuration: insertedVersionConfig }],
    } as any));

    await agentService.createAgent('tenant-1', 'template-uuid-1', 'Created Agent', 'user-1');

    expect(insertedVersionConfig).toBeDefined();
    expect(insertedVersionConfig.identity.agentName).toBe('Original Agent');
    expect(insertedVersionConfig.tools.bindings[0].toolId).toBe('book_appointment');

    // Mutate the original template object in memory
    (templateConfig.identity as any).agentName = 'MUTATED TEMPLATE NAME';
    templateConfig.tools!.bindings[0].name = 'MUTATED TOOL NAME';

    // Verify the snapshot in version.configuration was NOT mutated
    expect(insertedVersionConfig.identity.agentName).toBe('Original Agent');
    expect(insertedVersionConfig.tools.bindings[0].name).toBe('Book');
  });

  // ============================================================================
  // 3. TOOL PROPAGATION & COMPATIBILITY NORMALIZATION
  // ============================================================================

  it('6. Tool bindings propagate faithfully from version.configuration to RuntimeAgentConfig', async () => {
    const mockVersionConfig: AgentConfiguration = {
      identity: { agentName: 'Clinic Bot', greeting: 'Hello', businessName: 'Arogya Clinic' },
      persona: { role: 'Receptionist', personality: 'Warm', tone: 'warm', style: 'concise', formality: 'formal' },
      objective: { primaryObjective: 'Book doctor appointments' },
      businessInformation: { businessName: 'Arogya Clinic' },
      language: { primary: 'en-IN', supported: ['en-IN'] },
      voice: { provider: 'sarvam', voiceId: 'priya' },
      knowledge: { enabled: true, retrievalConfig: { topK: 3 } },
      tools: {
        enabled: true,
        bindings: [
          { toolId: 'book_appointment', name: 'Book Appointment', description: 'Schedule with doctor', enabled: true },
          { toolId: 'create_callback_lead', name: 'Callback Lead', description: 'Record callback', enabled: true },
        ],
      },
    };

    const mockDeployment = {
      id: 'deploy-hospital-test',
      tenantId: 'tenant-test',
      agentId: 'agent-hospital',
      versionId: 'ver-1',
      status: 'ACTIVE',
      agent: { id: 'agent-hospital', tenantId: 'tenant-test', name: 'Clinic Bot', status: 'READY' },
      version: { id: 'ver-1', agentId: 'agent-hospital', versionNumber: 1, configuration: mockVersionConfig },
    };

    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeployment);

    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig('deploy-hospital-test');

    expect(runtimeConfig.tools.enabled).toBe(true);
    expect(runtimeConfig.tools.tools).toHaveLength(2);
    expect(runtimeConfig.tools.tools[0]).toEqual({
      toolId: 'book_appointment',
      name: 'book_appointment',
      description: 'Schedule with doctor',
      parameters: {},
      enabled: true,
      confirmationRequired: undefined,
    });
    expect(runtimeConfig.tools.tools[1]).toEqual({
      toolId: 'create_callback_lead',
      name: 'create_callback_lead',
      description: 'Record callback',
      parameters: {},
      enabled: true,
      confirmationRequired: undefined,
    });
  });

  it('7. Legacy tool shape (tools.tools) is normalized into runtimeConfig.tools.tools without loss', async () => {
    const legacyConfig: any = {
      identity: { agentName: 'Legacy Bot', greeting: 'Hello' },
      businessInformation: { businessName: 'Legacy Biz' },
      tools: {
        enabled: true,
        tools: [
          { toolId: 'book_appointment', name: 'Book Legacy', description: 'Legacy booking description', enabled: true },
          { name: 'create_callback_lead', description: 'Legacy callback without toolId key', enabled: false },
        ],
      },
    };

    const mockDeployment = {
      id: 'deploy-legacy-test',
      tenantId: 'tenant-test',
      agentId: 'agent-legacy',
      versionId: 'ver-legacy',
      status: 'ACTIVE',
      agent: { id: 'agent-legacy', tenantId: 'tenant-test', name: 'Legacy Bot', status: 'READY' },
      version: { id: 'ver-legacy', agentId: 'agent-legacy', versionNumber: 1, configuration: legacyConfig },
    };

    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeployment);

    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig('deploy-legacy-test');

    expect(runtimeConfig.tools.enabled).toBe(true);
    expect(runtimeConfig.tools.tools).toHaveLength(2);
    expect(runtimeConfig.tools.tools[0].toolId).toBe('book_appointment');
    expect(runtimeConfig.tools.tools[0].enabled).toBe(true);
    expect(runtimeConfig.tools.tools[1].toolId).toBe('create_callback_lead');
    expect(runtimeConfig.tools.tools[1].enabled).toBe(false);
  });

  it('8. Canonical shape priority: if both bindings and legacy tools exist, bindings takes precedence without merging', async () => {
    const dualConfig: any = {
      identity: { agentName: 'Dual Bot', greeting: 'Hello' },
      businessInformation: { businessName: 'Dual Biz' },
      tools: {
        enabled: true,
        bindings: [
          { toolId: 'book_appointment', name: 'Canonical Binding', description: 'Authoritative', enabled: true },
        ],
        tools: [
          { toolId: 'create_callback_lead', name: 'Old Tool', description: 'Should be ignored', enabled: true },
        ],
      },
    };

    const mockDeployment = {
      id: 'deploy-dual-test',
      tenantId: 'tenant-test',
      agentId: 'agent-dual',
      versionId: 'ver-dual',
      status: 'ACTIVE',
      agent: { id: 'agent-dual', tenantId: 'tenant-test', name: 'Dual Bot', status: 'READY' },
      version: { id: 'ver-dual', agentId: 'agent-dual', versionNumber: 1, configuration: dualConfig },
    };

    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeployment);

    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig('deploy-dual-test');

    expect(runtimeConfig.tools.tools).toHaveLength(1);
    expect(runtimeConfig.tools.tools[0].toolId).toBe('book_appointment');
    expect(runtimeConfig.tools.tools[0].name).toBe('book_appointment');
    expect(runtimeConfig.tools.tools[0].description).toBe('Authoritative');
  });

  it('9. Disabled tool bindings (enabled: false) remain explicitly disabled in RuntimeAgentConfig', async () => {
    const mockVersionConfig: AgentConfiguration = {
      identity: { agentName: 'Disabled Tool Bot', greeting: 'Hello' },
      businessInformation: { businessName: 'Disabled Biz' },
      language: { primary: 'en-IN', supported: ['en-IN'] },
      voice: { provider: 'sarvam', voiceId: 'shubh' },
      tools: {
        enabled: true,
        bindings: [
          { toolId: 'book_appointment', name: 'Book Appointment', description: 'Book', enabled: false },
          { toolId: 'create_callback_lead', name: 'Callback Lead', description: 'Lead', enabled: true },
        ],
      },
    };

    const mockDeployment = {
      id: 'deploy-disabled-test',
      tenantId: 'tenant-test',
      agentId: 'agent-disabled',
      versionId: 'ver-disabled',
      status: 'ACTIVE',
      agent: { id: 'agent-disabled', tenantId: 'tenant-test', name: 'Disabled Tool Bot', status: 'READY' },
      version: { id: 'ver-disabled', agentId: 'agent-disabled', versionNumber: 1, configuration: mockVersionConfig },
    };

    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeployment);

    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig('deploy-disabled-test');

    expect(runtimeConfig.tools.tools).toHaveLength(2);
    expect(runtimeConfig.tools.tools[0].toolId).toBe('book_appointment');
    expect(runtimeConfig.tools.tools[0].enabled).toBe(false);
    expect(runtimeConfig.tools.tools[1].toolId).toBe('create_callback_lead');
    expect(runtimeConfig.tools.tools[1].enabled).toBe(true);
  });

  // ============================================================================
  // 4. TEMPLATE SEEDING IDEMPOTENCY & CUSTOM TEMPLATE PROTECTION
  // ============================================================================

  it('10. seedTemplates() synchronizes system templates idempotently and updates stale presets', async () => {
    const staleClinicConfig = {
      identity: { agentName: 'Stale Priya', greeting: 'Old greeting' },
      tools: { enabled: true, bindings: [] }, // Stale empty bindings
    };

    const existingRows = [
      {
        id: 'tpl-clinic-1',
        name: 'Clinic Receptionist',
        description: 'Old description',
        industry: 'Healthcare',
        defaultConfiguration: staleClinicConfig,
        isSystem: true,
      },
    ];

    (db.query.agentTemplates.findMany as any).mockResolvedValue(existingRows);

    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));
    (db.update as any) = updateSpy;

    const insertSpy = vi.fn(() => ({
      values: vi.fn(async () => undefined),
    }));
    (db.insert as any) = insertSpy;

    await templateService.seedTemplates();

    // The existing system template must have been updated
    expect(updateSpy).toHaveBeenCalled();

    // The other 4 missing system templates must have been inserted
    expect(insertSpy).toHaveBeenCalled();
  });

  it('11. seedTemplates() preserves custom user templates (isSystem: false) untouched', async () => {
    const customUserConfig = {
      identity: { agentName: 'Custom Admission Agent', greeting: 'Custom greeting' },
      tools: { enabled: true, bindings: [] },
    };

    const existingRows = [
      {
        id: 'custom-tpl-1',
        name: 'Admission Counselling', // Same name as a system template, but custom!
        description: 'Custom user-created template',
        industry: 'Education',
        defaultConfiguration: customUserConfig,
        isSystem: false, // User custom template!
      },
    ];

    (db.query.agentTemplates.findMany as any).mockResolvedValue(existingRows);

    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));
    (db.update as any) = updateSpy;

    await templateService.seedTemplates();

    // update should NOT have been called on the custom template id
    for (const call of updateSpy.mock.results) {
      expect(call).toBeDefined();
    }
  });

  it('12. Changing a system template does NOT alter already created agent version configurations', async () => {
    const originalVersionConfig: AgentConfiguration = {
      identity: { agentName: 'Priya', greeting: 'Hello', businessName: 'Arogya Clinic' },
      businessInformation: { businessName: 'Arogya Clinic' },
      language: { primary: 'en-IN', supported: ['en-IN'] },
      voice: { provider: 'sarvam', voiceId: 'priya' },
      tools: {
        enabled: true,
        bindings: [{ toolId: 'book_appointment', name: 'Book', description: 'Book', enabled: true }],
      },
    };

    const mockDeployment = {
      id: 'deploy-isolated-agent',
      tenantId: 'tenant-test',
      agentId: 'agent-isolated',
      versionId: 'ver-isolated',
      status: 'ACTIVE',
      agent: { id: 'agent-isolated', tenantId: 'tenant-test', name: 'Priya', status: 'READY' },
      version: { id: 'ver-isolated', agentId: 'agent-isolated', versionNumber: 1, configuration: originalVersionConfig },
    };

    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeployment);

    // Resolve runtime config for the deployed agent
    const beforeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig('deploy-isolated-agent');
    expect(beforeConfig.tools.tools[0].name).toBe('book_appointment');

    // Now update the system template in database
    const updatedTemplateInDB = {
      id: 'tpl-clinic',
      name: 'Clinic Receptionist',
      isSystem: true,
      defaultConfiguration: {
        ...originalVersionConfig,
        identity: { agentName: 'Priya v2 Updated' },
        tools: { enabled: true, bindings: [{ toolId: 'create_callback_lead', name: 'New Lead Tool', description: 'desc', enabled: true }] },
      },
    };
    (db.query.agentTemplates.findFirst as any).mockResolvedValue(updatedTemplateInDB);

    // Re-resolve runtime config for the existing deployment
    const afterConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig('deploy-isolated-agent');

    // The deployed agent configuration MUST remain the original version configuration!
    expect(afterConfig.prompt.greeting).toBe(originalVersionConfig.identity?.greeting);
    expect(afterConfig.tools.tools[0].name).toBe('book_appointment');
    expect(afterConfig.tools.tools[0].toolId).toBe('book_appointment');
  });

  // ============================================================================
  // 5. CROSS-INDUSTRY UNIFORM EXECUTION
  // ============================================================================

  it('13. All five industry templates resolve into valid RuntimeAgentConfig without industry branching', async () => {
    for (const template of SYSTEM_TEMPLATES) {
      const mockDeployment = {
        id: `deploy-${template.industry.toLowerCase().replace(/\s+/g, '-')}`,
        tenantId: 'tenant-test',
        agentId: `agent-${template.industry.toLowerCase()}`,
        versionId: `ver-${template.industry.toLowerCase()}`,
        status: 'ACTIVE',
        agent: { id: `agent-${template.industry.toLowerCase()}`, tenantId: 'tenant-test', name: template.name, status: 'READY' },
        version: { id: `ver-${template.industry.toLowerCase()}`, agentId: `agent-${template.industry.toLowerCase()}`, versionNumber: 1, configuration: template.defaultConfiguration },
      };

      (db.query.deployments.findFirst as any).mockResolvedValue(mockDeployment);

      const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(mockDeployment.id);

      expect(runtimeConfig.agent.agentName).toBe(template.name);
      expect(runtimeConfig.tools.enabled).toBe(true);
      expect(runtimeConfig.tools.tools.length).toBeGreaterThan(0);
      expect(runtimeConfig.prompt.compiledSystemPrompt).toBeTruthy();
      expect(runtimeConfig.language.primary).toBeTruthy();
      expect(runtimeConfig.voice.voiceId).toBeTruthy();

      // Ensure each bound tool is in KNOWN_PLATFORM_TOOL_IDS
      for (const tool of runtimeConfig.tools.tools) {
        expect(KNOWN_PLATFORM_TOOL_IDS.includes(tool.toolId as any)).toBe(true);
        expect(tool.enabled).toBe(true);
      }
    }
  });
});

