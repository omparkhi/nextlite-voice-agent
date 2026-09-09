import { db } from '../db';
import { deployments } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { promptCompiler } from './promptCompiler';
import type { AgentConfiguration } from './template';
import { type RuntimeAgentConfig, normalizeToolId } from '@nextlite/shared';
import { RuntimeConfigError } from '../errors/runtimeConfigError';

export { RuntimeConfigError, type RuntimeConfigErrorCode } from '../errors/runtimeConfigError';

const logger = createChildLogger({ module: 'runtime-agent-config-service' });

export class RuntimeAgentConfigService {
  /**
   * Resolves an authoritative RuntimeAgentConfig DTO for a specific deployment.
   *
   * Overloaded call signatures:
   * - resolveRuntimeAgentConfig(deploymentId: string) -> resolves tenantId authoritatively from database deployment
   * - resolveRuntimeAgentConfig(tenantId: string, deploymentId: string) -> validates tenantId matches deployment tenantId
   */
  async resolveRuntimeAgentConfig(
    arg1: string,
    arg2?: string,
  ): Promise<RuntimeAgentConfig> {
    let tenantIdConstraint: string | undefined = arg2 ? arg1 : undefined;
    const deploymentId: string = arg2 ? arg2 : arg1;

    if (!deploymentId) {
      throw new RuntimeConfigError('RUNTIME_CONFIG_CONFIG_INVALID', 'Deployment ID is required');
    }

    // 1. Query deployment directly or enforcing tenant constraint
    const deployment = await db.query.deployments.findFirst({
      where: tenantIdConstraint
        ? and(eq(deployments.id, deploymentId), eq(deployments.tenantId, tenantIdConstraint))
        : eq(deployments.id, deploymentId),
      with: {
        agent: true,
        version: true,
      },
    });

    if (!deployment) {
      logger.warn({ tenantIdConstraint, deploymentId }, 'Deployment not found');
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
        tenantIdConstraint ? 'Deployment not found for tenant' : 'Deployment not found',
      );
    }

    const tenantId = deployment.tenantId;

    // 2. Validate deployment status
    if (deployment.status !== 'ACTIVE') {
      logger.warn(
        { tenantId, deploymentId, status: deployment.status },
        'Deployment is not active',
      );
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
        `Deployment is not active (status: ${deployment.status})`,
      );
    }

    const agent = deployment.agent;
    const version = deployment.version;

    if (!agent || !version) {
      logger.error({ tenantId, deploymentId }, 'Deployment missing agent or version relation');
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_AGENT_INVALID',
        'Invalid deployment: missing agent or version record',
      );
    }

    // 3. Invariant checks for tenant/agent/version consistency
    if (
      deployment.agentId !== agent.id ||
      deployment.versionId !== version.id ||
      version.agentId !== agent.id
    ) {
      logger.error(
        {
          deploymentAgentId: deployment.agentId,
          agentId: agent.id,
          versionAgentId: version.agentId,
          deploymentVersionId: deployment.versionId,
          versionId: version.id,
        },
        'Mismatched deployment agent/version relationship',
      );
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_AGENT_INVALID',
        'Invalid deployment agent/version relationship',
      );
    }

    if (agent.tenantId !== tenantId) {
      logger.error({ agentTenantId: agent.tenantId, tenantId }, 'Tenant mismatch on agent record');
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_AGENT_INVALID',
        'Tenant mismatch on agent record',
      );
    }

    // 4. Agent Status Validation
    if (agent.status === 'ARCHIVED' || agent.status === 'PAUSED') {
      logger.warn({ agentId: agent.id, agentStatus: agent.status }, 'Agent is not active');
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_AGENT_INVALID',
        `Agent is ${agent.status.toLowerCase()}`,
      );
    }

    // 5. Exact Version Configuration JSONB
    const config = version.configuration as AgentConfiguration;
    if (!config) {
      logger.error({ versionId: version.id }, 'Agent version configuration is empty');
      throw new RuntimeConfigError(
        'RUNTIME_CONFIG_CONFIG_INVALID',
        'Invalid agent version configuration',
      );
    }

    // 6. Compile System Prompt via PromptCompilerService
    const compiledSystemPrompt = promptCompiler.compileAgentPrompt({
      configuration: config,
    });

    // Canonical shape: config.tools.bindings; Fallback legacy shape: (config.tools as any).tools
    const configuredBindings: any[] =
      config.tools?.bindings && Array.isArray(config.tools.bindings)
        ? config.tools.bindings
        : Array.isArray((config.tools as any)?.tools)
          ? (config.tools as any).tools
          : [];

    // 7. Map to RuntimeAgentConfig DTO using stored configuration values
    const runtimeConfig = buildRuntimeAgentConfig(config, {
      tenantId: deployment.tenantId,
      agentId: agent.id,
      agentName: agent.name,
      agentStatus: agent.status,
      deploymentId: deployment.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      compiledSystemPrompt,
    });

    logger.info(
      {
        tenantId,
        deploymentId: deployment.id,
        agentId: agent.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
      },
      'RuntimeAgentConfig resolved successfully',
    );

    return runtimeConfig;
  }
}

