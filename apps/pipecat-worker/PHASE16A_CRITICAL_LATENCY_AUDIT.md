# NextLite Pipecat — Phase 16A Critical Latency and Number-Detection Audit

**Scope:** read-only forensic audit of the active Pipecat 1.8.1 runtime. No realtime behavior, provider configuration, prompts, schemas, VAD, telephony, or LiveKit runtime was changed.

## 1. Executive summary

The active path is Pipecat-only:

`Plivo PSTN -> FastAPI WebSocket -> Pipecat -> Sarvam STT -> LLMContext aggregation -> Sarvam LLM/tools -> Sarvam TTS -> Plivo`.

The current logs establish that the tool HTTP request was fast (110 ms), so it cannot explain the 7.374 s appointment turn. The dominant wait is before the LLM emits a tool call. The worker does **not** presently log the outbound LLM request boundary, function-call frame boundary, or the final-transcript boundary separately from `on_utterance_end`; therefore the long pre-tool period is attributable to the LLM/tool-decision stage, but cannot be split further with existing evidence.

The 522 ms `utterance end -> aggregation` gap has a concrete Pipecat mechanism: `ExternalUserTurnStopStrategy` is configured with its default `wait_for_transcript=True` and a 0.5 s polling timeout. The STT `on_utterance_end` event only logs; it does not finalize the user message. The aggregator waits for a final `TranscriptionFrame`, then emits the context frame that starts the LLM. This is a real, intentional gating point. It is **not proof** that precisely 522 ms is a fixed sleep: the current telemetry omits the final-transcript timestamp relative to `on_utterance_end`.

The supplied transcript proves the phone number reached STT. It then enters `LLMContext` unchanged. There is no deterministic phone-number parser, Devanagari-digit normalization, spoken-digit conversion, E.164 validation, or tool-argument audit. Tool handlers merely trim the LLM-supplied string. Consequently the number can be lost or malformed at LLM extraction, and the code cannot prove which value was sent to the Control Plane without sensitive diagnostic telemetry or inspecting the resulting record.

## 2. Exact real-call timeline

All worker timing values use `time.perf_counter()` (monotonic server time). The supplied wall-clock log timestamps are usable for deltas but cannot be combined with monotonic values from another process.

| Turn | Milestone | Observed | Delta | What the code actually timestamps |
|---|---|---:|---:|---|
| Simple 1 | Sarvam VAD speech stop | 15:28:26.678 | — | `SarvamSTTService.on_speech_stopped` records `speech_stop` (`main.py:861-866`). |
| Simple 1 | Sarvam `on_utterance_end` | 15:28:26.855 | 177 ms | Log only (`main.py:868-870`); **not** `stt_final`. |
| Simple 1 | User aggregation event | 15:28:27.377 | 522 ms after utterance end | `on_user_turn_stopped` / inference-triggered records `user_aggregation_finalized` (`main.py:926-936`). |
| Simple 1 | First LLM output | 15:28:30.572 | 3,195 ms after aggregation | `LLMTextFrame`/`TextFrame` arrival at timing monitor (`main.py:280-301`). |
| Simple 1 | First TTS audio | 15:28:31.094 | 522 ms after first LLM output | first `TTSAudioRawFrame` at monitor (`main.py:311-345`). |
| Simple 1 | Stop -> first audio | reported 2,147 ms | Contradicts the displayed timestamps (4,416 ms) | This is a telemetry/turn-correlation inconsistency; do not use this reported E2E number as ground truth. |
| Simple 2 | Speech stop / utterance end / aggregation | 15:28:37.957 / 38.266 / 39.494 | 309 ms / 1,228 ms | Same sources as above. |
| Simple 2 | First LLM output / first TTS audio | 15:28:40.681 / 41.126 | 1,187 ms / 445 ms | Same sources as above. |
| Tool | Speech stop / utterance end / aggregation | 15:29:28.593 / 28.846 / 29.352 | 253 ms / 506 ms | Same sources as above. |
| Tool | Tool handler starts / completes | 15:29:34.165 / 34.275 | 4,813 ms after aggregation / 110 ms | wrapper entry and return (`tool_registry.py:_instrument_function_schema`). |
| Tool | Post-tool first LLM output / first TTS audio | 15:29:35.492 / 35.968 | 1,217 ms / 476 ms | first outbound text / audio at monitor. |
| Tool | Stop -> first audio | reported 7,374 ms | displayed timestamps yield 7,375 ms | This tool-turn E2E delta is internally consistent. |

