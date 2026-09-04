import type { RuntimeAgentConfig } from '@nextlite/shared';
import { z } from 'zod';

export class RuntimeConfigClientError extends Error {
  public readonly statusCode?: number | undefined;
  public readonly errorCode?: string | undefined;

  constructor(
    message: string,
    options?: { statusCode?: number | undefined; errorCode?: string | undefined; cause?: unknown },
  ) {
    super(message);
    this.name = 'RuntimeConfigClientError';
    this.statusCode = options?.statusCode;
    this.errorCode = options?.errorCode;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, RuntimeConfigClientError.prototype);
  }
}

export const runtimeVariableDefinitionSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'phone', 'email', 'enum']),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  scope: z.enum(['CALL', 'TENANT', 'GLOBAL']).optional(),
});

export const runtimeAgentConfigSchema = z.object({
  tenant: z.object({
    tenantId: z.string(),
  }),
  agent: z.object({
    agentId: z.string(),
    agentName: z.string(),
    status: z.string(),
  }),
  deployment: z.object({
    deploymentId: z.string(),
    versionId: z.string(),
    versionNumber: z.number().optional(),
  }),
  prompt: z.object({
    compiledSystemPrompt: z.string(),
    greeting: z.string().optional(),
  }),
  voice: z.object({
    provider: z.string(),
    sttModel: z.string().optional(),
    ttsModel: z.string().optional(),
    voiceId: z.string(),
    gender: z.enum(['male', 'female', 'neutral']).optional(),
    speakingSpeed: z.number().optional(),
    pitch: z.number().optional(),
  }),
  language: z.object({
    primary: z.string(),
    supportedLanguages: z.array(z.string()),
    autoDetectEnabled: z.boolean().optional(),
    languageSwitchingEnabled: z.boolean().optional(),
  }),
  runtime: z.object({
    modelProvider: z.string().optional(),
    llmModel: z.string().optional(),
    temperature: z.number().optional(),
    interruptionMode: z.string().optional(),
    preemptiveGenerationEnabled: z.boolean().optional(),
    responseEagerness: z.string().optional(),
    noiseCancellationModel: z.string().optional(),
    expressiveModeEnabled: z.boolean().optional(),
    maxCallDurationSeconds: z.number().optional(),
  }),
  knowledge: z.object({
    enabled: z.boolean(),
    retrievalConfig: z
      .object({
        topK: z.number(),
        scoreThreshold: z.number().optional(),
      })
      .optional(),
  }),
  tools: z.object({
    enabled: z.boolean(),
    tools: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.string(), z.unknown()).optional(),
        enabled: z.boolean(),
        confirmationRequired: z.boolean().optional(),
      }),
    ),
  }),
  variables: z.object({
    inputVariables: z.array(runtimeVariableDefinitionSchema),
    outputVariables: z.array(runtimeVariableDefinitionSchema),
    runtimeContext: z.record(z.string(), z.string()).optional(),
  }),
});

export interface GetRuntimeAgentConfigOptions {
  apiUrl?: string | undefined;
  workerSecret?: string | undefined;
  timeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
}

/**
 * Client for requesting RuntimeAgentConfig from NextLite Control Plane API.
 * Uses worker-secret Bearer authentication and validates response against shared contract schema.
 */
export async function getRuntimeAgentConfig(
  deploymentId: string,
  options?: GetRuntimeAgentConfigOptions | undefined,
): Promise<RuntimeAgentConfig> {
  // 1. Input Validation
  if (!deploymentId || typeof deploymentId !== 'string' || deploymentId.trim() === '') {
    throw new RuntimeConfigClientError(
      'Deployment ID is required and must be a non-empty string',
      { statusCode: 400, errorCode: 'INVALID_INPUT' },
    );
  }

  const cleanDeploymentId = deploymentId.trim();
  const baseUrl = (options?.apiUrl || process.env.NEXTLITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const secret = options?.workerSecret || process.env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3';
  const timeoutMs = options?.timeoutMs || 8000;
  const customFetch = options?.fetchFn || globalThis.fetch;

  const url = `${baseUrl}/api/internal/runtime-config/${encodeURIComponent(cleanDeploymentId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await customFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 2. HTTP Error Handling
    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }

      const status = response.status;
      const apiCode = errorBody?.code;
      const apiMessage = errorBody?.error;

      if (status === 401) {
        throw new RuntimeConfigClientError('Worker authentication failed', {
          statusCode: 401,
          errorCode: apiCode || 'UNAUTHORIZED',
        });
      }

      if (status === 404) {
        throw new RuntimeConfigClientError(apiMessage || 'Deployment not found', {
          statusCode: 404,
          errorCode: apiCode || 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND',
        });
      }

      if (status === 409) {
        throw new RuntimeConfigClientError(apiMessage || 'Deployment is inactive or unavailable', {
          statusCode: 409,
          errorCode: apiCode || 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE',
        });
      }

      if (status === 400) {
        throw new RuntimeConfigClientError(apiMessage || 'Invalid runtime configuration request', {
          statusCode: 400,
          errorCode: apiCode || 'RUNTIME_CONFIG_CONFIG_INVALID',
        });
      }

      throw new RuntimeConfigClientError(`NextLite API error (status ${status})`, {
        statusCode: status,
        errorCode: apiCode || 'SERVER_ERROR',
      });
    }

    // 3. Response JSON Parsing
    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (parseError) {
      throw new RuntimeConfigClientError('Invalid JSON response from NextLite API', {
        statusCode: 500,
        errorCode: 'INVALID_JSON',
        cause: parseError,
      });
    }

    // 4. Schema Validation against RuntimeAgentConfig
    const parseResult = runtimeAgentConfigSchema.safeParse(rawJson);
    if (!parseResult.success) {
      throw new RuntimeConfigClientError('Response from NextLite API does not match RuntimeAgentConfig contract', {
        statusCode: 500,
        errorCode: 'SCHEMA_VALIDATION_FAILED',
        cause: parseResult.error,
      });
    }

    return parseResult.data as RuntimeAgentConfig;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error instanceof RuntimeConfigClientError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new RuntimeConfigClientError('Request to NextLite runtime config API timed out', {
        statusCode: 504,
        errorCode: 'SERVICE_UNAVAILABLE',
        cause: error,
      });
    }

    throw new RuntimeConfigClientError('Failed to connect to NextLite runtime config API', {
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      cause: error,
    });
  }
}
