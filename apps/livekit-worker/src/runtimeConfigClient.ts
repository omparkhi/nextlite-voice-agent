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

/**
 * Safely extracts deploymentId from room metadata string.
 * Fails clearly if metadata is missing, malformed, or missing deploymentId.
 */
export function extractDeploymentId(metadata: unknown): string {
  if (typeof metadata !== 'string' || !metadata.trim()) {
    throw new RuntimeConfigClientError(
      'Room metadata is missing or empty: deploymentId is required',
      { statusCode: 400, errorCode: 'MISSING_ROOM_METADATA' },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch (error) {
    throw new RuntimeConfigClientError(
      'Room metadata is not valid JSON',
      { statusCode: 400, errorCode: 'MALFORMED_ROOM_METADATA', cause: error },
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new RuntimeConfigClientError(
      "Room metadata missing required 'deploymentId' string property",
      { statusCode: 400, errorCode: 'MISSING_DEPLOYMENT_ID' },
    );
  }

  const record = parsed as Record<string, unknown>;
  const rawDeploymentId = record['deploymentId'];

  if (typeof rawDeploymentId !== 'string' || !rawDeploymentId.trim()) {
    throw new RuntimeConfigClientError(
      "Room metadata missing required 'deploymentId' string property",
      { statusCode: 400, errorCode: 'MISSING_DEPLOYMENT_ID' },
    );
  }

  return rawDeploymentId.trim();
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

export interface KnowledgeRetrieveResultItem {
  content: string;
  score: number;
  sourceId?: string | undefined;
}

export interface KnowledgeRetrieveResponse {
  results: KnowledgeRetrieveResultItem[];
}

export interface RetrieveKnowledgeOptions {
  apiUrl?: string | undefined;
  workerSecret?: string | undefined;
  timeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
  topK?: number | undefined;
}

export const knowledgeRetrieveResponseSchema = z.object({
  results: z.array(
    z.object({
      content: z.string(),
      score: z.number(),
      sourceId: z.string().optional(),
    }),
  ),
});

/**
 * Client for requesting internal knowledge retrieval from NextLite Control Plane API.
 * Uses worker-secret authentication and trusted deploymentId context.
 */
export async function retrieveKnowledge(
  deploymentId: string,
  query: string,
  options?: RetrieveKnowledgeOptions | undefined,
): Promise<KnowledgeRetrieveResponse> {
  if (!deploymentId || typeof deploymentId !== 'string' || deploymentId.trim() === '') {
    throw new RuntimeConfigClientError(
      'Deployment ID is required and must be a non-empty string',
      { statusCode: 400, errorCode: 'INVALID_INPUT' },
    );
  }

  if (!query || typeof query !== 'string' || query.trim() === '') {
    throw new RuntimeConfigClientError(
      'Query is required and must be a non-empty string',
      { statusCode: 400, errorCode: 'INVALID_INPUT' },
    );
  }

  const cleanDeploymentId = deploymentId.trim();
  const cleanQuery = query.trim();
  const baseUrl = (options?.apiUrl || process.env.NEXTLITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const secret = options?.workerSecret || process.env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3';
  const timeoutMs = options?.timeoutMs || 3000;
  const customFetch = options?.fetchFn || globalThis.fetch;

  const url = `${baseUrl}/api/internal/knowledge/retrieve`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody: Record<string, unknown> = {
      deploymentId: cleanDeploymentId,
      query: cleanQuery,
    };
    if (typeof options?.topK === 'number' && options.topK > 0) {
      requestBody.topK = Math.floor(options.topK);
    }

    const response = await customFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }

      const status = response.status;
      const apiCode = errorBody?.code;
      const apiMessage = errorBody?.error || errorBody?.message;

      if (status === 401) {
        throw new RuntimeConfigClientError('Worker authentication failed', {
          statusCode: 401,
          errorCode: apiCode || 'UNAUTHORIZED',
        });
      }

      if (status === 404) {
        throw new RuntimeConfigClientError(apiMessage || 'Deployment not found for knowledge retrieval', {
          statusCode: 404,
          errorCode: apiCode || 'DEPLOYMENT_NOT_FOUND',
        });
      }

      if (status === 409) {
        throw new RuntimeConfigClientError(apiMessage || 'Deployment is inactive or unavailable', {
          statusCode: 409,
          errorCode: apiCode || 'DEPLOYMENT_INACTIVE',
        });
      }

      if (status === 400) {
        throw new RuntimeConfigClientError(apiMessage || 'Invalid knowledge retrieval request', {
          statusCode: 400,
          errorCode: apiCode || 'INVALID_REQUEST',
        });
      }

      throw new RuntimeConfigClientError(apiMessage || `NextLite knowledge API error (status ${status})`, {
        statusCode: status,
        errorCode: apiCode || 'SERVER_ERROR',
      });
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (parseError) {
      throw new RuntimeConfigClientError('Invalid JSON response from NextLite knowledge retrieval API', {
        statusCode: 500,
        errorCode: 'INVALID_JSON',
        cause: parseError,
      });
    }

    const parseResult = knowledgeRetrieveResponseSchema.safeParse(rawJson);
    if (!parseResult.success) {
      throw new RuntimeConfigClientError('Response from NextLite API does not match knowledge retrieval schema', {
        statusCode: 500,
        errorCode: 'SCHEMA_VALIDATION_FAILED',
        cause: parseResult.error,
      });
    }

    return parseResult.data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error instanceof RuntimeConfigClientError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new RuntimeConfigClientError('Request to NextLite knowledge retrieval API timed out', {
        statusCode: 504,
        errorCode: 'SERVICE_UNAVAILABLE',
        cause: error,
      });
    }

    throw new RuntimeConfigClientError('Failed to connect to NextLite knowledge retrieval API', {
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      cause: error,
    });
  }
}

export interface CreateCallSessionInput {
  tenantId: string;
  agentId: string;
  deploymentId: string;
  roomName: string;
  callerNumber?: string | null | undefined;
  direction?: 'INBOUND' | 'OUTBOUND' | 'WEB_TEST' | undefined;
  status?: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'MISSED' | undefined;
  durationSeconds?: number | undefined;
  primaryLanguage?: string | undefined;
  startedAt?: string | Date | undefined;
  endedAt?: string | Date | null | undefined;
  transcriptText?: string | null | undefined;
  turnsJson?: unknown | undefined;
  toolsUsed?: unknown | undefined;
  metricsJson?: unknown | undefined;
}

export interface UpdateCallSessionInput {
  tenantId: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'MISSED' | undefined;
  durationSeconds?: number | undefined;
  primaryLanguage?: string | undefined;
  endedAt?: string | Date | null | undefined;
  transcriptText?: string | null | undefined;
  turnsJson?: unknown | undefined;
  toolsUsed?: unknown | undefined;
  metricsJson?: unknown | undefined;
}

export interface CallSessionResponse {
  id: string;
  tenantId: string;
  agentId: string;
  deploymentId: string;
  roomName: string;
  callerNumber?: string | null | undefined;
  direction: 'INBOUND' | 'OUTBOUND' | 'WEB_TEST';
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'MISSED';
  durationSeconds: number;
  primaryLanguage?: string | null | undefined;
  startedAt: string;
  endedAt?: string | null | undefined;
  transcriptText?: string | null | undefined;
  turnsJson?: unknown;
  toolsUsed?: unknown;
  metricsJson?: unknown;
  createdAt: string;
}

export interface CallSessionClientOptions {
  apiUrl?: string | undefined;
  workerSecret?: string | undefined;
  timeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
}

/**
 * Creates an ACTIVE call session in the NextLite Control Plane.
 * Authenticated via worker secret.
 */
export async function createCallSession(
  data: CreateCallSessionInput,
  options?: CallSessionClientOptions | undefined,
): Promise<CallSessionResponse> {
  const baseUrl = (options?.apiUrl || process.env.NEXTLITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const secret = options?.workerSecret || process.env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3';
  const timeoutMs = options?.timeoutMs || 4000;
  const customFetch = options?.fetchFn || globalThis.fetch;

  const url = `${baseUrl}/api/internal/call-sessions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await customFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'x-worker-secret': secret,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }
      const status = response.status;
      const apiCode = errorBody?.code;
      const apiMessage = errorBody?.error || errorBody?.message;

      throw new RuntimeConfigClientError(
        apiMessage || `Failed to create call session (status ${status})`,
        { statusCode: status, errorCode: apiCode || 'CALL_SESSION_CREATE_FAILED' },
      );
    }

    const json = await response.json();
    return json as CallSessionResponse;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error instanceof RuntimeConfigClientError) {
      throw error;
    }
    if (error?.name === 'AbortError') {
      throw new RuntimeConfigClientError('Request to create call session timed out', {
        statusCode: 504,
        errorCode: 'SERVICE_UNAVAILABLE',
        cause: error,
      });
    }
    throw new RuntimeConfigClientError('Failed to connect to call session API', {
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      cause: error,
    });
  }
}

/**
 * Updates an existing call session (COMPLETED, FAILED, MISSED) with duration, transcript, turns, and metrics.
 * Authenticated via worker secret.
 */
export async function updateCallSession(
  sessionId: string,
  data: UpdateCallSessionInput,
  options?: CallSessionClientOptions | undefined,
): Promise<CallSessionResponse> {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new RuntimeConfigClientError('Session ID is required to update call session', {
      statusCode: 400,
      errorCode: 'INVALID_INPUT',
    });
  }

  const cleanSessionId = sessionId.trim();
  const baseUrl = (options?.apiUrl || process.env.NEXTLITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const secret = options?.workerSecret || process.env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3';
  const timeoutMs = options?.timeoutMs || 4000;
  const customFetch = options?.fetchFn || globalThis.fetch;

  const url = `${baseUrl}/api/internal/call-sessions/${encodeURIComponent(cleanSessionId)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await customFetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'x-worker-secret': secret,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }
      const status = response.status;
      const apiCode = errorBody?.code;
      const apiMessage = errorBody?.error || errorBody?.message;

      throw new RuntimeConfigClientError(
        apiMessage || `Failed to update call session (status ${status})`,
        { statusCode: status, errorCode: apiCode || 'CALL_SESSION_UPDATE_FAILED' },
      );
    }

    const json = await response.json();
    return json as CallSessionResponse;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error instanceof RuntimeConfigClientError) {
      throw error;
    }
    if (error?.name === 'AbortError') {
      throw new RuntimeConfigClientError('Request to update call session timed out', {
        statusCode: 504,
        errorCode: 'SERVICE_UNAVAILABLE',
        cause: error,
      });
    }
    throw new RuntimeConfigClientError('Failed to connect to call session API', {
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      cause: error,
    });
  }
}


