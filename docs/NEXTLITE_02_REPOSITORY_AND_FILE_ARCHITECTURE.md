# NextLite Voice V3 — Repository & File Architecture
## Document 02: Exhaustive Codebase Map, Dependency Graph & File Audit

> **Document Type**: Codebase Map & File-by-File Dependency Audit  
> **Status**: Verified from Implementation (Read-Only)  
> **Repository Root**: `e:\NextLite\nextlite-voice-engineering-spec`  
> **Active Branch**: `pipecat-migration`  
> **Timestamp**: 2026-09-09  

---

## 1. Top-Level Repository Structure

```
e:\NextLite\nextlite-voice-engineering-spec\
├── apps/
│   ├── api/                 # Control Plane Backend REST API (Node.js 24 + Express + Drizzle ORM)
│   ├── livekit-worker/      # Existing Realtime Voice Worker (Node.js 24 + LiveKit Agents + Sarvam)
│   ├── pipecat-worker/      # Target Realtime Voice Pipeline (Python 3.14 + FastAPI + Pipecat 1.8.1)
│   └── web/                 # Frontend Web Application (React 18 + Vite + TailwindCSS)
├── packages/
│   └── shared/              # Cross-Workspace Shared TypeScript Contracts & DTOs
├── docs/                    # Architecture Specs, Technical Blueprints & Master Audits
├── knowledge_base/          # Default Demo Markdown Knowledge Base Documents
├── package.json             # Root Monorepo NPM Workspace Definition
├── pnpm-lock.yaml           # Monorepo Lockfile
└── package-lock.json        # NPM Lockfile
```

---

## 2. Module & Directory Architecture

### 2.1 `apps/api` — Control Plane Backend REST API
- **Purpose**: Central administrative control plane, user authentication, tenant management, agent versioning, prompt compilation, RAG knowledge ingestion/indexing/retrieval, CRM persistence (calls, leads, appointments, follow-ups), telemetry analytics, and internal worker APIs.
- **Runtime**: Node.js `>=24.0.0`, TypeScript `5.3.2`, Express `4.18.2`.
- **Owner / Responsibility**: Backend Engineering / Control Plane Security.
- **Dependencies**: PostgreSQL (`postgres`, `drizzle-orm`), Redis (`ioredis`), AWS S3 / Backblaze B2 (`@aws-sdk/client-s3`), JWT (`jsonwebtoken`), Zod (`zod`), Resend (`resend`), LiveKit Server SDK (`livekit-server-sdk`), Pino (`pino`).
- **Environment Context**: Production runtime.
- **Key Subdirectories**:
  - `src/config/`: Environment variable schema validation (`env.ts`).
  - `src/db/`: Relational schema definitions (`schema.ts`), PostgreSQL connection pool (`index.ts`), Redis connection (`redis.ts`).
  - `src/routes/`: Route controllers (`internal.ts`, `agents.ts`, `client.ts`, `admin.ts`, `auth.ts`, `health.ts`, `knowledge.ts`, `test-conversation.ts`, `config-assistant.ts`).
  - `src/services/`: Core business logic (`runtimeAgentConfig.ts`, `promptCompiler.ts`, `agent.ts`, `template.ts`, `appointment.ts`, `lead.ts`, `callSession.ts`, `knowledge.ts`, `embedding.ts`, `phoneNumber.ts`, `livekit.ts`, `whatsapp.ts`, `followUp.ts`, `analytics.ts`, `toolCatalog.ts`, `voiceRegistry.ts`, `agentChecklist.ts`, `storage.ts`).
  - `src/middleware/`: Security and validation (`auth.ts`, `workerAuth.ts`, `validate.ts`, `correlationId.ts`, `errorHandler.ts`).
  - `drizzle/`: PostgreSQL migration files (`0000` through `0006`).
  - `src/__tests__/`: Comprehensive Vitest integration test suite (23 test files).

