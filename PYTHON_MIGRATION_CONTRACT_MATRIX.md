# NextLite Voice V3 — API & Domain Contract Matrix

**Total Route Handlers:** 65  
**Total Database Entities:** 20  

---

## 1. REST API Contract Matrix

| # | HTTP Method | Route Path | Auth Requirement | Role | Body / Zod Validator | Target FastAPI Endpoint |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `POST` | `/api/admin/clients` | `PUBLIC` | ALL | `createClientSchema` | `POST /api/admin/clients` |
| 2 | `GET` | `/api/admin/clients` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients` |
| 3 | `GET` | `/api/admin/clients/:id` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{id` |
| 4 | `PUT` | `/api/admin/clients/:id` | `PUBLIC` | ALL | `updateClientSchema` | `PUT /api/admin/clients/{id` |
| 5 | `GET` | `/api/admin/tools` | `PUBLIC` | ALL | `None` | `GET /api/admin/tools` |
| 6 | `GET` | `/api/admin/templates` | `PUBLIC` | ALL | `None` | `GET /api/admin/templates` |
| 7 | `GET` | `/api/admin/templates/:id` | `PUBLIC` | ALL | `None` | `GET /api/admin/templates/{id` |
| 8 | `GET` | `/api/admin/clients/:clientId/agents` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents` |
| 9 | `POST` | `/api/admin/clients/:clientId/agents` | `PUBLIC` | ALL | `createAgentSchema` | `POST /api/admin/clients/{clientId/agents` |
| 10 | `GET` | `/api/admin/clients/:clientId/agents/:agentId` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId` |
| 11 | `PUT` | `/api/admin/clients/:clientId/agents/:agentId` | `PUBLIC` | ALL | `updateAgentSchema` | `PUT /api/admin/clients/{clientId/agents/{agentId` |
| 12 | `PUT` | `/api/admin/clients/:clientId/agents/:agentId/config` | `PUBLIC` | ALL | `saveConfigSchema` | `PUT /api/admin/clients/{clientId/agents/{agentId/config` |
| 13 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/versions` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/versions` |
| 14 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/versions/:versionId` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/versions/{versionId` |
| 15 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/runtime-config` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/runtime-config` |
| 16 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/compile-prompt` | `PUBLIC` | ALL | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/compile-prompt` |
| 17 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/checklist` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/checklist` |
| 18 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/publish` | `PUBLIC` | ALL | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/publish` |
| 19 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/test-token` | `PUBLIC` | ALL | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/test-token` |
| 20 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/phone-test` | `PUBLIC` | ALL | `phoneTestSchema` | `POST /api/admin/clients/{clientId/agents/{agentId/phone-test` |
| 21 | `POST` | `/api/auth/login` | `PUBLIC` | ALL | `loginSchema` | `POST /api/auth/login` |
| 22 | `POST` | `/api/auth/logout` | `USER_JWT` | ALL | `None` | `POST /api/auth/logout` |
| 23 | `POST` | `/api/auth/refresh` | `PUBLIC` | ALL | `None` | `POST /api/auth/refresh` |
| 24 | `GET` | `/api/auth/verify-email/:token` | `PUBLIC` | ALL | `None` | `GET /api/auth/verify-email/{token` |
| 25 | `POST` | `/api/auth/set-password` | `PUBLIC` | ALL | `setPasswordSchema` | `POST /api/auth/set-password` |
| 26 | `POST` | `/api/auth/forgot-password` | `PUBLIC` | ALL | `forgotPasswordSchema` | `POST /api/auth/forgot-password` |
| 27 | `POST` | `/api/auth/reset-password` | `PUBLIC` | ALL | `resetPasswordSchema` | `POST /api/auth/reset-password` |
| 28 | `GET` | `/api/client/profile` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/profile` |
| 29 | `PUT` | `/api/client/profile` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `updateProfileSchema` | `PUT /api/client/profile` |
| 30 | `GET` | `/api/client/calls` | `ADMIN_JWT` | ADMIN | `None` | `GET /api/client/calls` |
| 31 | `GET` | `/api/client/calls/:id` | `ADMIN_JWT` | ADMIN | `None` | `GET /api/client/calls/{id` |
| 32 | `GET` | `/api/client/leads` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/leads` |
| 33 | `GET` | `/api/client/leads/:id` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/leads/{id` |
| 34 | `PATCH` | `/api/client/leads/:id` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `updateLeadSchema` | `PATCH /api/client/leads/{id` |
| 35 | `GET` | `/api/client/appointments` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/appointments` |
| 36 | `GET` | `/api/client/appointments/:id` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/appointments/{id` |
| 37 | `PATCH` | `/api/client/appointments/:id` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `updateAppointmentSchema` | `PATCH /api/client/appointments/{id` |
| 38 | `GET` | `/api/client/phone-numbers` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/phone-numbers` |
| 39 | `GET` | `/api/client/agents` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/agents` |
| 40 | `GET` | `/api/client/follow-ups` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/follow-ups` |
| 41 | `GET` | `/api/client/follow-ups/:id` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/follow-ups/{id` |
| 42 | `GET` | `/api/client/analytics/overview` | `PUBLIC` | CLIENT_OWNER, CLIENT_VIEWER | `None` | `GET /api/client/analytics/overview` |
| 43 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/propose` | `PUBLIC` | ALL | `proposeSchema` | `POST /api/admin/clients/{clientId/agents/{agentId/config-assistant/propose` |
| 44 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/proposals` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/config-assistant/proposals` |
| 45 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/proposals/:proposalId/approve` | `PUBLIC` | ALL | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/config-assistant/proposals/{proposalId/approve` |
| 46 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/proposals/:proposalId/reject` | `PUBLIC` | ALL | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/config-assistant/proposals/{proposalId/reject` |
| 47 | `GET` | `/api/health` | `PUBLIC` | ALL | `None` | `GET /api/health` |
| 48 | `GET` | `/api/internal/runtime-config/:deploymentId` | `PUBLIC` | ALL | `None` | `GET /api/internal/runtime-config/{deploymentId` |
| 49 | `POST` | `/api/internal/knowledge/retrieve` | `PUBLIC` | ALL | `retrieveKnowledgeSchema` | `POST /api/internal/knowledge/retrieve` |
| 50 | `POST` | `/api/internal/call-sessions` | `PUBLIC` | ALL | `createCallSessionSchema` | `POST /api/internal/call-sessions` |
| 51 | `PATCH` | `/api/internal/call-sessions/:id` | `PUBLIC` | ALL | `updateCallSessionSchema` | `PATCH /api/internal/call-sessions/{id` |
| 52 | `POST` | `/api/internal/leads` | `PUBLIC` | ALL | `createLeadSchema` | `POST /api/internal/leads` |
| 53 | `POST` | `/api/internal/appointments` | `PUBLIC` | ALL | `createAppointmentSchema` | `POST /api/internal/appointments` |
| 54 | `GET` | `/api/internal/phone-numbers/lookup` | `PUBLIC` | ALL | `None` | `GET /api/internal/phone-numbers/lookup` |
| 55 | `POST` | `/api/internal/phone-numbers` | `PUBLIC` | ALL | `createPhoneNumberSchema` | `POST /api/internal/phone-numbers` |
| 56 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/knowledge` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/knowledge` |
| 57 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/knowledge/:sourceId` | `PUBLIC` | ALL | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/knowledge/{sourceId` |
| 58 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/knowledge` | `PUBLIC` | ALL | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/knowledge` |
| 59 | `DELETE` | `/api/admin/clients/:clientId/agents/:agentId/knowledge/:sourceId` | `PUBLIC` | ALL | `None` | `DELETE /api/admin/clients/{clientId/agents/{agentId/knowledge/{sourceId` |
| 60 | `GET` | `/api/appointments/doctors` | `PUBLIC` | ALL | `None` | `GET /api/appointments/doctors` |
| 61 | `GET` | `/api/appointments/schedule` | `PUBLIC` | ALL | `None` | `GET /api/appointments/schedule` |
| 62 | `POST` | `/api/appointments/book` | `PUBLIC` | ALL | `bookSchema` | `POST /api/appointments/book` |
| 63 | `POST` | `/api/appointments/:id/cancel` | `PUBLIC` | ALL | `None` | `POST /api/appointments/{id/cancel` |
| 64 | `GET` | `/api/appointments/availability` | `PUBLIC` | ALL | `None` | `GET /api/appointments/availability` |
| 65 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/test` | `PUBLIC` | ALL | `sendMessageSchema` | `POST /api/admin/clients/{clientId/agents/{agentId/test` |

---

## 2. Database Schema Contract Matrix

| Table Name | Drizzle Variable | Columns | Indexes | Tenant Isolation Key |
| :--- | :--- | :--- | :--- | :--- |
| `tenants` | `tenants` | 6 | 0 | `tenant_id` |
| `users` | `users` | 8 | 0 | `tenant_id` |
| `refresh_tokens` | `refreshTokens` | 5 | 0 | `tenant_id` |
| `audit_logs` | `auditLogs` | 8 | 0 | `tenant_id` |
| `verification_tokens` | `verificationTokens` | 7 | 0 | `tenant_id` |
| `subscriptions` | `subscriptions` | 8 | 0 | `tenant_id` |
| `agent_templates` | `agentTemplates` | 7 | 0 | `tenant_id` |
| `agents` | `agents` | 7 | 0 | `tenant_id` |
| `agent_versions` | `agentVersions` | 8 | 0 | `tenant_id` |
| `deployments` | `deployments` | 10 | 4 | `tenant_id` |
| `agent_tools` | `agentTools` | 6 | 0 | `tenant_id` |
| `knowledge_sources` | `knowledgeSources` | 10 | 0 | `tenant_id` |
| `knowledge_chunks` | `knowledgeChunks` | 10 | 2 | `tenant_id` |
| `config_change_proposals` | `configChangeProposals` | 12 | 0 | `tenant_id` |
| `call_sessions` | `callSessions` | 17 | 6 | `tenant_id` |
| `leads` | `leads` | 13 | 6 | `tenant_id` |
| `appointments` | `appointments` | 16 | 8 | `tenant_id` |
| `tenant_appointment_counters` | `tenantAppointmentCounters` | 3 | 0 | `tenant_id` |
| `phone_numbers` | `phoneNumbers` | 9 | 5 | `tenant_id` |
| `follow_ups` | `followUps` | 20 | 4 | `tenant_id` |