### Actual frame and queue path

1. Plivo WebSocket media is deserialized by `DiagnosticPlivoFrameSerializer.deserialize` into `InputAudioRawFrame` (`main.py:759-809`), then accepted by `FastAPIWebsocketTransport.input()`.
2. `PreSTTDiagnosticProcessor` forwards it to `SarvamSTTService` (`main.py:938-1005`). The only potentially asynchronous conversion is `ulaw_to_pcm` for non-L16 input; the observed production path logs L16/8 kHz and bypasses it.
3. Sarvam STT asynchronously maintains its provider websocket, emits VAD proposal frames and final `TranscriptionFrame`. `on_speech_started`, `on_speech_stopped`, and `on_utterance_end` are callbacks; only the first two alter timing state.
4. `LanguageContextProcessor` synchronously executes language heuristics for every final transcript and may send an `LLMMessagesUpdateFrame` only on a language switch (`language_processor.py`). It then forwards the original frame.
5. `LLMContextAggregatorPair.user()` collects transcript frames. `ExternalUserTurnStrategies()` is explicitly configured (`main.py:912-915`). The user aggregator emits `LLMContextFrame` downstream after the external stop strategy decides the turn is complete.
6. `SarvamLLMService` converts that context to an OpenAI-compatible streaming request. It uses Sarvam `/v1` for `sarvam-105b-conversations` (`pipecat/services/sarvam/llm.py`). The worker has no hook at HTTP request dispatch.
7. Normal text flows to `SarvamTTSService`; function calls become Pipecat function-call frames, invoke the registered async handler, and results return to `LLMAssistantAggregator`, which pushes another upstream `LLMContextFrame` for the post-tool request.
8. Sarvam TTS emits `TTSStartedFrame`, then `TTSAudioRawFrame`; `FastAPIWebsocketTransport.output()` serializes it to Plivo. The timing monitor sees `OutputAudioRawFrame` before output transport but logs no Plivo serialization/send completion timestamp.

## 3. Every unexplained or under-instrumented latency gap

| Gap | Evidence and assessment |
|---|---|
| Speech stop -> `on_utterance_end` (177–309 ms) | Sarvam provider endpointing/VAD callback time. Correctly separate from final transcript; not currently measured as a named metric. |
| `on_utterance_end` -> aggregation (506–1,228 ms; first example 522 ms) | Expected candidate mechanism is external turn stop waiting for final transcript. Exact split is missing because `on_utterance_end` and final `TranscriptionFrame` are not correlated. |
| Aggregation -> first LLM output (1.187–3.195 s) | Includes context-frame propagation, request scheduling/serialization, Sarvam queue/network, and first streamed output. Existing `LLMContextFrame` timestamp could delimit it if retained, but no HTTP-request timestamp exists. It is not attributable to any tool HTTP call. |
| Aggregation -> tool handler start (4.813 s) | Entirely precedes the 110 ms tool execution. It is necessarily LLM tool-choice generation / stream parsing / function-call scheduling, but the code lacks first LLM function-call frame/request telemetry to distinguish those. |
| Tool result -> first post-tool output (1.217 s) | Includes tool-result frame delivery, assistant aggregator context push, next LLM request, and Sarvam first output. The API returned in 110 ms; it is not Control Plane tool execution time. |
| LLM first output -> first TTS audio (445–522 ms) | Includes text chunking, TTS start, Sarvam TTS synthesis and audio propagation. `ttsStartToFirstAudioMs` is measured, but the quoted logs omit `TTSStartedFrame`; cannot separate handoff from provider synthesis. |
| First TTS audio -> Plivo output | No send-completion metric. `OutputAudioRawFrame` is only debug-logged, so caller-device latency cannot be proven from worker logs. |

## 4. Turn aggregation analysis

### Proven code path

`main.py:912-915` uses `ExternalUserTurnStrategies()`. In Pipecat 1.8.1 this installs `ExternalUserTurnStartStrategy` plus `ExternalUserTurnStopStrategy`.

