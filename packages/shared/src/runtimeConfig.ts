/**
 * NextLite Voice V3 — RuntimeAgentConfig Contract
 * 
 * Strict runtime configuration DTO passed from the NextLite Control Plane
 * to the LiveKit Agent Worker at call session initialization.
 * 
 * This contract establishes a deliberate boundary between control-plane database
 * entities and the realtime audio execution engine.
 */

export interface RuntimeTenantConfig {
  tenantId: string;
}

export interface RuntimeAgentMetadata {
  agentId: string;
  agentName: string;
  status: 'DRAFT' | 'READY' | 'LIVE' | 'PAUSED' | 'ARCHIVED' | string;
}

export interface RuntimeDeploymentMetadata {
  deploymentId: string;
  versionId: string;
  versionNumber?: number;
}

export interface RuntimePromptConfig {
  compiledSystemPrompt: string;
  greeting?: string;
  timezone?: string;
}

export interface RuntimeVoiceConfig {
  provider: string; // e.g. 'sarvam', 'fish', 'openai'
  sttModel?: string; // e.g. 'saaras:v3'
  ttsModel?: string; // e.g. 'bulbul:v3'
  voiceId: string; // e.g. 'priya', 'rahul'
  gender?: 'male' | 'female' | 'neutral';
  speakingSpeed?: number;
  pitch?: number;
}

export interface RuntimeLanguageConfig {
  primary: string; // e.g. 'en-IN', 'hi-IN'
  supportedLanguages: string[];
  autoDetectEnabled?: boolean;
  languageSwitchingEnabled?: boolean;
}

export interface RuntimeBehaviorConfig {
  modelProvider?: string; // e.g. 'google', 'openai'
  llmModel?: string; // e.g. 'google/gemma-4-31b-it'
  temperature?: number;
  interruptionMode?: 'adaptive' | 'always' | 'disabled' | string;
  preemptiveGenerationEnabled?: boolean;
  responseEagerness?: 'low' | 'medium' | 'high' | string;
  noiseCancellationModel?: string; // e.g. 'quailVfS'
  expressiveModeEnabled?: boolean;
  maxCallDurationSeconds?: number;
}

export interface RuntimeKnowledgeConfig {
  enabled: boolean;
  retrievalConfig?: {
    topK: number;
    scoreThreshold?: number;
  };
}

export interface RuntimeToolDefinition {
  toolId?: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  enabled: boolean;
  confirmationRequired?: boolean;
}

export interface RuntimeToolConfig {
  enabled: boolean;
  tools: RuntimeToolDefinition[];
}

export interface RuntimeVariableDefinition {
  key: string;
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'phone' | 'email' | 'enum';
  required: boolean;
  defaultValue?: unknown;
  scope?: 'CALL' | 'TENANT' | 'GLOBAL';
}

export interface RuntimeVariableConfig {
  inputVariables: RuntimeVariableDefinition[];
  outputVariables: RuntimeVariableDefinition[];
  runtimeContext?: Record<string, string>;
}

export interface RuntimeAgentConfig {
  tenant: RuntimeTenantConfig;
  agent: RuntimeAgentMetadata;
  deployment: RuntimeDeploymentMetadata;
  prompt: RuntimePromptConfig;
  voice: RuntimeVoiceConfig;
  language: RuntimeLanguageConfig;
  runtime: RuntimeBehaviorConfig;
  knowledge: RuntimeKnowledgeConfig;
  tools: RuntimeToolConfig;
  variables: RuntimeVariableConfig;
}

export const CANONICAL_PLATFORM_TOOLS = [
  'query_knowledge_base',
  'create_callback_lead',
  'book_appointment',
] as const;

export type CanonicalPlatformToolId = typeof CANONICAL_PLATFORM_TOOLS[number];

const CANONICAL_TOOL_LABEL_MAP: Record<string, CanonicalPlatformToolId> = {
  // Knowledge retrieval
  query_knowledge_base: 'query_knowledge_base',
  'query knowledge base': 'query_knowledge_base',
  'query_knowledge_base_tool': 'query_knowledge_base',
  'knowledge base': 'query_knowledge_base',
  knowledge_base: 'query_knowledge_base',
  'knowledge search': 'query_knowledge_base',
  'search knowledge base': 'query_knowledge_base',

  // Lead capture
  create_callback_lead: 'create_callback_lead',
  'create callback lead': 'create_callback_lead',
  'callback lead': 'create_callback_lead',
  callback_lead: 'create_callback_lead',
  'record callback lead': 'create_callback_lead',
  'lead capture': 'create_callback_lead',
  lead_capture: 'create_callback_lead',

  // Appointment booking
  book_appointment: 'book_appointment',
  'book appointment': 'book_appointment',
  'book doctor appointment': 'book_appointment',
  'book demo class': 'book_appointment',
  'book service slot': 'book_appointment',
  'book site visit': 'book_appointment',
  'book advisor call': 'book_appointment',
  'schedule appointment': 'book_appointment',
  schedule_appointment: 'book_appointment',
  'appointment booking': 'book_appointment',
};

/**
 * Canonical tool ID normalization utility.
 * Normalizes display labels, aliases, and snake_case variations to canonical platform tool IDs.
 * If the input is already a canonical tool ID, returns it directly.
 * If the input maps to a canonical platform tool via label/alias, returns that canonical ID.
 * Returns undefined if the string is empty or invalid.
 */
export function normalizeToolId(toolIdOrName?: string | null): string | undefined {
  if (!toolIdOrName || typeof toolIdOrName !== 'string') return undefined;
  const trimmed = toolIdOrName.trim();
  if (!trimmed) return undefined;

  // Direct check
  if ((CANONICAL_PLATFORM_TOOLS as readonly string[]).includes(trimmed)) {
    return trimmed;
  }

  // Normalized label / alias lookup (case-insensitive)
  const lower = trimmed.toLowerCase();
  if (CANONICAL_TOOL_LABEL_MAP[lower]) {
    return CANONICAL_TOOL_LABEL_MAP[lower];
  }

  // Convert punctuation/spaces to single underscores and check again
  const snake = lower.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (CANONICAL_TOOL_LABEL_MAP[snake]) {
    return CANONICAL_TOOL_LABEL_MAP[snake];
  }

  // Return snake_cased identifier if valid identifier
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_SAFE_DISPLAY_KEYS = [
  'appointmentNumber',
  'displayNumber',
  'referenceNumber',
  'orderNumber',
  'bookingNumber',
  'confirmationNumber',
  'ticketNumber',
  'leadNumber',
] as const;

/**
 * Extracts a customer-safe display or reference identifier from a tool result object,
 * while strictly rejecting raw internal database UUIDs or malformed identifiers.
 * 
 * Returns the sanitized string identifier if valid and non-UUID, or undefined.
 */
export function getUserSafeDisplayId(result?: Record<string, unknown> | null): string | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  for (const key of USER_SAFE_DISPLAY_KEYS) {
    const value = result[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0 && !UUID_REGEX.test(trimmed)) {
        return trimmed;
      }
    }
  }

  return undefined;
}

