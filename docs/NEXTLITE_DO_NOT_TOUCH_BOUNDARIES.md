# NextLite Voice V3 — "Do Not Touch" Architectural Boundaries

> **Scope**: Definitive Non-Negotiable System Boundaries for Pipecat Migration  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Non-Negotiable "Do Not Touch" Systems

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                 NEXTLITE CONTROL PLANE & PRODUCT CORE (DO NOT TOUCH)              │
│                                                                                  │
│   • PostgreSQL Database & Schema (apps/api/src/db/schema.ts, drizzle/)           │
│   • RAG Ingestion, Chunking, Storage, Vector Embeddings (src/services/knowledge) │
│   • Prompt Compiler & Safety Boundaries (src/services/promptCompiler.ts)         │
│   • Agent Lifecycle & Versioning (src/services/agent.ts, template.ts)             │
│   • Appointment Sequencing & Counter Logic (src/services/appointment.ts)        │
│   • Client CRM & Analytics (src/services/lead.ts, analytics.ts, whatsapp.ts)    │
│   • Frontend Web Application (apps/web/src/*)                                    │
│   • Shared Contracts & DTOs (packages/shared/src/*)                              │
│   • Public & Client REST APIs (apps/api/src/routes/auth, admin, client)          │
│                                                                                  │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                        HTTP REST / Bearer WORKER_API_SECRET
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                  REALTIME VOICE WORKER RUNTIME (PIPECAT TARGET)                  │
│                                                                                  │
│   • Plivo Bidirectional WebSocket Audio Streaming (/ws/plivo)                    │
│   • 8kHz μ-law Telephony Serialization (PlivoFrameSerializer)                    │
│   • Sarvam Saaras v3 STT, Sarvam-105B LLM, Sarvam Bulbul v3 TTS Services        │
│   • Realtime In-Memory Turn-Taking & Conversation Context Aggregation            │
│   • Client Wrapper for /api/internal/* Endpoints                                 │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Exhaustive "Do Not Touch" Breakdown

### 1. PostgreSQL Database & Migrations
- **Boundaries**: Pipecat must **NEVER** install PostgreSQL drivers (`psycopg2`, `asyncpg`, `sqlalchemy`, etc.), execute direct SQL queries, modify schemas, or run migrations.
- **Rationale**: Direct DB access breaks tenant isolation, bypasses concurrency counters, creates connection pool exhaustion, and couples the voice worker to database internals.

### 2. RAG Knowledge Pipeline (Ingestion, Chunking, Embedding)
- **Boundaries**: Pipecat must **NEVER** parse uploaded files, chunk text, manage Backblaze B2/S3 storage, or compute vector embeddings.
- **Rationale**: NextLite Control Plane (`KnowledgeService`) owns the complete RAG lifecycle. Pipecat only issues HTTP search queries to `POST /api/internal/knowledge/retrieve`.

### 3. Prompt Compilation & Safety Engine
- **Boundaries**: Pipecat must **NEVER** re-implement the Layer A/Layer B prompt compiler or re-assemble prompt sections in Python.
- **Rationale**: `PromptCompilerService` in `apps/api` is the single source of truth for prompt structure, Layer A safety rules, and persona formatting.

### 4. Sequential Appointment Number Generation
- **Boundaries**: Pipecat must **NEVER** generate appointment numbers or mutate `tenant_appointment_counters`.
- **Rationale**: Concurrency-safe atomic incrementing is handled exclusively by PostgreSQL via `AppointmentService`.

### 5. Client CRM & Messaging
- **Boundaries**: Pipecat must **NEVER** interact directly with WhatsApp APIs (Meta, Twilio), dispatch follow-up notifications, or aggregate analytics.
- **Rationale**: CRM workflows are managed exclusively by `WhatsAppService` and `AnalyticsService`.

### 6. Frontend Web Application (`apps/web`)
- **Boundaries**: Pipecat migration does **NOT** require altering frontend React components, pages, or routes.
- **Rationale**: The frontend communicates exclusively with the Control Plane REST API.

### 7. Agent Versioning & Deployments
- **Boundaries**: Pipecat must **NEVER** create or mutate `agent_versions` or `deployments` records.
- **Rationale**: Agent lifecycle and deployment state machines are owned exclusively by `AgentService`.
