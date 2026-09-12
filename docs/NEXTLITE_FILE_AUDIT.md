# NextLite Voice V3 — Exhaustive File-by-File Audit

> **Audit Type**: Complete Dependency Graph & Runtime Reachability Analysis  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Control Plane & Backend Core (`apps/api`)

### 1.1 Server & Entry Points

#### `apps/api/src/index.ts`
- **Language**: TypeScript (`Node.js`)
- **Purpose**: Main HTTP server entry point. Configures middleware (CORS, Helmet, CookieParser, RequestLogger, CorrelationId), mounts all API route handlers, and starts Express listener on `PORT` (default `3001`).
- **Imported By**: `package.json` scripts (`npm run dev`, `npm run start`).
- **Imports**: `express`, `cors`, `helmet`, `cookie-parser`, `./config/env`, middleware modules, route modules (`health`, `auth`, `admin`, `agents`, `knowledge`, `test-conversation`, `config-assistant`, `client`, `internal`), `./lib/logger`.
- **Exports**: `app` (default export for Supertest / Vitest test harnesses).
- **Runtime Used By**: Production REST API server.
- **Dependencies**: Express, Node HTTP.
- **Configuration Consumed**: `env.PORT`, `env.CORS_ORIGIN`, `env.NODE_ENV`.
- **Classification**: **Authoritative** (API Server Bootstrap).
- **Runtime Reachability**: Production Runtime (Entry Point).
- **Security Implications**: Sets global HTTP headers and correlation ID tracking; bypasses ngrok browser interposer header for automated testing.

#### `apps/api/src/config/env.ts`
- **Language**: TypeScript
- **Purpose**: Validates all process environment variables at startup using a strict Zod schema. Exits process immediately with error diagnostics if mandatory variables are missing.
- **Imported By**: `src/index.ts`, `src/db/index.ts`, `src/db/redis.ts`, `src/services/livekit.ts`, `src/middleware/workerAuth.ts`, `src/lib/tokens.ts`, `src/lib/logger.ts`, `src/services/embedding.ts`, `src/services/storage.ts`.
- **Imports**: `zod`, `dotenv`.
- **Exports**: `env`, `type Env`.
- **Configuration Consumed**: `process.env`.
- **Configuration Produced**: Strongly typed, validated `env` object. Normalizes `WORKER_API_SECRET` and `LIVEKIT_WORKER_SECRET`.
- **Classification**: **Authoritative** (Environment Configuration Source of Truth).
- **Runtime Reachability**: Production Runtime (Module Initialization).
- **Security Implications**: Protects credentials; ensures secrets meet minimum length constraints (e.g., `JWT_SECRET` min 32 characters).

---

### 1.2 Database & Storage Layer

#### `apps/api/src/db/schema.ts`
- **Language**: TypeScript (`Drizzle ORM`)
- **Purpose**: Definitive PostgreSQL schema definition for the entire platform. Defines 15 relational tables, 8 pgEnums, indices, unique constraints, and Drizzle relations.
- **Imported By**: `src/db/index.ts`, `src/services/*`, `src/routes/*`.
- **Exports**: Table definitions (`tenants`, `users`, `refreshTokens`, `auditLogs`, `verificationTokens`, `subscriptions`, `agentTemplates`, `agents`, `agentVersions`, `deployments`, `agentTools`, `knowledgeSources`, `knowledgeChunks`, `configChangeProposals`, `callSessions`, `leads`, `appointments`, `tenantAppointmentCounters`, `phoneNumbers`, `followUps`), relations, enums, TypeScript inferred types (`Tenant`, `Agent`, `AgentVersion`, `Deployment`, `CallSession`, `Lead`, `Appointment`, etc.).
- **Classification**: **Authoritative** (Relational Data Model Source of Truth).
- **Runtime Reachability**: Production Runtime.
- **Security Implications**: Enforces referential integrity and foreign keys cascading to prevent orphan tenant records.

#### `apps/api/src/db/index.ts`
- **Language**: TypeScript
- **Purpose**: Creates the PostgreSQL connection pool using `postgres` client and binds Drizzle ORM to `schema.ts`.
- **Imported By**: All backend services (`agent.ts`, `runtimeAgentConfig.ts`, `appointment.ts`, `lead.ts`, `callSession.ts`, `knowledge.ts`, `phoneNumber.ts`, `whatsapp.ts`, `followUp.ts`, `analytics.ts`, `admin.ts`, `auth.ts`).
- **Exports**: `db` (Drizzle Database instance).
- **Classification**: **Authoritative** (Database Connection).
- **Runtime Reachability**: Production Runtime.

