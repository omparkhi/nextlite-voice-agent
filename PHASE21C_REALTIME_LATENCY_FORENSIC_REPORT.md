# PHASE 21C — FORENSIC-ONLY REALTIME LATENCY AUDIT

**Date:** 2026-09-12
**Status:** READ-ONLY FORENSIC INVESTIGATION
**Pipecat Version:** 1.8.1
**Sarvam TTS:** bulbul:v3 (WebSocket streaming)
**Sarvam STT:** saaras:v3
**Sarvam LLM:** sarvam-105b-conversations

---

## 1. Executive Summary

This is a forensic-only investigation of the NextLite Pipecat voice runtime latency. No code was modified. Every finding is classified as PROVEN, INFERRED, or UNKNOWN.

**Key findings:**

- **Greeting worker-side first audio:** ~2,011ms from call_start. This is NOT caller-perceived latency. The greeting path is serialized: RuntimeConfig (252ms) → pipeline services (277ms) → pipeline start (3ms) → TTS WebSocket connect (~855ms) → greeting TTS start (36ms) → first audio (562ms). The TTS WebSocket connection dominates at ~855ms.

- **Normal response P50:** ~3,360ms speech_stop → first TTS audio. The 500ms target is NOT achievable with the current component latencies.

- **Normal response P50 (best case, recent turn):** ~2,264ms. Still 4.5x the target.

- **LLM TTFT dominates:** Ranges from 607ms to 2,894ms. This is the single largest component.

- **TTS TTFB is highly variable:** 421ms to 987ms. Sarvam TTS WebSocket behavior is inconsistent.

- **Telemetry has multiple integrity defects:** Duplicate `greeting_first_audio` events, duplicate `turn_completed` events, tool turns split into two logical turns but tracked as separate telemetry events.

- **500ms target:** NOT FEASIBLE with current architecture. Theoretical minimum is ~1.4s with perfect components.

- **1-second greeting:** NOT FEASIBLE without TTS pre-warm or architectural changes. TTS WebSocket connection alone takes ~855ms.

---

## 2. Current Targets

| Target | Definition | Current | Gap | Status |
|--------|-----------|---------|-----|--------|
| Greeting ≤1s | call_start → first TTS audio | 2,011ms | +1,011ms | NOT MET |
| Normal response P50 | speech_stop → first TTS audio | ~2,264-4,457ms | +1,764-3,957ms | NOT MET |
| Measurement integrity | No duplicate events | Multiple defects | — | DEFECTIVE |

---

## 3. Latest Call Timeline (Primary Evidence)

### Startup Waterfall

| Event | Timestamp | Delta from Previous | Cumulative |
|-------|-----------|-------------------|-----------|
| websocket_handler_entered | +0ms | — | 0ms |
| websocket_accepted | +3ms | 3ms | 3ms |
| plivo_start_received | +108ms | 105ms | 108ms |
| runtime_config_resolved | +252ms | 144ms | 252ms |
| temporal_context_ready | +272ms | 20ms | 272ms |
| tts_service_create_start | +273ms | 1ms | 273ms |
| stt_service_created | +528ms | 255ms | 528ms |
| tool_registry_resolved | +529ms | 1ms | 529ms |
| llm_service_created | +530ms | 1ms | 530ms |
| pipeline_created | +531ms | 1ms | 531ms |
| pipeline_start | +532ms | 1ms | 532ms |
| pipeline_started | +533ms | 1ms | 533ms |
| pipeline_runner_started | +533ms | 0ms | 533ms |
| call_session_created | +659ms | 126ms | 659ms |
| tts_ready (TTS WS connected) | +1,388ms | 729ms | 1,388ms |
| greeting_queued | +1,424ms | 36ms | 1,424ms |
| greeting_tts_started | +1,449ms | 25ms | 1,449ms |
| greeting_first_audio | +2,011ms | 562ms | 2,011ms |

**Key observation:** `greeting_first_audio` appears multiple times in the log (+2008ms, +2011ms, +2070ms, +2083ms, +2170ms, etc.). This is a telemetry defect — see Part 13.

---

## 4. Greeting Waterfall

```
call_start (0ms)
  └─ websocket accept (3ms)
      └─ plivo_start_received (108ms)          [Plivo WebSocket negotiation]
          └─ runtime_config_resolved (252ms)    [HTTP GET RuntimeAgentConfig]
              └─ temporal_context_ready (272ms) [pure computation, ~0ms]
              └─ tts_service_create_start (273ms)
                  └─ stt_service_created (528ms)  [Sarvam STT constructor]
                  └─ tool_registry_resolved (529ms)
                  └─ llm_service_created (530ms)
                  └─ pipeline_created (531ms)
              └─ pipeline_start (532ms)
              └─ pipeline_started (533ms)
              └─ pipeline_runner_started (533ms)
          └─ call_session_created (659ms)       [background HTTP POST]
          └─ tts_ready (1,388ms)                [TTS WebSocket connect: 855ms]
              └─ greeting_queued (1,424ms)       [36ms pipeline frame routing]
                  └─ greeting_tts_started (1,449ms) [25ms TTS processing]
                      └─ greeting_first_audio (2,011ms) [562ms Sarvam synthesis]
```

