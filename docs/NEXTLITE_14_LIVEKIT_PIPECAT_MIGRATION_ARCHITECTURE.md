# NextLite Voice V3 — LiveKit to Pipecat Migration Architecture
## Document 14: Engine Parity Matrix, Current State & Boundary Specifications

> **Document Type**: Voice Engine Migration Architecture & Parity Blueprint  
> **Status**: Verified from Implementation (Read-Only)  
> **Current Engine**: LiveKit Agents (`apps/livekit-worker`)  
> **Target Engine**: Pipecat AI (`apps/pipecat-worker`)  
> **Current Migration Status**: STOPPED AT PHASE 5 (Zero Phase 6+ Code Implementation)  
> **Timestamp**: 2026-09-09  

---

## 1. Migration Architectural Principle

> [!IMPORTANT]
> **PIPECAT IS REPLACING THE REALTIME VOICE ENGINE, NOT REBUILDING THE NEXTLITE CONTROL PLANE.**
>
> NextLite Control Plane (Node.js/Express/PostgreSQL) remains the sole authoritative source of truth for agent configurations, prompts, RAG documents, embeddings, sequential appointment counters, and multi-tenant CRM storage. Pipecat is purely the audio transport, STT/TTS pipeline, and conversational turn-taking engine.

---

## 2. Complete Capability & Responsibility Migration Matrix

| Capability | NextLite Owner | LiveKit Current Implementation | Pipecat Requirement | Must Preserve | Must NOT Duplicate |
|---|---|---|---|---|---|
| **Runtime Config Resolution** | `apps/api` (`RuntimeAgentConfigService`) | `runtimeConfigClient.ts:getRuntimeAgentConfig` | Async HTTP client calling `GET /api/internal/runtime-config/:deploymentId` | `RuntimeAgentConfig` DTO | Do NOT assemble config in Python |
| **System Prompt Compilation** | `apps/api` (`PromptCompilerService`) | Receives compiled prompt string from API | Passes `compiledSystemPrompt` to `LLMContext` | Layer A safety + Layer B customer prompt | Do NOT build prompt compiler in Python |
| **Temporal Context** | Shared Worker Logic | `temporalContext.ts:buildTemporalInstruction` | Port to Python `temporal_context.py` | Time, date, timezone template | Do NOT hardcode date/time |
| **Calendar Context** | Shared Worker Logic | `calendarContext.ts:buildCalendarInstruction` | Port to Python `calendar_context.py` | 7-day relative matrix | Do NOT hardcode dates |
| **Multilingual Decision Manager** | Shared Worker Logic | `languageManager.ts:ConversationLanguageManager` | Port to Python `language_manager.py` | 12 Indic regex rules & Hinglish filters | Do NOT rely solely on naive STT language codes |
| **Speech-to-Text (STT)** | Sarvam AI | `@livekit/agents-plugin-sarvam` (`saaras:v3`) | `pipecat.services.sarvam.stt.SarvamSTTService` | `saaras:v3` 8kHz/16kHz streaming | Do NOT implement custom STT WebSocket client |
| **LLM Inference** | Sarvam AI | `SarvamLLM` custom adapter (`sarvam-105b`) | `pipecat.services.sarvam.llm.SarvamLLMService` | `sarvam-105b` conversational streaming | Do NOT implement custom LLM streaming engine |
| **Text-to-Speech (TTS)** | Sarvam AI | `@livekit/agents-plugin-sarvam` (`bulbul:v3`) | `pipecat.services.sarvam.tts.SarvamTTSService` | `bulbul:v3` streaming with dynamic language | Do NOT implement custom TTS client |
| **Telephony Audio Transport** | Telephony Layer | LiveKit SIP Inbound Trunk & WebRTC Room | FastAPI WebSocket `/ws/plivo` + `PlivoFrameSerializer` | 8000 Hz μ-law audio stream | Do NOT use LiveKit WebRTC for Plivo |
| **Speech Interruption** | Voice Engine | LiveKit AgentSession interruption options | Pipecat `InterruptionFrame` + Plivo buffer clear | Immediate audio cancellation on speech | Do NOT delay interruption handling |
| **Knowledge Retrieval (RAG)**| `apps/api` (`KnowledgeService`) | `knowledgeTool.ts` &rarr; `POST /api/internal/knowledge/retrieve` | Native Pipecat tool calling `/api/internal/knowledge/retrieve` | Vector search & tenant filtering | Do NOT build vector database in Python |
| **Appointment Booking** | `apps/api` (`AppointmentService`) | `appointmentTool.ts` &rarr; `POST /api/internal/appointments` | Native Pipecat tool calling `/api/internal/appointments` | Sequential `A-001` format | Do NOT generate appointment numbers in Python |
| **Lead Capture** | `apps/api` (`LeadService`) | `leadTool.ts` &rarr; `POST /api/internal/leads` | Native Pipecat tool calling `/api/internal/leads` | Caller phone fallback | Do NOT write directly to PostgreSQL |
| **Call Session Lifecycle** | `apps/api` (`CallSessionService`) | `POST /api/internal/call-sessions` (ACTIVE) & `PATCH .../:id` (COMPLETED) | Call `POST` on start and `PATCH` in `finally:` handler | State machine (`ACTIVE`, `COMPLETED`, `MISSED`, `FAILED`) | Do NOT bypass call session persistence |
| **Turn & Timing Telemetry** | Worker Memory | `debugTranscript.ts` & `realtimeTiming.ts` | In-memory accumulator & `RealtimeStreamingTimingMonitor` | STT, TTFT, TTFB, and turn latency logs | Do NOT omit latency metrics |
| **Worker Authentication** | `apps/api` (`workerAuth.ts`) | Pre-shared secret header (`x-worker-secret`) | Inject `WORKER_API_SECRET` into all HTTP requests | Pre-shared worker secret | Do NOT bypass internal API security |