### 2.2 `apps/livekit-worker` — LiveKit Realtime Voice Worker
- **Purpose**: Current production realtime voice engine handling audio streams via LiveKit WebRTC / SIP Gateway, Sarvam Saaras v3 STT, Sarvam-105B LLM / LiveKit Gateway inference, Sarvam Bulbul v3 TTS, dynamic multilingual switching, temporal/calendar context injection, and native tool execution.
- **Runtime**: Node.js `>=24.0.0`, TypeScript `5.9.3`, `@livekit/agents 1.6.3`.
- **Owner / Responsibility**: Realtime Voice Platform Team.
- **Dependencies**: `@livekit/agents`, `@livekit/agents-plugin-sarvam`, `@livekit/plugins-ai-coustics`, `@livekit/rtc-node`, `zod`, `dotenv`.
- **Environment Context**: Production runtime (Active Behavioral Reference).
- **Key Files**:
  - `src/main.ts`: Worker entry point (`defineAgent`), room job listener, config resolution, audio pipeline setup, session finalizer.
  - `src/agent.ts`: LiveKit Agent builder (`createAgent`), fallback prompt, tool resolution.
  - `src/runtimeConfigClient.ts`: Control plane HTTP client calling `/api/internal/*`.
  - `src/languageManager.ts`: `ConversationLanguageManager` controlling multilingual state and 12 Indic regex rules.
  - `src/temporalContext.ts` & `src/calendarContext.ts`: Dynamic temporal and 7-day relative calendar context builders.
  - `src/sarvamLlm.ts`: Custom LiveKit LLM adapter for Sarvam-105B conversational REST API.
  - `src/tools/`: Tool registry and native tool implementations (`appointmentTool.ts`, `leadTool.ts`, `knowledgeTool.ts`).

### 2.3 `apps/pipecat-worker` — Pipecat Telephony Voice Engine
- **Purpose**: Target realtime voice worker executing bidirectional telephony streams directly over Plivo WebSockets using the official Pipecat AI framework, Sarvam STT, Sarvam LLM, and Sarvam TTS.
- **Runtime**: Python `3.14.3`, FastAPI `0.115.x`, `pipecat-ai 1.8.1`, `sarvamai 0.1.28`.
- **Owner / Responsibility**: Realtime Voice Platform Team (Phases 1–5 complete).
- **Dependencies**: `pipecat-ai[websocket,sarvam]`, `fastapi`, `uvicorn`, `pydantic-settings`, `loguru`, `pytest`.
- **Environment Context**: Migration Candidate (Verified through Phase 5).
- **Key Files**:
  - `app/main.py`: FastAPI server with `/health`, `/plivo/test-xml`, and `/ws/plivo` executing native Pipecat `Pipeline`, `PlivoFrameSerializer` (8kHz μ-law), `SarvamSTTService`, `LLMContextAggregatorPair`, `SarvamLLMService`, `SarvamTTSService`, and `RealtimeStreamingTimingMonitor`.
  - `app/config.py`: Pydantic settings loading `SARVAM_API_KEY`, models, and test defaults.
  - `tests/`: Pytest test suite (27 passing tests across 4 suites).
  - `LIVEKIT_TO_PIPECAT_BEHAVIOR_PARITY_MATRIX.md`: Phase 5 parity audit matrix.

### 2.4 `apps/web` — Admin & Client Web Application
- **Purpose**: Single-page application providing Admin Agent Studio, Template configuration, Knowledge base management, Live Web/Phone Voice Testing, and Client CRM Dashboard.
- **Runtime**: React `18.2.0`, Vite `5.0.10`, TypeScript `5.3.2`, TailwindCSS `3.4.0`.
- **Owner / Responsibility**: Frontend Engineering.
- **Dependencies**: `react`, `react-dom`, `react-router-dom`, `livekit-client`, `tailwindcss`.
- **Environment Context**: Production frontend.

### 2.5 `packages/shared` — Shared TypeScript Contracts
- **Purpose**: Monorepo shared library providing strictly typed contracts, interfaces, and utilities shared between `apps/api`, `apps/web`, and `apps/livekit-worker`.
- **Runtime**: TypeScript `5.3.2` (ES Module).
- **Owner / Responsibility**: Architecture / Core Platform.
- **Key Files**:
  - `src/runtimeConfig.ts`: Definitive `RuntimeAgentConfig` interface and schemas, `CANONICAL_PLATFORM_TOOLS`, `normalizeToolId()`, `getUserSafeDisplayId()`.
  - `src/types.ts`: Persistence DTOs (`CallSession`, `Lead`, `Appointment`, `PhoneNumber`, `FollowUp`, `AnalyticsOverview`, `ApiResponse`).

---

## 3. Exhaustive File-by-File Audit & Dependency Analysis

### 3.1 Control Plane Backend (`apps/api`)

