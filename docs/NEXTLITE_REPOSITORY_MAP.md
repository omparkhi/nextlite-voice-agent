# NextLite Voice V3 — Exhaustive Repository Map

> **Audit Status**: Complete & Verified (Read-Only)  
> **Timestamp**: 2026-09-09  
> **Repository Root**: `e:\NextLite\nextlite-voice-engineering-spec`  
> **Active Branch**: `pipecat-migration`

---

## 1. Top-Level Directory Structure

```
e:\NextLite\nextlite-voice-engineering-spec\
├── apps/
│   ├── api/                 # Control Plane Backend REST API (Node.js + Express + Drizzle ORM)
│   ├── livekit-worker/      # Existing Realtime Voice Worker (Node.js + LiveKit Agents + Sarvam)
│   ├── pipecat-worker/      # Realtime Voice Telephony Pipeline (Python 3.14 + FastAPI + Pipecat 1.8.1)
│   └── web/                 # Frontend Web Application (React 18 + Vite + TailwindCSS)
├── packages/
│   └── shared/              # Cross-Workspace Shared TypeScript Contracts & DTOs
├── docs/                    # Architecture Specs, Technical Blueprints & Audit Documentation
├── knowledge_base/          # Default Demo Markdown Knowledge Base Documents
├── package.json             # Root Monorepo NPM Workspace Definition
├── pnpm-lock.yaml           # Monorepo Lockfile
└── package-lock.json        # NPM Lockfile
```

---

## 2. Comprehensive Module & Directory Breakdown

