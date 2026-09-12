# Target Python Unified Architecture Map

**Target Architecture:** FastAPI Control Plane + Shared Python Domain Layer + Pipecat Realtime Workers  
**Audit Date:** September 2026

---

## 1. Proposed Target Topology

```
                      ┌─────────────────────────────────┐
                      │    React / TypeScript Frontend  │
                      │           (`apps/web`)          │
                      └────────────────┬────────────────┘
                                       │ HTTP / REST (Verbatim Parity)
                                       ▼
                      ┌─────────────────────────────────┐
                      │   Python FastAPI Control Plane  │
                      │           (`apps/api`)          │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │   Python Shared Domain Layer    │
                      │      (`packages/domain`)        │
                      │  - Repositories (asyncpg/SQLA)  │
                      │  - Prompt Compiler              │
                      │  - Tool Registry & Execution    │
                      │  - RuntimeAgentConfig Engine    │
                      │  - Multi-Tenant & Auth Domain   │
                      └───┬─────────────────────────┬───┘
                          │ Direct Async Call       │ Direct Async Call
                          ▼                         ▼
            ┌───────────────────────┐     ┌───────────────────────┐
            │   PostgreSQL 16 DB    │     │ Pipecat Realtime Voice│
            │     + pgvector        │     │        Worker         │
            └───────────────────────┘     └───▲───────────────┬───┘
                                              │               │
                                              │ Plivo WS      │ Sarvam STT/TTS
                                              ▼               ▼
                                      ┌──────────────┐ ┌──────────────┐
                                      │  Plivo PSTN  │ │  Sarvam AI   │
                                      └──────────────┘ └──────────────┘
```

---

## 2. Key Architectural Guarantees

1. **Unified Python Ecosystem:** Single language across control plane and realtime execution engine. Single set of Pydantic models for configuration, schemas, and tools.
2. **Flexible Boundary Execution:** Tools and runtime configurations can execute via high-performance shared in-process domain services or via HTTP internal endpoints when running in distributed multi-node topologies.
3. **Frontend Invariance:** The React frontend remains 100% untouched. All endpoint paths, verbs, payloads, status codes, and JSON schemas remain identical.
4. **Pipecat Native Purity:** Zero custom monkeypatching of Pipecat internals; retains clean `FastAPIWebsocketTransport` and `PlivoFrameSerializer`.