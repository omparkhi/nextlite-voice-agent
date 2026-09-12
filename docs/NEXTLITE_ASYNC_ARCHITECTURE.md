# NextLite Voice V3 — Async Jobs & Background Task Audit

> **Scope**: Redis, BullMQ, Message Queues, Scheduled Jobs, and Voice Runtime Asynchrony  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Inventory of Async Infrastructure in Codebase

### 1.1 Redis Client (`apps/api/src/db/redis.ts`)
- **Library**: `ioredis 5.3.2`.
- **Initialization**: Connected to `env.REDIS_URL` on server startup.
- **Actual Runtime Usage**:
  - `apps/api/src/routes/health.ts:lines 27–28`: Used solely for executing a ping health check (`await redis.ping()`) to report service status (`health.services.redis = 'connected'`).
  - **No queues, no BullMQ, and no background workers are instantiated in the codebase.**

### 1.2 Knowledge Base Ingestion
- **Execution Model**: Synchronous HTTP request processing.
- **Flow**: When an admin uploads a file (`POST /api/admin/knowledge/upload`), `KnowledgeService.uploadDocument()` chunks the document, calls the embedding API, and writes chunks directly to PostgreSQL within the request lifecycle. No detached background queue is used.

### 1.3 Telephony & Voice Audio Execution
- **Execution Model**: Realtime streaming over persistent WebSockets (Plivo / LiveKit WebRTC).
- **Turn-Taking**: Synchronous frame-by-frame pipeline processing.
- **Persistence**: Call sessions, leads, and appointments are persisted synchronously over HTTP REST (`POST/PATCH /api/internal/*`) at the moments of tool execution and call finalization.

---

## 2. Definitive Voice Runtime Asynchrony Determination

> [!NOTE]
> **AUDIT CONCLUSION: THE VOICE RUNTIME DOES NOT DEPEND ON ASYNC QUEUES OR BACKGROUND WORKERS.**

1. **Zero Message Queue Dependency**: Neither the LiveKit worker nor the Pipecat worker relies on BullMQ, Celery, RabbitMQ, Kafka, or Redis pub/sub for audio execution, tool calling, or session finalization.
2. **Direct Synchronous Contracts**: All interactions between the realtime audio engine and the NextLite control plane occur via direct, low-latency, authenticated HTTP REST endpoints (`/api/internal/*`).
3. **Implications for Pipecat Migration**: The migration from LiveKit to Pipecat does not require configuring message brokers, background job workers, or distributed lock managers.
