# NextLite Voice V3 — Complete API Contract Audit

> **Scope**: All Control Plane, Client Portal, Internal Worker, and Health API Endpoints  
> **Route Files**: `apps/api/src/routes/*`  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Internal Worker APIs (`apps/api/src/routes/internal.ts`)

All routes require internal worker authentication (`x-worker-secret` or Bearer `WORKER_API_SECRET`).

| Method | Path | Input Schema / Params | Output Payload | Backend Service & DB Operations | Failure Behavior |
|---|---|---|---|---|---|
| `GET` | `/api/internal/runtime-config/:deploymentId` | `deploymentId` (UUID param) | `RuntimeAgentConfig` DTO | `RuntimeAgentConfigService`: queries `deployments` joined with `agents`, `agent_versions`. Compiles system prompt. | `404` if deployment missing; `409` if inactive/archived; `400` if config invalid. |
| `POST` | `/api/internal/knowledge/retrieve` | `{ deploymentId: UUID, query: string, topK?: number }` | `{ results: Array<{ content, score, sourceId }> }` | `KnowledgeService`: embeds query, calculates cosine similarity over `knowledge_chunks` filtered strictly by resolved `tenantId` & `agentId`. | `400` invalid input; `404/409` deployment invalid; `500` embedding/DB error. |
| `POST` | `/api/internal/call-sessions` | `CreateCallSessionRequest` (`tenantId`, `agentId`, `deploymentId`, `roomName`, `callerNumber`, `direction`, `status`, `startedAt`, etc.) | `CallSession` entity (status `ACTIVE`) | `CallSessionService`: verifies tenant ownership of agent and deployment; inserts into `call_sessions`. | `400` validation failure or tenant mismatch. |
| `PATCH` | `/api/internal/call-sessions/:id` | `{ tenantId: UUID, status, durationSeconds, endedAt, transcriptText, turnsJson, toolsUsed, metricsJson }` | Updated `CallSession` entity | `CallSessionService`: verifies tenant ownership; updates `call_sessions` row with final duration and metrics. | `400` validation failure; `404` session not found. |
| `POST` | `/api/internal/leads` | `{ deploymentId?: UUID, tenantId?: UUID, agentId?: UUID, customerName, customerPhone, customerEmail?, interestCategory?, notes?, metadata? }` | `Lead` entity | `LeadService`: authoritatively derives `tenantId` and `agentId` from `deploymentId`; inserts into `leads`. | `400` invalid body or missing phone; `404/409` deployment invalid. |
| `POST` | `/api/internal/appointments` | `{ deploymentId?: UUID, tenantId?: UUID, agentId?: UUID, customerName, customerPhone, title, bookingDate, bookingTime, resourceName?, notes?, metadata? }` | `Appointment` entity (`appointmentNumber: 'A-001'`, `status: 'REQUESTED'`) | `AppointmentService`: authoritatively derives `tenantId` and `agentId` from `deploymentId`; increments `tenant_appointment_counters`; inserts into `appointments`. | `400` invalid body or missing phone; `404/409` deployment invalid. |
| `GET` | `/api/internal/phone-numbers/lookup` | `phoneNumber` (Query string) | `PhoneNumber` record with joined `agent`, `deployment`, `tenant` | `PhoneNumberService`: queries `phone_numbers` table WHERE `phone_number = :phone`. | `400` missing query param; `404` number not registered. |
| `POST` | `/api/internal/phone-numbers` | `{ tenantId: UUID, agentId?, deploymentId?, phoneNumber, provider?, status? }` | `PhoneNumber` entity | `PhoneNumberService`: verifies tenant ownership of referenced entities; inserts into `phone_numbers`. | `400` invalid input or duplicate phone number. |

---

## 2. Admin Agent Studio APIs (`apps/api/src/routes/agents.ts`)

All routes require JWT Authentication with role `ADMIN`.