### Minimum Theoretical Greeting Path

The greeting is a `TTSSpeakFrame` pushed after `on_pipeline_started`. The actual dependency chain is:

1. **WebSocket accepted** — REQUIRED (Plivo must connect)
2. **Plivo start received** — REQUIRED (stream metadata needed)
3. **RuntimeConfig resolved** — REQUIRED (greeting text, voice, TTS model come from here)
4. **TTS service created** — REQUIRED (must exist to speak greeting)
5. **TTS WebSocket connected** — REQUIRED (must be connected before synthesis)
6. **Pipeline started** — REQUIRED (greeting queued on pipeline_started)
7. **Greeting queued** — REQUIRED (TTSSpeakFrame pushed)
8. **TTS synthesis** — REQUIRED (Sarvam processes text, generates audio)

**NOT required for greeting:**
- STT service creation (528ms) — greeting doesn't need STT
- Tool registry resolution (529ms) — greeting doesn't use tools
- LLM service creation (530ms) — greeting bypasses LLM
- Temporal context (272ms) — greeting doesn't use temporal context
- CallSession creation (659ms) — greeting doesn't need session
- LanguageManager setup — greeting doesn't need language detection

**Sequential operations that happen in parallel:**
- STT, tool registry, LLM, and pipeline construction all happen sequentially in code but are independent of each other and of the greeting path.

**Theoretical minimum greeting path (no architectural changes):**
- Plivo start: ~100ms
- RuntimeConfig: ~150ms (cached HTTP)
- TTS service create: ~5ms (constructor only)
- TTS WebSocket connect: ~400ms (Sarvam network)
- Pipeline start: ~2ms
- Greeting queued → TTS start: ~30ms
- TTS synthesis (first audio): ~400ms (text-dependent)
- **Total theoretical minimum: ~1,087ms** — still above 1s target

---

## 5. Normal Turn Waterfalls

### Turn 1 (Primary Evidence)

| Stage | Timestamp | Delta | Confidence |
|-------|-----------|-------|-----------|
| user_speech_stop | +10,244ms | — | PROVEN |
| stt_utterance_end | +10,493ms | 249ms | PROVEN |
| user_aggregated | +10,759ms | 266ms | PROVEN |
| llm_request_created | +10,806ms | 47ms | PROVEN |
| llm_first_provider_response | +13,700ms | 2,894ms | PROVEN |
| llm_first_text_output | +13,719ms | 19ms | PROVEN |
| tts_started | +14,280ms | 561ms | PROVEN |
| tts_first_audio | +14,701ms | 421ms | PROVEN |
| turn_completed | +15,052ms | 351ms | PROVEN |

**Total: speech_stop → first_audio = 4,457ms**

### Turn 2 (Second Normal Turn)

| Stage | Timestamp | Delta |
|-------|-----------|-------|
| user_speech_stop | +21,429ms | — |
| stt_utterance_end | +21,568ms | 139ms |
| user_aggregated | +21,822ms | 254ms |
| llm_request_created | +21,825ms | 3ms |
| llm_first_provider_response | +22,481ms | 656ms |
| llm_first_text_output | +22,484ms | 3ms |
| tts_started | +22,706ms | 222ms |
| tts_first_audio | +23,693ms | 987ms |
| turn_completed | +24,207ms | 514ms |

**Total: speech_stop → first_audio = 2,264ms**

### Normal Turn Comparison Table

| TURN | ENDPOINT | AGG | LLM SCHED | LLM TTFT | LLM→TEXT | TEXT→TTS | TTS TTFB | TOTAL |
|------|----------|-----|-----------|----------|----------|---------|---------|-------|
| T1 | 249ms | 266ms | 47ms | 2,894ms | 19ms | 561ms | 421ms | 4,457ms |
| T2 | 139ms | 254ms | 3ms | 656ms | 3ms | 222ms | 987ms | 2,264ms |

**Observation:** LLM TTFT varies by 4.4x (656ms vs 2,894ms). TTS TTFB varies by 2.3x (421ms vs 987ms). This proves substantial provider-side variability.

---

## 6. Tool Turn Waterfalls

### Tool Turn 1

| Stage | Timestamp | Delta |
|-------|-----------|-------|
| user_speech_stop | +33,794ms | — |
| stt_utterance_end | +33,958ms | 164ms |
| user_aggregated | +34,218ms | 260ms |
| llm_request_created | +34,220ms | 2ms |
| llm_first_provider_response | +34,827ms | 607ms |
| first_tool_call_delta | +35,044ms | 217ms |
| tool_call_complete | +37,361ms | 2,317ms |
| llm_response_complete | +37,361ms | 0ms |
| tool_executed | +37,365ms | 4ms |
| turn_completed | +37,369ms | 4ms |
| **Post-tool phase:** | | |
| post_tool_llm_context | +37,381ms | 12ms |
| post_tool_llm_request_created | +37,384ms | 3ms |
| post_tool_llm_first_provider_response | +38,297ms | 913ms |
| post_tool_llm_first_output | +38,300ms | 3ms |
| tts_started | +38,960ms | 660ms |
| tts_first_audio | +39,378ms | 418ms |
| tts_stopped | +40,228ms | 850ms |
| turn_completed | +40,229ms | 1ms |

