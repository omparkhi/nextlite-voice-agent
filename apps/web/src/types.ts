export interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER';
  emailVerified: boolean;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  status: string;
  planName: string | null;
  currentPeriodEnd: string | null;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  users: User[];
  subscriptions: Subscription[];
}

export interface ProfileResponse {
  tenant: Tenant;
  user: User;
  subscription: Subscription | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

// --- Dynamic Agent Builder Types ---

export interface InputVariable {
  key: string;
  label: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'phone' | 'email' | 'enum';
  required: boolean;
  defaultValue?: any;
  source?: 'STATIC' | 'RUNTIME' | 'CALLER' | 'SYSTEM' | 'INTEGRATION';
  scope?: 'CALL' | 'TENANT' | 'GLOBAL';
  sensitive?: boolean;
}

export interface OutputVariable {
  key: string;
  label: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'phone' | 'email' | 'enum';
  required: boolean;
  extractionStrategy: 'TURN' | 'CALL_END' | 'TOOL_RESULT' | 'SYSTEM';
  sensitive?: boolean;
}

export interface ConversationPhase {
  id: string;
  name: string;
  description?: string;
  objective: string;
  instructions: string[];
  requiredInformation?: string[];
  optionalInformation?: string[];
  questions?: string[];
  completionCriteria?: string[];
  transitionConditions?: string[];
  failureBehavior?: string;
  nextPhase?: string;
}

export interface AgentConfiguration {
  identity: {
    displayName?: string;
    agentName: string;
    name?: string;
    description?: string;
    greeting: string;
    introduction?: string;
    businessName?: string;
    avatar?: string;
  };
  persona: {
    role: string;
    personality: string;
    tone: string;
    style: string;
    formality: 'formal' | 'informal' | 'mixed' | string;
    aiIdentityBehavior?: string;
  };
  environment?: {
    situation?: string;
    channel?: 'voice' | 'chat' | 'omnichannel' | string;
    audience?: string;
    businessContext?: string;
    callerContext?: string;
  };
  objective: {
    primaryObjective: string;
    secondaryObjectives?: string[];
    successCriteria?: string[];
    failureConditions?: string[];
  };
  speakingStyle?: {
    maxSentences?: number;
    maxWords?: number;
    oneQuestionAtATime?: boolean;
    conciseResponses?: boolean;
    fillerStyle?: string;
    acknowledgementStyle?: string;
    reaskStyle?: string;
    avoidMarkdown?: boolean;
    avoidSymbols?: boolean;
    codeSwitchingStyle?: string;
  };
  businessInformation: {
    businessName: string;
    businessType: string;
    description: string;
    location?: string;
    address?: string;
    hours?: string;
    timezone?: string;
    contactInformation?: string;
    customFacts?: Record<string, any>;
  };
  conversation?: {
    phases: ConversationPhase[];
  };
  businessRules?: {
    appointmentRules?: Record<string, any>;
    leadRules?: Record<string, any>;
    pricingRules?: Record<string, any>;
    cancellationRules?: Record<string, any>;
    customRules?: string[];
  };
  guardrails?: {
    prohibitedTopics?: string[];
    prohibitedClaims?: string[];
    hallucinationRules?: string[];
    escalationRules?: string[];
    emergencyRules?: string[];
    humanHandoffRules?: string[];
    competitorHandling?: string;
    abuseHandling?: string;
    fallbackBehavior?: string;
  };
  language: {
    primary: string;
    supported: string[];
    startingLanguage?: string;
    autoDetect?: boolean;
    languageSwitchEnabled?: boolean;
    switchSensitivity?: string;
    outputNumbersInIndic?: boolean;
  };
  voice: {
    provider: string;
    voiceId: string;
    gender?: 'male' | 'female';
    speakingSpeed?: number;
    pitch?: number;
    sttModel?: string;
    ttsModel?: string;
  };
  runtimeSettings?: {
    modelProvider?: string;
    llmModel?: string;
    modelTemperature?: number;
    allowCallerInterruptions?: boolean;
    interruptionMode?: 'adaptive' | 'always' | 'disabled' | string;
    preemptiveGenerationEnabled?: boolean;
    eagernessToRespond?: 'low' | 'medium' | 'high' | string;
    noiseCancellationModel?: string;
    expressiveModeEnabled?: boolean;
    volumeThreshold?: number;
    backgroundSound?: 'none' | 'office' | 'clinic' | 'call_center' | string;
    nudges?: {
      enabled: boolean;
      delaySeconds: number;
      messages: string[];
      maxUnansweredNudges: number;
    };
    voicemail?: {
      detectionEnabled: boolean;
      message?: string;
    };
    maxCallLengthSeconds?: number;
  };
  modelProvider?: string;
  llmModel?: string;
  variables?: {
    input: InputVariable[];
    output: OutputVariable[];
  };
  knowledge?: {
    enabled: boolean;
    retrievalConfig?: {
      topK: number;
      similarityThreshold?: number;
    };
    attachedSourceIds?: string[];
  };
  tools?: {
    enabled: boolean;
    bindings: Array<{
      toolId: string;
      name: string;
      description: string;
      enabled: boolean;
      confirmationRequired?: boolean;
    }>;
  };
  role?: { description: string };
  goal?: { primaryObjective: string };
  personality?: { tone: string; style: string; formality: string };
  conversationRules?: { maxTurns: number; greetingStyle: string; fallbackBehavior: string };
  appointmentRules?: { slotDuration: number; bufferTime: number; workingHours: string; bookingRules: string };
  leadRules?: { requiredFields: string[]; qualificationCriteria: string };
  escalationRules?: { triggerConditions: string[]; transferNumber: string; timeout: number };
  systemInstructions: string;
}

export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  message: string;
}