`ExternalUserTurnStopStrategy` defaults to `timeout=0.5` and `wait_for_transcript=True`. After `ProposedUserStoppedSpeakingFrame`, it refuses to stop until it has final transcript text and no interim result. It runs a task which waits on an event with a 0.5-second timeout. A final `TranscriptionFrame` supplies the text/event; the strategy then triggers user-turn stop. Only then does `LLMUserAggregator._on_user_turn_inference_triggered` call `push_aggregation()`, append the user message to `LLMContext`, and push `LLMContextFrame` downstream.

Thus:

`Sarvam VAD end -> external stop strategy -> final transcript gate -> user aggregation -> LLMContextFrame -> Sarvam LLM`.

`on_utterance_end` is merely a log callback. It does not create a `TranscriptionFrame`, call the aggregator, queue an LLM request, or alter turn state. This is the exact reason it is invalid to label the 522 ms gap "STT final -> aggregation" based on that log alone.

### Finding

**PROVEN:** The Pipecat turn strategy intentionally makes final transcription a prerequisite for LLM inference, and its documented 0.5 s timeout is compatible with the observed ~0.5 s gaps.

**STRONGLY INDICATED:** The 1,228 ms second gap includes delayed final STT text, not merely VAD. The code contains no other explicit wait in that interval.

**NOT PROVEN:** Event-loop blocking, a duplicate queue, pending interruption, or a fixed aggregator sleep as the specific cause of any one production sample. The requested boundaries are not logged.

## 5. Tool-call delay analysis

### A. Why did execution wait ~4.8 seconds?

The handler's first executable line logs `tool_started`; no local tool code runs before that point. The handler then makes a single awaited `httpx` POST. Therefore the 4.813 s interval precedes the handler and cannot be caused by its API call.

Pipecat's function path is: Sarvam LLM streaming response -> tool-call parsing/in-progress frame -> registered handler -> `params.result_callback` -> `FunctionCallResultFrame` -> assistant aggregator context push -> next LLM request. The missing timestamp is the LLM request/first function-call frame. With the present data, the exact cause inside the pre-tool LLM stage is **UNKNOWN**; it may be provider TTFT/tool-selection generation, a delayed stream/function-call completion, or request scheduling. It is not a 4.8-second REST tool request.

### B. Why did post-tool LLM take ~1.2 seconds?

`LLMAssistantAggregator._maybe_push_context_after_function_result()` pushes an upstream `LLMContextFrame` once the final result is in context, unless another result is queued, the user is speaking, or the bot is speaking. In the supplied turn, the measured 1.217 s is post-result context delivery plus second Sarvam LLM request through first text. It is a distinct LLM TTFT measurement only if a request-dispatch timestamp is added; it cannot be interpreted as API time.

### C. Why did TTS take ~475 ms?

The number is first LLM text to first audio, not a clean provider TTS measure. The monitor records `tts_start` at `TTSStartedFrame` and audio at `TTSAudioRawFrame`, so `ttsStartToFirstAudioMs` is the valid synthesis-to-first-audio boundary. The quoted log omits the TTS start timestamp. Existing evidence supports "~475 ms total LLM-text-to-audio", not "475 ms Sarvam synthesis".

## 6. LLM TTFT and TTS telemetry audit

- `LLMContextFrame` at the monitor records `llm_start` before it reaches the LLM service. It is a **pipeline request-intent boundary**, not actual HTTP dispatch.
- First `LLMTextFrame`/`TextFrame` is valid first observable output. It can be either normal response text; a tool-only response may produce no text before its tool call.
- There is no `LLM request dispatched`, HTTP connection/first-byte, tool-call-delta, function-call-complete, or post-tool request-dispatched telemetry.
- `TTSStartedFrame` and first `TTSAudioRawFrame` are the correct worker-side TTS boundaries. `tts_connected` is connection-ready state, but `TurnTimingTracker.start_new_turn()` fails to reset `tts_connected`, so this metric leaks across turns.
- `OutputAudioRawFrame` is observed before transport output; no timestamp verifies WebSocket write completion or Plivo receipt.

## 7. Interruption state and `TURN_METRICS_INVALID`

### False interruption / turn-state issue: YES