### 2.1 `apps/api` — Control Plane Backend REST API
- **Purpose**: Central administrative control plane, authentication, tenant management, agent versioning, prompt compilation, RAG knowledge ingestion/indexing/retrieval, CRM persistence (calls, leads, appointments, follow-ups), telemetry analytics, and internal worker APIs.
- **Runtime**: Node.js `>=24.0.0`, TypeScript `5.3.2`, Express `4.18.2`.
- **Owner / Responsibility**: Backend Engineering / Control Plane Security.
- **Dependencies**: PostgreSQL (`postgres`, `drizzle-orm`), Redis (`ioredis`), AWS S3 / Backblaze B2 (`@aws-sdk/client-s3`), JWT (`jsonwebtoken`), Zod (`zod`), Resend (`resend`), LiveKit Server SDK (`livekit-server-sdk`), Pino (`pino`).
- **Environment Context**: Production runtime.
- **Important Directories & Files**:
  - `src/index.ts`: Express application setup, security middleware (Helmet, CORS, CookieParser), route mounting, HTTP listener on port 3001.
  - `src/config/env.ts`: Zod schema validation for all environment variables (`DATABASE_URL`, `JWT_SECRET`, `LIVEKIT_URL`, `WORKER_API_SECRET`, etc.).
  - `src/db/`:
    - `schema.ts`: Drizzle ORM PostgreSQL schema defining 15 tables (`tenants`, `users`, `refreshTokens`, `auditLogs`, `verificationTokens`, `subscriptions`, `agentTemplates`, `agents`, `agentVersions`, `deployments`, `agentTools`, `knowledgeSources`, `knowledgeChunks`, `configChangeProposals`, `callSessions`, `leads`, `appointments`, `tenantAppointmentCounters`, `phoneNumbers`, `followUps`).
    - `index.ts`: PostgreSQL connection pool creation using `postgres` and Drizzle schema binding.
    - `redis.ts`: Redis connection client initialization (`ioredis`).
  - `src/routes/`:
    - `internal.ts`: Authenticated worker endpoints (`/api/internal/runtime-config/:deploymentId`, `/api/internal/knowledge/retrieve`, `/api/internal/call-sessions`, `/api/internal/leads`, `/api/internal/appointments`, `/api/internal/phone-numbers`).
    - `agents.ts`: Admin agent management (`/api/admin/clients/:clientId/agents`, `/compile-prompt`, `/publish`, `/test-token`, `/phone-test`).
    - `client.ts`: Client CRM & dashboard endpoints (`/api/client/calls`, `/leads`, `/appointments`, `/phone-numbers`, `/follow-ups`, `/analytics/overview`).
    - `admin.ts`: Admin platform client & user management.
    - `auth.ts`: Authentication (`/login`, `/refresh`, `/register`, `/verify-email`, `/reset-password`).
    - `health.ts`: Liveness & dependency health checks (`/api/health`).
    - `knowledge.ts`: Admin knowledge document upload, listing, deletion.
    - `test-conversation.ts`: Interactive prompt test conversation runner.
    - `config-assistant.ts`: AI-assisted agent configuration generator.
  - `src/services/`:
    - `runtimeAgentConfig.ts`: Authoritative `RuntimeAgentConfig` resolution from `deployments` & `agent_versions`.
    - `promptCompiler.ts`: Multi-layer system prompt compilation (Layer A safety boundary + Layer B customer persona/phases/guardrails).
    - `agent.ts`: Agent CRUD, configuration versioning (`saveConfiguration`), deployment publication (`publishAgent`).
    - `template.ts`: Agent template presets and configuration validator.
    - `appointment.ts`: Atomic appointment creation, tenant-scoped sequencing (`A-001`), and CRM queries.
    - `lead.ts`: Generic customer lead persistence and status management.
    - `callSession.ts`: Realtime call session lifecycle persistence.
    - `knowledge.ts`: Document chunking, embedding generation, storage, and cosine similarity vector retrieval.
    - `embedding.ts`: Nvidia (`nvidia/nemotron-3-embed-1b`) and Gemini (`gemini-embedding-001`) vector embedding adapters.
    - `phoneNumber.ts`: Phone number inventory, tenant allocation, and reverse lookup.
    - `livekit.ts`: LiveKit test token generation, room dispatching, and SIP outbound test calling.
    - `whatsapp.ts`: Multi-provider WhatsApp messaging integration (`DEMO`, `META`, `TWILIO`).
    - `followUp.ts`: Follow-up message logs and delivery tracking.
    - `analytics.ts`: Comprehensive CRM analytics aggregation (calls, durations, outcomes, leads, appointments, latencies).
    - `toolCatalog.ts`: Safe discovery catalog of platform tools.
    - `voiceRegistry.ts`: Voice ID gender and metadata registry.
    - `agentChecklist.ts`: Pre-publication readiness checklist evaluator.
    - `storage.ts`: Backblaze B2 / S3 object storage adapter.
  - `src/middleware/`:
    - `auth.ts`: JWT verification, role-based access control (`ADMIN`, `CLIENT_OWNER`, `CLIENT_VIEWER`), tenant scoping.
    - `workerAuth.ts`: Shared secret verification (`x-worker-secret` / Bearer token) for `/api/internal/*`.
    - `validate.ts`: Zod schema request validation middleware.
    - `correlationId.ts`: Unique request tracking ID injector.
    - `errorHandler.ts`: Standardized JSON error response handler.
  - `drizzle/`: PostgreSQL migration files (`0000` through `0006`).
  - `src/__tests__/`: Comprehensive Vitest integration test suite (23 test files).

---