export interface AgentChecklistResult {
  completenessPercentage: number;
  canPublish: boolean;
  criticalErrorsCount: number;
  warningsCount: number;
  passedCount: number;
  items: ChecklistItem[];
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  defaultConfiguration: AgentConfiguration;
  isSystem: boolean;
  createdAt: string;
}

export interface AgentVersion {
  id: string;
  agentId: string;
  versionNumber: number;
  configuration: AgentConfiguration;
  createdBy: string;
  notes: string | null;
  createdAt: string;
  createdByUser?: { id: string; email: string };
}

export interface Agent {
  id: string;
  tenantId: string;
  templateId: string;
  name: string;
  status: 'DRAFT' | 'READY' | 'LIVE' | 'PAUSED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  template?: { id: string; name: string; industry: string; description?: string };
  versions?: AgentVersion[];
  tools?: AgentTool[];
}

export interface AgentTool {
  id: string;
  agentId: string;
  toolName: string;
  toolConfig: Record<string, any>;
  enabled: boolean;
  createdAt: string;
}

export interface RuntimeConfig {
  agentId: string;
  agentName: string;
  status: string;
  templateName: string;
  configuration: AgentConfiguration;
  systemPrompt: string;
  tools: Array<{ name: string; config: Record<string, any> }>;
  voice: { voiceId: string; provider: string };
  language: { primary: string; supported: string[] };
}

export interface KnowledgeSource {
  id: string;
  agentId: string;
  tenantId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  chunkCount: number;
  contentHash: string | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  knowledgeUsed?: Array<{ content: string; score?: number; sourceId?: string }>;
}

export interface TestConversationResponse {
  reply: string;
  response?: string;
  turnId?: string;
  knowledgeUsed?: Array<{ content: string; score?: number; sourceId?: string }>;
}

export interface ConfigProposal {
  id: string;
  agentId: string;
  userMessage: string;
  proposedConfig: AgentConfiguration;
  diff: Record<string, { old: unknown; new: unknown }>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface ConfigAssistantResponse {
  versionId: string;
  versionNumber: number;
}

export interface ToolCatalogParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface ToolCatalogItem {
  toolId: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  parameters: ToolCatalogParameter[];
  confirmationSupported: boolean;
}