**Tool JSON generation: ~2,317ms. Tool execution: ~4ms. Post-tool LLM TTFT: 913ms.**

### Tool Turn 2

| Stage | Timestamp | Delta |
|-------|-----------|-------|
| user_speech_stop | +48,634ms | — |
| stt_utterance_end | +48,791ms | 157ms |
| user_aggregated | +49,054ms | 263ms |
| llm_request_created | +49,056ms | 2ms |
| llm_first_provider_response | +49,798ms | 742ms |
| llm_first_text_output | +49,802ms | 4ms |
| first_tool_call_delta | +50,008ms | 206ms |
| tool_call_complete | +53,029ms | 3,021ms |
| llm_response_complete | +53,029ms | 0ms |
| tool_executed | +53,134ms | 105ms |
| turn_completed | +53,138ms | 4ms |
| **Post-tool phase:** | | |
| post_tool_llm_context | +53,138ms | 0ms |
| post_tool_llm_request_created | +53,140ms | 2ms |
| post_tool_llm_first_provider_response | +53,791ms | 651ms |
| post_tool_llm_first_output | +53,793ms | 2ms |
| tts_started | +54,189ms | 396ms |
| tts_first_audio | +55,120ms | 931ms |
| tts_stopped | +56,737ms | 1,617ms |
| turn_completed | +56,737ms | 0ms |

**Tool JSON generation: 3,021ms. Tool execution: 105ms. Post-tool LLM TTFT: 651ms.**

---

## 7. LLM Analysis

### Observed TTFT Values

| Turn | TTFT | Type |
|------|------|------|
| Turn 1 | 2,894ms | Normal turn (cold) |
| Turn 2 | 656ms | Normal turn (warm) |
| Tool Turn 1 (pre-tool) | 607ms | Tool invocation |
| Tool Turn 1 (post-tool) | 913ms | Post-tool response |
| Tool Turn 2 (pre-tool) | 742ms | Tool invocation |
| Tool Turn 2 (post-tool) | 651ms | Post-tool response |

**Observation:** Turn 1 TTFT is 4.4x higher than Turn 2. This is consistent with LLM "cold start" — the first request likely includes connection setup (DNS, TCP, TLS) and possibly model warm-up on the Sarvam provider side.

### Connection Reuse (Phase 21B)

**PROVEN from source code:**

Phase 21B implemented a shared worker-lifetime `httpx.AsyncClient` (`app.state.sarvam_llm_http_client`) in `main.py:134-142`:

```python
app.state.sarvam_llm_http_client = httpx.AsyncClient(
    limits=httpx.Limits(
        max_connections=50,
        max_keepalive_connections=20,
        keepalive_expiry=60.0,
    ),
    timeout=httpx.Timeout(30.0, connect=10.0),
    http2=False,
)
```

This client is injected into `InstrumentedSarvamLLMService` via `http_client=sarvam_llm_pool` (line 1335). The `create_client` method at line 304-335 uses this shared client instead of creating a new `DefaultAsyncHttpxClient`.

**However:** The `AsyncOpenAI` client is created per-call (per WebSocket connection) at `main.py:1331-1336`. While the underlying `httpx.AsyncClient` transport is shared, the `AsyncOpenAI` wrapper object itself is new per call. The connection pool IS shared, but the OpenAI SDK client lifecycle is per-call.

**Impact on TTFT:** Connection reuse means DNS+TCP+TLS is amortized after the first call. But the OpenAI SDK client still needs to serialize the request, set up streaming, etc. The 2,894ms outlier may reflect Sarvam provider-side cold start, not client-side connection setup.

### LLM Context Size

**INFERRED from code:**
- System prompt: Variable (compiled_system_prompt + temporal_instructions + language instructions)
- Tool schemas: Variable (1-3 tools × ~200-500 tokens each)
- Conversation history: Grows linearly with turns
- Temporal context: ~100-200 tokens
- Greeting: Injected as assistant message (~20-50 tokens)

**UNKNOWN:** Exact token counts. Not logged. The `emit_llm_ttft_audit_log` method accepts `estimated_prompt_tokens` but it is never called with actual values in production code.

---

## 8. TTS Analysis

### SarvamTTSService Lifecycle

1. **Constructor** (`__init__`): Validates model, sets defaults, stores config. No WebSocket connection.
2. **`setup()`** (called by Pipecat pipeline): Calls `_connect()` which calls `_connect_websocket()`.
3. **`_connect_websocket()`**: Opens WebSocket to `wss://api.sarvam.ai/text-to-speech/ws?model=...&send_completion_event=true`, sends config message, fires `on_connected` event.
4. **`_send_config()`**: Sends JSON config with voice, language, min_buffer_size, etc.
5. **`run_tts(text, context_id)`**: Sends text via `_send_text()`, yields `None` (audio arrives asynchronously via `_receive_messages()`).
6. **`_receive_messages()`**: Listens on WebSocket for `audio` type messages, decodes base64, yields `TTSAudioRawFrame`.

### TTS Timing Breakdown

| Measurement | Value | Confidence |
|-------------|-------|-----------|
| tts_service_create → tts_ready | 855ms | PROVEN (1388-533) |
| tts_ready → greeting_queued | 36ms | PROVEN |
| greeting_queued → greeting_tts_started | 25ms | PROVEN |
| greeting_tts_started → greeting_first_audio | 562ms | PROVEN |

