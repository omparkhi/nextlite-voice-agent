# Current NextLite Architecture Map

**Audit Date:** September 2026

---

## 1. System Topology Overview

```
                      ┌─────────────────────────────────┐
                      │    React / TypeScript Frontend  │
                      │           (`apps/web`)          │
                      └────────────────┬────────────────┘
                                       │ HTTP / REST / Bearer JWT
                                       ▼
                      ┌─────────────────────────────────┐
                      │   Node.js / Express Control API │
                      │           (`apps/api`)          │
                      └───┬─────────────────────────┬───┘
                          │                         │
     PostgreSQL Queries   │                         │  HTTP Internal REST
    (Drizzle ORM)         │                         │  (Bearer Secret)
                          ▼                         ▼
            ┌───────────────────────┐     ┌───────────────────────┐
            │   PostgreSQL 16 DB    │     │  Pipecat Python Worker│
            │     + pgvector        │     │ (`apps/pipecat-worker`)│
            └───────────▲───────────┘     └───▲───────────────┬───┘
                        │                     │               │
                        │                     │ Media WS      │ Sarvam STT/TTS
                        │                     │               ▼
                        │             ┌───────┴──────┐ ┌──────────────┐
                        │             │  Plivo PSTN  │ │  Sarvam AI   │
                        │             │   WebSockets │ │ Cloud APIs   │
                        │             └──────────────┘ └──────────────┘
                        │
                        │ Redis Caching / BullMQ
                        ▼
            ┌───────────────────────┐
            │      Redis Server     │
            └───────────────────────┘
```

---

## 2. Identified Architectural Bottlenecks & Inefficiencies

1. **Dual-Language Complexity:** Maintenance of TypeScript types (`@nextlite/shared`, `packages/shared/src/runtimeConfig.ts`) alongside Python Pydantic models (`apps/pipecat-worker/app/runtime_config.py`).
2. **HTTP Boundary Overhead for Internal Worker Actions:** Tool execution (`POST /api/internal/tools/execute`) and Call Session finalization (`PATCH /api/internal/call-sessions/:id`) traverse HTTP boundaries between Python worker and Node API, incurring unnecessary serialization and networking overhead.
3. **Redundant Logic Implementation:** Temporal context calculation and prompt compilation existed in both TypeScript (`promptCompiler.ts`) and Python (`prompt_builder.py`).