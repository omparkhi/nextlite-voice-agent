import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRuntimeAgentConfig, RuntimeConfigClientError } from './runtimeConfigClient.ts';

describe('RuntimeConfigClient (Module A7)', () => {
  const secretKey = 'super-secret-worker-token-xyz';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validRuntimeConfig = {
    tenant: { tenantId: 'tenant-123' },
    agent: { agentId: 'agent-456', agentName: 'Test Voice Agent', status: 'LIVE' },
    deployment: { deploymentId: 'deploy-789', versionId: 'ver-1', versionNumber: 1 },
    prompt: { compiledSystemPrompt: 'You are a test assistant.', greeting: 'Hello' },
    voice: { provider: 'sarvam', voiceId: 'rahul', gender: 'male' },
    language: { primary: 'en-IN', supportedLanguages: ['en-IN'] },
    runtime: { modelProvider: 'google', llmModel: 'google/gemma-4-31b-it', temperature: 0.7 },
    knowledge: { enabled: false },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  it('TEST A: Valid deployment -> sends GET to correct endpoint with Bearer auth, no tenantId header, returns config', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRuntimeConfig),
    });

    const result = await getRuntimeAgentConfig('deploy-789', {
      apiUrl: 'http://api.nextlite.internal:3001',
      workerSecret: secretKey,
      fetchFn: mockFetch as any,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, requestInit] = mockFetch.mock.calls[0];
    expect(url).toBe('http://api.nextlite.internal:3001/api/internal/runtime-config/deploy-789');
    expect(requestInit.headers.Authorization).toBe(`Bearer ${secretKey}`);
    expect(requestInit.headers['x-tenant-id']).toBeUndefined();
    expect(url).not.toContain('tenantId=');
    expect(result).toEqual(validRuntimeConfig);
  });

  it('TEST B: Empty deploymentId -> fails before making network request', async () => {
    const mockFetch = vi.fn();

    await expect(
      getRuntimeAgentConfig('', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Deployment ID is required');

    await expect(
      getRuntimeAgentConfig('   ', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Deployment ID is required');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('TEST C: 401 response -> throws typed RuntimeConfigClientError preserving status 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ error: 'Invalid worker secret', code: 'UNAUTHORIZED' }),
    });

    try {
      await getRuntimeAgentConfig('deploy-789', { workerSecret: secretKey, fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Worker authentication failed');
    }
  });

  it('TEST D: 404 response -> throws typed error preserving deployment-not-found code', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: 'Deployment not found',
        code: 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
      }),
    });

    try {
      await getRuntimeAgentConfig('non-existent-deploy', { fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.statusCode).toBe(404);
      expect(err.errorCode).toBe('RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND');
      expect(err.message).toBe('Deployment not found');
    }
  });

  it('TEST E: 409 response -> throws typed error preserving inactive code', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({
        error: 'Deployment is not active (status: INACTIVE)',
        code: 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
      }),
    });

    try {
      await getRuntimeAgentConfig('inactive-deploy', { fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.statusCode).toBe(409);
      expect(err.errorCode).toBe('RUNTIME_CONFIG_DEPLOYMENT_INACTIVE');
      expect(err.message).toBe('Deployment is not active (status: INACTIVE)');
    }
  });

  it('TEST F: 500 response -> throws typed error without exposing server internals', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'Internal server error' }),
    });

    try {
      await getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.statusCode).toBe(500);
      expect(err.message).not.toContain('PostgreSQL');
      expect(err.message).not.toContain('stack');
    }
  });

  it('TEST G: Network failure -> throws typed SERVICE_UNAVAILABLE error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (DNS / connection refused)'));

    try {
      await getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.statusCode).toBe(503);
      expect(err.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(err.message).toBe('Failed to connect to NextLite runtime config API');
    }
  });

  it('TEST H: Invalid JSON -> throws typed INVALID_JSON error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON at position 0')),
    });

    try {
      await getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.errorCode).toBe('INVALID_JSON');
      expect(err.message).toBe('Invalid JSON response from NextLite API');
    }
  });

  it('TEST I: JSON that does not match RuntimeAgentConfig -> validation failure', async () => {
    const invalidConfig = {
      tenant: {}, // Missing tenantId
      agent: { agentId: '123' }, // Missing agentName, status
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(invalidConfig),
    });

    try {
      await getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.errorCode).toBe('SCHEMA_VALIDATION_FAILED');
      expect(err.message).toBe('Response from NextLite API does not match RuntimeAgentConfig contract');
    }
  });

  it('TEST K: Missing required voice.voiceId -> fails validation', async () => {
    const invalidConfig = {
      ...validRuntimeConfig,
      voice: { provider: 'sarvam' }, // voiceId is missing
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(invalidConfig),
    });

    await expect(
      getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Response from NextLite API does not match RuntimeAgentConfig contract');
  });

  it('TEST L: Missing required language.primary -> fails validation', async () => {
    const invalidConfig = {
      ...validRuntimeConfig,
      language: { supportedLanguages: ['en-IN'] }, // primary is missing
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(invalidConfig),
    });

    await expect(
      getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Response from NextLite API does not match RuntimeAgentConfig contract');
  });

  it('TEST M: Invalid variable type -> fails validation', async () => {
    const invalidConfig = {
      ...validRuntimeConfig,
      variables: {
        inputVariables: [
          { key: 'user_age', type: 'custom_type_invalid', required: true }
        ],
        outputVariables: [],
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(invalidConfig),
    });

    await expect(
      getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Response from NextLite API does not match RuntimeAgentConfig contract');
  });

  it('TEST N: Invalid variable scope -> fails validation', async () => {
    const invalidConfig = {
      ...validRuntimeConfig,
      variables: {
        inputVariables: [
          { key: 'user_id', type: 'string', required: true, scope: 'INVALID_SCOPE' }
        ],
        outputVariables: [],
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(invalidConfig),
    });

    await expect(
      getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Response from NextLite API does not match RuntimeAgentConfig contract');
  });

  it('TEST O: Invalid gender -> fails validation', async () => {
    const invalidConfig = {
      ...validRuntimeConfig,
      voice: { provider: 'sarvam', voiceId: 'rahul', gender: 'other_invalid' },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(invalidConfig),
    });

    await expect(
      getRuntimeAgentConfig('deploy-789', { fetchFn: mockFetch as any })
    ).rejects.toThrow('Response from NextLite API does not match RuntimeAgentConfig contract');
  });

  it('TEST J: Secret safety -> error messages do NOT contain the worker secret', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error during request'));

    try {
      await getRuntimeAgentConfig('deploy-789', {
        workerSecret: secretKey,
        fetchFn: mockFetch as any,
      });
      expect.fail('Should have thrown RuntimeConfigClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RuntimeConfigClientError);
      expect(err.message).not.toContain(secretKey);
      expect(JSON.stringify(err)).not.toContain(secretKey);
    }
  });
});
