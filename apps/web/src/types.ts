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
  instructions?: string;
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

// --- Module 1B: Client CRM & Follow-up Types ---

export type CallDirection = 'INBOUND' | 'OUTBOUND' | 'WEB_TEST';
export type CallStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'MISSED';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLOSED';
export type AppointmentStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';
export type FollowUpStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface StartupMetricsBreakdown {
  pickupToWebsocketMs?: number | null;
  websocketToStartFrameMs?: number | null;
  startFrameToRuntimeConfigMs?: number | null;
  runtimeConfigToCallSessionMs?: number | null;
  callSessionToServicesMs?: number | null;
  servicesToPipelineMs?: number | null;
  callSessionToPipelineMs?: number | null;
  pipelineToSTTReadyMs?: number | null;
  pipelineToTTSReadyMs?: number | null;
  ttsReadyToGreetingQueuedMs?: number | null;
  greetingQueuedToFirstAudioMs?: number | null;
  pickupToFirstGreetingAudioMs?: number | null;
}

export interface TurnTimingStageMetrics {
  turnId: string;
  turnIndex?: number;
  responseLatencyMs?: number | null;
  speechDurationMs?: number | null;
  vadStopToUtteranceEndMs?: number | null;
  utteranceEndToSttFinalMs?: number | null;
  vadStopToSttFinalMs?: number | null;
  speechStopToFinalTranscriptMs?: number | null;
  sttFinalToAggregationMs?: number | null;
  finalTranscriptToAggregationMs?: number | null;
  aggregationToLlmStartMs?: number | null;
  aggregationToLLMStartMs?: number | null;
  aggregationToLLMRequestMs?: number | null;
  llmHttpRequestMs?: number | null;
  llmProviderToFirstOutputMs?: number | null;
  llmToFirstToolDeltaMs?: number | null;
  firstToolDeltaToToolCompleteMs?: number | null;
  llmToFirstOutputMs?: number | null;
  llmStartToFirstOutputMs?: number | null;
  llmContextToRequestMs?: number | null;
  llmRequestToFirstOutputMs?: number | null;
  llmFirstOutputToTtsStartMs?: number | null;
  llmToTTSStartMs?: number | null;
  firstLLMOutputToFirstAudioMs?: number | null;
  toolDurationMs?: number | null;
  toolExecutionMs?: number | null;
  tools?: Array<{ name: string; durationMs?: number | null; success?: boolean }> | null;
  firstOutputToToolStartMs?: number | null;
  toolResultToPostToolLlmStartMs?: number | null;
  toolResultToPostToolLLMMs?: number | null;
  postToolLlmToFirstOutputMs?: number | null;
  postToolLlmMs?: number | null;
  postToolLLMToTTSMs?: number | null;
  postToolTTSToFirstAudioMs?: number | null;
  toolResultToFirstAudioMs?: number | null;
  ttsStartToFirstAudioMs?: number | null;
  ttsConnectionMs?: number | null;
  userStopToFirstAudioMs?: number | null;
  speechStopToFirstAudioMs?: number | null;
  aggregationToFirstAudioMs?: number | null;
  totalTurnDurationMs?: number | null;
  totalTurnMs?: number | null;
  interrupted?: boolean;
  events?: CallTimelineEvent[];
  phoneTrace?: SafePhoneTraceInfo | null;
}

export interface CallTimelineEvent {
  type?: 'STARTUP' | 'TURN' | string;
  turnId?: string;
  event: string;
  timestamp?: string;
  monotonicTimestamp?: number;
  elapsedFromCallStartMs?: number;
  [key: string]: any;
}

export interface SafePhoneTraceInfo {
  phoneObserved: boolean;
  digits: number;
  last4?: string | null;
  representation?: string;
  turnId?: string;
  boundary?: string;
}