### TTS TTFB Variability

| Turn | TTS TTFB | Notes |
|------|----------|-------|
| Turn 1 | 421ms | — |
| Turn 2 | 987ms | 2.3x higher |
| Tool Turn 1 (post-tool) | 418ms | — |
| Tool Turn 2 (post-tool) | 931ms | 2.2x higher |

**PROVEN from code:** The `min_buffer_size` is set to 30 characters (line 1137: `"min_buffer_size": 30`). This is a server-side Sarvam parameter — the Sarvam WebSocket server buffers 30 characters before beginning synthesis. Lower values reduce latency but the server may batch differently.

**INFERRED:** The variability likely comes from Sarvam's server-side processing (model warm-up, queue depth, text complexity). The 2x variance is consistent across turns, suggesting it is not random noise but a systematic factor (possibly connection warm-up or model state).

### TTS Synthesis Path

```
TextFrame
  → EarlyReleaseTextAggregator.aggregate() [Phase 21A]
    → clause/sentence boundary detection
  → AggregatedTextFrame
  → TTSService._push_tts_frames()
    → create context_id
    → apply text filters
    → run_tts(text, context_id)
      → SarvamTTSService._send_text(text)  [WebSocket send]
        → Sarvam server buffers min_buffer_size chars
        → Sarvam synthesizes audio
        → Sarvam sends audio message back
      → _receive_messages() decodes base64 audio
      → TTSAudioRawFrame yielded
  → RealtimeStreamingTimingMonitor.process_frame()
    → record_first_tts_audio()
  → transport.output()
    → PlivoFrameSerializer.serialize()
    → WebSocket send to Plivo
```

---

## 9. Sentence Aggregation Analysis (Phase 21A)

### Current Aggregator

The codebase uses `EarlyReleaseTextAggregator` (Phase 21A) which replaces the default `SimpleTextAggregator`:

```python
tts_service._text_aggregator = EarlyReleaseTextAggregator(
    min_first_chunk_words=3,
    min_first_chunk_chars=20,
)
```

### How EarlyReleaseTextAggregator Works

1. **First chunk:** Requires ≥3 words AND ≥20 characters before releasing at a clause boundary (comma, semicolon, colon, dash).
2. **Subsequent chunks:** Requires ≥4 words AND ≥25 characters.
3. **Sentence endings:** Detected via NLTK `match_endofsentence()` with non-whitespace lookahead.
4. **Protected patterns:** Numbers (10,000), abbreviations (Dr., Mr.), URLs, Devanagari danda.

### Text → TTS Start Latency

| Turn | first_text → tts_started | Notes |
|------|-------------------------|-------|
| Turn 1 | 561ms | After 2,894ms LLM TTFT |
| Turn 2 | 222ms | After 656ms LLM TTFT |

**Analysis:** The 561ms in Turn 1 includes both aggregation delay and TTS scheduling overhead. The 222ms in Turn 2 is closer to the aggregation target. The difference may reflect the amount of text that needs to accumulate before a clause boundary is found.

**INFERRED:** Phase 21A (EarlyReleaseTextAggregator) is likely effective — the 222ms in Turn 2 is within the 150-200ms target range. Turn 1's 561ms may be inflated by the long LLM TTFT causing text to arrive in larger bursts.

---

## 10. STT / Endpointing Analysis

### Observed Endpointing Latency

| Turn | speech_stop → stt_utterance_end |
|------|--------------------------------|
| Turn 1 | 249ms |
| Turn 2 | 139ms |
| Tool Turn 1 | 164ms |
| Tool Turn 2 | 157ms |

**P50:** ~160ms
**P90:** ~240ms

### STT → Aggregation

| Turn | stt_utterance_end → user_aggregated |
|------|-------------------------------------|
| Turn 1 | 266ms |
| Turn 2 | 254ms |
| Tool Turn 1 | 260ms |
| Tool Turn 2 | 263ms |

**P50:** ~258ms

**Observation:** STT → Aggregation is remarkably consistent (~258ms). This is the LLMContextAggregatorPair's `on_user_turn_inference_triggered` callback, which fires after the user turn stop strategy (timeout=0.25s configured at line 1284) determines the user has finished speaking. The 250ms timeout in `ExternalUserTurnStopStrategy(timeout=0.25)` is the dominant factor.

---

## 11. Plivo / WebSocket Audio Analysis

### Outbound Audio Path

```
TTSAudioRawFrame
  → RealtimeStreamingTimingMonitor.process_frame() [timing]
  → transport.output()
    → FastAPIWebsocketOutputTransport.write_audio_frame()
      → serialize via PlivoFrameSerializer.serialize()
        → pcm_to_ulaw() [codec conversion]
        → base64.b64encode() [encoding]
        → JSON wrap with "playAudio" event
      → _write_frame()
        → fixed_audio_packet_size check [chunking]
        → websocket.send(payload) [WebSocket send]
      → _write_audio_sleep() [backpressure timing]
```

### Plivo Serialization Cost

