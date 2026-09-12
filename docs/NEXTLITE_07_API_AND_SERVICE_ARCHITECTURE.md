# NextLite Voice V3 — API & Service Architecture
## Document 07: REST API Contracts, Service Catalog & Async Architecture

> **Document Type**: REST API Contract Specification & Service Catalog  
> **Status**: Verified from Implementation (Read-Only)  
> **Route Files**: `apps/api/src/routes/*`  
> **Service Files**: `apps/api/src/services/*`  
> **Timestamp**: 2026-09-09  

---

## 1. Internal Worker APIs (`apps/api/src/routes/internal.ts`)

All internal routes require shared worker authentication via `x-worker-secret` header or `Authorization: Bearer <WORKER_API_SECRET>`.

| Method | Path | Auth & Role | Tenant Scope | Input Payload / Params | Output Payload | Backend Service & DB Effect | Error Behavior |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/internal/runtime-config/:deploymentId` | Worker Secret | Deployment-derived | `deploymentId` (UUID param) | `RuntimeAgentConfig` DTO | `RuntimeAgentConfigService`: queries `deployments` joined with `agents`, `agent_versions`. Compiles system prompt. | `404` if deployment missing; `409` if inactive/archived; `400` if config invalid. |
| `POST` | `/api/internal/knowledge/retrieve` | Worker Secret | Deployment-derived | `{ deploymentId: UUID, query: string, topK?: number }` | `{ results: Array<{ content, score, sourceId }> }` | `KnowledgeService`: embeds query, calculates cosine similarity over `knowledge_chunks` filtered strictly by resolved `tenantId` & `agentId`. | `400` invalid input; `404/409` deployment invalid; `500` embedding/DB error. |
| `POST` | `/api/internal/call-sessions` | Worker Secret | Body `tenantId` | `CreateCallSessionRequest` (`tenantId`, `agentId`, `deploymentId`, `roomName`, `callerNumber`, `direction`, `status`, `startedAt`, etc.) | `CallSession` entity (status `ACTIVE`) | `CallSessionService`: verifies tenant ownership of agent and deployment; inserts into `call_sessions`. | `400` validation failure or tenant mismatch. |
| `PATCH` | `/api/internal/call-sessions/:id` | Worker Secret | Body `tenantId` | `{ tenantId: UUID, status, durationSeconds, endedAt, transcriptText, turnsJson, toolsUsed, metricsJson }` | Updated `CallSession` entity | `CallSessionService`: verifies tenant ownership; updates `call_sessions` row with final duration and metrics. | `400` validation failure; `404` session not found. |
| `POST` | `/api/internal/leads` | Worker Secret | Deployment-derived | `{ deploymentId?: UUID, tenantId?: UUID, agentId?: UUID, customerName, customerPhone, customerEmail?, interestCategory?, notes?, metadata? }` | `Lead` entity | `LeadService`: authoritatively derives `tenantId` and `agentId` from `deploymentId`; inserts into `leads`. | `400` invalid body or missing phone; `404/409` deployment invalid. |
| `POST` | `/api/internal/appointments` | Worker Secret | Deployment-derived | `{ deploymentId?: UUID, tenantId?: UUID, agentId?: UUID, customerName, customerPhone, title, bookingDate, bookingTime, resourceName?, notes?, metadata? }` | `Appointment` entity (`appointmentNumber: 'A-001'`, `status: 'REQUESTED'`) | `AppointmentService`: authoritatively derives `tenantId` and `agentId` from `deploymentId`; increments `tenant_appointment_counters`; inserts into `appointments`. | `400` invalid body or missing phone; `404/409` deployment invalid. |
| `GET` | `/api/internal/phone-numbers/lookup` | Worker Secret | Global DID lookup | `phoneNumber` (Query string) | `PhoneNumber` record with joined `agent`, `deployment`, `tenant` | `PhoneNumberService`: queries `phone_numbers` table WHERE `phone_number = :phone`. | `400` missing query param; `404` number not registered. |
| `POST` | `/api/internal/phone-numbers` | Worker Secret | Body `tenantId` | `{ tenantId: UUID, agentId?, deploymentId?, phoneNumber, provider?, status? }` | `PhoneNumber` entity | `PhoneNumberService`: verifies tenant ownership of referenced entities; inserts into `phone_numbers`. | `400` invalid input or duplicate phone number. |

---

## 2. Admin Agent Studio APIs (`apps/api/src/routes/agents.ts`)

All admin routes require JWT Authentication with role `ADMIN`.

| Method | Path | Input Payload / Params | Output Payload | Backend Service & DB Effect | Error Behavior |
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
| `GET` | `/api/admin/clients/:clientId/agents/:agentId/runtime-config` | `clientId`, `agentId` | `RuntimeAgentConfig` | **DEPRECATED**: Legacy unversioned endpoint. V3 workers use `/api/internal/runtime-config/:deploymentId`. | `404` agent not found. |

---

## 3. Client Portal CRM APIs (`apps/api/src/routes/client.ts`)

All routes require JWT Authentication with role `CLIENT_OWNER`, `CLIENT_VIEWER`, or `ADMIN`. Scoped strictly to authenticated user's `tenantId`.

| Method | Path | Role Required | Input Params | Output Payload | Backend Service & DB Effect | Error Behavior |
|---|---|---|---|---|---|---|
| `GET` | `/api/client/profile` | Any authenticated | None | `{ tenant, user, subscription }` | Queries `tenants` joined with `users` and `subscriptions`. | `403` no tenant context; `404` tenant not found. |
| `PUT` | `/api/client/profile` | `CLIENT_OWNER` / `ADMIN` | `{ businessName: string }` | `{ message: string }` | Updates `tenants.name`. | `403` read-only role rejected. |
| `GET` | `/api/client/calls` | Any authenticated | Query: `limit`, `offset`, `agentId`, `status` | `{ calls: CallSession[], total, limit, offset }` | `CallSessionService`: queries `call_sessions` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/calls/:id` | Any authenticated | `id` (UUID param) | `CallSession` entity with joined `agent`, `leads`, `appointments` | `CallSessionService`: queries call session by ID and `tenantId`. | `404` call session not found. |
| `GET` | `/api/client/leads` | Any authenticated | Query: `limit`, `offset`, `agentId`, `status` | `{ leads: Lead[], total, limit, offset }` | `LeadService`: queries `leads` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/leads/:id` | Any authenticated | `id` (UUID param) | `Lead` entity with joined `agent`, `callSession` | `LeadService`: queries lead by ID and `tenantId`. | `404` lead not found. |
| `PATCH`| `/api/client/leads/:id` | `CLIENT_OWNER` / `ADMIN` | `{ customerName?, customerPhone?, customerEmail?, interestCategory?, status?, notes?, metadata? }` | Updated `Lead` entity | `LeadService`: updates `leads` row. | `403` read-only role rejected; `404` lead not found. |
| `GET` | `/api/client/appointments` | Any authenticated | Query: `limit`, `offset`, `agentId`, `status`, `bookingDate` | `{ appointments: Appointment[], total, limit, offset }` | `AppointmentService`: queries `appointments` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/appointments/:id` | Any authenticated | `id` (UUID param) | `Appointment` entity with joined `agent`, `callSession` | `AppointmentService`: queries appointment by ID and `tenantId`. | `404` appointment not found. |
| `PATCH`| `/api/client/appointments/:id` | `CLIENT_OWNER` / `ADMIN` | `{ customerName?, customerPhone?, title?, resourceName?, bookingDate?, bookingTime?, status?, notes?, metadata? }` | Updated `Appointment` entity | `AppointmentService`: updates `appointments` row. | `403` read-only role rejected; `404` appointment not found. |
| `GET` | `/api/client/phone-numbers` | Any authenticated | None | `{ phoneNumbers: PhoneNumber[] }` | `PhoneNumberService`: queries `phone_numbers` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/agents` | Any authenticated | None | `{ agents: Agent[] }` | Queries `agents` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/follow-ups` | Any authenticated | Query: `limit`, `offset`, `status`, `channel`, `customerPhone` | `{ followUps: FollowUp[], total, limit, offset }` | `FollowUpService`: queries `follow_ups` filtered by `tenantId`. | `403` no tenant context. |
| `GET` | `/api/client/follow-ups/:id` | Any authenticated | `id` (UUID param) | `FollowUp` entity with joined `lead`, `appointment`, `callSession` | `FollowUpService`: queries follow-up by ID and `tenantId`. | `404` follow-up not found. |
| `POST` | `/api/client/follow-ups/send-whatsapp` | `CLIENT_OWNER` / `ADMIN` | `{ leadId?, appointmentId?, callSessionId?, customerName?, customerPhone: string, message: string, messageType?, provider? }` | `SendWhatsAppResponse` | `WhatsAppService`: verifies entity tenant ownership, dispatches via provider (`DEMO`/`META`/`TWILIO`), logs in `follow_ups`. | `403` read-only role rejected; `400` entity tenant mismatch. |
| `GET` | `/api/client/analytics/overview` | Any authenticated | None | `AnalyticsOverview` DTO | `AnalyticsService`: aggregates call totals, outcomes, 7-day trend, lead funnel, appointment statuses, languages, and latencies. | `403` no tenant context. |

---

## 4. Async Infrastructure & Queue Audit

> [!NOTE]
> **AUDIT CONCLUSION: THE VOICE RUNTIME CONTAINS ZERO ASYNC QUEUE DEPENDENCIES.**

1. **Redis Client (`apps/api/src/db/redis.ts`)**:
   - Initialized via `ioredis 5.3.2`.
   - Used strictly by `/api/health` for connection ping status (`await redis.ping()`).
   - **No message queues, BullMQ workers, or Celery tasks exist in the codebase.**
2. **Knowledge Ingestion**: Synchronous HTTP processing. Uploading files (`POST /api/admin/knowledge/upload`) executes chunking, embedding generation, and DB insertion within the HTTP request.
3. **Telephony & Realtime Streaming**: Persistent bidirectional WebSockets (Plivo / WebRTC) process frames synchronously.
4. **CRM Persistence**: Worker issues synchronous HTTP REST calls (`/api/internal/*`) upon tool execution and session finalization.