export interface CallSession {
  id: string;
  tenantId: string;
  agentId: string;
  deploymentId: string;
  roomName: string;
  callerNumber?: string | null;
  direction: CallDirection;
  status: CallStatus;
  durationSeconds: number;
  primaryLanguage?: string | null;
  startedAt: string;
  endedAt?: string | null;
  transcriptText?: string | null;
  turnsJson?: Array<{
    turnId?: number | string;
    startTime?: string;
    endTime?: string;
    user?: {
      transcript: string;
      detectedLanguage?: string | null;
      timestamp?: string;
    };
    agent?: {
      response: string;
      activeLanguage?: string;
      interrupted?: boolean;
      timestamp?: string;
      ttftMs?: number;
      durationMs?: number;
    };
    tools?: Array<{
      toolName: string;
      callId?: string;
      args?: any;
      success?: boolean;
      executedAt?: string;
    }>;
    speaker?: 'AI' | 'Caller' | 'Agent' | string;
    text?: string;
    timestamp?: number | string;
    durationMs?: number;
  }> | null;
  toolsUsed?: Array<string | { toolName?: string; name?: string; parameters?: any; result?: any }> | null;
  metricsJson?: {
    totalTurns?: number;
    executedToolsCount?: number;
    errorsCount?: number;
    timing?: Record<string, any>;
    startupMetrics?: Record<string, any>;
    startupBreakdown?: StartupMetricsBreakdown;
    callBaseline?: {
      totalTurns?: number;
      successfulTurns?: number;
      interruptedTurns?: number;
      toolTurns?: number;
      responseLatencyP50Ms?: number | null;
      responseLatencyP90Ms?: number | null;
      responseLatencyMaxMs?: number | null;
      toolLatencyP50Ms?: number | null;
      toolLatencyP90Ms?: number | null;
      toolLatencyMaxMs?: number | null;
      nonToolLatencyP50Ms?: number | null;
      nonToolLatencyP90Ms?: number | null;
      nonToolLatencyMaxMs?: number | null;
      totalCallDurationMs?: number | null;
    };
    latestTurnMetrics?: TurnTimingStageMetrics;
    turns?: TurnTimingStageMetrics[];
    timeline?: CallTimelineEvent[];
    phoneTraces?: SafePhoneTraceInfo[];
    errors?: Array<{ timestamp: string; message: string; source?: string }>;
    turnLatencyMs?: number;
    e2eLatencyMs?: number;
    sttLatencyMs?: number;
    llmLatencyMs?: number;
    ttsLatencyMs?: number;
    turnCount?: number;
    userSpokenDurationMs?: number;
    agentSpokenDurationMs?: number;
  } | null;
  createdAt: string;
  agent?: { id: string; name: string; status?: string };
  deployment?: { id: string; environment: string; status: string };
  leads?: Lead[];
  appointments?: Appointment[];
}

export interface Lead {
  id: string;
  tenantId: string;
  agentId: string;
  callSessionId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  interestCategory?: string | null;
  status: LeadStatus;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string };
  callSession?: {
    id: string;
    roomName: string;
    callerNumber?: string | null;
    direction: CallDirection;
    status: CallStatus;
    durationSeconds: number;
  } | null;
}

export interface Appointment {
  id: string;
  tenantId: string;
  agentId: string;
  callSessionId?: string | null;
  appointmentNumber?: string | null; // e.g. 'A-001'
  customerName: string;
  customerPhone: string;
  title: string;
  resourceName?: string | null;
  bookingDate: string;
  bookingTime: string;
  status: AppointmentStatus;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string };
  callSession?: {
    id: string;
    roomName: string;
    callerNumber?: string | null;
    direction: CallDirection;
    status: CallStatus;
    durationSeconds: number;
  } | null;
}

export interface PhoneNumberItem {
  id: string;
  tenantId: string;
  agentId?: string | null;
  deploymentId?: string | null;
  phoneNumber: string;
  provider: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string };
  deployment?: { id: string; environment: string; status: string };
}

export interface FollowUpItem {
  id: string;
  tenantId: string;
  leadId?: string | null;
  appointmentId?: string | null;
  callSessionId?: string | null;
  customerName?: string | null;
  customerPhone: string;
  channel: string;
  provider: string;
  messageType: string;
  messageText: string;
  status: FollowUpStatus;
  providerMessageId?: string | null;
  isDemo: boolean;
  sentAt: string;
  deliveredAt?: string | null;
  failedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lead?: Partial<Lead> | null;
  appointment?: Partial<Appointment> | null;
  callSession?: Partial<CallSession> | null;
}

export interface AnalyticsOverviewData {
  totalCalls: number;
  connectedCalls: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  totalLeads: number;
  qualifiedLeads: number;
  totalAppointments: number;
  confirmedAppointments: number;
  requestedAppointments: number;
  pendingFollowUps: number;
  sentFollowUps: number;
  callTrend: Array<{
    date: string;
    total: number;
    completed: number;
    missed: number;
    failed: number;
  }>;
  callOutcomes: {
    completed: number;
    missed: number;
    failed: number;
    active: number;
  };
  leadFunnel: {
    new: number;
    contacted: number;
    qualified: number;
    closed: number;
  };
  appointmentStatus: {
    requested: number;
    confirmed: number;
    cancelled: number;
  };
  languages: Array<{
    language: string;
    count: number;
    percentage: number;
  }>;
  directions: {
    inbound: number;
    outbound: number;
    webTest: number;
  };
  toolUsage: Array<{
    toolName: string;
    count: number;
  }>;
  performance: {
    avgTurnLatencyMs?: number;
    avgSttLatencyMs?: number;
    avgLlmLatencyMs?: number;
    avgTtsLatencyMs?: number;
  };
}

export interface SendWhatsAppPayload {
  leadId?: string;
  appointmentId?: string;
  callSessionId?: string;
  customerName?: string;
  customerPhone: string;
  message: string;
  messageType?: 'APPOINTMENT_REQUEST' | 'APPOINTMENT_CONFIRMATION' | 'LEAD_CALLBACK' | 'CUSTOM';
  provider?: 'DEMO' | 'META' | 'TWILIO';
}