This is a telemetry ownership defect, and it can label healthy calls incorrectly. It is not yet proven to delay the response pipeline.

1. The monitor marks every `InterruptionFrame` as `user_barge_in` (`main.py:372-389`). It does not verify that the frame interrupted active TTS/LLM output, nor does it attach the interruption to a stable turn id.
2. On either `TTSStoppedFrame` **or** `LLMFullResponseEndFrame`, it completes, emits, and immediately starts a new turn (`main.py:347-357`). Both frames are part of one assistant response, so the same response can finalize/reset twice.
3. A later/duplicate `TTSStoppedFrame` can therefore emit a zero-duration turn whose `speech_start` was created by the prior reset. This exactly fits `responseLatencyMs=null` and `totalTurnDurationMs=0` records after `interrupted=true`.
4. `start_new_turn()` resets most fields but does **not** reset `tts_connected`. A new turn's `tts_start` can be later than a connection timestamp from a prior turn, producing the reported negative `ttsConnectionMs` values (-359 ms, -13,108 ms, -23,216 ms).
5. Speech timestamps can also be overwritten twice: direct Sarvam callbacks record them and the monitor records proposed/user speaking frames again (`main.py:234-243`, `main.py:854-866`). This is not necessarily wrong, but it makes the metric's event source ambiguous.

There is no blocking lock, retry, or wait tied to `interrupted`; the inspected code only mutates metrics/transcript state. Hence a direct latency effect is **possible but unproven**. The metric data is unreliable enough that it must not be used to compare real calls until correlation is repaired.

## 8. Startup audit

The 3,626 ms `websocket_accept -> first_greeting_audio` is a serial startup chain by construction:

1. Wait for Plivo `start` WebSocket message.
2. Await RuntimeConfig HTTP GET (`main.py:635-646`).
3. Compute config/temporal context and await Control Plane `create_call_session` POST (`main.py:708-750`). This is explicitly sequential with config resolution.
4. Construct serializer, transport, STT, tools/context, LLM, TTS, monitor, pipeline, worker.
5. Start pipeline. STT/TTS websocket connects occur after pipeline start.
6. `on_pipeline_started` queues the greeting; `SarvamTTSService` then connects/synthesizes it.

The reported `pipelineToTtsReadyMs=1,285` and `greetingQueueToFirstAudioMs=579` account for 1,864 ms of the 3,626 ms total. The remaining 1,762 ms is necessarily before/at pipeline readiness: Plivo start wait, config GET, call-session POST, construction, runner scheduling, and/or STT/TTS connection scheduling. Current aggregate metrics do not expose each value, though the `StartupTimingTracker` records the raw stages.

No synchronous database operation exists in the worker. HTTP is async. Tool resolution/context construction is CPU-local and small. Startup is not parallelized: the call-session POST cannot overlap with later construction under this code. That is an audit finding, not an instruction to change it in Phase 16A.

## 9. Phone-number data-flow audit

### Proven path

1. Sarvam STT emits the supplied final transcript, including `९६५७९५४६४१` and the spoken English digit sequence. The reported log proves STT received it.
2. `LanguageContextProcessor` reads but does not modify `frame.text`; it forwards the exact `TranscriptionFrame`.
3. `LLMUserAggregator._handle_transcription` appends the transcript to its aggregation and `push_aggregation()` writes it as the `user` message in the shared `LLMContext`.
4. `SarvamLLMService` receives that context and exposes the registered tools.
5. The model may emit `customerPhone` in `create_callback_lead` or `book_appointment` arguments. The wrapper records raw `params.arguments` to the transcript collector before handler execution.
6. Each handler selects `raw_args.customerPhone` if it is a nonempty string, otherwise trusted `caller_phone`; it does only `.strip()`, then posts it to the Control Plane.

### Findings

| Variant | STT/aggregation | Normalization/validation | Result |
|---|---|---|---|
| Devanagari digits `९६५७९५४६४१` | Preserved Unicode text | None | The LLM may pass Unicode digits untouched; API receives them untouched. |
| Spoken Hindi-script English digits `नाइन सिक्स फाइव...` | Preserved text | None | Requires LLM to infer/assemble the number. |
| Mixed digits and words | Preserved text | None | Requires LLM to reconcile alternatives; no deterministic precedence exists. |
| Caller-number fallback | Metadata extracted from Plivo start/query | No E.164 validation | Used only when LLM omits/empties `customerPhone`; it does not repair malformed explicit LLM input. |