#### `apps/api/src/db/redis.ts`
- **Language**: TypeScript
- **Purpose**: Instantiates `ioredis` client for Redis connectivity with retry strategies.
- **Imported By**: `src/routes/health.ts`.
- **Exports**: `redis`, `closeRedis()`.
- **Classification**: **Infrastructure / Peripheral** (Currently used solely for liveness health checks; no active queue/job dependencies).
- **Runtime Reachability**: Production Runtime (Health Check).

---

### 1.3 Core Configuration & Prompt Compilation Services

#### `apps/api/src/services/runtimeAgentConfig.ts`
- **Language**: TypeScript
- **Purpose**: Resolves the canonical `RuntimeAgentConfig` DTO for a given deployment ID. Performs tenant/agent/version consistency validation and triggers prompt compilation.
- **Imported By**: `src/routes/internal.ts`.
- **Imports**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`, `./promptCompiler`, `./template`, `@nextlite/shared`, `../errors/runtimeConfigError`.
- **Exports**: `RuntimeAgentConfigService`, `runtimeAgentConfigService`, `buildRuntimeAgentConfig()`, `RuntimeConfigError`.
- **Consumed**: `deployments` table row, `agent_versions.configuration` JSONB, `agents` row, `tenants` row.
- **Produced**: `RuntimeAgentConfig` DTO conforming to `@nextlite/shared`.
- **Classification**: **Authoritative** (Runtime Configuration Resolution Engine).
- **Runtime Reachability**: Production Runtime (`GET /api/internal/runtime-config/:deploymentId`).
- **Security Implications**: Validates that deployment is active, agent is not archived/paused, and agent tenant matches deployment tenant.

#### `apps/api/src/services/promptCompiler.ts`
- **Language**: TypeScript
- **Purpose**: Compiles Layer B customer configuration into a single coherent system prompt string, bounded by Layer A Core Safety & Turn-Taking Rules.
- **Imported By**: `src/services/runtimeAgentConfig.ts`, `src/services/agent.ts`, `src/routes/agents.ts`.
- **Imports**: `../lib/logger`, `./template`, `./voiceRegistry`.
- **Exports**: `PromptCompilerService`, `promptCompiler`, `CompilePromptParams`.
- **Consumed**: `AgentConfiguration` JSONB.
- **Produced**: `compiledSystemPrompt` (String).
- **Classification**: **Authoritative** (Prompt Compilation Engine).
- **Runtime Reachability**: Production Runtime.
- **Security Implications**: Injects non-negotiable prompt guardrails: max 1–2 sentences, single question per turn, anti-self-talk, latest intent priority, non-UUID display reference rules (`A-001`), and caller ID handling.

#### `apps/api/src/services/agent.ts`
- **Language**: TypeScript
- **Purpose**: Manages Agent lifecycle, version snapshots (`saveConfiguration`), publishing to production deployments (`publishAgent`), and draft test deployment updates.
- **Imported By**: `src/routes/agents.ts`, `src/routes/client.ts`, `src/services/livekit.ts`.
- **Imports**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`, `./template`, `./agentChecklist`.
- **Exports**: `AgentService`, `agentService`.
- **Classification**: **Authoritative** (Agent & Deployment Lifecycle Controller).
- **Runtime Reachability**: Production Runtime.

#### `apps/api/src/services/template.ts`
- **Language**: TypeScript
- **Purpose**: Stores system agent templates, defines `AgentConfiguration` interface, and enforces configuration schema validations (`validateTemplateConfiguration`).
- **Imported By**: `src/services/agent.ts`, `src/services/runtimeAgentConfig.ts`, `src/services/promptCompiler.ts`, `src/services/toolCatalog.ts`, `src/routes/agents.ts`.
- **Exports**: `TemplateService`, `templateService`, `AgentConfiguration`, `validateTemplateConfiguration`, `KNOWN_PLATFORM_TOOL_IDS`, `KnownPlatformToolId`.
- **Classification**: **Authoritative** (Template Definitions & Types).
- **Runtime Reachability**: Production Runtime.

---

### 1.4 Business Logic & CRM Services

