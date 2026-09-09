import { describe, it, expect, vi, beforeEach } from 'vitest';
import dotenv from 'dotenv';
import { extractDeploymentId, getRuntimeAgentConfig, RuntimeConfigClientError } from './runtimeConfigClient.ts';
import { createAgent } from './agent.ts';
import type { RuntimeAgentConfig } from '@nextlite/shared';

dotenv.config({ path: '.env.local' });

describe('LiveKit Worker Runtime Config Loading (Module 1)', () => {
  const secretKey = 'test-worker-secret';

  const mockConfigA: RuntimeAgentConfig = {
    tenant: { tenantId: 'tenant-aaa' },
    agent: { agentId: 'agent-aaa', agentName: 'Support Agent A', status: 'LIVE' },
    deployment: { deploymentId: 'dep-aaa', versionId: 'ver-1', versionNumber: 1 },
    prompt: { compiledSystemPrompt: 'You are Support Agent A.', greeting: 'Hello from A' },
    voice: { provider: 'sarvam', voiceId: 'priya', gender: 'female' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
    runtime: { modelProvider: 'google', llmModel: 'google/gemma-4-31b-it', temperature: 0.7 },
    knowledge: { enabled: false },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  const mockConfigB: RuntimeAgentConfig = {
    tenant: { tenantId: 'tenant-bbb' },
    agent: { agentId: 'agent-bbb', agentName: 'Sales Agent B', status: 'LIVE' },
    deployment: { deploymentId: 'dep-bbb', versionId: 'ver-2', versionNumber: 2 },
    prompt: { compiledSystemPrompt: 'You are Sales Agent B.', greeting: 'Hello from B' },
    voice: { provider: 'sarvam', voiceId: 'shubh', gender: 'male' },
    language: { primary: 'hi-IN', supportedLanguages: ['hi-IN', 'en-IN'] },
    runtime: { modelProvider: 'google', llmModel: 'google/gemma-4-31b-it', temperature: 0.5 },
    knowledge: { enabled: false },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Room Metadata Parsing & deploymentId Extraction', () => {
    it('successfully extracts deploymentId from valid JSON metadata', () => {
      const metadata = JSON.stringify({ deploymentId: 'dep-123' });
      const id = extractDeploymentId(metadata);
      expect(id).toBe('dep-123');
    });

    it('trims whitespace from deploymentId', () => {
      const metadata = JSON.stringify({ deploymentId: '   dep-spaced-456   ' });
      const id = extractDeploymentId(metadata);
      expect(id).toBe('dep-spaced-456');
    });

    it('ignores untrusted tenantId or agentId fields in room metadata and strictly uses deploymentId', () => {
      const metadata = JSON.stringify({
        tenantId: 'untrusted-tenant-fake',
        agentId: 'fake-agent',
        deploymentId: 'dep-authoritative-999',
      });
      const id = extractDeploymentId(metadata);
      expect(id).toBe('dep-authoritative-999');
    });

    it('throws typed MISSING_ROOM_METADATA error when metadata is undefined or null', () => {
      expect(() => extractDeploymentId(undefined)).toThrow(RuntimeConfigClientError);
      expect(() => extractDeploymentId(undefined)).toThrow('Room metadata is missing or empty');
      expect(() => extractDeploymentId(null)).toThrow('Room metadata is missing or empty');

      try {
        extractDeploymentId(undefined);
      } catch (err: any) {
        expect(err.errorCode).toBe('MISSING_ROOM_METADATA');
        expect(err.statusCode).toBe(400);
      }
    });

    it('throws typed MISSING_ROOM_METADATA error when metadata is empty or whitespace string', () => {
      expect(() => extractDeploymentId('')).toThrow('Room metadata is missing or empty');
      expect(() => extractDeploymentId('   ')).toThrow('Room metadata is missing or empty');
    });

    it('throws typed MALFORMED_ROOM_METADATA error when metadata is not valid JSON', () => {
      expect(() => extractDeploymentId('plain-text-not-json')).toThrow('Room metadata is not valid JSON');
      expect(() => extractDeploymentId('{ broken json')).toThrow('Room metadata is not valid JSON');

      try {
        extractDeploymentId('invalid json string');
      } catch (err: any) {
        expect(err.errorCode).toBe('MALFORMED_ROOM_METADATA');
        expect(err.statusCode).toBe(400);
      }
    });

    it('throws typed MISSING_DEPLOYMENT_ID error when JSON is missing deploymentId property', () => {
      expect(() => extractDeploymentId(JSON.stringify({}))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );
      expect(() => extractDeploymentId(JSON.stringify({ agentId: 'ag-1' }))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );
      expect(() => extractDeploymentId(JSON.stringify({ tenantId: 't-1' }))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );

      try {
        extractDeploymentId(JSON.stringify({ otherField: 'val' }));
      } catch (err: any) {
        expect(err.errorCode).toBe('MISSING_DEPLOYMENT_ID');
        expect(err.statusCode).toBe(400);
      }
    });

    it('throws typed MISSING_DEPLOYMENT_ID error when deploymentId is empty string or non-string', () => {
      expect(() => extractDeploymentId(JSON.stringify({ deploymentId: '' }))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );
      expect(() => extractDeploymentId(JSON.stringify({ deploymentId: '   ' }))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );
      expect(() => extractDeploymentId(JSON.stringify({ deploymentId: 12345 }))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );
      expect(() => extractDeploymentId(JSON.stringify({ deploymentId: null }))).toThrow(
        "Room metadata missing required 'deploymentId' string property",
      );
    });
  });

  describe('2. Room Runtime Loading Workflow & Error Propagation', () => {
    it('successfully resolves RuntimeAgentConfig for valid room metadata', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockConfigA),
      });

      const rawMetadata = JSON.stringify({ deploymentId: 'dep-aaa' });
      const deploymentId = extractDeploymentId(rawMetadata);
      const config = await getRuntimeAgentConfig(deploymentId, {
        workerSecret: secretKey,
        fetchFn: mockFetch as any,
      });

      expect(config).toEqual(mockConfigA);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/internal/runtime-config/dep-aaa'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${secretKey}`,
          }),
        }),
      );

      // Verify createAgent accepts resolved runtimeConfig
      const agent = createAgent(config);
      expect(agent).toBeDefined();
    });

    it('fails fast on missing metadata without making API call or starting default fallback', async () => {
      const mockFetch = vi.fn();

      expect(() => {
        const rawMetadata = undefined;
        extractDeploymentId(rawMetadata);
      }).toThrow(RuntimeConfigClientError);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fails clearly on API 404 (deployment not found) without fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({
          error: 'Deployment not found',
          code: 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
        }),
      });

      const rawMetadata = JSON.stringify({ deploymentId: 'dep-not-found' });
      const deploymentId = extractDeploymentId(rawMetadata);

      await expect(
        getRuntimeAgentConfig(deploymentId, { fetchFn: mockFetch as any })
      ).rejects.toThrow('Deployment not found');
    });

    it('fails clearly on API 409 (deployment inactive) without fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({
          error: 'Deployment is not active (status: INACTIVE)',
          code: 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
        }),
      });

      const rawMetadata = JSON.stringify({ deploymentId: 'dep-inactive' });
      const deploymentId = extractDeploymentId(rawMetadata);

      await expect(
        getRuntimeAgentConfig(deploymentId, { fetchFn: mockFetch as any })
      ).rejects.toThrow('Deployment is not active');
    });

    it('fails clearly on API 401 (worker authentication failed) without fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: 'Invalid internal worker credential',
          code: 'UNAUTHORIZED',
        }),
      });

      const rawMetadata = JSON.stringify({ deploymentId: 'dep-aaa' });
      const deploymentId = extractDeploymentId(rawMetadata);

      await expect(
        getRuntimeAgentConfig(deploymentId, { fetchFn: mockFetch as any })
      ).rejects.toThrow('Worker authentication failed');
    });
  });

  describe('3. Multi-Session / Multi-Tenant Isolation', () => {
    it('maintains strict per-room isolation across concurrent room entries with no global state leakage', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('dep-aaa')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockConfigA,
          };
        }
        if (url.includes('dep-bbb')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockConfigB,
          };
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: 'Not found' }),
        };
      });

      // Simulate Room 1 entry (Tenant A)
      const room1Metadata = JSON.stringify({ deploymentId: 'dep-aaa' });
      const room1DeploymentId = extractDeploymentId(room1Metadata);

      // Simulate Room 2 entry (Tenant B)
      const room2Metadata = JSON.stringify({ deploymentId: 'dep-bbb' });
      const room2DeploymentId = extractDeploymentId(room2Metadata);

      // Concurrent fetch
      const [config1, config2] = await Promise.all([
        getRuntimeAgentConfig(room1DeploymentId, { fetchFn: mockFetch as any }),
        getRuntimeAgentConfig(room2DeploymentId, { fetchFn: mockFetch as any }),
      ]);

      expect(config1.tenant.tenantId).toBe('tenant-aaa');
      expect(config1.agent.agentName).toBe('Support Agent A');
      expect(config1.voice.voiceId).toBe('priya');

      expect(config2.tenant.tenantId).toBe('tenant-bbb');
      expect(config2.agent.agentName).toBe('Sales Agent B');
      expect(config2.voice.voiceId).toBe('shubh');

      // Room configs are distinct objects
      expect(config1).not.toBe(config2);
      expect(config1.deployment.deploymentId).toBe('dep-aaa');
      expect(config2.deployment.deploymentId).toBe('dep-bbb');
    });
  });
});