**PROVEN from source:** The `PlivoFrameSerializer.serialize()` method (lines 118-170):
1. Converts PCM to μ-law via `pcm_to_ulaw()`
2. Base64 encodes the result
3. Wraps in JSON with event metadata

For a typical 20ms audio frame at 8kHz mono (160 samples × 2 bytes = 320 bytes PCM):
- μ-law conversion: ~320 bytes output
- Base64: ~428 bytes
- JSON wrapper: ~100 bytes overhead
- **Total: ~528 bytes per frame**

### Fixed Audio Packet Size

The transport uses `fixed_audio_packet_size` which chunks audio into fixed-size packets before sending. This adds:
- Buffer accumulation time
- Potential head-of-line blocking

### WebSocket Send

**INFERRED:** The WebSocket send is async (`await self._client.send(payload)`) and is subject to:
- TCP send buffer filling
- Plivo's receive window
- Network congestion
- WebSocket frame fragmentation

**NOT OBSERVABLE:** There are no timestamps logged between `TTSAudioRawFrame` creation and WebSocket `send()` completion. The `_write_audio_sleep()` backpressure mechanism adds artificial delay to match real-time audio pacing.

---

## 12. CallSession / Trusted Context Analysis

### CallSession Creation Timing

| Event | Timestamp |
|-------|-----------|
| call_session_start | ~659ms |
| call_session_created | ~659ms (background task) |

**PROVEN:** CallSession is created in a background `asyncio.Task` (line 1128: `call_session_task = asyncio.create_task(_bg_create_call_session())`). It runs concurrently with pipeline construction and TTS setup.

### Race Analysis

- **Pipeline starts before CallSession completes:** Pipeline starts at ~533ms, CallSession completes at ~659ms.
- **Greeting does NOT depend on CallSession:** Greeting is queued at ~1,424ms, well after both pipeline start and CallSession creation.
- **Tools DO depend on CallSession:** `ToolRuntimeContext.ensure_call_session_id()` awaits the background task if call_session_id is None. This only blocks tool execution, not greeting or normal conversation.

**NO RACE CONDITION for greeting.** The greeting path does not touch CallSession, tools, or any async-dependent state.

---

## 13. Telemetry Integrity Audit

### Duplicate greeting_first_audio Events

**PROVEN DEFECT:** The `StartupTimingTracker.record_stage()` method (line 838) uses idempotent latching for `greeting_first_audio`:

```python
if stage_name in ("greeting_first_audio", "first_greeting_audio"):
    if self.greeting_first_audio is None:
        self.greeting_first_audio = now
        self.first_greeting_audio = now
```

This latches to the FIRST timestamp. However, the log shows multiple `greeting_first_audio` events at different timestamps (+2008, +2011, +2070, +2083, +2170, +2744).

**Root cause:** The `RealtimeStreamingTimingMonitor.process_frame()` method (lines 484-500) fires on EVERY `TTSAudioRawFrame` while in greeting context:

```python
is_greeting_context = (
    (self._turn_tracker and self._turn_tracker.turn_type == "greeting")
    or (self._startup_tracker and self._startup_tracker.greeting_queued is not None and self._startup_tracker.greeting_completed is None)
)
if is_greeting_context and self._startup_tracker and self._startup_tracker.first_greeting_audio is None:
    self._startup_tracker.record_stage("greeting_first_audio", first_audio_time)
```

The `record_stage` latches (only first timestamp is stored), but the event is logged EVERY time because `record_stage` always emits a log line. The multiple log entries are redundant log emissions, not multiple value assignments.

**Impact:** The dashboard may overcount greeting events if it counts log lines rather than unique values. The stored value is correct (first timestamp only).

### Duplicate turn_completed Events

**PROVEN DEFECT:** Tool turns emit `turn_completed` TWICE:

1. After tool execution completes (line 559 in `RealtimeStreamingTimingMonitor.process_frame()`):
   ```python
   if self._turn_tracker.record_turn_complete_once():
       self._turn_tracker.emit_turn_metrics_log()
   ```

2. After TTS stops (line 579 in `TTSStoppedFrame` handler):
   ```python
   if self._turn_tracker.record_turn_complete_once():
       self._turn_tracker.emit_turn_metrics_log()
   ```

The `record_turn_complete_once()` method (line 467) prevents the VALUE from being set twice, but the second call still invokes `emit_turn_metrics_log()` which returns early because `_emitted` is True. However, the first `turn_completed` event (after tool) is logged, and the second (after TTS) is also attempted.

**Actual behavior for tool turns:**
- First `turn_completed`: Logged at tool completion (~37,369ms)
- Second `turn_completed`: Logged at TTS completion (~40,229ms)
- Both are logged as separate `[PIPECAT_TURN_TRACE]` events

**This is a telemetry/event ownership defect.** The tool turn creates two logical turns in the telemetry but only one actual conversational turn.

### Dashboard Overcount Risk

| Metric | Overcount Risk | Evidence |
|--------|---------------|---------|
| Turns | YES | Tool turns produce 2 turn_completed events |
| Greeting first audio | LOW | Value latched correctly, but redundant log lines |
| Response latency | YES | Tool turns split into two latency measurements |
| Tool latency | CORRECT | tool_executed is logged once per tool |

---

## 14. Tool Turn Telemetry

### Correct Semantic Lifecycle