#### `apps/api/src/services/appointment.ts`
- **Language**: TypeScript
- **Purpose**: Manages business appointments, tenant isolation verification, and concurrency-safe sequential appointment numbering (`A-001`) via `tenant_appointment_counters`.
- **Imported By**: `src/routes/internal.ts`, `src/routes/client.ts`, `src/services/index.ts`.
- **Exports**: `AppointmentService`, `appointmentService`.
- **Classification**: **Authoritative** (Appointment Domain Logic).
- **Runtime Reachability**: Production Runtime (`POST /api/internal/appointments`, `GET/PATCH /api/client/appointments`).

#### `apps/api/src/services/lead.ts`
- **Language**: TypeScript
- **Purpose**: Manages lead persistence, tenant boundary verification, and status transitions (`NEW`, `CONTACTED`, `QUALIFIED`, `CLOSED`).
- **Imported By**: `src/routes/internal.ts`, `src/routes/client.ts`, `src/services/index.ts`.
- **Exports**: `LeadService`, `leadService`.
- **Classification**: **Authoritative** (Lead Domain Logic).
- **Runtime Reachability**: Production Runtime (`POST /api/internal/leads`, `GET/PATCH /api/client/leads`).

#### `apps/api/src/services/callSession.ts`
- **Language**: TypeScript
- **Purpose**: Persists call session states (`ACTIVE`, `COMPLETED`, `FAILED`, `MISSED`), durations, caller numbers, transcripts, turns JSON, and latency metrics.
- **Imported By**: `src/routes/internal.ts`, `src/routes/client.ts`, `src/services/index.ts`.
- **Exports**: `CallSessionService`, `callSessionService`.
- **Classification**: **Authoritative** (Call Session Persistence).
- **Runtime Reachability**: Production Runtime (`POST/PATCH /api/internal/call-sessions`, `GET /api/client/calls`).

#### `apps/api/src/services/knowledge.ts`
- **Language**: TypeScript
- **Purpose**: Document ingestion, SHA-256 deduplication, storage upload, chunking, embedding generation, and cosine similarity vector retrieval.
- **Imported By**: `src/routes/internal.ts`, `src/routes/knowledge.ts`, `src/services/index.ts`.
- **Exports**: `KnowledgeService`, `KnowledgeServiceImpl`, `createKnowledgeService`, `getKnowledgeService()`.
- **Classification**: **Authoritative** (RAG Ingestion & Vector Retrieval).
- **Runtime Reachability**: Production Runtime (`POST /api/internal/knowledge/retrieve`, `/api/admin/knowledge/*`).

#### `apps/api/src/services/embedding.ts`
- **Language**: TypeScript
- **Purpose**: Adapts vector embedding generation using Nvidia API (`nvidia/nemotron-3-embed-1b`) or Google Gemini (`gemini-embedding-001`).
- **Imported By**: `src/services/knowledge.ts`.
- **Exports**: `EmbeddingService`, `NvidiaEmbeddingAdapter`, `GeminiEmbeddingAdapter`, `createEmbeddingService()`.
- **Classification**: **Authoritative** (Embedding Provider Client).
- **Runtime Reachability**: Production Runtime.

#### `apps/api/src/services/phoneNumber.ts`
- **Language**: TypeScript
- **Purpose**: Manages phone number inventory, reverse lookup for inbound telephony routing, and tenant assignment.
- **Imported By**: `src/routes/internal.ts`, `src/routes/client.ts`, `src/services/index.ts`.
- **Exports**: `PhoneNumberService`, `phoneNumberService`.
- **Classification**: **Authoritative** (Phone Number Registry).
- **Runtime Reachability**: Production Runtime (`GET /api/internal/phone-numbers/lookup`, `GET /api/client/phone-numbers`).

#### `apps/api/src/services/whatsapp.ts`
- **Language**: TypeScript
- **Purpose**: Multi-provider WhatsApp messaging dispatcher (`DEMO`, `META`, `TWILIO`) creating logged records in `follow_ups`.
- **Imported By**: `src/routes/client.ts`, `src/services/index.ts`.
- **Exports**: `WhatsAppService`, `whatsAppService`, `DemoWhatsAppProvider`.
- **Classification**: **Authoritative** (Follow-up Messaging Engine).
- **Runtime Reachability**: Production Runtime (`POST /api/client/follow-ups/send-whatsapp`).

