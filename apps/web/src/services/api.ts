import type { ReceptionistUser, Subscription, PlanTemplate } from '../types';

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost') ? import.meta.env.VITE_API_URL : '')
  : (import.meta.env.VITE_API_URL || '');

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const newToken = data.accessToken || null;
        setAccessToken(newToken);
        return newToken;
      }
      setAccessToken(null);
      return null;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  const buildHeaders = (token: string | null): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  });
  
  let response = await fetch(url, {
    ...fetchOptions,
    headers: buildHeaders(accessToken),
    credentials: 'include',
  });
  
  // If 401 Unauthorized and not on an auth endpoint, transparently refresh and retry
  if (response.status === 401 && !endpoint.startsWith('/api/auth/login') && !endpoint.startsWith('/api/auth/refresh')) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      response = await fetch(url, {
        ...fetchOptions,
        headers: buildHeaders(refreshedToken),
        credentials: 'include',
      });
    } else {
      // Both tokens are invalid — session is fully expired
      // Clear stale token and redirect to login
      setAccessToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.detail || 'Request failed');
  }
  
  return response.json();
}

import type {
  Agent,
  AgentTemplate,
  AgentVersion,
  AgentConfiguration,
  KnowledgeSource,
  TestConversationResponse,
  ConfigProposal,
  ConfigAssistantResponse,
  ToolCatalogItem,
  CallSession,
  Lead,
  Appointment,
  PhoneNumberItem,
  FollowUpItem,
  AnalyticsOverviewData,
  SendWhatsAppPayload,
} from '../types';