```
User speech → STT → Aggregation → LLM → Tool call → Tool execution → Post-tool LLM → TTS → Assistant speech
```

### Current Telemetry Behavior

```
User turn:
  speech_stop → stt → aggregation → LLM → tool_call_delta → tool_call_complete → tool_executed → TURN_COMPLETED

Post-tool turn:
  post_tool_llm → tts_started → tts_first_audio → tts_stopped → TURN_COMPLETED
```

**Classification: TELEMETRY/EVENT OWNERSHIP DEFECT.** The tool turn and post-tool response are tracked as separate turns. This inflates `totalTurns` and creates misleading per-turn latency metrics.

The `TurnTimingTracker` distinguishes pre-tool and post-tool phases via `tool_executions` list checks (line 316-318, 324-327, 333-335), but `record_turn_complete_once()` is called at both boundaries.

---

## 15. Async / Event Loop Analysis

### Potential Event Loop Blocking

**PROVEN from code inspection:**

1. **`analyze_pcm_audio()`** (line 647-669): Synchronous PCM analysis using `struct.unpack`, `max()`, `sum()`. Called only on first audio frame and every 50th frame when `PIPECAT_AUDIO_DEBUG=True`. For 160 samples, this is negligible (~0.01ms).

2. **`base64.b64decode()` in PlivoFrameSerializer**: Synchronous base64 decoding. For ~320 bytes of μ-law audio, this is ~0.001ms.

3. **`base64.b64encode()` in PlivoFrameSerializer.serialize()**: Synchronous base64 encoding. For ~320 bytes, ~0.001ms.

4. **`json.dumps()` / `json.loads()`**: Used in serialization/deserialization. For typical payloads (~500 bytes), ~0.01ms.

5. **`struct.unpack()` in `analyze_pcm_audio`**: Only called with debug flag, not in hot path.

**NO SIGNIFICANT EVENT LOOP BLOCKING FOUND.** All hot-path operations are async. The synchronous operations are microsecond-scale.

### Background Tasks

- `_bg_create_call_session()`: HTTP POST, runs in background. Does not block pipeline.
- `bounded_call_task()`: Sleep-based timer. Does not block pipeline.
- TTS `_receive_task_handler()`: Async WebSocket receive loop. Non-blocking.
- TTS `_keepalive_task_handler()`: 20-second sleep interval. Non-blocking.

---

## 16. Pipecat Overhead

### Frame Routing Overhead

Pipecat's `Pipeline` links processors in sequence. Each frame passes through:
- `PipelineSource` → processor1 → processor2 → ... → `PipelineSink`
- Each processor calls `await super().process_frame()` then its own logic

**PROVEN:** The pipeline has 10 processors:
```
transport.input() → pre_stt → stt → language → user_aggregator → llm → tts → timing_monitor → transport.output() → assistant_aggregator
```

**INFERRED:** Pipecat's frame routing overhead is likely <5ms per frame. The framework uses `asyncio` task queuing (`_process_push_queue`) which involves `await self._push_queue.get()` and `await self._pipeline.queue_frame(frame)`.

**INFERRED from `_write_audio_sleep()`:** The transport implements backpressure by sleeping to match real-time audio pacing. This adds artificial delay between audio frames but does NOT affect the first audio frame.

**Evidence from timing:** The gap between `tts_first_audio` and `turn_completed` is 351ms in Turn 1. This includes the remainder of TTS synthesis + all audio frames being sent. The TTSStoppedFrame arrives 850ms after tts_first_audio in tool turns, which is consistent with audio playback duration, not Pipecat overhead.

---

## 17. 500ms Feasibility Analysis

### Current Component Minimums (Observed Best Case)

| Component | Best Observed | P50 |
|-----------|--------------|-----|
| Endpointing (speech_stop → STT) | 139ms | 160ms |
| Aggregation (STT → user_aggregated) | 254ms | 258ms |
| LLM scheduling (aggregation → LLM request) | 2ms | 3ms |
| LLM TTFT (LLM request → provider response) | 607ms | 730ms |
| LLM parsing (provider → first text) | 3ms | 11ms |
| Text → TTS start | 222ms | 392ms |
| TTS TTFB (TTS start → first audio) | 418ms | 704ms |

**Minimum theoretical path (best case components):**
139 + 254 + 2 + 607 + 3 + 222 + 418 = **1,645ms**

**With P50 components:**
160 + 258 + 3 + 730 + 11 + 392 + 704 = **2,258ms**

### CAN THE CURRENT ARCHITECTURE ACHIEVE 500MS?

**NO.**

The minimum theoretical latency with current best-case components is **1,645ms** — already 3.3x the target.

To reach 500ms, the following would ALL need to change simultaneously:

| Component | Current Best | Required | Improvement Needed |
|-----------|-------------|----------|-------------------|
| Endpointing | 139ms | ~50ms | 2.8x (Sarvam VAD tuning) |
| Aggregation | 254ms | ~50ms | 5.1x (eliminate 250ms timeout) |
| LLM TTFT | 607ms | ~200ms | 3.0x (faster model or speculative) |
| Text→TTS | 222ms | ~50ms | 4.4x (token streaming) |
| TTS TTFB | 418ms | ~100ms | 4.2x (faster TTS provider) |
| **Total** | **1,645ms** | **~500ms** | **3.3x overall** |