| Method | Path | Input Schema / Params | Output Payload | Backend Service & DB Operations | Failure Behavior |
|---|---|---|---|---|---|
| `GET` | `/api/admin/tools` | None | `ToolCatalogItem[]` | `getPlatformToolCatalog()`: returns safe metadata catalog of platform tools. | `500` server error. |
| `GET` | `/api/admin/templates` | None | `AgentTemplate[]` | `TemplateService`: queries `agent_templates`. | `500` server error. |
| `GET` | `/api/admin/templates/:id` | `id` (UUID param) | `AgentTemplate` | `TemplateService`: queries `agent_templates` by ID. | `404` template not found. |
| `GET` | `/api/admin/clients/:clientId/agents` | `clientId` (UUID param) | `Agent[]` (with template info & latest version) | `AgentService`: queries `agents` WHERE `tenantId = :clientId`. | `404` client not found. |
| `POST` | `/api/admin/clients/:clientId/agents` | `{ name: string, templateId: UUID }` | `Agent` entity with initial v1 & test deployment | `AgentService`: creates `agents` row, clones template config into `agent_versions` v1, creates active `TEST` deployment. | `404` template/client not found; `400` validation error. |
| `GET` | `/api/admin/clients/:clientId/agents/:agentId` | `clientId`, `agentId` | `Agent` entity with versions & template | `AgentService`: queries agent by ID and tenant ID. | `404` agent not found. |
| `PUT` | `/api/admin/clients/:clientId/agents/:agentId` | `{ name?: string, status?: string }` | Updated `Agent` entity | `AgentService`: updates agent name or status in `agents`. | `404` agent not found. |
| `PUT` | `/api/admin/clients/:clientId/agents/:agentId/config` | `{ configuration: AgentConfiguration, notes?: string }` | New `AgentVersion` entity (version `N+1`) | `AgentService`: creates new `agent_versions` row (DRAFT); updates active `TEST` deployment to point to new version. | `400` schema violation; `404` agent not found. |
| `GET` | `/api/admin/clients/:clientId/agents/:agentId/versions` | `clientId`, `agentId` | `AgentVersion[]` | `AgentService`: queries `agent_versions` ordered by `versionNumber DESC`. | `404` agent not found. |
| `POST` | `/api/admin/clients/:clientId/agents/:agentId/compile-prompt` | Optional `{ configuration: AgentConfiguration }` | `{ compiledPrompt: string }` | `PromptCompilerService`: compiles system prompt preview. | `404` config not found; `500` error. |
| `GET` | `/api/admin/clients/:clientId/agents/:agentId/checklist` | `clientId`, `agentId` | `AgentChecklistResult` | `AgentChecklistService`: evaluates agent configuration completeness and publication readiness. | `404` config not found. |
| `POST` | `/api/admin/clients/:clientId/agents/:agentId/publish` | None | `{ message, agent, publishedVersion, deployment, checklist }` | `AgentService`: validates checklist, marks version `PUBLISHED`, updates agent status `LIVE`, deactivates prior prod deployment, creates new active `PRODUCTION` deployment. | `400` checklist validation failed; `404` version/agent not found. |
| `POST` | `/api/admin/clients/:clientId/agents/:agentId/test-token` | None | `{ livekitUrl, token, roomName, dispatchId }` | `LiveKitService`: resolves active `TEST` deployment, creates test room with deployment metadata, dispatches worker, returns browser JWT. | `400` no active test deployment; `503` LiveKit unconfigured. |
| `POST` | `/api/admin/clients/:clientId/agents/:agentId/phone-test` | `{ phoneNumber: string }` (E.164) | `{ success, roomName, callId, participantIdentity, deploymentId, dispatchId }` | `LiveKitService`: validates E.164, creates phone test room, dispatches worker, dials destination via LiveKit SIP outbound trunk. | `400` invalid phone format or no test deployment; `503` SIP trunk unconfigured. |

---

## 3. Client Portal CRM APIs (`apps/api/src/routes/client.ts`)

All routes require JWT Authentication with role `CLIENT_OWNER`, `CLIENT_VIEWER`, or `ADMIN`. Scoped strictly to authenticated user's `tenantId`.