export const api = {
  // Admin - Platform Tools
  getToolCatalog: () =>
    request<ToolCatalogItem[]>('/api/admin/tools'),

  // Auth
  login: (email: string, password: string) =>
    request<{ accessToken: string; expiresIn: string; user?: { id: string; name: string; email: string; role: string; tenantId: string | null; tenantName: string; tenantSlug: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  
  logout: () =>
    request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
  
  refresh: () =>
    request<{ accessToken: string; expiresIn: string; user?: { id: string; name: string; email: string; role: string; tenantId: string | null; tenantName: string; tenantSlug: string } }>('/api/auth/refresh', {
      method: 'POST',
    }),
  
  verifyEmail: (token: string) =>
    request<{ valid: boolean; userId: string }>(`/api/auth/verify-email/${token}`),
  
  setPassword: (token: string, password: string) =>
    request<{ message: string }>('/api/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  
  // Admin - Clients
  getClients: () =>
    request<any[]>('/api/admin/clients'),
  
  getClient: (id: string) =>
    request<any>(`/api/admin/clients/${id}`),
  
  createClient: (data: { name: string; email: string; businessName: string; password?: string }) =>
    request<any>('/api/admin/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  updateClient: (id: string, data: { name?: string; ownerName?: string; contactName?: string; doctorName?: string; email?: string; status?: string; businessName?: string }) =>
    request<any>(`/api/admin/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  resetClientData: (id: string) =>
    request<{ success: boolean; message: string; deletedCounts: { appointments: number; leads: number; callSessions: number } }>(`/api/admin/clients/${id}/reset-data`, {
      method: 'POST',
    }),

  resetOwnData: (tenantId?: string) => {
    const stringParams: Record<string, string> = {};
    if (tenantId) stringParams.tenantId = tenantId;
    return request<{ success: boolean; message: string; deletedCounts: { appointments: number; leads: number; callSessions: number } }>('/api/client/reset-data', {
      method: 'POST',
      params: stringParams,
    });
  },

  // Client - Profile
  getProfile: () =>
    request<any>('/api/client/profile'),
  
  updateProfile: (data: { businessName?: string }) =>
    request<any>('/api/client/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Client - Calls
  getClientCalls: (params?: { limit?: number; offset?: number; agentId?: string; status?: string; tenantId?: string }) => {
    const stringParams: Record<string, string> = {};
    if (params?.limit !== undefined) stringParams.limit = String(params.limit);
    if (params?.offset !== undefined) stringParams.offset = String(params.offset);
    if (params?.agentId) stringParams.agentId = params.agentId;
    if (params?.status) stringParams.status = params.status;
    if (params?.tenantId) stringParams.tenantId = params.tenantId;
    return request<{ calls: CallSession[]; total: number; limit: number; offset: number }>('/api/client/calls', {
      params: stringParams,
    });
  },

  getClientCall: (id: string, tenantId?: string) => {
    const stringParams: Record<string, string> = {};
    if (tenantId) stringParams.tenantId = tenantId;
    return request<CallSession>(`/api/client/calls/${id}`, {
      params: stringParams,
    });
  },

  // Client - Leads
  getClientLeads: (params?: { limit?: number; offset?: number; agentId?: string; status?: string }) => {
    const stringParams: Record<string, string> = {};
    if (params?.limit !== undefined) stringParams.limit = String(params.limit);
    if (params?.offset !== undefined) stringParams.offset = String(params.offset);
    if (params?.agentId) stringParams.agentId = params.agentId;
    if (params?.status) stringParams.status = params.status;
    return request<{ leads: Lead[]; total: number; limit: number; offset: number }>('/api/client/leads', {
      params: stringParams,
    });
  },

  getClientLead: (id: string) =>
    request<Lead>(`/api/client/leads/${id}`),

  updateClientLead: (id: string, data: Partial<Lead>) =>
    request<Lead>(`/api/client/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Client - Appointments
  getClientAppointments: (params?: { limit?: number; offset?: number; agentId?: string; status?: string; bookingDate?: string; bookedBy?: string; tenantId?: string }) => {
    const stringParams: Record<string, string> = {};
    if (params?.limit !== undefined) stringParams.limit = String(params.limit);
    if (params?.offset !== undefined) stringParams.offset = String(params.offset);
    if (params?.agentId) stringParams.agentId = params.agentId;
    if (params?.status) stringParams.status = params.status;
    if (params?.bookingDate) stringParams.bookingDate = params.bookingDate;
    if (params?.bookedBy) stringParams.bookedBy = params.bookedBy;
    if (params?.tenantId) stringParams.tenantId = params.tenantId;
    return request<{ appointments: Appointment[]; total: number; limit: number; offset: number }>('/api/client/appointments', {
      params: stringParams,
    });
  },

  getClientAppointment: (id: string) =>
    request<Appointment>(`/api/client/appointments/${id}`),

  updateClientAppointment: (id: string, data: Partial<Appointment>) =>
    request<Appointment>(`/api/client/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  bookClientAppointment: (data: {
    customerName: string;
    customerPhone: string;
    bookingDate: string;
    bookingTime: string;
    title?: string;
    resourceName?: string;
    bookedBy?: string;
    bookedByName?: string;
    age?: string;
    place?: string;
    walkIn?: boolean;
    notes?: string;
  }) =>
    request<{ success: boolean; appointment: Appointment }>('/api/client/appointments/book', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createClientAppointment: (data: {
    customerName: string;
    customerPhone: string;
    bookingDate: string;
    bookingTime: string;
    title?: string;
    resourceName?: string;
    bookedBy?: string;
    bookedByName?: string;
    age?: string;
    place?: string;
    walkIn?: boolean;
    notes?: string;
  }) =>
    request<{ success: boolean; appointment: Appointment }>('/api/client/appointments/book', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  checkClientAppointmentSlots: (bookingDate: string, phone?: string, preferredTime?: string) => {
    const params: Record<string, string> = { bookingDate };
    if (phone) params.phone = phone;
    if (preferredTime) params.preferredTime = preferredTime;
    return request<{
      bookingDate: string;
      preferredTime?: string;
      slotAvailable: boolean;
      isOccupied?: boolean;
      isPast?: boolean;
      isOutsideShift?: boolean;
      bookedSlots: string[];
      availableSlots: string[];
      totalAvailable: number;
      hasExistingBooking: boolean;
      existingBooking?: any;
    }>('/api/client/appointments/slots', { params });
  },

  rescheduleClientAppointment: (data: {
    appointmentId?: string;
    newDate: string;
    newTime: string;
    phone?: string;
    reason?: string;
  }) =>
    request<{ success: boolean; appointment: Appointment }>('/api/client/appointments/reschedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Client - Phone Numbers & Agents
  getClientPhoneNumbers: () =>
    request<{ phoneNumbers: PhoneNumberItem[] }>('/api/client/phone-numbers'),

  getClientAgents: () =>
    request<{ agents: any[] }>('/api/client/agents'),

  // Client - Follow-ups & WhatsApp
  getClientFollowUps: (params?: { limit?: number; offset?: number; status?: string; channel?: string }) => {
    const stringParams: Record<string, string> = {};
    if (params?.limit !== undefined) stringParams.limit = String(params.limit);
    if (params?.offset !== undefined) stringParams.offset = String(params.offset);
    if (params?.status) stringParams.status = params.status;
    if (params?.channel) stringParams.channel = params.channel;
    return request<{ followUps: FollowUpItem[]; total: number; limit: number; offset: number }>('/api/client/follow-ups', {
      params: stringParams,
    });
  },

  getClientFollowUp: (id: string) =>
    request<FollowUpItem>(`/api/client/follow-ups/${id}`),

  sendWhatsAppFollowUp: (payload: SendWhatsAppPayload) =>
    request<{ success: boolean; followUpId: string; status: string; provider: string; providerMessageId?: string; isDemo: boolean; message: string }>(
      '/api/client/follow-ups/send-whatsapp',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  // Client - Analytics Overview
  getAnalyticsOverview: () =>
    request<AnalyticsOverviewData>('/api/client/analytics/overview'),

  // Client - Receptionist Staff Management
  getClientReceptionists: () =>
    request<{ receptionists: ReceptionistUser[] }>('/api/client/receptionists'),

  createClientReceptionist: (data: { name: string; email: string; password: string }) =>
    request<{ success: boolean; receptionist: ReceptionistUser }>('/api/client/receptionists', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateClientReceptionist: (id: string, data: { name?: string; isActive?: boolean; password?: string }) =>
    request<{ success: boolean; receptionist: ReceptionistUser }>(`/api/client/receptionists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteClientReceptionist: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/client/receptionists/${id}`, {
      method: 'DELETE',
    }),

  // Admin - Templates
  getTemplates: () =>
    request<AgentTemplate[]>('/api/admin/templates'),

  getTemplate: (id: string) =>
    request<AgentTemplate>(`/api/admin/templates/${id}`),

  // Admin - Agents
  getAgents: (clientId: string) =>
    request<Agent[]>(`/api/admin/clients/${clientId}/agents`),

  getAgent: (clientId: string, agentId: string) =>
    request<Agent>(`/api/admin/clients/${clientId}/agents/${agentId}`),

  createAgent: (clientId: string, data: { name: string; templateId: string }) =>
    request<Agent>(`/api/admin/clients/${clientId}/agents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAgent: (clientId: string, agentId: string, data: { name?: string; status?: string }) =>
    request<Agent>(`/api/admin/clients/${clientId}/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  saveAgentConfig: (clientId: string, agentId: string, configuration: AgentConfiguration, notes?: string) =>
    request<AgentVersion>(`/api/admin/clients/${clientId}/agents/${agentId}/config`, {
      method: 'PUT',
      body: JSON.stringify({ configuration, notes }),
    }),

  getAgentVersions: (clientId: string, agentId: string) =>
    request<AgentVersion[]>(`/api/admin/clients/${clientId}/agents/${agentId}/versions`),

  getAgentVersion: (clientId: string, agentId: string, versionId: string) =>
    request<AgentVersion>(`/api/admin/clients/${clientId}/agents/${agentId}/versions/${versionId}`),

  compilePrompt: (clientId: string, agentId: string, configuration?: AgentConfiguration) =>
    request<{ compiledPrompt: string }>(`/api/admin/clients/${clientId}/agents/${agentId}/compile-prompt`, {
      method: 'POST',
      body: JSON.stringify({ configuration }),
    }),

  getChecklist: (clientId: string, agentId: string) =>
    request<any>(`/api/admin/clients/${clientId}/agents/${agentId}/checklist`),

  publishAgent: (clientId: string, agentId: string, notes?: string, configuration?: AgentConfiguration) =>
    request<{ success: boolean; message: string; version: AgentVersion; agent: Agent }>(
      `/api/admin/clients/${clientId}/agents/${agentId}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({ notes, configuration }),
      }
    ),

  getAgentInboundNumber: (clientId: string, agentId: string) =>
    request<{
      assigned: boolean;
      phoneNumber: string | null;
      provider: string;
      status: string | null;
      deploymentId: string | null;
      createdAt?: string;
    }>(`/api/admin/clients/${clientId}/agents/${agentId}/inbound-number`),

  setAgentInboundNumber: (clientId: string, agentId: string, phoneNumber: string, provider: string = 'plivo') =>
    request<{
      success: boolean;
      message: string;
      phoneNumber: string;
      deploymentId: string;
      status: string;
    }>(`/api/admin/clients/${clientId}/agents/${agentId}/inbound-number`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, provider }),
    }),

  disconnectAgentInboundNumber: (clientId: string, agentId: string, phoneNumber?: string) =>
    request<{
      success: boolean;
      message: string;
      phoneNumbers?: string[];
      agentId?: string;
      tenantId?: string;
    }>(
      `/api/admin/clients/${clientId}/agents/${agentId}/inbound-number${
        phoneNumber ? `?phoneNumber=${encodeURIComponent(phoneNumber)}` : ''
      }`,
      {
        method: 'DELETE',
      }
    ),

  goLiveAgent: (clientId: string, agentId: string, resetTestData: boolean = true) =>
    request<{
      success: boolean;
      message: string;
      agent: Agent;
      phoneNumber: string | null;
      subscription: any;
      testDataPurged: boolean;
      deletedCounts: Record<string, number>;
      forwardingCodes: {
        unconditional: string;
        busy: string;
        noReply: string;
        unreachable: string;
        deactivate: string;
      };
      handoverText: string;
    }>(`/api/admin/clients/${clientId}/agents/${agentId}/go-live`, {
      method: 'POST',
      body: JSON.stringify({ resetTestData }),
    }),




  // Knowledge
  getKnowledgeSources: (clientId: string, agentId: string) =>
    request<KnowledgeSource[]>(`/api/admin/clients/${clientId}/agents/${agentId}/knowledge`),

  uploadKnowledge: (clientId: string, agentId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    let url = `${API_URL}/api/admin/clients/${clientId}/agents/${agentId}/knowledge`;
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(url, { method: 'POST', body: formData, headers, credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`Upload failed: ${r.status}`); return r.json(); }) as Promise<{ results: { sourceId: string; fileName: string; status: string }[] }>;
  },

  deleteKnowledgeSource: (clientId: string, agentId: string, sourceId: string) =>
    request<void>(`/api/admin/clients/${clientId}/agents/${agentId}/knowledge/${sourceId}`, { method: 'DELETE' }),

  // Test Conversation
  sendTestMessage: (clientId: string, agentId: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    request<TestConversationResponse>(`/api/admin/clients/${clientId}/agents/${agentId}/test`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  // Config Assistant
  proposeConfig: (clientId: string, agentId: string, message: string) =>
    request<ConfigProposal>(`/api/admin/clients/${clientId}/agents/${agentId}/config-assistant/propose`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  getConfigProposals: (clientId: string, agentId: string) =>
    request<ConfigProposal[]>(`/api/admin/clients/${clientId}/agents/${agentId}/config-assistant/proposals`),

  approveConfigProposal: (clientId: string, agentId: string, proposalId: string) =>
    request<ConfigAssistantResponse>(`/api/admin/clients/${clientId}/agents/${agentId}/config-assistant/proposals/${proposalId}/approve`, {
      method: 'POST',
    }),

  rejectConfigProposal: (clientId: string, agentId: string, proposalId: string) =>
    request<void>(`/api/admin/clients/${clientId}/agents/${agentId}/config-assistant/proposals/${proposalId}/reject`, {
      method: 'POST',
    }),

  // V3 LiveKit SIP Outbound Phone Test
  startPhoneTest: (clientId: string, agentId: string, phoneNumber: string) =>
    request<PhoneTestResult>(`/api/admin/clients/${clientId}/agents/${agentId}/phone-test`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  // Subscription & Plans (Module 2)
  getAdminPlansCatalog: () =>
    request<{ plans: PlanTemplate[]; defaultPayAsYouGoRate: number }>(`/api/admin/plans/catalog`),

  getAdminClientSubscription: (clientId: string) =>
    request<Subscription>(`/api/admin/clients/${clientId}/subscription`),

  assignAdminClientSubscription: (clientId: string, data: {
    planTier: string;
    billingCycle?: string;
    customPrice?: number;
    customMinutes?: number;
    customOverageRate?: number;
    adminNotes?: string;
  }) =>
    request<{ success: boolean; message: string; subscription: Subscription }>(
      `/api/admin/clients/${clientId}/subscription`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  getClientSubscription: () =>
    request<Subscription>(`/api/client/subscription`),
};

export interface PhoneTestResult {
  success: boolean;
  roomName: string;
  callId?: string;
  participantId?: string;
  participantIdentity: string;
  deploymentId: string;
  dispatchId?: string;
}