#### `apps/api/src/services/analytics.ts`
- **Language**: TypeScript
- **Purpose**: Aggregates tenant-scoped analytics for calls, connected rates, durations, outcomes, lead funnels, appointment statuses, languages, tool executions, and turn/STT/LLM/TTS latencies.
- **Imported By**: `src/routes/client.ts`, `src/services/index.ts`.
- **Exports**: `AnalyticsService`, `analyticsService`.
- **Classification**: **Authoritative** (CRM Analytics Aggregator).
- **Runtime Reachability**: Production Runtime (`GET /api/client/analytics/overview`).

#### `apps/api/src/services/toolCatalog.ts`
- **Language**: TypeScript
- **Purpose**: Authoritative admin discovery catalog defining metadata and parameters for platform tools (`query_knowledge_base`, `create_callback_lead`, `book_appointment`).
- **Imported By**: `src/routes/agents.ts`.
- **Exports**: `PLATFORM_TOOL_CATALOG`, `getPlatformToolCatalog()`, `validateCatalogAlignment()`.
- **Classification**: **Authoritative Discovery** (Admin Tool Catalog).
- **Runtime Reachability**: Production Runtime (`GET /api/admin/tools`).

#### `apps/api/src/services/livekit.ts`
- **Language**: TypeScript
- **Purpose**: Generates browser test tokens, creates LiveKit test rooms with deployment metadata, dispatches workers, and triggers outbound SIP phone tests via LiveKit SIP trunk.
- **Imported By**: `src/routes/agents.ts`.
- **Exports**: `LiveKitService`, `livekitService`, `isValidE164()`.
- **Classification**: **Authoritative (LiveKit Control Plane Integration)**.
- **Runtime Reachability**: Production Runtime (Browser/SIP Testing).

---

### 1.5 Internal & Public API Routes

#### `apps/api/src/routes/internal.ts`
- **Language**: TypeScript
- **Purpose**: Internal control-plane API dedicated strictly to voice workers (LiveKit / Pipecat). Protected by `authenticateWorkerSecret`.
- **Endpoints**:
  - `GET /api/internal/runtime-config/:deploymentId`: Returns `RuntimeAgentConfig`.
  - `POST /api/internal/knowledge/retrieve`: Tenant/Agent-scoped vector search.
  - `POST /api/internal/call-sessions`: Creates ACTIVE call session.
  - `PATCH /api/internal/call-sessions/:id`: Updates completed/failed call session.
  - `POST /api/internal/leads`: Ingests lead with deployment-derived tenant isolation.
  - `POST /api/internal/appointments`: Ingests appointment with deployment-derived tenant isolation.
  - `GET /api/internal/phone-numbers/lookup`: Resolves tenant/deployment for inbound caller number.
  - `POST /api/internal/phone-numbers`: Registers phone numbers.
- **Classification**: **Authoritative Worker Boundary**.
- **Runtime Reachability**: Production Runtime (Worker Communication).

#### `apps/api/src/routes/agents.ts`
- **Language**: TypeScript
- **Purpose**: Admin routes for agent creation, configuration editing, prompt compilation preview, checklist verification, publication, web test token generation, and phone test calls.
- **Classification**: **Authoritative Admin API**.
- **Runtime Reachability**: Production Runtime (`/api/admin/*`).

#### `apps/api/src/routes/client.ts`
- **Language**: TypeScript
- **Purpose**: Client portal endpoints for calls, leads, appointments, phone numbers, follow-ups, WhatsApp messaging, and analytics.
- **Classification**: **Authoritative Client Portal API**.
- **Runtime Reachability**: Production Runtime (`/api/client/*`).

---

## 2. LiveKit Realtime Voice Worker (`apps/livekit-worker`)

### `apps/livekit-worker/src/main.ts`
- **Language**: TypeScript (`Node.js`)
- **Purpose**: Worker process entry point. Connects to LiveKit server, listens for room jobs, extracts `deploymentId`, fetches `RuntimeAgentConfig`, creates active call session, wires Sarvam STT/TTS, listens for transcription/language/turn/tool/speech events, tracks timing, and finalizes call session on disconnect.
- **Classification**: **Active Production Worker Runtime**.
- **Runtime Reachability**: Production Runtime (LiveKit Execution Engine).

### `apps/livekit-worker/src/agent.ts`
- **Language**: TypeScript
- **Purpose**: Instantiates LiveKit Agent with compiled system prompt, active language instruction, LLM adapter (`SarvamLLM` or `inference.LLM`), and tools resolved from `ToolRegistry`.
- **Classification**: **Active Production Agent Builder**.
- **Runtime Reachability**: Production Runtime.