The schemas describe `customerPhone` only as "Contact phone number. Omit if using caller's number." They do not require 10 digits/E.164, explain Devanagari/spoken digits, or require the exact number from the latest transcript. Unlike the legacy implementation, the Pipecat handlers do not have Zod parsing either; they perform basic type/nonempty checks only. Neither implementation normalizes Indic digits or spoken numbers.

**NUMBER DETECTION ROOT CAUSE: downstream extraction/normalization gap — strongly indicated.** STT is excluded as root cause for the reported call. The exact handoff where the value disappeared is **UNKNOWN** because raw tool args and outgoing payload are not safely correlated in existing production logs. The Control Plane API is not exercised in this audit, so API-side validation remains unverified.

## 10. LiveKit behavioral comparison (reference only)

No LiveKit component is active or recommended.

| Behavior | Legacy LiveKit reference | Active Pipecat behavior / difference |
|---|---|---|
| Turn endpointing | `AgentSession` owns turn manager; timing tracker has explicit transcript-final, committed-turn, LLM-start, tool-start, TTS-start, first-audio points. | Pipecat uses Sarvam VAD plus `ExternalUserTurnStopStrategy`, which waits for final transcript by default. Its current instrumentation lacks actual request/tool-call boundaries. |
| Transcript/context | Agent session retains transcript/context. | Pipecat forwards final transcript unchanged into `LLMContext`; proven equivalent for supplied number. |
| Phone handling | Zod verifies type/length only; no digit-word/Devanagari conversion. | Basic nonempty string checks only; same absence of numeric normalization, weaker schema enforcement. |
| Tool result | Native tool return resumes response. | `LLMAssistantAggregator` deliberately defers re-inference if other results are queued, user is speaking, or bot is speaking. This is a Pipecat-specific scheduling condition worth measuring. |
| Interruptions | Legacy recorded a dedicated TTS interruption event. | Current monitor treats every `InterruptionFrame` as barge-in and can complete the same turn on both LLM end and TTS stop. |

## 11. Event-loop and blocking audit

No blocking filesystem, synchronous database, polling loop on the media path, CPU-heavy RAG, or `time.sleep` was found. The relevant network operations use `await`:

- Sarvam STT/LLM/TTS websocket activity is provider async I/O.
- Runtime config and call session use `httpx.AsyncClient`.
- Lead/appointment/RAG tools use awaited HTTP requests, each with finite timeout.
- The only `asyncio.sleep` in application code is the maximum-call-duration task, outside a normal user turn.

Possible serial waits remain: external final-transcript gating; Pipecat queues; LLM request/stream parsing; assistant aggregator's result deferral rules; and TTS streaming. No code evidence supports blocking CPU/event loop as the source of the observed 3.2 s or 4.8 s waits.

## 12. Root causes ranked by confidence

### PROVEN

1. **Aggregation is gated by final transcript.** `ExternalUserTurnStopStrategy(wait_for_transcript=True, timeout=0.5)` sits after Sarvam VAD stop and before `LLMContextFrame`.
2. **The 4.8 s tool wait is not tool API time.** The handler starts only after the LLM has selected/parsing-dispatched the function call; its HTTP request completed in 110 ms.
3. **Turn metrics have state-correlation defects.** Duplicate end-frame completion and stale `tts_connected` explain invalid/zero/negative metrics.
4. **The shown number reached STT and Pipecat aggregation.** No number conversion exists after that point.

### STRONGLY INDICATED

1. **REAL LATENCY ROOT CAUSE #1:** final-transcript/turn-finalization gating contributes approximately 0.5–1.2 s before the LLM can start.
2. **REAL LATENCY ROOT CAUSE #2:** unusually slow Sarvam LLM tool-decision/stream stage contributes approximately 4.8 s before the handler, and a separate ~1.2 s after the result. It is not the tool API.
3. **NUMBER DETECTION ROOT CAUSE:** model-dependent extraction from raw multilingual text with no canonical phone normalization/validation or argument/payload observability.
4. Startup is serial around config/session creation and provider readiness.

### POSSIBLE

