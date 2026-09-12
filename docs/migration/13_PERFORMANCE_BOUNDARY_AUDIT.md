# Performance & Latency Boundary Audit

**Audit Sources:** Phase 14-22 Production & PSTN Latency Reports  
**Audit Date:** September 2026

---

## 1. Empirical Latency Breakdown (Caller-Perceived Turn Latency)

| Stage | Mean Latency (ms) | P95 Latency (ms) | Optimization Applied (Phases 14-22) | Target Migration Impact |
| :--- | :--- | :--- | :--- | :--- |
| **PSTN Network & Plivo Jitter** | 120 ms | 180 ms | Native PlivoFrameSerializer | Preserved (Telephony invariant) |
| **Sarvam STT Audio Buffering** | 150 ms | 220 ms | Early Turn Endpointing & VAD tuning | Preserved |
| **UserAggregator Endpointing** | 120 ms | 150 ms | Silence threshold reduced to 250ms | Preserved |
| **Sarvam LLM TTFT** | 220 ms | 350 ms | Shared persistent HTTP/2 connection | Preserved |
| **Tool Execution (DB / RAG)** | 45 ms | 85 ms | Indexed queries & local connection pool | **IMPROVED: Direct Python Shared Service eliminates HTTP hop** |
| **Sarvam Bulbul TTS TTFB** | 160 ms | 260 ms | Early release sentence aggregation | Preserved |
| **Total Turnaround Time** | **~815 ms** | **~1245 ms** | Sub-second real-time conversational standard | Preserved & slightly improved |

---

## 2. Node.js vs. Python Boundary Measurements

In the existing architecture:
- Pipecat Worker → Node.js API HTTP GET `/api/internal/runtime-agent-config`: **15-35 ms**.
- Pipecat Worker → Node.js API HTTP POST `/api/internal/tools/execute`: **25-50 ms**.
- Pipecat Worker → Node.js API HTTP PATCH `/api/internal/call-sessions/:id`: **20-40 ms**.

In the Target Python Architecture:
- Shared Python Domain Services allow direct asynchronous in-process database access via `asyncpg`/`SQLAlchemy` when running in colocated worker mode, reducing tool latency from ~45ms to **< 8ms**, while retaining clean REST boundaries for external control plane calls.