#### `apps/api/src/index.ts`
- **PATH**: `apps/api/src/index.ts`
- **PURPOSE**: Main HTTP server entry point. Configures middleware (CORS, Helmet, CookieParser, RequestLogger, CorrelationId), mounts all API route handlers, and starts Express listener on `PORT` (default `3001`).
- **IMPORTS**: `express`, `cors`, `helmet`, `cookie-parser`, `./config/env`, middleware modules, route modules (`health`, `auth`, `admin`, `agents`, `knowledge`, `test-conversation`, `config-assistant`, `client`, `internal`), `./lib/logger`.
- **CONSUMERS**: `package.json` scripts (`npm run dev`, `npm run start`), Supertest test harnesses.
- **RESPONSIBILITY**: Application bootstrap, global error boundary, HTTP server initialization.
- **RUNTIME STATUS**: **Authoritative Production Entry Point**.

#### `apps/api/src/config/env.ts`
- **PATH**: `apps/api/src/config/env.ts`
- **PURPOSE**: Validates all process environment variables at startup using a strict Zod schema. Exits process immediately with error diagnostics if mandatory variables are missing.
- **IMPORTS**: `zod`, `dotenv`.
- **CONSUMERS**: `src/index.ts`, `src/db/index.ts`, `src/db/redis.ts`, `src/services/livekit.ts`, `src/middleware/workerAuth.ts`, `src/lib/tokens.ts`, `src/lib/logger.ts`, `src/services/embedding.ts`, `src/services/storage.ts`.
- **RESPONSIBILITY**: Environment configuration validation and normalization (e.g. `WORKER_API_SECRET` and `LIVEKIT_WORKER_SECRET`).
- **RUNTIME STATUS**: **Authoritative Configuration Source**.

#### `apps/api/src/db/schema.ts`
- **PATH**: `apps/api/src/db/schema.ts`
- **PURPOSE**: Definitive PostgreSQL schema definition for the entire platform. Defines 15 relational tables, 8 pgEnums, indices, unique constraints, and Drizzle relations.
- **IMPORTS**: `drizzle-orm/pg-core`, `drizzle-orm`.
- **CONSUMERS**: `src/db/index.ts`, all backend services, all route controllers.
- **RESPONSIBILITY**: Data modeling, relational integrity, table definitions.
- **RUNTIME STATUS**: **Authoritative Relational Schema**.

#### `apps/api/src/db/index.ts`
- **PATH**: `apps/api/src/db/index.ts`
- **PURPOSE**: Creates PostgreSQL connection pool using `postgres` client and binds Drizzle ORM to `schema.ts`.
- **IMPORTS**: `postgres`, `drizzle-orm/postgres-js`, `./schema`, `../config/env`.
- **CONSUMERS**: All backend services.
- **RESPONSIBILITY**: Database connection pooling and query execution.
- **RUNTIME STATUS**: **Authoritative Database Connection**.

#### `apps/api/src/db/redis.ts`
- **PATH**: `apps/api/src/db/redis.ts`
- **PURPOSE**: Instantiates `ioredis` client for Redis connectivity with retry strategies.
- **IMPORTS**: `ioredis`, `../config/env`, `../lib/logger`.
- **CONSUMERS**: `src/routes/health.ts`.
- **RESPONSIBILITY**: Redis client lifecycle; currently utilized solely for health check pings.
- **RUNTIME STATUS**: **Peripheral Infrastructure (Health Check Only)**.

