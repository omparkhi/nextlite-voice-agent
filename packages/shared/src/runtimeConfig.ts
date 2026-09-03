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
