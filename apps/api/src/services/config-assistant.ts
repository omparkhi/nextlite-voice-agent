import { z } from 'zod';
import { db } from '../db';
import { configChangeProposals, agents, agentVersions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { LLMService } from './llm';
import { KNOWN_PLATFORM_TOOL_IDS, type AgentConfiguration } from './template';

const toolBindingSchema = z.object({
  toolId: z.string().refine((id) => (KNOWN_PLATFORM_TOOL_IDS as readonly string[]).includes(id), {
    message: 'Unknown platform tool ID',
  }),
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  confirmationRequired: z.boolean().optional(),
}).passthrough();

const toolsConfigSchema = z.object({
  enabled: z.boolean(),
  bindings: z.array(toolBindingSchema).refine((bindings) => {
    const ids = bindings.map((b) => b.toolId);
    return new Set(ids).size === ids.length;
  }, {
    message: 'Duplicate toolId in tool bindings',
  }),
}).passthrough();

const agentConfigurationSchema = z.object({
  identity: z.object({ greeting: z.string() }).passthrough(),
  voice: z.object({ voiceId: z.string(), provider: z.string() }).passthrough(),
  language: z.object({ primary: z.string(), supported: z.array(z.string()) }).passthrough(),
  businessInformation: z.object({ businessName: z.string() }).passthrough(),
  tools: toolsConfigSchema.optional(),
  systemInstructions: z.string().optional(),
}).passthrough();

export interface ConfigProposal {
  id: string;
  agentId: string;
  userMessage: string;
  proposedConfig: AgentConfiguration;
  diff: Record<string, { old: unknown; new: unknown }>;
  status: string;
  createdAt: Date;
}

export interface ConfigAssistantService {
  proposeChange(tenantId: string, agentId: string, userId: string, userMessage: string): Promise<ConfigProposal>;
  listProposals(tenantId: string, agentId: string): Promise<ConfigProposal[]>;
  approve(tenantId: string, agentId: string, proposalId: string, userId: string): Promise<{ versionId: string; versionNumber: number }>;
  reject(tenantId: string, agentId: string, proposalId: string, userId: string): Promise<void>;
}

export class ConfigAssistantServiceImpl implements ConfigAssistantService {
  private llm: LLMService;

  constructor(llm: LLMService) {
    this.llm = llm;
  }

  async proposeChange(tenantId: string, agentId: string, userId: string, userMessage: string): Promise<ConfigProposal> {
    const agentResults = await db.select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)))
      .limit(1);

    if (agentResults.length === 0) throw new Error('Agent not found');

    const versionResults = await db.select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionNumber))
      .limit(1);

    const currentConfig = (versionResults[0]?.configuration as AgentConfiguration) || this.getDefaultConfig();

    const configSchema = this.getJsonSchema();

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a configuration assistant. Given the current agent configuration, propose changes to achieve the user\'s request. Return ONLY the full updated configuration as JSON. Do not remove fields that are not relevant to the request.',
      },
      {
        role: 'user' as const,
        content: `Current configuration:\n${JSON.stringify(currentConfig, null, 2)}\n\nUser request: ${userMessage}`,
      },
    ];

    const rawProposed = (await this.llm.chatWithJsonOutput(messages, configSchema)) as unknown as AgentConfiguration;

    // Safety rules: preserve omitted fields (tools, businessInformation, timezone, etc.) from currentConfig
    let proposedWithPreservedTools = { ...rawProposed };
    if (rawProposed) {
      if (rawProposed.businessInformation && currentConfig.businessInformation) {
        proposedWithPreservedTools.businessInformation = {
          ...currentConfig.businessInformation,
          ...rawProposed.businessInformation,
        };
      }
      if ((rawProposed.tools === undefined || rawProposed.tools === null) && currentConfig.tools) {
        proposedWithPreservedTools.tools = currentConfig.tools;
      }
    }

    const validated = agentConfigurationSchema.parse(proposedWithPreservedTools);

    const diff = this.computeDiff(currentConfig, validated);

    const proposalResults = await db.insert(configChangeProposals).values({
      agentId,
      tenantId,
      proposedBy: userId,
      userMessage,
      currentConfig,
      proposedConfig: validated,
      diff,
      status: 'PENDING',
    }).returning();

    const proposal = proposalResults[0];

    return {
      id: proposal.id,
      agentId,
      userMessage,
      proposedConfig: validated,
      diff,
      status: proposal.status,
      createdAt: proposal.createdAt,
    };
  }

  async listProposals(tenantId: string, agentId: string): Promise<ConfigProposal[]> {
    const results = await db.select()
      .from(configChangeProposals)
      .where(and(eq(configChangeProposals.agentId, agentId), eq(configChangeProposals.tenantId, tenantId)))
      .orderBy(desc(configChangeProposals.createdAt));

    return results.map(p => ({
      id: p.id,
      agentId: p.agentId,
      userMessage: p.userMessage,
      proposedConfig: p.proposedConfig as AgentConfiguration,
      diff: p.diff as Record<string, { old: unknown; new: unknown }>,
      status: p.status,
      createdAt: p.createdAt,
    }));
  }

  async approve(tenantId: string, agentId: string, proposalId: string, userId: string): Promise<{ versionId: string; versionNumber: number }> {
    const proposalResults = await db.select()
      .from(configChangeProposals)
      .where(and(
        eq(configChangeProposals.id, proposalId),
        eq(configChangeProposals.agentId, agentId),
        eq(configChangeProposals.tenantId, tenantId),
      ))
      .limit(1);

    if (proposalResults.length === 0) throw new Error('Proposal not found');
    const proposal = proposalResults[0];

    if (proposal.status !== 'PENDING') throw new Error(`Proposal cannot be approved: already ${proposal.status}`);

    const latestVersion = await db.select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (latestVersion[0]?.versionNumber || 0) + 1;

    const versionResults = await db.insert(agentVersions).values({
      agentId,
      versionNumber: nextVersionNumber,
      configuration: proposal.proposedConfig as any,
      status: 'DRAFT',
      createdBy: userId,
      notes: `Applied config assistant proposal: "${proposal.userMessage.substring(0, 100)}"`,
    }).returning();

    await db.update(configChangeProposals)
      .set({ status: 'APPROVED', reviewedBy: userId, reviewedAt: new Date() })
      .where(eq(configChangeProposals.id, proposalId));

    return {
      versionId: versionResults[0].id,
      versionNumber: nextVersionNumber,
    };
  }

  async reject(tenantId: string, agentId: string, proposalId: string, userId: string): Promise<void> {
    const proposalResults = await db.select()
      .from(configChangeProposals)
      .where(and(
        eq(configChangeProposals.id, proposalId),
        eq(configChangeProposals.agentId, agentId),
        eq(configChangeProposals.tenantId, tenantId),
      ))
      .limit(1);

    if (proposalResults.length === 0) throw new Error('Proposal not found');
    const proposal = proposalResults[0];

    if (proposal.status !== 'PENDING') throw new Error(`Proposal cannot be rejected: already ${proposal.status}`);

    await db.update(configChangeProposals)
      .set({ status: 'REJECTED', reviewedBy: userId, reviewedAt: new Date() })
      .where(eq(configChangeProposals.id, proposalId));
  }

  private computeDiff(current: AgentConfiguration, proposed: AgentConfiguration): Record<string, { old: unknown; new: unknown }> {
    const diff: Record<string, { old: unknown; new: unknown }> = {};
    const flatCurrent = this.flattenObject(current as unknown as Record<string, unknown>);
    const flatProposed = this.flattenObject(proposed as unknown as Record<string, unknown>);

    const allKeys = new Set([...Object.keys(flatCurrent), ...Object.keys(flatProposed)]);

    for (const key of allKeys) {
      const oldVal = flatCurrent[key];
      const newVal = flatProposed[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[key] = { old: oldVal ?? null, new: newVal ?? null };
      }
    }
    return diff;
  }

  private flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, fullKey));
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }

  private getDefaultConfig(): AgentConfiguration {
    return {
      identity: { agentName: 'Assistant', displayName: 'Assistant', greeting: 'Hello! How can I help you today?', businessName: '' },
      persona: { role: 'AI Assistant', personality: 'Helpful and concise', tone: 'warm', style: 'concise', formality: 'mixed' },
      objective: { primaryObjective: 'Assist caller queries efficiently.' },
      speakingStyle: { maxSentences: 2, oneQuestionAtATime: true, conciseResponses: true },
      businessInformation: { businessName: '', businessType: 'General', hours: '', location: '', description: '', timezone: 'Asia/Kolkata' },
      conversation: { phases: [] },
      guardrails: { prohibitedTopics: [], escalationRules: [], fallbackBehavior: '' },
      language: { primary: 'en-IN', supported: ['en-IN'] },
      voice: { voiceId: 'shubh', provider: 'sarvam', gender: 'male' },
      runtimeSettings: {
        modelTemperature: 0.7,
        allowCallerInterruptions: true,
        nudges: { enabled: true, delaySeconds: 7, messages: ['Are you there?'], maxUnansweredNudges: 2 },
        maxCallLengthSeconds: 300,
      },
      variables: { input: [], output: [] },
      knowledge: { enabled: true, retrievalConfig: { topK: 3 } },
      tools: { enabled: false, bindings: [] },
      systemInstructions: '',
    };
  }

  private getJsonSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        identity: {
          type: 'object',
          properties: {
            agentName: { type: 'string' },
            displayName: { type: 'string' },
            greeting: { type: 'string' },
            businessName: { type: 'string' },
          },
          required: ['greeting'],
        },
        persona: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            personality: { type: 'string' },
            tone: { type: 'string' },
            style: { type: 'string' },
            formality: { type: 'string' },
          },
        },
        objective: {
          type: 'object',
          properties: {
            primaryObjective: { type: 'string' },
            secondaryObjectives: { type: 'array', items: { type: 'string' } },
          },
        },
        speakingStyle: {
          type: 'object',
          properties: {
            maxSentences: { type: 'number' },
            oneQuestionAtATime: { type: 'boolean' },
            conciseResponses: { type: 'boolean' },
          },
        },
        businessInformation: {
          type: 'object',
          properties: {
            businessName: { type: 'string' },
            businessType: { type: 'string' },
            hours: { type: 'string' },
            location: { type: 'string' },
            description: { type: 'string' },
            timezone: { type: 'string' },
          },
        },
        conversation: {
          type: 'object',
          properties: {
            phases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  objective: { type: 'string' },
                  instructions: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        guardrails: {
          type: 'object',
          properties: {
            prohibitedTopics: { type: 'array', items: { type: 'string' } },
            escalationRules: { type: 'array', items: { type: 'string' } },
            fallbackBehavior: { type: 'string' },
          },
        },
        voice: {
          type: 'object',
          properties: {
            voiceId: { type: 'string' },
            provider: { type: 'string' },
            gender: { type: 'string' },
          },
        },
        language: {
          type: 'object',
          properties: {
            primary: { type: 'string' },
            supported: { type: 'array', items: { type: 'string' } },
          },
        },
        systemInstructions: { type: 'string' },
      },
      required: ['identity', 'voice', 'language', 'businessInformation'],
    };
  }
}

export function createConfigAssistantService(llm: LLMService): ConfigAssistantService {
  return new ConfigAssistantServiceImpl(llm);
}