#### `apps/api/src/services/runtimeAgentConfig.ts`
- **PATH**: `apps/api/src/services/runtimeAgentConfig.ts`
- **PURPOSE**: Resolves the canonical `RuntimeAgentConfig` DTO for a given deployment ID. Performs tenant/agent/version consistency validation and triggers prompt compilation.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`, `./promptCompiler`, `./template`, `@nextlite/shared`, `../errors/runtimeConfigError`.
- **CONSUMERS**: `src/routes/internal.ts` (`GET /api/internal/runtime-config/:deploymentId`).
- **RESPONSIBILITY**: Runtime configuration resolution engine across process boundaries.
- **RUNTIME STATUS**: **Authoritative Runtime Configuration Engine**.

#### `apps/api/src/services/promptCompiler.ts`
- **PATH**: `apps/api/src/services/promptCompiler.ts`
- **PURPOSE**: Compiles Layer B customer configuration into a single coherent system prompt string, bounded by Layer A Core Safety & Turn-Taking Rules.
- **IMPORTS**: `../lib/logger`, `./template`, `./voiceRegistry`.
- **CONSUMERS**: `src/services/runtimeAgentConfig.ts`, `src/services/agent.ts`, `src/routes/agents.ts`.
- **RESPONSIBILITY**: Prompt compilation, Layer A security boundaries, conversational turn limits.
- **RUNTIME STATUS**: **Authoritative Prompt Compilation Engine**.

#### `apps/api/src/services/agent.ts`
- **PATH**: `apps/api/src/services/agent.ts`
- **PURPOSE**: Manages Agent lifecycle, version snapshots (`saveConfiguration`), publishing to production deployments (`publishAgent`), and draft test deployment updates.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`, `./template`, `./agentChecklist`.
- **CONSUMERS**: `src/routes/agents.ts`, `src/routes/client.ts`, `src/services/livekit.ts`.
- **RESPONSIBILITY**: Agent CRUD, version state machine, deployment management.
- **RUNTIME STATUS**: **Authoritative Agent Lifecycle Controller**.

#### `apps/api/src/services/template.ts`
- **PATH**: `apps/api/src/services/template.ts`
- **PURPOSE**: Stores system agent templates, defines `AgentConfiguration` interface, and enforces configuration schema validations (`validateTemplateConfiguration`).
- **IMPORTS**: `zod`, `../lib/logger`.
- **CONSUMERS**: `src/services/agent.ts`, `src/services/runtimeAgentConfig.ts`, `src/services/promptCompiler.ts`, `src/services/toolCatalog.ts`, `src/routes/agents.ts`.
- **RESPONSIBILITY**: Template presets, configuration validation rules.
- **RUNTIME STATUS**: **Authoritative Template & Schema Types**.

#### `apps/api/src/services/appointment.ts`
- **PATH**: `apps/api/src/services/appointment.ts`
- **PURPOSE**: Manages business appointments, tenant isolation verification, and concurrency-safe sequential appointment numbering (`A-001`) via `tenant_appointment_counters`.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`.
- **CONSUMERS**: `src/routes/internal.ts`, `src/routes/client.ts`.
- **RESPONSIBILITY**: Appointment persistence, atomic sequential counter incrementing.
- **RUNTIME STATUS**: **Authoritative Appointment Domain Logic**.

#### `apps/api/src/services/lead.ts`
- **PATH**: `apps/api/src/services/lead.ts`
- **PURPOSE**: Manages lead persistence, tenant boundary verification, and status transitions (`NEW`, `CONTACTED`, `QUALIFIED`, `CLOSED`).
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`.
- **CONSUMERS**: `src/routes/internal.ts`, `src/routes/client.ts`.
- **RESPONSIBILITY**: Customer lead persistence and status management.
- **RUNTIME STATUS**: **Authoritative Lead Domain Logic**.

#### `apps/api/src/services/callSession.ts`
- **PATH**: `apps/api/src/services/callSession.ts`
- **PURPOSE**: Persists call session states (`ACTIVE`, `COMPLETED`, `FAILED`, `MISSED`), durations, caller numbers, transcripts, turns JSON, and latency metrics.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`.
- **CONSUMERS**: `src/routes/internal.ts`, `src/routes/client.ts`.
- **RESPONSIBILITY**: Realtime call session lifecycle persistence.
- **RUNTIME STATUS**: **Authoritative Call Session Persistence**.

#### `apps/api/src/services/knowledge.ts`
- **PATH**: `apps/api/src/services/knowledge.ts`
- **PURPOSE**: Document ingestion, SHA-256 deduplication, storage upload, chunking, embedding generation, and cosine similarity vector retrieval.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `./storage`, `./embedding`, `./chunking`, `../lib/logger`.
- **CONSUMERS**: `src/routes/internal.ts` (`POST /api/internal/knowledge/retrieve`), `src/routes/knowledge.ts`.
- **RESPONSIBILITY**: RAG ingestion, chunking, vector indexing, tenant-isolated vector retrieval.
- **RUNTIME STATUS**: **Authoritative RAG Engine**.

#### `apps/api/src/services/embedding.ts`
- **PATH**: `apps/api/src/services/embedding.ts`
- **PURPOSE**: Adapts vector embedding generation using Nvidia API (`nvidia/nemotron-3-embed-1b`) or Google Gemini (`gemini-embedding-001`).
- **IMPORTS**: `axios`, `../config/env`, `../lib/logger`.
- **CONSUMERS**: `src/services/knowledge.ts`.
- **RESPONSIBILITY**: Vector embedding API integration.
- **RUNTIME STATUS**: **Authoritative Embedding Client**.

#### `apps/api/src/services/phoneNumber.ts`
- **PATH**: `apps/api/src/services/phoneNumber.ts`
- **PURPOSE**: Manages phone number inventory, reverse lookup for inbound telephony routing, and tenant assignment.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`.
- **CONSUMERS**: `src/routes/internal.ts`, `src/routes/client.ts`.
- **RESPONSIBILITY**: Inbound telephony DID routing resolution.
- **RUNTIME STATUS**: **Authoritative Phone Number Registry**.

