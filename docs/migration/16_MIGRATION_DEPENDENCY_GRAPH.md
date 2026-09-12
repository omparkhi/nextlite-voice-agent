# Migration Dependency Graph & Phased Roadmap

**Audit Date:** September 2026

---

## 1. Topological Migration Order

```
[ Phase 0: Forensic Audit & Zero-Loss Baseline ] (CURRENT)
                       │
                       ▼
[ Phase 1: Python Shared Domain Models & DB Repositories ]
  - Pydantic Domain Schemas (RuntimeAgentConfig, Tools, Auth)
  - Async SQLAlchemy / asyncpg Models (20 Tables, 13 Enums)
  - Multi-tenant query filters & Tenant appointment counters
  - Pytest Suite for Domain & Repositories
                       │
                       ▼
[ Phase 2: Python Shared Domain Services ]
  - Password / Argon2 / JWT Token Services
  - Prompt Compiler & Dynamic Temporal Context
  - Realtime Tool Implementations (book_appointment, query_knowledge_base, create_callback_lead)
  - pgvector RAG Embedding & Retrieval Engine
                       │
                       ▼
[ Phase 3: Python FastAPI Control Plane Endpoints ]
  - Auth Routes (`/api/auth/*`)
  - Admin & Agent Builder Routes (`/api/admin/*`)
  - Client CRM Routes (`/api/client/*`)
  - Receptionist Public Booking Routes (`/api/appointments/*`)
  - Internal Worker Routes (`/api/internal/*`)
                       │
                       ▼
[ Phase 4: Pipecat Worker Direct Domain Integration ]
  - Update Pipecat worker to import Shared Domain Services
  - Sub-millisecond tool execution path
  - Unified logging and error traps
                       │
                       ▼
[ Phase 5: End-to-End PSTN & Frontend Parity Acceptance ]
  - Live PSTN Plivo validation calls
  - Full React UI regression testing
  - Zero-loss regression test run (515+ test cases)
                       │
                       ▼
[ Phase 6: Deprecation & Decommission of Node API ]
  - Archive `apps/api` (Node) and `apps/livekit-worker`
  - Clean up package manifests
```

---

## 2. Parallelizable Workstreams

- **Track A (Control Plane):** FastAPI routes, JWT auth, and admin CRM endpoints.
- **Track B (RAG & Tool Optimization):** pgvector asyncpg integration, vector similarity queries, and tool execution registry.
- **Track C (Realtime Worker):** Plivo WebSocket handshake, early release aggregation, and audio cache optimizations.