### `apps/livekit-worker/src/languageManager.ts`
- **Language**: TypeScript
- **Purpose**: `ConversationLanguageManager` controlling multilingual state, 12 Indic regex rules, Indic script filters, and Latin Hinglish/Minglish marker protections.
- **Classification**: **Authoritative Voice Multilingual Logic**.
- **Runtime Reachability**: Production Runtime.

### `apps/livekit-worker/src/runtimeConfigClient.ts`
- **Language**: TypeScript
- **Purpose**: HTTP client wrapper communicating with NextLite Control Plane (`/api/internal/*`) using `LIVEKIT_WORKER_SECRET`.
- **Classification**: **Authoritative Worker API Client**.
- **Runtime Reachability**: Production Runtime.

### `apps/livekit-worker/src/tools/toolRegistry.ts`
- **Language**: TypeScript
- **Purpose**: Resolves tool definitions in `RuntimeAgentConfig.tools` to native LiveKit tools (`query_knowledge_base`, `create_callback_lead`, `book_appointment`).
- **Classification**: **Authoritative Tool Factory Registry**.
- **Runtime Reachability**: Production Runtime.

### `apps/livekit-worker/src/tools/appointmentTool.ts`
- **Language**: TypeScript
- **Purpose**: Executes `book_appointment` by calling `POST /api/internal/appointments` with trusted context (`deploymentId`, `callSessionId`, `callerPhone`). Returns customer-facing reference `A-001`.
- **Classification**: **Authoritative Appointment Tool Execution**.
- **Runtime Reachability**: Production Runtime.

### `apps/livekit-worker/src/tools/leadTool.ts`
- **Language**: TypeScript
- **Purpose**: Executes `create_callback_lead` by calling `POST /api/internal/leads` with trusted context.
- **Classification**: **Authoritative Lead Tool Execution**.
- **Runtime Reachability**: Production Runtime.

### `apps/livekit-worker/src/knowledgeTool.ts`
- **Language**: TypeScript
- **Purpose**: Executes `query_knowledge_base` by calling `POST /api/internal/knowledge/retrieve`.
- **Classification**: **Authoritative Knowledge Tool Execution**.
- **Runtime Reachability**: Production Runtime.

---

## 3. Pipecat Telephony Worker (`apps/pipecat-worker`)

### `apps/pipecat-worker/app/main.py`
- **Language**: Python (`FastAPI`)
- **Purpose**: Implements bidirectional telephony audio pipeline over Plivo WebSocket (`/ws/plivo`) using `PlivoFrameSerializer` (8kHz μ-law), `SarvamSTTService` (`saaras:v3`), `LLMContextAggregatorPair`, `SarvamLLMService` (`sarvam-105b`), `SarvamTTSService` (`bulbul:v3`), and `RealtimeStreamingTimingMonitor`.
- **Classification**: **Active Migration Candidate (Phase 4 Verified)**.
- **Runtime Reachability**: Telephony Endpoint (`/ws/plivo`).

### `apps/pipecat-worker/app/config.py`
- **Language**: Python (`pydantic-settings`)
- **Purpose**: Loads environment configuration (`SARVAM_API_KEY`, `STT_MODEL`, `TTS_MODEL`, `LLM_MODEL`, `PHASE2_TEST_VOICE_ID`, `PLIVO_*`).
- **Classification**: **Authoritative Infrastructure Config for Pipecat**.
- **Runtime Reachability**: Pipecat Worker Runtime.

---

## 4. Shared Contracts (`packages/shared`)

### `packages/shared/src/runtimeConfig.ts`
- **Language**: TypeScript
- **Purpose**: Defines `RuntimeAgentConfig` interface, `CANONICAL_PLATFORM_TOOLS`, `normalizeToolId()`, and `getUserSafeDisplayId()`.
- **Classification**: **Authoritative DTO & Contract Source of Truth**.
- **Runtime Reachability**: Production Runtime (Control Plane, Worker, Frontend).

### `packages/shared/src/types.ts`
- **Language**: TypeScript
- **Purpose**: Defines core platform entities (`CallSession`, `Lead`, `Appointment`, `PhoneNumber`, `FollowUp`, `AnalyticsOverview`, `ApiResponse`).
- **Classification**: **Authoritative Data Types**.
- **Runtime Reachability**: Production Runtime.