#### `apps/api/src/services/whatsapp.ts`
- **PATH**: `apps/api/src/services/whatsapp.ts`
- **PURPOSE**: Multi-provider WhatsApp messaging dispatcher (`DEMO`, `META`, `TWILIO`) creating logged records in `follow_ups`.
- **IMPORTS**: `../db`, `../db/schema`, `../config/env`, `../lib/logger`.
- **CONSUMERS**: `src/routes/client.ts`.
- **RESPONSIBILITY**: Follow-up messaging dispatch and logging.
- **RUNTIME STATUS**: **Authoritative Messaging Engine**.

#### `apps/api/src/services/analytics.ts`
- **PATH**: `apps/api/src/services/analytics.ts`
- **PURPOSE**: Aggregates tenant-scoped analytics for calls, connected rates, durations, outcomes, lead funnels, appointment statuses, languages, tool executions, and latencies.
- **IMPORTS**: `../db`, `../db/schema`, `drizzle-orm`, `../lib/logger`.
- **CONSUMERS**: `src/routes/client.ts`.
- **RESPONSIBILITY**: CRM analytics aggregation.
- **RUNTIME STATUS**: **Authoritative Analytics Aggregator**.

#### `apps/api/src/routes/internal.ts`
- **PATH**: `apps/api/src/routes/internal.ts`
- **PURPOSE**: Internal control plane API dedicated strictly to voice workers (LiveKit / Pipecat). Protected by `authenticateWorkerSecret`.
- **IMPORTS**: `express`, `../services/*`, `../middleware/workerAuth.ts`, `../middleware/validate.ts`, `../lib/logger`.
- **CONSUMERS**: `apps/livekit-worker`, `apps/pipecat-worker`.
- **RESPONSIBILITY**: Worker-facing endpoints (`/api/internal/runtime-config`, `/knowledge/retrieve`, `/call-sessions`, `/leads`, `/appointments`, `/phone-numbers`).
- **RUNTIME STATUS**: **Authoritative Worker API Boundary**.

---

### 3.2 LiveKit Realtime Voice Worker (`apps/livekit-worker`)

#### `apps/livekit-worker/src/main.ts`
- **PATH**: `apps/livekit-worker/src/main.ts`
- **PURPOSE**: Worker process entry point. Connects to LiveKit server, listens for room jobs, extracts `deploymentId`, fetches `RuntimeAgentConfig`, creates active call session, wires Sarvam STT/TTS, listens for transcription/language/turn/tool/speech events, tracks timing, and finalizes call session on disconnect.
- **IMPORTS**: `@livekit/agents`, `@livekit/agents-plugin-sarvam`, `./agent`, `./runtimeConfigClient`, `./languageManager`, `./callLifecycle`, `./debugTranscript`, `./realtimeTiming`, `./temporalContext`, `./calendarContext`.
- **CONSUMERS**: LiveKit Server worker dispatcher.
- **RESPONSIBILITY**: Realtime voice session execution, event handling, lifecycle finalization.
- **RUNTIME STATUS**: **Active Production Reference Runtime**.

#### `apps/livekit-worker/src/agent.ts`
- **PATH**: `apps/livekit-worker/src/agent.ts`
- **PURPOSE**: Instantiates LiveKit Agent with compiled system prompt, active language instruction, LLM adapter (`SarvamLLM` or `inference.LLM`), and tools resolved from `ToolRegistry`.
- **IMPORTS**: `@livekit/agents`, `@livekit/agents-plugin-sarvam`, `./sarvamLlm`, `./tools/toolRegistry`.
- **CONSUMERS**: `src/main.ts`.
- **RESPONSIBILITY**: Agent session construction.
- **RUNTIME STATUS**: **Active Production Agent Builder**.

