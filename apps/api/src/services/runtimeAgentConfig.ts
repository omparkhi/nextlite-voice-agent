import { db } from '../db';
import { deployments } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { promptCompiler } from './promptCompiler';
import type { AgentConfiguration } from './template';
import type { RuntimeAgentConfig } from '@nextlite/shared';
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

    // 7. Map to RuntimeAgentConfig DTO using stored configuration values
    const runtimeConfig: RuntimeAgentConfig = {
      tenant: {
        tenantId: deployment.tenantId,
      },
      agent: {
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
      },
      deployment: {
        deploymentId: deployment.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
      },
      prompt: {
        compiledSystemPrompt,
        greeting: config.identity?.greeting,
      },
      voice: {
        provider: config.voice?.provider,
        sttModel: (config.voice as any)?.sttModel,
        ttsModel: (config.voice as any)?.ttsModel,
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
        modelProvider: (config.runtimeSettings as any)?.modelProvider || (config as any)?.modelProvider,
        llmModel: (config.runtimeSettings as any)?.llmModel || (config as any)?.llmModel,
        temperature: config.runtimeSettings?.modelTemperature,
        interruptionMode:
          config.runtimeSettings?.allowCallerInterruptions !== undefined
            ? config.runtimeSettings.allowCallerInterruptions
              ? 'adaptive'
              : 'disabled'
            : undefined,
        preemptiveGenerationEnabled: (config.runtimeSettings as any)?.preemptiveGenerationEnabled,
        responseEagerness: config.runtimeSettings?.eagernessToRespond,
        noiseCancellationModel: (config.runtimeSettings as any)?.noiseCancellationModel,
        expressiveModeEnabled: (config.runtimeSettings as any)?.expressiveModeEnabled,
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
        tools: (config.tools?.bindings || []).map((t) => ({
          name: t.name || t.toolId,
          description: t.description || '',
          parameters: {},
          enabled: t.enabled ?? true,
          confirmationRequired: t.confirmationRequired,
        })),
      },
      variables: {
        inputVariables: (config.variables?.input || []).map((v) => ({
          key: v.key,
          label: v.label,
          type: v.type as any,
          required: v.required ?? false,
          defaultValue: v.defaultValue,
          scope: v.scope as any,
        })),
        outputVariables: (config.variables?.output || []).map((v) => ({
          key: v.key,
          label: v.label,
          type: v.type as any,
          required: v.required ?? false,
        })),
      },
    };

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

export const runtimeAgentConfigService = new RuntimeAgentConfigService();