/**
 * Pure mapping helper that builds a RuntimeAgentConfig DTO from an AgentConfiguration snapshot.
 */
export function buildRuntimeAgentConfig(
  config: AgentConfiguration,
  options: {
    tenantId?: string;
    agentId?: string;
    agentName?: string;
    agentStatus?: string;
    deploymentId?: string;
    versionId?: string;
    versionNumber?: number;
    compiledSystemPrompt?: string;
  } = {},
): RuntimeAgentConfig {
  // Canonical shape: config.tools.bindings; Fallback legacy shape: (config.tools as any).tools
  const configuredBindings: any[] =
    config.tools?.bindings && Array.isArray(config.tools.bindings)
      ? config.tools.bindings
      : Array.isArray((config.tools as any)?.tools)
        ? (config.tools as any).tools
        : [];

  return {
    tenant: {
      tenantId: options.tenantId || 'test-tenant',
    },
    agent: {
      agentId: options.agentId || 'test-agent',
      agentName: options.agentName || 'Test Agent',
      status: options.agentStatus || 'active',
    },
    deployment: {
      deploymentId: options.deploymentId || 'test-deployment',
      versionId: options.versionId || 'test-version',
      versionNumber: options.versionNumber || 1,
    },
    prompt: {
      compiledSystemPrompt: options.compiledSystemPrompt || '',
      greeting: config.identity?.greeting,
      timezone: config.businessInformation?.timezone || 'Asia/Kolkata',
    },
    voice: {
      provider: config.voice?.provider,
      sttModel: config.voice?.sttModel,
      ttsModel: config.voice?.ttsModel,
      voiceId: config.voice?.voiceId,
      gender: config.voice?.gender,
      speakingSpeed: config.voice?.speakingSpeed,
      pitch: config.voice?.pitch,
    },
    language: {
      primary: config.language?.primary,
      supportedLanguages: config.language?.supported || [],
      autoDetectEnabled: config.language?.autoDetect,
      languageSwitchingEnabled: config.language?.languageSwitchEnabled,
    },
    runtime: {
      modelProvider: config.runtimeSettings?.modelProvider || config.modelProvider,
      llmModel: config.runtimeSettings?.llmModel || config.llmModel,
      temperature: config.runtimeSettings?.modelTemperature,
      interruptionMode:
        config.runtimeSettings?.interruptionMode ||
        (config.runtimeSettings?.allowCallerInterruptions !== undefined
          ? config.runtimeSettings.allowCallerInterruptions
            ? 'adaptive'
            : 'disabled'
          : undefined),
      preemptiveGenerationEnabled: config.runtimeSettings?.preemptiveGenerationEnabled,
      responseEagerness: config.runtimeSettings?.eagernessToRespond,
      noiseCancellationModel: config.runtimeSettings?.noiseCancellationModel,
      expressiveModeEnabled: config.runtimeSettings?.expressiveModeEnabled,
      maxCallDurationSeconds: config.runtimeSettings?.maxCallLengthSeconds,
    },
    knowledge: {
      enabled: config.knowledge?.enabled ?? false,
      retrievalConfig: config.knowledge?.retrievalConfig
        ? {
            topK: config.knowledge.retrievalConfig.topK,
            scoreThreshold: config.knowledge.retrievalConfig.similarityThreshold,
          }
        : undefined,
    },
    tools: {
      enabled: config.tools?.enabled ?? false,
      tools: configuredBindings.map((t) => {
        const canonicalId = normalizeToolId(t.toolId || t.name) || t.toolId || t.name;
        return {
          toolId: canonicalId,
          name: canonicalId,
          description: t.description || '',
          parameters: t.parameters || {},
          enabled: typeof t.enabled === 'boolean' ? t.enabled : true,
          confirmationRequired: t.confirmationRequired,
        };
      }),
    },
    variables: {
      inputVariables: (config.variables?.input || []).map((v) => ({
        key: v.key,
        label: v.label,
        type: v.type,
        required: v.required ?? false,
        defaultValue: v.defaultValue,
        scope: v.scope,
      })),
      outputVariables: (config.variables?.output || []).map((v) => ({
        key: v.key,
        label: v.label,
        type: v.type,
        required: v.required ?? false,
      })),
    },
  };
}

export const runtimeAgentConfigService = new RuntimeAgentConfigService();
