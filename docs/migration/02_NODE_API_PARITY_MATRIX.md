# Node.js Express API Parity Matrix

**Total Route Handlers:** 65  
**Router Mounts:**  
- `/api` → `healthRoutes`
- `/api/auth` → `authRoutes`
- `/api/internal` → `internalRoutes` (Worker Bearer Auth)
- `/api/admin` → `adminRoutes`, `agentRoutes`, `knowledgeRoutes`, `testConversationRoutes`, `configAssistantRoutes` (Admin JWT)
- `/api/client` → `clientRoutes` (Client Owner / Viewer JWT)
- `/api/appointments` → `receptionistRoutes` (Public / Receptionist Token)

---

## Complete Endpoint-by-Endpoint Matrix

| # | Method | Path | Auth / Role | Tenant Rule | Zod Validator / Body | Touched Tables | Services / External | Target FastAPI Route |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `POST` | `/api/admin/clients` | `PUBLIC` | Strict Tenant Match | `createClientSchema` | `subscriptions, tenants, users, verificationTokens` | `None` | `POST /api/admin/clients` |
| 2 | `GET` | `/api/admin/clients` | `PUBLIC` | Strict Tenant Match | `None` | `subscriptions, tenants, users` | `None` | `GET /api/admin/clients` |
| 3 | `GET` | `/api/admin/clients/:id` | `PUBLIC` | Strict Tenant Match | `None` | `subscriptions, tenants, users` | `None` | `GET /api/admin/clients/{id` |
| 4 | `PUT` | `/api/admin/clients/:id` | `PUBLIC` | Strict Tenant Match | `updateClientSchema` | `tenants, users, verificationTokens` | `None` | `PUT /api/admin/clients/{id` |
| 5 | `GET` | `/api/admin/tools` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `None` | `GET /api/admin/tools` |
| 6 | `GET` | `/api/admin/templates` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `templateService` | `GET /api/admin/templates` |
| 7 | `GET` | `/api/admin/templates/:id` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `templateService` | `GET /api/admin/templates/{id` |
| 8 | `GET` | `/api/admin/clients/:clientId/agents` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `GET /api/admin/clients/{clientId/agents` |
| 9 | `POST` | `/api/admin/clients/:clientId/agents` | `PUBLIC` | Strict Tenant Match | `createAgentSchema` | `agents` | `agentService` | `POST /api/admin/clients/{clientId/agents` |
| 10 | `GET` | `/api/admin/clients/:clientId/agents/:agentId` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `GET /api/admin/clients/{clientId/agents/{agentId` |
| 11 | `PUT` | `/api/admin/clients/:clientId/agents/:agentId` | `PUBLIC` | Strict Tenant Match | `updateAgentSchema` | `agents` | `agentService` | `PUT /api/admin/clients/{clientId/agents/{agentId` |
| 12 | `PUT` | `/api/admin/clients/:clientId/agents/:agentId/config` | `PUBLIC` | Strict Tenant Match | `saveConfigSchema` | `agents` | `agentService` | `PUT /api/admin/clients/{clientId/agents/{agentId/config` |
| 13 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/versions` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `GET /api/admin/clients/{clientId/agents/{agentId/versions` |
| 14 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/versions/:versionId` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `GET /api/admin/clients/{clientId/agents/{agentId/versions/{versionId` |
| 15 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/runtime-config` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `GET /api/admin/clients/{clientId/agents/{agentId/runtime-config` |
| 16 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/compile-prompt` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `POST /api/admin/clients/{clientId/agents/{agentId/compile-prompt` |
| 17 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/checklist` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `GET /api/admin/clients/{clientId/agents/{agentId/checklist` |
| 18 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/publish` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `agentService` | `POST /api/admin/clients/{clientId/agents/{agentId/publish` |
| 19 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/test-token` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `livekitService` | `POST /api/admin/clients/{clientId/agents/{agentId/test-token` |
| 20 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/phone-test` | `PUBLIC` | Strict Tenant Match | `phoneTestSchema` | `agents` | `agentService, livekitService, plivoService` | `POST /api/admin/clients/{clientId/agents/{agentId/phone-test` |
| 21 | `POST` | `/api/auth/login` | `PUBLIC` | Strict Tenant Match | `loginSchema` | `refreshTokens, users` | `None` | `POST /api/auth/login` |
| 22 | `POST` | `/api/auth/logout` | `USER_JWT` | Strict Tenant Match | `None` | `refreshTokens` | `None` | `POST /api/auth/logout` |
| 23 | `POST` | `/api/auth/refresh` | `PUBLIC` | Strict Tenant Match | `None` | `refreshTokens, users` | `None` | `POST /api/auth/refresh` |
| 24 | `GET` | `/api/auth/verify-email/:token` | `PUBLIC` | Strict Tenant Match | `None` | `verificationTokens` | `None` | `GET /api/auth/verify-email/{token` |
| 25 | `POST` | `/api/auth/set-password` | `PUBLIC` | Strict Tenant Match | `setPasswordSchema` | `users, verificationTokens` | `None` | `POST /api/auth/set-password` |
| 26 | `POST` | `/api/auth/forgot-password` | `PUBLIC` | Strict Tenant Match | `forgotPasswordSchema` | `users, verificationTokens` | `None` | `POST /api/auth/forgot-password` |
| 27 | `POST` | `/api/auth/reset-password` | `PUBLIC` | Strict Tenant Match | `resetPasswordSchema` | `refreshTokens, users, verificationTokens` | `None` | `POST /api/auth/reset-password` |
| 28 | `GET` | `/api/client/profile` | `PUBLIC` | Strict Tenant Match | `None` | `subscriptions, tenants, users` | `None` | `GET /api/client/profile` |
| 29 | `PUT` | `/api/client/profile` | `PUBLIC` | Strict Tenant Match | `updateProfileSchema` | `tenants` | `None` | `PUT /api/client/profile` |
| 30 | `GET` | `/api/client/calls` | `ADMIN_JWT` | Strict Tenant Match | `None` | `agents` | `callSessionService` | `GET /api/client/calls` |
| 31 | `GET` | `/api/client/calls/:id` | `ADMIN_JWT` | Strict Tenant Match | `None` | `callSessions, leads` | `callSessionService` | `GET /api/client/calls/{id` |
| 32 | `GET` | `/api/client/leads` | `PUBLIC` | Strict Tenant Match | `None` | `leads` | `leadService` | `GET /api/client/leads` |
| 33 | `GET` | `/api/client/leads/:id` | `PUBLIC` | Strict Tenant Match | `None` | `leads` | `leadService` | `GET /api/client/leads/{id` |
| 34 | `PATCH` | `/api/client/leads/:id` | `PUBLIC` | Strict Tenant Match | `updateLeadSchema` | `appointments, leads` | `leadService` | `PATCH /api/client/leads/{id` |
| 35 | `GET` | `/api/client/appointments` | `PUBLIC` | Strict Tenant Match | `None` | `appointments` | `appointmentService` | `GET /api/client/appointments` |
| 36 | `GET` | `/api/client/appointments/:id` | `PUBLIC` | Strict Tenant Match | `None` | `appointments` | `appointmentService` | `GET /api/client/appointments/{id` |
| 37 | `PATCH` | `/api/client/appointments/:id` | `PUBLIC` | Strict Tenant Match | `updateAppointmentSchema` | `appointments` | `appointmentService` | `PATCH /api/client/appointments/{id` |
| 38 | `GET` | `/api/client/phone-numbers` | `PUBLIC` | Strict Tenant Match | `None` | `agents, phoneNumbers` | `phoneNumberService` | `GET /api/client/phone-numbers` |
| 39 | `GET` | `/api/client/agents` | `PUBLIC` | Strict Tenant Match | `None` | `agents, deployments` | `None` | `GET /api/client/agents` |
| 40 | `GET` | `/api/client/follow-ups` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `followUpService` | `GET /api/client/follow-ups` |
| 41 | `GET` | `/api/client/follow-ups/:id` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `followUpService` | `GET /api/client/follow-ups/{id` |
| 42 | `GET` | `/api/client/analytics/overview` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `None` | `GET /api/client/analytics/overview` |
| 43 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/propose` | `PUBLIC` | Strict Tenant Match | `proposeSchema` | `agents` | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/config-assistant/propose` |
| 44 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/proposals` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/config-assistant/proposals` |
| 45 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/proposals/:proposalId/approve` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/config-assistant/proposals/{proposalId/approve` |
| 46 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/config-assistant/proposals/:proposalId/reject` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/config-assistant/proposals/{proposalId/reject` |
| 47 | `GET` | `/api/health` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `None` | `GET /api/health` |
| 48 | `GET` | `/api/internal/runtime-config/:deploymentId` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `runtimeAgentConfigService` | `GET /api/internal/runtime-config/{deploymentId` |
| 49 | `POST` | `/api/internal/knowledge/retrieve` | `PUBLIC` | Strict Tenant Match | `retrieveKnowledgeSchema` | `None` | `knowledgeService, runtimeAgentConfigService` | `POST /api/internal/knowledge/retrieve` |
| 50 | `POST` | `/api/internal/call-sessions` | `PUBLIC` | Strict Tenant Match | `createCallSessionSchema` | `None` | `callSessionService` | `POST /api/internal/call-sessions` |
| 51 | `PATCH` | `/api/internal/call-sessions/:id` | `PUBLIC` | Strict Tenant Match | `updateCallSessionSchema` | `leads` | `callSessionService` | `PATCH /api/internal/call-sessions/{id` |
| 52 | `POST` | `/api/internal/leads` | `PUBLIC` | Strict Tenant Match | `createLeadSchema` | `appointments, leads` | `leadService, runtimeAgentConfigService` | `POST /api/internal/leads` |
| 53 | `POST` | `/api/internal/appointments` | `PUBLIC` | Strict Tenant Match | `createAppointmentSchema` | `appointments` | `appointmentService, runtimeAgentConfigService` | `POST /api/internal/appointments` |
| 54 | `GET` | `/api/internal/phone-numbers/lookup` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `phoneNumberService` | `GET /api/internal/phone-numbers/lookup` |
| 55 | `POST` | `/api/internal/phone-numbers` | `PUBLIC` | Strict Tenant Match | `createPhoneNumberSchema` | `None` | `phoneNumberService` | `POST /api/internal/phone-numbers` |
| 56 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/knowledge` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/knowledge` |
| 57 | `GET` | `/api/admin/clients/:clientId/agents/:agentId/knowledge/:sourceId` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `GET /api/admin/clients/{clientId/agents/{agentId/knowledge/{sourceId` |
| 58 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/knowledge` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/knowledge` |
| 59 | `DELETE` | `/api/admin/clients/:clientId/agents/:agentId/knowledge/:sourceId` | `PUBLIC` | Strict Tenant Match | `None` | `agents` | `None` | `DELETE /api/admin/clients/{clientId/agents/{agentId/knowledge/{sourceId` |
| 60 | `GET` | `/api/appointments/doctors` | `PUBLIC` | Strict Tenant Match | `None` | `appointments` | `None` | `GET /api/appointments/doctors` |
| 61 | `GET` | `/api/appointments/schedule` | `PUBLIC` | Strict Tenant Match | `None` | `appointments` | `None` | `GET /api/appointments/schedule` |
| 62 | `POST` | `/api/appointments/book` | `PUBLIC` | Strict Tenant Match | `bookSchema` | `appointments` | `None` | `POST /api/appointments/book` |
| 63 | `POST` | `/api/appointments/:id/cancel` | `PUBLIC` | Strict Tenant Match | `None` | `appointments` | `None` | `POST /api/appointments/{id/cancel` |
| 64 | `GET` | `/api/appointments/availability` | `PUBLIC` | Strict Tenant Match | `None` | `None` | `None` | `GET /api/appointments/availability` |
| 65 | `POST` | `/api/admin/clients/:clientId/agents/:agentId/test` | `PUBLIC` | Strict Tenant Match | `sendMessageSchema` | `agents` | `None` | `POST /api/admin/clients/{clientId/agents/{agentId/test` |

---

## Detailed Endpoint Specifications

### 1. Authentication Endpoints (`apps/api/src/routes/auth.ts`)
- **`POST /api/auth/register`**: Validates `registerSchema` (email, password, name, tenantName). Hashes password with Argon2. Creates `tenants`, `users` (Role: ADMIN/CLIENT_OWNER), generates verification token, sends email via Resend.
- **`POST /api/auth/login`**: Validates `loginSchema`. Verifies Argon2 hash. Generates Access Token (15m JWT) and Refresh Token (7d in DB & httpOnly cookie).
- **`POST /api/auth/refresh`**: Reads cookie/body refresh token. Rotates refresh token in `refresh_tokens` table. Issues new JWT.
- **`POST /api/auth/logout`**: Revokes token in `refresh_tokens`, clears cookie.
- **`POST /api/auth/verify-email`**: Verifies token in `verification_tokens`, sets `email_verified = true`.
- **`POST /api/auth/forgot-password`** & **`POST /api/auth/reset-password`**: Generates reset token and updates `users.password_hash`.

### 2. Internal Worker Endpoints (`apps/api/src/routes/internal.ts`)
- **`GET /api/internal/runtime-agent-config`**: Authenticated via `INTERNAL_WORKER_SECRET` Bearer header. Resolves active deployment by `deploymentId` or `phoneNumber`. Compiles full `RuntimeAgentConfig` (system prompt, tools, voice, language, RAG context).
- **`POST /api/internal/call-sessions`**: Worker creates new `call_sessions` row with status `ACTIVE`, call direction, caller number, agent version snapshot.
- **`PATCH /api/internal/call-sessions/:id`**: Worker updates transcript, status (`COMPLETED`/`FAILED`/`MISSED`), duration, latency metrics JSON, recording URL, and tools used. Idempotent.
- **`POST /api/internal/tools/execute`**: Executes backend tools (`query_knowledge_base`, `book_appointment`, `create_callback_lead`) with injected trusted context (`tenantId`, `agentId`, `callerPhoneNumber`).
- **`POST /api/internal/knowledge/retrieve`**: Performs pgvector semantic similarity search on `knowledge_chunks` filtered by `tenant_id` and `agent_id`.

### 3. Admin & Agent Management Endpoints (`apps/api/src/routes/agents.ts`, `admin.ts`)
- **`GET /api/admin/agents`**, **`POST /api/admin/agents`**, **`GET /api/admin/agents/:id`**, **`PATCH /api/admin/agents/:id`**, **`DELETE /api/admin/agents/:id`**: CRUD operations on `agents`.
- **`POST /api/admin/agents/:id/versions`**: Creates immutable `agent_versions` snapshot.
- **`POST /api/admin/agents/:id/deploy`**: Promotes version to `deployments` (TEST or PRODUCTION).
- **`GET /api/admin/agents/:id/runtime-preview`**: Returns preview of compiled `RuntimeAgentConfig`.

### 4. Knowledge Management Endpoints (`apps/api/src/routes/knowledge.ts`)
- **`POST /api/admin/knowledge/upload`**: Multipart file upload, text extraction, semantic chunking, NVIDIA/Sarvam embedding generation, pgvector storage.
- **`GET /api/admin/knowledge/sources`**, **`DELETE /api/admin/knowledge/sources/:id`**: Manage knowledge documents.

### 5. Client CRM Endpoints (`apps/api/src/routes/client.ts`)
- **`GET /api/client/dashboard`**: Tenant-scoped metrics (total calls, leads, appointments, minutes used).
- **`GET /api/client/calls`**, **`GET /api/client/calls/:id`**: Call history with full transcript and turn timing metrics.
- **`GET /api/client/leads`**, **`PATCH /api/client/leads/:id`**: CRM leads generated by voice agents.
- **`GET /api/client/appointments`**, **`PATCH /api/client/appointments/:id`**: Appointment booking management.
- **`POST /api/client/whatsapp/send`**: Send follow-up WhatsApp messages via template.