### 2.2 `apps/livekit-worker` — LiveKit Realtime Voice Worker
- **Purpose**: Current production realtime voice engine handling audio streams via LiveKit WebRTC / SIP Gateway, Sarvam Saaras v3 STT, Sarvam-105B LLM / LiveKit Gateway inference, Sarvam Bulbul v3 TTS, dynamic multilingual switching, temporal/calendar context injection, and native tool execution.
- **Runtime**: Node.js `>=24.0.0`, TypeScript `5.9.3`, `@livekit/agents 1.6.3`.
- **Owner / Responsibility**: Realtime Voice Platform Team.
- **Dependencies**: `@livekit/agents`, `@livekit/agents-plugin-sarvam`, `@livekit/plugins-ai-coustics`, `@livekit/rtc-node`, `zod`, `dotenv`.
- **Environment Context**: Production runtime (Active Behavioral Reference).
- **Important Files**:
  - `src/main.ts`: LiveKit Agent worker entry point (`defineAgent`), room metadata extraction, `RuntimeAgentConfig` fetching, ACTIVE call session creation, STT/TTS pipeline wiring, dynamic language event listeners, metrics capture, and session finalization (`COMPLETED`, `MISSED`, `FAILED`).
  - `src/agent.ts`: Functional agent builder (`createAgent`), fallback prompt, LLM provider selection (`SarvamLLM` vs `inference.LLM`), interruption options mapping, and tool resolution via `toolRegistry`.
  - `src/runtimeConfigClient.ts`: Control plane HTTP client for fetching `RuntimeAgentConfig`, retrieving knowledge, creating/updating call sessions, and creating leads/appointments.
  - `src/languageManager.ts`: `ConversationLanguageManager` managing active language state, 12 Indic regex rules, Indic script filters, and Latin Hinglish/Minglish marker protections.
  - `src/temporalContext.ts`: Formats dynamic temporal instructions (`buildTemporalInstruction`: current day, date, time, timezone).
  - `src/calendarContext.ts`: Formats 7-day relative calendar matrix (`buildCalendarInstruction`: Today, Tomorrow, Day after tomorrow).
  - `src/sarvamLlm.ts`: Custom LiveKit LLM adapter for Sarvam-105B conversational REST API.
  - `src/callLifecycle.ts`: Room name / identity parser for call direction (`INBOUND`, `OUTBOUND`, `WEB_TEST`) and caller number extraction.
  - `src/debugTranscript.ts`: In-memory turn, message, tool execution, and error accumulator for final call session logs.
  - `src/realtimeTiming.ts`: Monotonic microsecond latency tracker for turn-taking, STT, LLM, TTS, and tool execution.
  - `src/tools/`:
    - `toolRegistry.ts`: Central factory registry resolving configured `RuntimeAgentConfig.tools` to native LiveKit tools.
    - `appointmentTool.ts`: `book_appointment` tool implementation calling `POST /api/internal/appointments`.
    - `leadTool.ts`: `create_callback_lead` tool implementation calling `POST /api/internal/leads`.
    - `knowledgeTool.ts`: `query_knowledge_base` tool implementation calling `POST /api/internal/knowledge/retrieve`.

---

### 2.3 `apps/pipecat-worker` — Pipecat Telephony Voice Engine
- **Purpose**: Target realtime voice worker executing bidirectional telephony streams directly over Plivo WebSockets using the official Pipecat AI framework, Sarvam STT, Sarvam LLM, and Sarvam TTS.
- **Runtime**: Python `3.14.3`, FastAPI `0.115.x`, `pipecat-ai 1.8.1`, `sarvamai 0.1.28`.
- **Owner / Responsibility**: Realtime Voice Platform Team (Phases 1–5 complete).
- **Dependencies**: `pipecat-ai[websocket,sarvam]`, `fastapi`, `uvicorn`, `pydantic-settings`, `loguru`, `pytest`.
- **Environment Context**: Migration Candidate (Verified through Phase 5).
- **Important Files**:
  - `app/main.py`: FastAPI server with `/health`, `/plivo/test-xml`, `/ws/plivo` WebSocket endpoint executing native Pipecat `Pipeline`, `PlivoFrameSerializer` (8kHz μ-law), `SarvamSTTService` (`saaras:v3`), `LLMContextAggregatorPair` (`LLMUserAggregator` + `LLMAssistantAggregator`), `SarvamLLMService` (`sarvam-105b`), `SarvamTTSService` (`bulbul:v3`), and `RealtimeStreamingTimingMonitor`.
  - `app/config.py`: Pydantic settings loading `SARVAM_API_KEY`, `STT_MODEL`, `TTS_MODEL`, `LLM_MODEL`, and test defaults.
  - `tests/`: Pytest unit and integration test suite (27 passing tests across 4 test suites: `test_plivo_echo.py`, `test_sarvam_pipeline.py`, `test_realtime_streaming.py`, `test_sarvam_llm_pipeline.py`).
  - `LIVEKIT_TO_PIPECAT_BEHAVIOR_PARITY_MATRIX.md`: Comprehensive Phase 5 parity audit matrix.

---

