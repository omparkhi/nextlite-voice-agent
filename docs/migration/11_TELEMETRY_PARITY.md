# Telemetry & Timing Metrics Forensic Parity

**Monotonic Telemetry Module:** `apps/pipecat-worker/app/turn_timing.py` & `turn_metrics.py`  
**Database Field:** `call_sessions.metrics_json`  
**Audit Date:** September 2026

---

## 1. Monotonic Turn Timing Timestamps

To eliminate clock skew and duplicate events, all turn timing is captured using Python `time.monotonic()` latches:

| Metric Identifier | Event Description | Latch Condition | Clock Type |
| :--- | :--- | :--- | :--- |
| `user_speech_start` | VAD detects speech start | First voice frame after silence | Monotonic |
| `user_speech_end` | VAD detects silence (endpointing) | Silence exceeds threshold | Monotonic |
| `stt_start` | STT audio streaming initiated | Audio sent to Sarvam | Monotonic |
| `stt_final` | Final transcript received | Final STT frame arrives | Monotonic |
| `llm_request_start` | LLM HTTP/WS request dispatched | Payload sent to Sarvam LLM | Monotonic |
| `llm_first_chunk` | Time to First Token (TTFT) | First LLM text chunk arrives | Monotonic |
| `llm_complete` | Full text generation finished | Final LLM token received | Monotonic |
| `tool_start` | Function call requested by LLM | Tool execution dispatched | Monotonic |
| `tool_end` | Tool execution result returned | DB mutation completed | Monotonic |
| `tts_request_start` | Text sent to Sarvam TTS | Bulbul v3 request sent | Monotonic |
| `tts_first_audio` | Time to First Byte (TTFB) | First PCM audio frame received | Monotonic |
| `tts_complete` | Audio playback finished | Last frame sent to Plivo WS | Monotonic |

---

## 2. Calculated Turn Metrics & Aggregations

For each turn, the worker calculates:
- **`stt_duration_ms`:** `(stt_final - stt_start) * 1000`
- **`llm_ttft_ms`:** `(llm_first_chunk - llm_request_start) * 1000`
- **`tool_duration_ms`:** `(tool_end - tool_start) * 1000`
- **`tts_ttfb_ms`:** `(tts_first_audio - tts_request_start) * 1000`
- **`turn_latency_ms`:** Caller perceived delay: `(tts_first_audio - user_speech_end) * 1000`

At call termination, the worker computes session aggregates (P50, P90, P95, Mean, Min, Max) and persists them into `call_sessions.metrics_json`.