| Method | Path | Input Schema / Params | Output Payload | Backend Service & DB Operations | Failure Behavior |
|---|---|---|---|---|---|
| `GET` | `/api/client/profile` | None | `{ tenant, user, subscription }` | Queries `tenants` joined with `users` and `subscriptions`. | `403` no tenant context; `404` tenant not found. |
| `PUT` | `/api/client/profile` | `{ businessName: string }` | `{ message: string }` | Updates `tenants.name`. (Requires `CLIENT_OWNER` or `ADMIN`). | `403` read-only role rejected. |
| `GET` | `/api/client/calls` | Query params: `limit`, `offset`, `agentId`, `status` | `{ calls: CallSession[], total, limit, offset }` | `CallSessionService`: queries `call_sessions` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/calls/:id` | `id` (UUID param) | `CallSession` entity with joined `agent`, `leads`, `appointments` | `CallSessionService`: queries call session by ID and `tenantId`. | `404` call session not found. |
| `GET` | `/api/client/leads` | Query params: `limit`, `offset`, `agentId`, `status` | `{ leads: Lead[], total, limit, offset }` | `LeadService`: queries `leads` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/leads/:id` | `id` (UUID param) | `Lead` entity with joined `agent`, `callSession` | `LeadService`: queries lead by ID and `tenantId`. | `404` lead not found. |
| `PATCH`| `/api/client/leads/:id` | `{ customerName?, customerPhone?, customerEmail?, interestCategory?, status?, notes?, metadata? }` | Updated `Lead` entity | `LeadService`: updates `leads` row. (Requires `CLIENT_OWNER` or `ADMIN`). | `403` read-only role rejected; `404` lead not found. |
| `GET` | `/api/client/appointments` | Query params: `limit`, `offset`, `agentId`, `status`, `bookingDate` | `{ appointments: Appointment[], total, limit, offset }` | `AppointmentService`: queries `appointments` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/appointments/:id` | `id` (UUID param) | `Appointment` entity with joined `agent`, `callSession` | `AppointmentService`: queries appointment by ID and `tenantId`. | `404` appointment not found. |
| `PATCH`| `/api/client/appointments/:id` | `{ customerName?, customerPhone?, title?, resourceName?, bookingDate?, bookingTime?, status?, notes?, metadata? }` | Updated `Appointment` entity | `AppointmentService`: updates `appointments` row. (Requires `CLIENT_OWNER` or `ADMIN`). | `403` read-only role rejected; `404` appointment not found. |
| `GET` | `/api/client/phone-numbers` | None | `{ phoneNumbers: PhoneNumber[] }` | `PhoneNumberService`: queries `phone_numbers` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/agents` | None | `{ agents: Agent[] }` (with template, latest deployment & version) | Queries `agents` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/follow-ups` | Query params: `limit`, `offset`, `status`, `channel`, `customerPhone` | `{ followUps: FollowUp[], total, limit, offset }` | `FollowUpService`: queries `follow_ups` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/follow-ups/:id` | `id` (UUID param) | `FollowUp` entity with joined `lead`, `appointment`, `callSession` | `FollowUpService`: queries follow-up by ID and `tenantId`. | `404` follow-up not found. |
| `POST` | `/api/client/follow-ups/send-whatsapp` | `{ leadId?, appointmentId?, callSessionId?, customerName?, customerPhone: string, message: string, messageType?, provider? }` | `SendWhatsAppResponse` | `WhatsAppService`: verifies entity tenant ownership, dispatches via provider (`DEMO`/`META`/`TWILIO`), logs in `follow_ups`. | `403` read-only role rejected; `400` entity tenant mismatch. |
| `GET` | `/api/client/analytics/overview` | None | `AnalyticsOverview` DTO | `AnalyticsService`: aggregates call totals, outcomes, 7-day trend, lead funnel, appointment statuses, languages, and latencies. | `403` no tenant context. |
