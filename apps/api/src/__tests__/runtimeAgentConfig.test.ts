import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
vi.mock('../db', () => ({
  db: {
    query: {
      deployments: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { runtimeAgentConfigService, RuntimeConfigError } from '../services/runtimeAgentConfig';
import { db } from '../db';

describe('RuntimeAgentConfigService (Module A6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleConfigV2 = {
    identity: {
      agentName: 'Aarav (V2)',
      greeting: 'Hello, this is Version 2 of Aarav.',
      businessName: 'Apex Health Clinic',
    },
    persona: {
      role: 'Medical Assistant',
      personality: 'Warm and professional',
      tone: 'Empathetic',
    },
    language: {
      primary: 'hi-IN',
      supported: ['hi-IN', 'en-IN'],
      autoDetect: true,
      languageSwitchEnabled: true,
    },
    voice: {
      provider: 'custom-provider-v2',
      voiceId: 'rahul',
      gender: 'male',
      speakingSpeed: 1.0,
      sttModel: 'stt-custom-v2',
      ttsModel: 'tts-custom-v2',
    },
    runtimeSettings: {
      modelProvider: 'custom-llm-provider',
      llmModel: 'custom-llm-model-v2',
      modelTemperature: 0.7,
      allowCallerInterruptions: true,
      interruptionMode: 'adaptive',
      preemptiveGenerationEnabled: false,
      noiseCancellationModel: 'quailVfS',
      expressiveModeEnabled: false,
      eagernessToRespond: 'medium',
      maxCallLengthSeconds: 300,
    },
    knowledge: {
      enabled: true,
      retrievalConfig: { topK: 3 },
    },
    tools: {
      enabled: true,
      bindings: [
        { toolId: 'book_appointment', name: 'Book Appointment', description: 'Schedule doctor visit', enabled: true },
      ],
    },
    variables: {
      input: [
        { key: 'userName', label: 'User Name', type: 'string', required: false, scope: 'CALLER' },
      ],
      output: [
        { key: 'appointmentConfirmed', label: 'Appointment Confirmed', type: 'boolean', required: true },
      ],
    },
    systemInstructions: 'You are Aarav Version 2. Help patients schedule appointments.',
  };

  const mockDeploymentV2 = {
    id: 'deployment-123',
    tenantId: 'tenant-abc',
    agentId: 'agent-456',
    versionId: 'version-v2',
    environment: 'PRODUCTION',
    status: 'ACTIVE',
    createdBy: 'user-789',
    createdAt: new Date(),
    updatedAt: new Date(),
    agent: {
      id: 'agent-456',
      tenantId: 'tenant-abc',
      name: 'Aarav Assistant',
      status: 'LIVE',
    },
    version: {
      id: 'version-v2',
      agentId: 'agent-456',
      versionNumber: 2,
      configuration: sampleConfigV2,
      status: 'PUBLISHED',
    },
  };

  it('TEST 1: Correct tenant + active deployment -> returns RuntimeAgentConfig', async () => {
    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeploymentV2);

    const result = await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');

    expect(result).toBeDefined();
    expect(result.tenant.tenantId).toBe('tenant-abc');
    expect(result.agent.agentId).toBe('agent-456');
    expect(result.agent.agentName).toBe('Aarav Assistant');
    expect(result.deployment.deploymentId).toBe('deployment-123');
    expect(result.deployment.versionId).toBe('version-v2');
    expect(result.deployment.versionNumber).toBe(2);
    expect(result.prompt.greeting).toBe('Hello, this is Version 2 of Aarav.');
    expect(result.prompt.compiledSystemPrompt).toContain('You are Aarav Version 2');
    expect(result.voice.provider).toBe('custom-provider-v2');
    expect(result.voice.voiceId).toBe('rahul');
    expect(result.voice.sttModel).toBe('stt-custom-v2');
    expect(result.voice.ttsModel).toBe('tts-custom-v2');
    expect(result.language.primary).toBe('hi-IN');
    expect(result.runtime.modelProvider).toBe('custom-llm-provider');
    expect(result.runtime.llmModel).toBe('custom-llm-model-v2');
    expect(result.runtime.interruptionMode).toBe('adaptive');
    expect(result.runtime.preemptiveGenerationEnabled).toBe(false);
    expect(result.runtime.noiseCancellationModel).toBe('quailVfS');
    expect(result.runtime.expressiveModeEnabled).toBe(false);
    expect(result.tools.tools).toHaveLength(1);
    expect(result.tools.tools[0].name).toBe('Book Appointment');
  });

  it('TEST 2: Wrong tenant -> rejected with stable RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND code', async () => {
    (db.query.deployments.findFirst as any).mockResolvedValue(null);

    try {
      await runtimeAgentConfigService.resolveRuntimeAgentConfig('wrong-tenant', 'deployment-123');
      expect.fail('Should have thrown RuntimeConfigError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigError);
      expect(err.code).toBe('RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND');
      expect(err.message).toBe('Deployment not found for tenant');
    }
  });

  it('TEST 3: Inactive deployment -> rejected with stable RUNTIME_CONFIG_DEPLOYMENT_INACTIVE code', async () => {
    const inactiveDeployment = {
      ...mockDeploymentV2,
      status: 'INACTIVE',
    };
    (db.query.deployments.findFirst as any).mockResolvedValue(inactiveDeployment);

    try {
      await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');
      expect.fail('Should have thrown RuntimeConfigError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigError);
      expect(err.code).toBe('RUNTIME_CONFIG_DEPLOYMENT_INACTIVE');
      expect(err.message).toContain('Deployment is not active');
    }
  });

  it('TEST 4: Rolled-back deployment -> rejected with stable RUNTIME_CONFIG_DEPLOYMENT_INACTIVE code', async () => {
    const rolledBackDeployment = {
      ...mockDeploymentV2,
      status: 'ROLLED_BACK',
    };
    (db.query.deployments.findFirst as any).mockResolvedValue(rolledBackDeployment);

    try {
      await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');
      expect.fail('Should have thrown RuntimeConfigError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigError);
      expect(err.code).toBe('RUNTIME_CONFIG_DEPLOYMENT_INACTIVE');
    }
  });

  it('TEST 5: Deployment points to Version 2 while Version 3 exists -> resolver returns Version 2 configuration', async () => {
    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeploymentV2);

    const result = await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');

    expect(result.deployment.versionId).toBe('version-v2');
    expect(result.deployment.versionNumber).toBe(2);
    expect(result.prompt.greeting).toBe('Hello, this is Version 2 of Aarav.');
    expect(result.prompt.compiledSystemPrompt).not.toContain('Version 3 draft');
  });

  it('TEST 6: Deployment agent/version relationship is invalid -> rejected with RUNTIME_CONFIG_AGENT_INVALID', async () => {
    const mismatchedDeployment = {
      ...mockDeploymentV2,
      version: {
        id: 'version-v2',
        agentId: 'other-agent-999',
        versionNumber: 2,
        configuration: sampleConfigV2,
        status: 'PUBLISHED',
      },
    };
    (db.query.deployments.findFirst as any).mockResolvedValue(mismatchedDeployment);

    try {
      await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');
      expect.fail('Should have thrown RuntimeConfigError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigError);
      expect(err.code).toBe('RUNTIME_CONFIG_AGENT_INVALID');
      expect(err.message).toBe('Invalid deployment agent/version relationship');
    }
  });

  it('TEST 7: Compiled prompt comes from the deployed version configuration', async () => {
    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeploymentV2);

    const result = await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');

    expect(result.prompt.compiledSystemPrompt).toContain('NEXTLITE CORE RUNTIME SAFETY BOUNDARY');
    expect(result.prompt.compiledSystemPrompt).toContain('Aarav (V2)');
    expect(result.prompt.compiledSystemPrompt).toContain('Apex Health Clinic');
  });

  it('TEST 8: Side-by-side isolation: TEST deployment (v3 draft) and PRODUCTION deployment (v2 published) resolve their respective versions independently', async () => {
    const sampleConfigV3Draft = {
      ...sampleConfigV2,
      identity: {
        agentName: 'Aarav (V3 Draft)',
        greeting: 'Hello, this is Version 3 DRAFT of Aarav.',
        businessName: 'Apex Health Clinic',
      },
      systemInstructions: 'You are Aarav Version 3 DRAFT.',
    };

    const mockTestDeploymentV3 = {
      id: 'deployment-test-v3',
      tenantId: 'tenant-abc',
      agentId: 'agent-456',
      versionId: 'version-v3',
      environment: 'TEST',
      status: 'ACTIVE',
      createdBy: 'user-789',
      createdAt: new Date(),
      updatedAt: new Date(),
      agent: {
        id: 'agent-456',
        tenantId: 'tenant-abc',
        name: 'Aarav Assistant',
        status: 'LIVE',
      },
      version: {
        id: 'version-v3',
        agentId: 'agent-456',
        versionNumber: 3,
        configuration: sampleConfigV3Draft,
        status: 'DRAFT',
      },
    };

    // 1. Resolve TEST deployment
    (db.query.deployments.findFirst as any).mockResolvedValue(mockTestDeploymentV3);
    const testResult = await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-test-v3');

    expect(testResult.deployment.deploymentId).toBe('deployment-test-v3');
    expect(testResult.deployment.versionId).toBe('version-v3');
    expect(testResult.deployment.versionNumber).toBe(3);
    expect(testResult.prompt.greeting).toBe('Hello, this is Version 3 DRAFT of Aarav.');

    // 2. Resolve PRODUCTION deployment
    (db.query.deployments.findFirst as any).mockResolvedValue(mockDeploymentV2);
    const prodResult = await runtimeAgentConfigService.resolveRuntimeAgentConfig('tenant-abc', 'deployment-123');

    expect(prodResult.deployment.deploymentId).toBe('deployment-123');
    expect(prodResult.deployment.versionId).toBe('version-v2');
    expect(prodResult.deployment.versionNumber).toBe(2);
    expect(prodResult.prompt.greeting).toBe('Hello, this is Version 2 of Aarav.');
  });
});

