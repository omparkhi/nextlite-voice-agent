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

// Module 1A: Core Persistence Contracts

export type CallDirection = 'INBOUND' | 'OUTBOUND' | 'WEB_TEST';
export type CallStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'MISSED';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLOSED';
export type AppointmentStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';

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
  startedAt: string | Date;
  endedAt?: string | Date | null;
  transcriptText?: string | null;
  turnsJson?: any;
  toolsUsed?: any;
  metricsJson?: any;
  createdAt: string | Date;
}

export interface CreateCallSessionRequest {
  id?: string;
  tenantId: string;
  agentId: string;
  deploymentId: string;
  roomName: string;
  callerNumber?: string | null;
  direction?: CallDirection;
  status?: CallStatus;
  durationSeconds?: number;
  primaryLanguage?: string;
  startedAt?: string | Date;
  endedAt?: string | Date | null;
  transcriptText?: string | null;
  turnsJson?: any;
  toolsUsed?: any;
  metricsJson?: any;
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
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateLeadRequest {
  tenantId: string;
  agentId: string;
  callSessionId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  interestCategory?: string | null;
  status?: LeadStatus;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Appointment {
  id: string;
  tenantId: string;
  agentId: string;
  callSessionId?: string | null;
  appointmentNumber?: string | null;
  customerName: string;
  customerPhone: string;
  title: string;
  resourceName?: string | null;
  bookingDate: string;
  bookingTime: string;
  status: AppointmentStatus;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateAppointmentRequest {
  tenantId: string;
  agentId: string;
  callSessionId?: string | null;
  appointmentNumber?: string | null;
  customerName: string;
  customerPhone: string;
  title: string;
  resourceName?: string | null;
  bookingDate: string;
  bookingTime: string;
  status?: AppointmentStatus;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PhoneNumber {
  id: string;
  tenantId: string;
  agentId?: string | null;
  deploymentId?: string | null;
  phoneNumber: string;
  provider: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreatePhoneNumberRequest {
  tenantId: string;
  agentId?: string | null;
  deploymentId?: string | null;
  phoneNumber: string;
  provider?: string;
  status?: string;
}
