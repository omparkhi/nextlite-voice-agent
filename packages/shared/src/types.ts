export type UserRole = 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER';

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  correlationId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
  tenantId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export type VoiceEngineMode = 'legacy' | 'livekit';

export interface RuntimeAgentConfig {
  sessionId: string;
  tenantId: string;
  agentId: string;
  agentVersionId: string;
  compiledSystemPrompt: string;
  voice: {
    provider: string;
    voiceId: string;
    gender: 'male' | 'female' | 'neutral';
    speakingSpeed: number;
  };
  language: {
    primary: string;
    supportedLanguages?: string[];
    languageSwitchEnabled: boolean;
  };
  runtimeSettings: {
    modelTemperature: number;
    allowCallerInterruptions: boolean;
    nudges: {
      enabled: boolean;
      delaySeconds: number;
      messages: string[];
    };
    maxCallLengthSeconds: number;
  };
  variables: Record<string, any>;
  callerInfo?: {
    phoneNumber?: string;
    channel?: string;
  };
}

export interface V2LiveKitTokenResponse {
  token: string;
  serverUrl: string;
  roomName: string;
  sessionId: string;
}

export interface V2SessionEndRequest {
  sessionId: string;
  tenantId: string;
  agentId: string;
  agentVersionId: string;
  transport: 'web_voice' | 'plivo' | 'exotel';
  status: 'completed' | 'failed' | 'canceled';
  durationSeconds: number;
  livekitRoomSid?: string;
  providerCallId?: string;
  transcriptJson?: any[];
  error?: string;
}

