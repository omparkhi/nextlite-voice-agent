# Pipecat vs NextLite Ownership Matrix

**Audit Target:** `apps/pipecat-worker`  
**Installed Framework:** `pipecat-ai==1.8.1` / Python 3.14.3  
**Audit Date:** 2026-09-11  

---

## 1. Ownership & Responsibility Matrix

| Responsibility | Current Owner | Should Be Owned By | Native Pipecat API | Duplicate? | Latency Risk | Correctness Risk | Action |
|---|---|---|---|---|---|---|---|
| **WebSocket transport** | Native Pipecat | Pipecat | `FastAPIWebsocketTransport` | No | None | None | Retain native `FastAPIWebsocketTransport`. |
| **Plivo protocol** | `DiagnosticPlivoFrameSerializer` (subclasses Pipecat) | Pipecat + Subclass | `PlivoFrameSerializer` | Partially | Low (<0.5ms) | Medium (Native misses `"stop"`/`"close"` events) | Retain subclass: native Pipecat misses Plivo call termination events and L16 linear PCM codec. |
| **Audio serialization** | `DiagnosticPlivoFrameSerializer` | Pipecat | `PlivoFrameSerializer` (`pcm_to_ulaw`, `ulaw_to_pcm`) | Partially | Low | Low | Retain codec compatibility handling for 8kHz linear PCM vs μ-law. |
| **Audio input** | Native Pipecat | Pipecat | `transport.input()` -> `InputAudioRawFrame` | No | None | None | Retain native audio input frame flow. |
| **Audio output** | Native Pipecat | Pipecat | `transport.output()` -> `OutputAudioRawFrame` | No | None | None | Retain native audio output frame flow. |
| **Frame routing** | Native Pipecat | Pipecat | `Pipeline.push_frame()` / `FrameProcessor` | No | None | None | Retain native frame routing. No custom router detected. |
| **Pipeline execution** | Native Pipecat | Pipecat | `PipelineWorker`, `PipelineParams` | No | None | None | Retain native `PipelineWorker`. |
| **Worker lifecycle** | Native Pipecat | Pipecat | `WorkerRunner.run()` | No | None | None | Retain native `WorkerRunner`. |
| **Task lifecycle** | Native Pipecat | Pipecat | `BaseObject.task_manager`, `create_task()` | Minor (3 raw `asyncio.create_task`) | Low | Low (Background session creation protected by `asyncio.shield`) | Consider migrating background session & timeout tasks to `task_manager` in future phases. |
| **Interruption (Barge-in)** | Native Pipecat | Pipecat | `UserTurnStrategies`, `InterruptionFrame`, `PlivoFrameSerializer` | No | None | None | Retain 100% native Pipecat interruption. Native serializer automatically emits Plivo `clearAudio`. |
| **Turn start** | Native Pipecat + Callback listener | Pipecat | `ExternalUserTurnStartStrategy`, `UserStartedSpeakingFrame` | Partially (dual-recorded in VAD callback & frame processor) | Low | Low (Idempotent deduplication in place) | Authoritative source should remain `UserStartedSpeakingFrame` or Pipecat's `TurnTrackingObserver`. |
| **Turn stop** | Native Pipecat + Callback listener | Pipecat | `ExternalUserTurnStopStrategy`, `UserStoppedSpeakingFrame` | Partially (dual-recorded in VAD callback & frame processor) | Low | Low (Idempotent deduplication in place) | Authoritative source should remain `UserStoppedSpeakingFrame`. |
| **Endpointing** | Native Pipecat | Pipecat | `ExternalUserTurnStopStrategy(timeout=0.25, wait_for_transcript=True)` | No | None | None | Retain native Pipecat endpointing strategies. |
| **STT service** | Native Pipecat | Pipecat | `SarvamSTTService` | No | None | None | Retain native `SarvamSTTService`. |
| **Transcript events** | Native Pipecat | Pipecat | `TranscriptionFrame` | No | None | None | Retain native `TranscriptionFrame`. |
| **User aggregation** | Native Pipecat | Pipecat | `LLMContextAggregatorPair.user()` | No | None | None | Retain native universal user aggregator. |
| **LLM context** | Native Pipecat | Pipecat | `LLMContext` | No | None | None | Retain native Pipecat `LLMContext`. |
| **LLM streaming** | Native Pipecat (`InstrumentedAsyncStream` wrapper) | Pipecat | `SarvamLLMService.get_chat_completions()` | Low (wrapping stream for monotonic timing) | Very Low (<0.1ms) | None | Wrapper only inspects choices delta timestamps; does not alter streaming. |
| **Function calling** | Native Pipecat | Pipecat | `BaseOpenAILLMService.run_function_calls()`, `FunctionSchema` | No | None | None | Retain 100% native Pipecat function calling. |
| **Tool execution** | NextLite Tool Registry + Native Handlers | NextLite | `FunctionSchema.handler` | No | Tool runtime depends on backend API | None | Retain NextLite tool execution. Handlers execute asynchronously through Pipecat's native runner. |
| **TTS synthesis** | Native Pipecat | Pipecat | `SarvamTTSService` | No | None | None | Retain native `SarvamTTSService`. |
| **TTS interruption** | Native Pipecat | Pipecat | `TTSService.process_frame(InterruptionFrame)` | No | None | None | Retain native Pipecat TTS cancellation. |
| **Greeting** | Native Pipecat frame + NextLite trigger | Pipecat (synthesis) / NextLite (text) | `worker.queue_frame(TTSSpeakFrame(greeting))` | No | None | Low (Resolved in Phase 18C) | Retain native `TTSSpeakFrame`. Greeting routes directly to TTS, completely bypassing LLM. |
| **Transcript collection** | NextLite `CallTranscriptCollector` | NextLite | None (Pipecat does not persist full conversation transcripts) | No | None | Low (Resolved in Phase 18C) | Retain NextLite `CallTranscriptCollector`. |
| **Call lifecycle** | NextLite `finalize_call_session` | NextLite | None (Pipecat has no concept of NextLite CallSession records) | No | None | None | Retain NextLite lifecycle manager. |
| **Call session persistence** | NextLite `CallSessionClient` | NextLite | None | No | None | None | Retain NextLite API persistence. |
| **Startup timing** | NextLite `StartupTimingTracker` | NextLite / Pipecat Observer | Pipecat `StartupTimingObserver` | Duplicate | None | None | NextLite tracker captures external PSTN stages (`plivo_start_received`, `deploymentId`, etc.) which Pipecat cannot know. |
| **Turn timing** | NextLite `TurnTimingTracker` | NextLite / Pipecat Observer | Pipecat `UserBotLatencyObserver`, `TurnTrackingObserver` | Duplicate | None | None | NextLite tracker adds granular backend API and tool-execution stages. |
| **Metrics telemetry** | NextLite `[TURN_METRICS]` & `[CALL_STARTUP_METRICS]` | NextLite | Pipecat `MetricsFrame`, `on_latency_breakdown` | Duplicate | None | None | NextLite produces structured JSON logs for Control Plane ingest. |
| **Tenant / Runtime config** | NextLite `RuntimeConfigClient` | NextLite | None | No | None | None | Retain NextLite configuration layer. |
| **RAG / Knowledge API** | NextLite `query_knowledge_base` | NextLite | None | No | API backend search | None | Retain NextLite RAG tool. |
| **Appointment tools** | NextLite `book_appointment` | NextLite | None | No | API backend DB | None | Retain NextLite appointment tool. |
| **Lead tools** | NextLite `create_callback_lead` | NextLite | None | No | API backend DB | None | Retain NextLite lead tool. |
| **CRM integration** | NextLite API | NextLite | None | No | None | None | Retain NextLite CRM layer. |
| **Authentication & Secrets** | NextLite `settings.POC_SECRET_KEY`, `WORKER_API_SECRET` | NextLite | None | No | None | None | Retain NextLite security layer. |

---

## 2. Framework vs Application Boundary Verdict

- **Pipecat (Realtime Voice Infrastructure):** Owns audio I/O, WebSocket transport, frame scheduling, VAD turn-stop strategies, STT/TTS service communication, LLM streaming, native tool-call invocation, and audio buffer flushing on interruption.
- **NextLite (SaaS Control Plane & Business Logic):** Owns tenant isolation, deployment resolution, prompt compilation, authoritative timezone/calendar grounding, CRM/appointment tools, database persistence, and call session state.