1. Assistant aggregator deferred post-tool re-inference because it believed bot/user state was active or multiple result frames were queued.
2. False/duplicate interruption state may perturb Pipecat's active turn state. It is proven to corrupt telemetry, not proven to create the long waits.
3. Full prompt/history/tool payload may increase Sarvam TTFT; prior Phase 14A reports a payload-size correlation, but no request payload or provider trace was captured for this call.

## 13. Recommended fixes ranked by impact (not implemented)

1. **First, add minimal Phase 16B correlation telemetry**: a stable turn UUID on every VAD, utterance-end, final-transcript, user-message-added, `LLMContextFrame`, actual LLM HTTP dispatch, first text, first tool-call delta, handler start/end, result-frame arrival, post-tool HTTP dispatch, TTS start, first audio, and output write. Log only normalized lengths/hash or last four digits for phone fields. This is the single first fix because it turns the 3.2/4.8-second intervals from inference into evidence.
2. Repair timing state ownership: complete a turn only once, reset `tts_connected`, use exactly one speech event source, and distinguish an interruption of active output from all interruption frames.
3. After evidence confirms the distribution, decide whether the intentional external stop strategy must wait for final transcript on PSTN. Do not change it before measuring final-transcript arrival.
4. Add deterministic phone canonicalization/validation plus explicit tool instructions and tests for Devanagari, spoken digits, and mixed forms; retain caller-ID fallback only for omitted values.
5. Add stage-level startup timings and evaluate safe parallelism only after recording the runtime-config and call-session request durations.

## 14. What must not change in Phase 16A

- Do not restore or introduce LiveKit, SIP, WebRTC, or a second voice framework.
- Do not change Sarvam models, VAD configuration, turn strategy, prompts, RAG, tools, schemas, Plivo behavior, or provider routing in this audit phase.
- Do not claim an API or TTS-provider latency from an aggregate timestamp that does not isolate it.

## 15. Exact Phase 16B recommendation

Implement only a minimal, correlation-safe diagnostic processor/service wrapper around the existing Pipecat pipeline. It must use one monotonic clock, one immutable turn ID created on Sarvam VAD start, and record the boundaries listed in recommendation 1. Capture a small controlled PSTN matrix: simple Hindi, Hindi numeric digits, spoken English digits in Devanagari, mixed number, lead, appointment, and one intentional barge-in. Compare final transcript, `LLMContext` user message (redacted), raw function args (redacted), normalized payload (redacted), and Control Plane accepted value. Do not optimize turn strategy, providers, tools, or prompts until those traces exist.

## 16. Required status block

```text
REAL LATENCY ROOT CAUSE #1:
External Pipecat user-turn finalization waits for final STT transcript before emitting LLMContextFrame; the default strategy has a 0.5 s timeout. Proven mechanism; per-call share needs final-transcript telemetry.

REAL LATENCY ROOT CAUSE #2:
The ~4.8 s appointment wait is before tool handler entry, therefore in LLM tool-decision/stream parsing/scheduling, not the 110 ms Control Plane tool API. Exact subcause is unmeasured.

NUMBER DETECTION ROOT CAUSE:
Downstream LLM extraction plus absent Devanagari/spoken-digit normalization and phone validation. STT received the number. Exact loss point is unmeasured.

FALSE INTERRUPTION/TURN STATE ISSUE:
YES — proven telemetry/turn ownership defect; impact on actual latency is UNKNOWN.

STARTUP ISSUE:
Serial config GET -> call-session POST -> construction -> provider connection -> queued greeting; 1.285 s provider readiness and 579 ms greeting-to-audio are measured, while 1.762 s pre-pipeline portion is not decomposed.

RECOMMENDED SINGLE FIRST FIX:
Add minimal stable-turn, monotonic boundary telemetry at final transcript, LLM dispatch, tool-call frame, result-frame, post-tool dispatch, TTS start/audio, and Plivo output. Stop after that diagnostic Phase 16B capture before optimization.
```

## 17. Verification

`PYTHONPATH=. .\\.venv\\Scripts\\python.exe -m pytest -q` completed successfully: **167 passed**. Four warnings were emitted, including a pre-existing pytest-cache path warning and a Pipecat un-awaited coroutine warning during process teardown; no test failed.
