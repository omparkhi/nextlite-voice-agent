const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

import type { Agent, AgentTemplate, AgentVersion, AgentConfiguration, KnowledgeSource, TestConversationResponse, ConfigProposal, ConfigAssistantResponse, ToolCatalogItem } from '../types';

export const api = {
  // Admin - Platform Tools
  getToolCatalog: () =>
    request<ToolCatalogItem[]>('/api/admin/tools'),

  // Auth
  login: (email: string, password: string) =>
    request<{ accessToken: string; expiresIn: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  
  logout: () =>
    request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
  
  refresh: () =>
    request<{ accessToken: string; expiresIn: string }>('/api/auth/refresh', {
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
  
  createClient: (data: { name: string; email: string; businessName: string }) =>
    request<any>('/api/admin/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  updateClient: (id: string, data: { name?: string; email?: string; status?: string; businessName?: string }) =>
    request<any>(`/api/admin/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  // Client - Profile
  getProfile: () =>
    request<any>('/api/client/profile'),
  
  updateProfile: (data: { businessName?: string }) =>
    request<any>('/api/client/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
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

  publishAgent: (clientId: string, agentId: string) =>
    request<{ message: string; agent: Agent; checklist: any }>(`/api/admin/clients/${clientId}/agents/${agentId}/publish`, {
      method: 'POST',
    }),

  getTestToken: (clientId: string, agentId: string) =>
    request<{ livekitUrl: string; token: string; roomName: string }>(`/api/admin/clients/${clientId}/agents/${agentId}/test-token`, {
      method: 'POST',
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
      .then(r => r.json()) as Promise<{ results: { sourceId: string; fileName: string; status: string }[] }>;
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