### 2.4 `apps/web` — Admin & Client Web Application
- **Purpose**: Single-page application providing Admin Agent Studio, Template configuration, Knowledge base management, Live Web/Phone Voice Testing, and Client CRM Dashboard (Calls, Leads, Appointments, Follow-ups, Analytics, Phone Numbers).
- **Runtime**: React `18.2.0`, Vite `5.0.10`, TypeScript `5.3.2`, TailwindCSS `3.4.0`.
- **Owner / Responsibility**: Frontend Engineering.
- **Dependencies**: `react`, `react-dom`, `react-router-dom`, `livekit-client`, `tailwindcss`.
- **Environment Context**: Production frontend.
- **Important Directories & Files**:
  - `src/App.tsx`: React Router configuration with public, admin (`/admin/*`), and client (`/dashboard/*`) routes.
  - `src/pages/admin/`:
    - `AgentDetail.tsx`: Master agent editor with tabs: Overview, Persona, Knowledge, Tools, Variables, Testing, Settings.
    - `AgentBuilder.tsx`: Multi-step agent creation wizard from template.
    - `KnowledgeManager.tsx`: Document upload and indexing UI.
    - `TestConversation.tsx`: Prompt compiler interactive text simulator.
    - `ClientList.tsx` / `ClientDetail.tsx`: Client tenant onboarding and management.
  - `src/pages/client/`:
    - `Dashboard.tsx`: High-level summary metrics, recent calls, quick actions.
    - `Calls.tsx`: Call history, duration, status, audio player, transcript drawer.
    - `Leads.tsx`: Lead capture pipeline, status updates, notes.
    - `Appointments.tsx`: Booking calendar, appointment status (`REQUESTED`, `CONFIRMED`, `CANCELLED`).
    - `FollowUps.tsx`: WhatsApp & SMS message logs and composer.
    - `Analytics.tsx`: Interactive charts for call volumes, outcomes, languages, tool usage, latencies.
    - `PhoneAgents.tsx`: Phone number to agent deployment mappings.
  - `src/components/`:
    - `WebVoiceTest.tsx`: Browser microphone WebRTC testing using `livekit-client`.
    - `PhoneCallTest.tsx`: Outbound SIP phone testing trigger modal.
    - `agent-builder/`: Modular configuration editors (`SettingsEditor`, `ToolsManager`, `VariablesManager`, `GuardrailsEditor`, `PhaseBuilder`, `ChecklistPanel`, `PromptPreviewModal`).
    - `client/`: Drawers and cards (`CallDetailsDrawer`, `LeadDetailsDrawer`, `AppointmentDetailsDrawer`, `WhatsAppComposer`, `TranscriptViewer`, `AnalyticsChart`).

---

### 2.5 `packages/shared` — Shared TypeScript Contracts
- **Purpose**: Monorepo shared library providing strictly typed contracts, interfaces, and utilities shared between `apps/api`, `apps/web`, and `apps/livekit-worker`.
- **Runtime**: TypeScript `5.3.2` (ES Module).
- **Owner / Responsibility**: Architecture / Core Platform.
- **Important Files**:
  - `src/runtimeConfig.ts`: Definitive `RuntimeAgentConfig` interface and schemas, `CANONICAL_PLATFORM_TOOLS`, `normalizeToolId()`, `getUserSafeDisplayId()`.
  - `src/types.ts`: Persistence DTOs (`CallSession`, `Lead`, `Appointment`, `PhoneNumber`, `FollowUp`, `AnalyticsOverview`, `ApiResponse`).
  - `src/index.ts`: Public package export barrel.

---

### 2.6 `knowledge_base/` — Sample Knowledge Base
- **Purpose**: Curated Markdown documents used for seeding, testing, and demonstrating domain-specific RAG knowledge retrieval.
- **Files**:
  - `01_clinic_overview.md`: Clinic hours, location, emergency guidelines.
  - `02_doctors_and_opd_schedule.md`: Doctor roster, specializations, consultation hours.
  - `03_consultation_fees_and_appointments.md`: Pricing, booking procedures, cancellation policies.
  - `04_faqs_emergency_and_policies.md`: Frequently asked questions and escalation rules.

---

### 2.7 `docs/` — Engineering Specifications & Architectural Documentation
- **Purpose**: System specifications, database schemas, API contracts, design requirements, and migration blueprints.
- **Files**: `01_PRODUCT_REQUIREMENTS.md` through `17_INDEX.md`, `DESIGN-elevenlabs.md`.