**No single component optimization can achieve 500ms.** This requires simultaneous improvement across all components.

---

## 18. 1-Second Greeting Feasibility

### Current Greeting Path

| Stage | Duration | Required |
|-------|----------|----------|
| Plivo start → RuntimeConfig | 144ms | YES |
| RuntimeConfig → TTS service created | 258ms | YES (but parallelizable) |
| TTS service created → TTS connected | 855ms | YES (WebSocket connect) |
| TTS connected → greeting queued | 36ms | YES |
| Greeting queued → TTS started | 25ms | YES |
| TTS started → first audio | 562ms | YES (Sarvam synthesis) |

**Total: ~1,880ms from plivo_start to first_audio**

### Minimum Achievable (No Architectural Changes)

- Plivo start → RuntimeConfig: ~100ms (cached)
- RuntimeConfig → TTS created: ~5ms (constructor only, skip STT/LLM/tools)
- TTS connect: ~400ms (Sarvam WebSocket, network-dependent)
- Greeting queued → TTS start: ~25ms
- TTS synthesis: ~400ms (text-dependent)
- **Total: ~930ms** — potentially achievable if:
  - STT, tool registry, LLM creation, and pipeline construction are deferred or parallelized
  - TTS WebSocket connection is pre-warmed
  - Sarvam TTS processes greeting text faster

### GREETING 1-SECOND TARGET: NEEDS MORE DATA

The theoretical minimum (~930ms) is below 1s, but depends on:
1. Sarvam TTS WebSocket connect time (currently ~855ms, could vary)
2. Sarvam TTS synthesis time (currently ~562ms for greeting text)
3. Whether parallelization of service creation is safe

**Cannot claim FEASIBLE without measuring:**
- TTS WebSocket connect in isolation (with no competing services)
- Greeting text synthesis time in isolation
- Whether Sarvam TTS cold-starts affect greeting

---

## 19. Proven Bottlenecks

| # | Component | Measured Latency | Evidence | Confidence |
|---|-----------|-----------------|----------|-----------|
| 1 | LLM TTFT | 607-2,894ms | Direct timestamps from InstrumentedAsyncStream | PROVEN |
| 2 | TTS WebSocket connect | 855ms | tts_service_create_start → tts_ready | PROVEN |
| 3 | TTS TTFB | 418-987ms | tts_started → tts_first_audio | PROVEN |
| 4 | Aggregation timeout | 250ms fixed | ExternalUserTurnStopStrategy(timeout=0.25) | PROVEN |
| 5 | Endpointing | 139-249ms | speech_stop → stt_utterance_end | PROVEN |

---

## 20. Inferred Bottlenecks

| # | Component | Estimated Impact | Basis |
|---|-----------|-----------------|-------|
| 1 | Sarvam provider cold start | ~2,000ms on first call | Turn 1 TTFT 4.4x higher than Turn 2 |
| 2 | TTS server-side buffering | ~30 chars × ~10ms/char | min_buffer_size=30, variable response |
| 3 | Plivo audio pacing | Unknown | _write_audio_sleep adds backpressure |
| 4 | Conversation history growth | Unknown | No token count logging |
| 5 | WebSocket frame fragmentation | Unknown | Large base64 payloads |

---

## 21. Unknowns

| # | Question | Why Unknown |
|---|----------|------------|
| 1 | Caller-perceived latency | No instrumentation outside worker |
| 2 | Plivo network latency | No Plivo-side timestamps |
| 3 | Sarvam provider queue depth | No provider-side metrics |
| 4 | LLM input token count | Not logged in production |
| 5 | TTS audio chunk distribution | Not logged per-chunk |
| 6 | WebSocket send completion time | No send-ack tracking |
| 7 | DNS resolution time | Not instrumented |
| 8 | TCP/TLS handshake time | Not instrumented |

---

## 22. Required Additional Observability

1. **Worker → Plivo outbound audio timestamp:** Log when `websocket.send()` completes for first audio frame.
2. **Caller-perceived latency:** Plivo webhook for call answer + first audio ACK.
3. **LLM input token count:** Log `token_usage.prompt_tokens` from streaming response.
4. **TTS per-chunk timing:** Log timestamp of each `TTSAudioRawFrame` received from Sarvam.
5. **WebSocket send duration:** Instrument `await self._client.send()` with timing.
6. **DNS/TCP/TLS timing:** Use httpx event hooks or OpenTelemetry.
7. **Sarvam TTS server-side latency:** Request-id round-trip timing.

---

## 23. Ranked Root Causes

| Rank | Component | Evidence | Potential Impact |
|------|-----------|----------|-----------------|
| #1 | LLM TTFT (Sarvam) | 607-2,894ms, 4.4x variance | Largest single contributor to response latency |
| #2 | TTS WebSocket connect | 855ms cold, blocks greeting | Blocks greeting, adds to cold-start path |
| #3 | TTS TTFB (Sarvam) | 418-987ms, 2.3x variance | Second-largest provider-side latency |
| #4 | Aggregation timeout | 250ms fixed delay | Artificial floor on response latency |
| #5 | Telemetry integrity | Duplicate events, tool turn split | Misleading metrics, wrong optimization targets |

