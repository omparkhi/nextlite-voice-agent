# Pipecat Clean Reference Architecture vs NextLite Implementation

**Target Service:** `apps/pipecat-worker`  
**Installed Framework:** `pipecat-ai==1.8.1` / Python 3.14.3  
**Audit Date:** 2026-09-11  

---

## 1. Clean Reference Architecture (Official Pipecat 1.8.1 Standard)

In standard Pipecat telephony applications, the reference architecture consists of:
```
Plivo Bidirectional WebSocket
       ↓
FastAPIWebsocketTransport(serializer=PlivoFrameSerializer)
       ↓
Pipeline([
    transport.input(),
    stt_service,
    context_aggregator.user(),
    llm_service,
    tts_service,
    transport.output(),
    context_aggregator.assistant(),
])
       ↓
PipelineWorker(pipeline, observers=[StartupTimingObserver, TurnTrackingObserver, UserBotLatencyObserver])
       ↓
WorkerRunner.run()
```
- **Greeting:** Triggered via `@worker.event_handler("on_pipeline_started") -> worker.queue_frame(TTSSpeakFrame(text=greeting))`.
- **Function Calling:** Registered using `FunctionSchema(name, description, properties, required, handler)` in `LLMContext(tools=...)` and natively executed by `BaseOpenAILLMService.run_function_calls()`.
- **Interruption:** Detected by `ExternalUserTurnStartStrategy`, which generates `InterruptionFrame`; `PlivoFrameSerializer` natively serializes it to `{"event": "clearAudio", "streamId": ...}`.

---

## 2. Area-by-Area Comparison

| Area | Clean Pipecat | Our Implementation | Difference | Necessary? | Risk |
|---|---|---|---|---|---|
| **WebSocket Transport** | `FastAPIWebsocketTransport` connected directly to FastAPI WebSocket route | `FastAPIWebsocketTransport` in `/ws/plivo` | None | Yes | None |
| **Plivo Serializer** | Standard `PlivoFrameSerializer` | `DiagnosticPlivoFrameSerializer` (subclass of `PlivoFrameSerializer`) | Adds handling for Plivo `"stop"` and `"close"` events (returns `EndFrame()`), adds support for `audio/x-l16` codec, and logs packet counts | Yes (High value). Native Pipecat drops Plivo's `"stop"` event, which prevents clean call teardown. | Low |
| **Pre-STT Processing** | None (direct connection from `transport.input()` to STT) | `PreSTTDiagnosticProcessor` | Computes RMS, peak amplitude, and non-zero sample ratio for audio diagnostics | Optional (Diagnostic only). Does not buffer or alter audio bytes. | Very Low (<0.05ms) |
| **STT Service** | `SarvamSTTService(model=..., vad_signals=True)` | `SarvamSTTService(model=..., vad_signals=True, ttfs_p99_latency=0.15)` | Sets `ttfs_p99_latency` parameter | Yes | None |
| **Language Processing** | Fixed system prompt in `LLMContext` | `LanguageContextProcessor` placed between STT and User Aggregator | Inspects `TranscriptionFrame`, invokes `ConversationLanguageManager`, and pushes `LLMMessagesUpdateFrame` on language switch | Yes for multilingual clinic workflows (Hindi, Marathi, English) | Low |
| **Turn Detection & Strategies** | `UserTurnStrategies(start=[...], stop=[...])` | `UserTurnStrategies(start=[ExternalUserTurnStartStrategy(...)], stop=[ExternalUserTurnStopStrategy(timeout=0.25, wait_for_transcript=True)])` | Identical to clean reference | Yes | None |
| **Context Aggregation** | `LLMContextAggregatorPair(conversation_context, user_params=...)` | `LLMContextAggregatorPair(conversation_context, user_params=...)` | Identical to clean reference | Yes | None |
| **LLM Service** | `SarvamLLMService` | `InstrumentedSarvamLLMService` (subclasses `SarvamLLMService`) | Overrides `get_chat_completions` to wrap async stream in `InstrumentedAsyncStream` for delta/token timing | Optional for operation; critical for microsecond telemetry | Very Low (<0.1ms). Does not buffer tokens. |
| **Function Calling** | `FunctionSchema` instances with handlers in `LLMContext` | `ToolRegistry.resolve_tools()` creates `FunctionSchema` instances with context injection | Identical mechanism; adds trusted tenant context wrapper | Yes. Legitimate SaaS security boundary. | None |
| **TTS Service** | `SarvamTTSService` initialized at startup | `SarvamTTSService` initialized concurrently with background `_connect()` prewarm | Identical service class; connects earlier to shave ~200ms off greeting TTFB | Yes (Optimizes TTFB) | None |
| **Timing & Telemetry** | Native `observers` (`UserBotLatencyObserver`, `TurnTrackingObserver`, `StartupTimingObserver`) | Custom `RealtimeStreamingTimingMonitor` (`FrameProcessor` in pipeline) + `StartupTimingTracker` + `TurnTimingTracker` | NextLite uses an in-pipeline `FrameProcessor` instead of the newer `BaseObserver` composition API | Partially duplicate. Observers could replace the in-pipeline monitor in future versions. | Low (Phase 18C fixed greeting misattribution) |
| **Interruption (Barge-in)** | Native Pipecat `InterruptionFrame` -> `PlivoFrameSerializer` -> `clearAudio` | Native Pipecat `InterruptionFrame` -> `PlivoFrameSerializer` -> `clearAudio` | Identical to clean reference | Yes | None |
| **Greeting Playback** | Native `TTSSpeakFrame` queued on `on_pipeline_started` | Native `TTSSpeakFrame` queued on `on_pipeline_started` | Identical to clean reference | Yes | None |
| **Transcript Recording** | None (clean Pipecat does not persist conversation history) | `CallTranscriptCollector` stores turns and generates plain-text / JSON transcript for DB | Custom NextLite business requirement | Yes. Required for CRM, call review, and analytics. | None |
| **Call Lifecycle Management** | None (clean Pipecat shuts down runner on `EndFrame`) | `finalize_call_session` asynchronously updates NextLite Control Plane via `CallSessionClient` (ACTIVE -> COMPLETED/MISSED/FAILED) | Custom NextLite business requirement | Yes. Required for billing, CRM, and call records. | None |

---

## 3. Qualitative Comparison Summary

1. **Audio & Media Routing:** 100% compliant with clean Pipecat. No custom audio queues, buffers, or schedulers exist.
2. **Turn-Taking & Strategies:** 100% compliant with clean Pipecat. Employs official `UserTurnStrategies` with `ExternalUserTurnStartStrategy` and `ExternalUserTurnStopStrategy`.
3. **Function Calling:** 100% compliant with clean Pipecat. Employs native `FunctionSchema` registered in `LLMContext` and executed via Pipecat's native `BaseOpenAILLMService`.
4. **Telephony:** Extends `PlivoFrameSerializer` strictly to fix framework gaps (Plivo call termination `"stop"` event and Linear 16-bit PCM codec).
5. **Telemetry Divergence:** NextLite uses an in-pipeline `FrameProcessor` (`RealtimeStreamingTimingMonitor`) rather than Pipecat's newer `observers=[UserBotLatencyObserver, TurnTrackingObserver]`. This was necessary historically to capture external telephony, API persistence, and tool latency metrics that Pipecat's native observers do not measure.
