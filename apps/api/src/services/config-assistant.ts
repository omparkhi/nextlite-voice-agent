import { z } from 'zod';
import { db } from '../db';
import { configChangeProposals, agents, agentVersions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { LLMService } from './llm';
import type { AgentConfiguration } from './template';

const agentConfigurationSchema = z.object({
  identity: z.object({ greeting: z.string() }).passthrough(),
  voice: z.object({ voiceId: z.string(), provider: z.string() }).passthrough(),
  language: z.object({ primary: z.string(), supported: z.array(z.string()) }).passthrough(),
  businessInformation: z.object({ businessName: z.string() }).passthrough(),
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

    const proposedConfig = await this.llm.chatWithJsonOutput(messages, configSchema) as unknown as AgentConfiguration;

    const validated = agentConfigurationSchema.parse(proposedConfig);

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
      .where(and(
        eq(configChangeProposals.tenantId, tenantId),
        eq(configChangeProposals.agentId, agentId),
      ))
      .orderBy(desc(configChangeProposals.createdAt));

    return results.map(r => ({
      id: r.id,
      agentId: r.agentId,
      userMessage: r.userMessage,
      proposedConfig: r.proposedConfig as AgentConfiguration,
      diff: r.diff as Record<string, { old: unknown; new: unknown }>,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async approve(tenantId: string, agentId: string, proposalId: string, userId: string): Promise<{ versionId: string; versionNumber: number }> {
    const proposalResults = await db.select()
      .from(configChangeProposals)
      .where(and(
        eq(configChangeProposals.id, proposalId),
        eq(configChangeProposals.tenantId, tenantId),
        eq(configChangeProposals.agentId, agentId),
      ))
      .limit(1);

    if (proposalResults.length === 0) throw new Error('Proposal not found');
    if (proposalResults[0].status !== 'PENDING') throw new Error('Proposal already reviewed');

    const maxVersionResults = await db.select({ maxVersion: agentVersions.versionNumber })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionNumber))
      .limit(1);

    const nextVersion = (maxVersionResults[0]?.maxVersion || 0) + 1;

    const versionResults = await db.insert(agentVersions).values({
      agentId,
      versionNumber: nextVersion,
      configuration: proposalResults[0].proposedConfig,
      createdBy: userId,
      notes: `Config assistant: ${proposalResults[0].userMessage}`,
    }).returning();

    await db.update(configChangeProposals)
      .set({ status: 'APPROVED', reviewedBy: userId, reviewedAt: new Date() })
      .where(eq(configChangeProposals.id, proposalId));

    return { versionId: versionResults[0].id, versionNumber: nextVersion };
  }

  async reject(tenantId: string, agentId: string, proposalId: string, userId: string): Promise<void> {
    const results = await db.select()
      .from(configChangeProposals)
      .where(and(
        eq(configChangeProposals.id, proposalId),
        eq(configChangeProposals.tenantId, tenantId),
        eq(configChangeProposals.agentId, agentId),
      ))
      .limit(1);

    if (results.length === 0) throw new Error('Proposal not found');
    if (results[0].status !== 'PENDING') throw new Error('Proposal already reviewed');

    await db.update(configChangeProposals)
      .set({ status: 'REJECTED', reviewedBy: userId, reviewedAt: new Date() })
      .where(eq(configChangeProposals.id, proposalId));
  }

  private computeDiff(oldConfig: AgentConfiguration, newConfig: AgentConfiguration): Record<string, { old: unknown; new: unknown }> {
    const diff: Record<string, { old: unknown; new: unknown }> = {};
    const flatOld = this.flattenObject(oldConfig as unknown as Record<string, unknown>);
    const flatNew = this.flattenObject(newConfig as unknown as Record<string, unknown>);

    const allKeys = new Set([...Object.keys(flatOld), ...Object.keys(flatNew)]);
    for (const key of allKeys) {
      if (JSON.stringify(flatOld[key]) !== JSON.stringify(flatNew[key])) {
        diff[key] = { old: flatOld[key], new: flatNew[key] };
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
      identity: { agentName: 'Assistant', name: 'Assistant', greeting: 'Hello! How can I help you today?' },
      persona: { role: 'AI Assistant', personality: 'Helpful and concise', tone: 'warm', style: 'concise', formality: 'mixed' },
      objective: { primaryObjective: 'Assist caller queries efficiently.' },
      voice: { voiceId: 'shubh', provider: 'sarvam', gender: 'male' },
      language: { primary: 'en-IN', supported: ['en-IN'] },
      businessInformation: { businessName: '', businessType: 'General', hours: '', location: '', description: '' },
      role: { description: 'AI Assistant' },
      goal: { primaryObjective: 'Assist caller queries efficiently.' },
      personality: { tone: 'professional', style: 'concise', formality: 'formal' },
      conversationRules: { maxTurns: 10, greetingStyle: 'professional', fallbackBehavior: '' },
      appointmentRules: { slotDuration: 30, bufferTime: 15, workingHours: '', bookingRules: '' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    };
  }

  private getJsonSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        identity: { type: 'object', properties: { name: { type: 'string' }, greeting: { type: 'string' } }, required: ['name', 'greeting'] },
        role: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] },
        goal: { type: 'object', properties: { primaryObjective: { type: 'string' } }, required: ['primaryObjective'] },
        voice: { type: 'object', properties: { voiceId: { type: 'string' }, provider: { type: 'string' } }, required: ['voiceId', 'provider'] },
        language: { type: 'object', properties: { primary: { type: 'string' }, supported: { type: 'array', items: { type: 'string' } } }, required: ['primary', 'supported'] },
        businessInformation: { type: 'object', properties: { businessName: { type: 'string' }, businessType: { type: 'string' }, hours: { type: 'string' }, location: { type: 'string' }, description: { type: 'string' } }, required: ['businessName', 'businessType', 'hours', 'location', 'description'] },
        personality: { type: 'object', properties: { tone: { type: 'string' }, style: { type: 'string' }, formality: { type: 'string' } }, required: ['tone', 'style', 'formality'] },
        conversationRules: { type: 'object', properties: { maxTurns: { type: 'number' }, greetingStyle: { type: 'string' }, fallbackBehavior: { type: 'string' } }, required: ['maxTurns', 'greetingStyle', 'fallbackBehavior'] },
        appointmentRules: { type: 'object', properties: { slotDuration: { type: 'number' }, bufferTime: { type: 'number' }, workingHours: { type: 'string' }, bookingRules: { type: 'string' } }, required: ['slotDuration', 'bufferTime', 'workingHours', 'bookingRules'] },
        leadRules: { type: 'object', properties: { requiredFields: { type: 'array', items: { type: 'string' } }, qualificationCriteria: { type: 'string' } }, required: ['requiredFields', 'qualificationCriteria'] },
        escalationRules: { type: 'object', properties: { triggerConditions: { type: 'array', items: { type: 'string' } }, transferNumber: { type: 'string' }, timeout: { type: 'number' } }, required: ['triggerConditions', 'transferNumber', 'timeout'] },
        systemInstructions: { type: 'string' },
      },
      required: ['identity', 'role', 'goal', 'voice', 'language', 'businessInformation', 'personality', 'conversationRules', 'appointmentRules', 'leadRules', 'escalationRules', 'systemInstructions'],
      additionalProperties: false,
    };
  }
}

export function createConfigAssistantService(llm: LLMService): ConfigAssistantService {
  return new ConfigAssistantServiceImpl(llm);
}