#### `apps/livekit-worker/src/languageManager.ts`
- **PATH**: `apps/livekit-worker/src/languageManager.ts`
- **PURPOSE**: `ConversationLanguageManager` controlling multilingual state, 12 Indic regex rules, Indic script filters, and Latin Hinglish/Minglish marker protections.
- **IMPORTS**: None (Self-contained pure logic).
- **CONSUMERS**: `src/main.ts`.
- **RESPONSIBILITY**: Turn-by-turn multilingual decision logic.
- **RUNTIME STATUS**: **Authoritative Voice Multilingual Logic**.

#### `apps/livekit-worker/src/tools/toolRegistry.ts`
- **PATH**: `apps/livekit-worker/src/tools/toolRegistry.ts`
- **PURPOSE**: Resolves tool definitions in `RuntimeAgentConfig.tools` to native LiveKit tools (`query_knowledge_base`, `create_callback_lead`, `book_appointment`).
- **IMPORTS**: `@livekit/agents`, `./appointmentTool`, `./leadTool`, `./knowledgeTool`, `@nextlite/shared`.
- **CONSUMERS**: `src/agent.ts`.
- **RESPONSIBILITY**: Tool factory registry and runtime execution.
- **RUNTIME STATUS**: **Authoritative Tool Factory Registry**.

---

### 3.3 Pipecat Telephony Worker (`apps/pipecat-worker`)

#### `apps/pipecat-worker/app/main.py`
- **PATH**: `apps/pipecat-worker/app/main.py`
- **PURPOSE**: Implements bidirectional telephony audio pipeline over Plivo WebSocket (`/ws/plivo`) using `PlivoFrameSerializer` (8kHz μ-law), `SarvamSTTService` (`saaras:v3`), `LLMContextAggregatorPair`, `SarvamLLMService` (`sarvam-105b`), `SarvamTTSService` (`bulbul:v3`), and `RealtimeStreamingTimingMonitor`.
- **IMPORTS**: `fastapi`, `pipecat.transports.*`, `pipecat.services.sarvam.*`, `pipecat.pipeline.*`, `pipecat.processors.*`.
- **CONSUMERS**: Plivo WebSocket telephony stream.
- **RESPONSIBILITY**: Telephony audio streaming, speech recognition, LLM inference, speech synthesis.
- **RUNTIME STATUS**: **Migration Target (Phases 1–5 Verified)**.

#### `apps/pipecat-worker/app/config.py`
- **PATH**: `apps/pipecat-worker/app/config.py`
- **PURPOSE**: Loads environment configuration (`SARVAM_API_KEY`, `STT_MODEL`, `TTS_MODEL`, `LLM_MODEL`, `PHASE2_TEST_VOICE_ID`, `PLIVO_*`).
- **IMPORTS**: `pydantic_settings`.
- **CONSUMERS**: `app/main.py`, test suites.
- **RESPONSIBILITY**: Worker environment settings.
- **RUNTIME STATUS**: **Authoritative Worker Config**.

---

### 3.4 Shared Package (`packages/shared`)

#### `packages/shared/src/runtimeConfig.ts`
- **PATH**: `packages/shared/src/runtimeConfig.ts`
- **PURPOSE**: Defines `RuntimeAgentConfig` interface, `CANONICAL_PLATFORM_TOOLS`, `normalizeToolId()`, and `getUserSafeDisplayId()`.
- **IMPORTS**: `zod`.
- **CONSUMERS**: `apps/api`, `apps/web`, `apps/livekit-worker`, future Python client.
- **RESPONSIBILITY**: Shared contract source of truth.
- **RUNTIME STATUS**: **Authoritative Contract Source**.

#### `packages/shared/src/types.ts`
- **PATH**: `packages/shared/src/types.ts`
- **PURPOSE**: Defines core platform entities (`CallSession`, `Lead`, `Appointment`, `PhoneNumber`, `FollowUp`, `AnalyticsOverview`, `ApiResponse`).
- **IMPORTS**: None.
- **CONSUMERS**: `apps/api`, `apps/web`.
- **RESPONSIBILITY**: Data transfer types and interfaces.
- **RUNTIME STATUS**: **Authoritative DTO Definitions**.
