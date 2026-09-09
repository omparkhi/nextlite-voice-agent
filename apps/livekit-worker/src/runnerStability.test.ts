import { describe, it, expect, vi } from 'vitest';
import { extractDeploymentId, RuntimeConfigClientError } from './runtimeConfigClient.ts';
import { createAgent, resolveInterruptionOptions, resolvePreemptiveGenerationOptions, resolveExpressiveOption } from './agent.ts';
import type { RuntimeAgentConfig } from '@nextlite/shared';

describe('LiveKit Worker Runner Stability & Error Isolation (Module 3.3.1)', () => {
  const sampleRuntimeConfig: RuntimeAgentConfig = {
    tenant: { tenantId: 'tenant-123' },
    agent: { agentId: 'agent-123', agentName: 'Aarav', status: 'ACTIVE' },
    deployment: { deploymentId: 'deploy-abc', versionId: 'ver-1' },
    prompt: { compiledSystemPrompt: 'You are Aarav.', greeting: 'Hello' },
    voice: { provider: 'sarvam', voiceId: 'shubh', sttModel: 'saaras:v3', ttsModel: 'bulbul:v3' },
    language: { primary: 'hi-IN', supportedLanguages: ['hi-IN', 'en-IN'] },
    runtime: {
      modelProvider: 'sarvam',
      llmModel: 'sarvam-105b-conversations',
      interruptionMode: 'adaptive',
      preemptiveGenerationEnabled: true,
      expressiveModeEnabled: true,
    },
    knowledge: { enabled: false },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  it('1. Malformed or missing metadata fails fast with clear RuntimeConfigClientError', () => {
    expect(() => extractDeploymentId(undefined)).toThrow(RuntimeConfigClientError);
    expect(() => extractDeploymentId('')).toThrow(RuntimeConfigClientError);
    expect(() => extractDeploymentId('not-json')).toThrow(RuntimeConfigClientError);
    expect(() => extractDeploymentId(JSON.stringify({ other: 'value' }))).toThrow(RuntimeConfigClientError);
  });

  it('2. Valid metadata extracts deploymentId cleanly', () => {
    const validMetadata = JSON.stringify({ deploymentId: '11111111-2222-3333-4444-555555555555' });
    expect(extractDeploymentId(validMetadata)).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('3. Agent creation is isolated and creates valid agent instance with custom config', () => {
    const agent1 = createAgent(sampleRuntimeConfig, 'hi-IN', 'deploy-abc');
    expect(agent1).toBeDefined();

    const agent2 = createAgent(sampleRuntimeConfig, 'en-IN', 'deploy-xyz');
    expect(agent2).toBeDefined();
  });

  it('4. Runtime options resolution is resilient to missing/undefined parameters', () => {
    expect(resolveInterruptionOptions(undefined)).toEqual({ mode: 'adaptive' });
    expect(resolveInterruptionOptions('disabled')).toEqual({ enabled: false });
    expect(resolveInterruptionOptions('always')).toEqual({ enabled: true, mode: 'vad' });

    expect(resolvePreemptiveGenerationOptions(undefined)).toEqual({ enabled: false });
    expect(resolvePreemptiveGenerationOptions(false)).toEqual({ enabled: false });
    expect(resolvePreemptiveGenerationOptions(true)).toEqual({ enabled: true });

    expect(resolveExpressiveOption(undefined)).toBe(true);
    expect(resolveExpressiveOption(false)).toBe(false);
  });

  it('5. Failed job initialization does not corrupt subsequent job configuration', async () => {
    // Simulate job 1 failing due to invalid metadata
    let job1Failed = false;
    try {
      extractDeploymentId('{invalid-json');
    } catch {
      job1Failed = true;
    }
    expect(job1Failed).toBe(true);

    // Job 2 arrives with valid metadata and succeeds independently
    const validMetadata = JSON.stringify({ deploymentId: 'deploy-job-2' });
    const deploymentId = extractDeploymentId(validMetadata);
    expect(deploymentId).toBe('deploy-job-2');

    const agent = createAgent(sampleRuntimeConfig, 'hi-IN', deploymentId);
    expect(agent).toBeDefined();
  });
});