---

## 3. Pipecat Worker Current State Audit (Phases 1–5 Complete)

### Phase 1: Plivo ↔ Pipecat Transport Echo POC (COMPLETE ✅)
- **Implemented**: `apps/pipecat-worker/app/main.py`, `PlivoFrameSerializer`, `FastAPIWebsocketTransport`.
- **Verified**: Bidirectional audio streaming over WebSocket on `/ws/plivo`, start/connected event parsing, audio echo loopback.
- **Tests**: `tests/test_plivo_echo.py` (7 passing tests).

### Phase 2: Real Pipecat Voice Pipeline Foundation (COMPLETE ✅)
- **Implemented**: Real Sarvam STT (`saaras:v3`) and Sarvam TTS (`bulbul:v3`) using official `pipecat-ai[sarvam]` SDK primitives.
- **Verified**: Native frame flow, STT transcription frames, TTS synthesis frames, temporary deterministic echo test processor (`DeterministicTestEchoProcessor`).
- **Tests**: `tests/test_sarvam_pipeline.py` (6 passing tests).

### Phase 3: Realtime Streaming & Audio Output Optimization (COMPLETE ✅)
- **Implemented**: 8000 Hz native telephony streaming without resampling transcode bottlenecks, `RealtimeStreamingTimingMonitor` latency instrumentation, interruption signal handling.
- **Tests**: `tests/test_realtime_streaming.py` (7 passing tests).

### Phase 4: Real Sarvam LLM Integration (COMPLETE ✅)
- **Implemented**: `SarvamLLMService` (`sarvam-105b`), `LLMContext`, `LLMContextAggregatorPair` (`LLMUserAggregator` + `LLMAssistantAggregator`), conversational context aggregation, LLM TTFT latency tracking.
- **Verified**: Native conversational dialogue (User speaks &rarr; STT transcribes &rarr; Context aggregates &rarr; Sarvam-105B streams tokens &rarr; Sarvam Bulbul v3 synthesizes audio &rarr; Plivo outputs audio).
- **Tests**: `tests/test_sarvam_llm_pipeline.py` (7 passing tests).

### Phase 5: LiveKit &rarr; Pipecat Behavior Parity Audit (COMPLETE ✅)
- **Implemented**: `apps/pipecat-worker/LIVEKIT_TO_PIPECAT_BEHAVIOR_PARITY_MATRIX.md`.
- **Output**: Complete behavioral parity blueprint mapping all 22 LiveKit components to Pipecat.
- **Code Changes**: **NONE (Audit Only)**.

---

## 4. Production-Ready vs Temporary vs Missing Elements in Pipecat

| Component | Current Status in Pipecat | Classification | Action for Phase 6+ |
|---|---|---|---|
| **Plivo WebSocket Handshake** | Implemented & verified | **Production-Ready** | Preserve as-is. |
| **8kHz μ-law Audio Serialization** | Implemented & verified | **Production-Ready** | Preserve as-is. |
| **Sarvam STT (`saaras:v3`)** | Implemented & verified | **Production-Ready** | Wire dynamic initial language (`'unknown'` vs primary). |
| **Sarvam LLM (`sarvam-105b`)** | Implemented & verified | **Production-Ready** | Wire model name from `RuntimeAgentConfig.runtime.llmModel`. |
| **Sarvam TTS (`bulbul:v3`)** | Implemented & verified | **Production-Ready** | Wire voice ID from `RuntimeAgentConfig.voice.voiceId` & dynamic language switch. |
| **Context Aggregator Pair** | Implemented & verified | **Production-Ready** | Preserve as-is. |
| **`TEST_PROMPT` in `config.py`** | Hardcoded generic prompt | **Temporary / Test-Only** | **Replace with `RuntimeAgentConfig.prompt.compiledSystemPrompt`**. |
| **`PHASE2_TEST_VOICE_ID`** | Hardcoded `'shubh'` | **Temporary / Test-Only** | **Replace with `RuntimeAgentConfig.voice.voiceId`**. |
| **`DeterministicTestEchoProcessor`** | Static test echo class | **Test-Only** | Retain for isolated tests; exclude from live pipeline. |
| **Control Plane HTTP Client** | Not implemented in Python | **Missing (Phase 6)** | Implement async client calling `/api/internal/*`. |
| **`RuntimeAgentConfig` Loading** | Not implemented in Python | **Missing (Phase 6)** | Fetch config on WebSocket connect before pipeline setup. |
| **`ConversationLanguageManager`** | Not implemented in Python | **Missing (Phase 6)** | Port 12 Indic regex rules & Hinglish filters to Python. |
| **Temporal & Calendar Context** | Not implemented in Python | **Missing (Phase 6)** | Port dynamic context generators to Python. |
| **Tool Registry & Execution** | Not implemented in Python | **Missing (Phase 6)** | Implement native Pipecat tool calling for the 3 platform tools. |
| **Call Session Persistence** | Not implemented in Python | **Missing (Phase 6)** | Add `POST` (ACTIVE) and `PATCH` (COMPLETED) calls. |