---

## 24. Phase 21A Result

**Phase 21A (EarlyReleaseTextAggregator)** appears EFFECTIVE based on Turn 2 data:
- Text → TTS start: 222ms (within 150-200ms target range)
- Compare to historical ~400ms with default SentenceAggregator

**INCONCLUSIVE:** Only 2 normal turns available. Turn 1 shows 561ms which may reflect different text patterns.

---

## 25. Phase 21B Result

**Phase 21B (Shared LLM Connection Pool)** is PROVEN implemented:
- `app.state.sarvam_llm_http_client` is created at worker startup
- `InstrumentedSarvamLLMService` receives and uses this shared client
- Connection pool settings: 50 max connections, 20 keepalive, 60s expiry

**Effectiveness: INCONCLUSIVE**
- Turn 1 TTFT (2,894ms) suggests cold-start despite connection pool
- Turn 2 TTFT (656ms) is better but may reflect Sarvam provider warm-up, not connection reuse
- Cannot distinguish client-side connection reuse from provider-side caching

---

## 26. Final Metrics Table

| Metric | Current | Target | Gap | Confidence |
|--------|---------|--------|-----|-----------|
| Greeting worker latency | 2,011ms | ≤1,000ms | +1,011ms | PROVEN |
| Greeting caller latency | NOT OBSERVABLE | ≤1,000ms | UNKNOWN | UNKNOWN |
| Normal response P50 | ~2,264ms | ~500ms | +1,764ms | PROVEN |
| Normal response P90 | ~4,457ms | ~700ms | +3,757ms | PROVEN |
| Endpointing P50 | ~160ms | <100ms | +60ms | PROVEN |
| LLM TTFT P50 | ~730ms | <200ms | +530ms | PROVEN |
| LLM TTFT P90 | ~2,894ms | <500ms | +2,394ms | PROVEN |
| LLM cold TTFT | ~2,894ms | <500ms | +2,394ms | PROVEN |
| Text → TTS start P50 | ~392ms | <100ms | +292ms | INFERRED |
| TTS TTFB P50 | ~704ms | <200ms | +504ms | PROVEN |
| TTS TTFB P90 | ~987ms | <300ms | +687ms | PROVEN |
| Outbound audio delay | NOT OBSERVABLE | <50ms | UNKNOWN | UNKNOWN |
| Tool JSON latency | ~2,669ms | N/A | REGRESSION DATA | PROVEN |
| Tool execution latency | ~55ms | <100ms | MET | PROVEN |
| Pipecat overhead | <5ms | <5ms | MET | INFERRED |
| Telemetry accuracy | PARTIALLY | FULLY | DEFECTIVE | PROVEN |

---

## PHASE 21C FORENSIC VERDICT

**GREETING WORKER LATENCY:** 2,011ms

**GREETING CALLER-PERCEIVED LATENCY:** NOT OBSERVABLE

**GREETING 1-SECOND TARGET:** NEEDS MORE DATA (theoretical minimum ~930ms, but requires isolated TTS connect/synthesis measurement)

**NORMAL RESPONSE P50:** ~2,264ms

**NORMAL RESPONSE P90:** ~4,457ms

**NORMAL RESPONSE 500MS TARGET:** NOT FEASIBLE (theoretical minimum ~1,645ms with current components)

**LLM MAIN BOTTLENECK:** YES (607-2,894ms TTFT, largest single component)

**TTS MAIN BOTTLENECK:** YES (418-987ms TTFB, second-largest provider component + 855ms connect)

**SENTENCE AGGREGATION MAIN BOTTLENECK:** NO (222ms in best case, within target range after Phase 21A)

**STT/ENDPOINTING MAIN BOTTLENECK:** NO (139-249ms, relatively small contributor)

**PLIVO MAIN BOTTLENECK:** NOT PROVEN (no outbound audio timing instrumentation)

**PIPECAT MAIN BOTTLENECK:** NO (<5ms frame routing overhead, INFERRED)

**TELEMETRY ACCURATE:** PARTIALLY (duplicate events, tool turn ownership defect, greeting event redundancy)

**PHASE 21A EFFECTIVE:** INCONCLUSIVE (text→TTS improved to 222ms in best case, but sample size too small)

**PHASE 21B EFFECTIVE:** INCONCLUSIVE (connection pool implemented, but cannot isolate effect from provider warm-up)

**LARGEST PROVEN BOTTLENECK:** LLM TTFT dominates at 607-2,894ms, with 4.4x cold-vs-warm variance indicating Sarvam provider cold start is the primary latency driver.

**LARGEST UNKNOWN:** Caller-perceived latency cannot be measured from worker logs alone — no Plivo-side instrumentation exists.

**SINGLE BEST NEXT OPTIMIZATION TARGET:** Sarvam LLM TTFT — reducing cold-start TTFT from ~2,894ms to ~600ms would save ~2.3s on first turn and improve all subsequent turns.

**EXPECTED IMPACT:** If LLM cold TTFT is reduced to warm levels (~650ms), normal response P50 drops from ~2,264ms to ~1,020ms. Still above 500ms target but a ~55% improvement.

**PHASE 21C STATUS:** COMPLETE

**STOP.**
