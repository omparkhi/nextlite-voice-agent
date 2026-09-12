# NextLite Voice V3 — Pipecat Worker Current State Audit (Phases 1–5)

> **Workspace Directory**: `apps/pipecat-worker/`  
> **Status**: Completed through Phase 5 (Behavior Parity Audit)  
> **Stopping Point**: STOPPED AT PHASE 5 (Zero Phase 6+ implementation)  
> **Timestamp**: 2026-09-09  

---

## 1. Phase-by-Phase Completion State

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

## 2. Git Status Verification

```text
Command: git status --short
Output:
?? apps/pipecat-worker/

Command: git diff --name-only
Output: (Empty - 0 tracked files modified)
```

- **Clean Boundary**: No tracked files in `apps/api`, `apps/web`, `apps/livekit-worker`, `packages/shared`, or `database/` have been modified.
- **Untracked Directory**: `apps/pipecat-worker/` is the dedicated isolated workspace for the Pipecat migration branch.

---

## 3. What is Production-Ready vs Temporary vs Missing in Pipecat

| Component | Status in Pipecat Worker | Classification | Migration Action for Phase 6+ |
|---|---|---|---|
| **Plivo WebSocket Handshake** | Implemented & verified | **Production-Ready** | Keep and preserve. |
| **8kHz μ-law Audio Serialization** | Implemented & verified | **Production-Ready** | Keep and preserve. |
| **Sarvam STT (`saaras:v3`)** | Implemented & verified | **Production-Ready** | Wire dynamic initial language (`'unknown'` vs primary). |
| **Sarvam LLM (`sarvam-105b`)** | Implemented & verified | **Production-Ready** | Wire model name from `RuntimeAgentConfig.runtime.llmModel`. |
| **Sarvam TTS (`bulbul:v3`)** | Implemented & verified | **Production-Ready** | Wire voice ID from `RuntimeAgentConfig.voice.voiceId` & dynamic language switch. |
| **Context Aggregator Pair** | Implemented & verified | **Production-Ready** | Keep and preserve. |
| **`TEST_PROMPT` in `config.py`** | Hardcoded generic prompt | **Temporary / Test-Only** | **Replace with `RuntimeAgentConfig.prompt.compiledSystemPrompt`**. |
| **`PHASE2_TEST_VOICE_ID`** | Hardcoded `'shubh'` | **Temporary / Test-Only** | **Replace with `RuntimeAgentConfig.voice.voiceId`**. |
| **`DeterministicTestEchoProcessor`** | Static test echo class | **Test-Only** | Retain for isolated unit tests; exclude from live pipeline. |
| **Control Plane HTTP Client** | Not implemented in Python | **Missing (Phase 6)** | Implement Python HTTP client for `/api/internal/*`. |
| **`RuntimeAgentConfig` Loading** | Not implemented in Python | **Missing (Phase 6)** | Fetch config on WebSocket connect before pipeline setup. |
| **`ConversationLanguageManager`** | Not implemented in Python | **Missing (Phase 6)** | Port 12 Indic regex rules & Hinglish filters to Python. |
| **Temporal & Calendar Context** | Not implemented in Python | **Missing (Phase 6)** | Port dynamic context generators to Python. |
| **Tool Registry & Execution** | Not implemented in Python | **Missing (Phase 6)** | Implement native Pipecat tool calling for the 3 platform tools. |
| **Call Session Persistence** | Not implemented in Python | **Missing (Phase 6)** | Add `POST` (ACTIVE) and `PATCH` (COMPLETED) calls. |
