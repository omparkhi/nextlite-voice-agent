# Implementation Report: Quiet-Caller Second Cycle & Terminal Hangup Fix

**Document:** `10C_NUDGE_SECOND_CYCLE_FIX_IMPLEMENTATION_REPORT.md`  
**Date:** September 28, 2026  
**Status:** IMPLEMENTATION COMPLETE — TESTS PASSING  
**Target:** NextLite Voice V3 (`apps/pipecat-worker`)

---

## A. Files Changed

1. **[`apps/pipecat-worker/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py)**
   - Implemented Fix 1 (acoustic playout boundary decoupling).
   - Implemented Fix 2 (genuine caller response isolation).
   - Implemented Fix 3 (guaranteed `record_tts_stop()` on `TTSStoppedFrame` and clean turn completion on `LLMFullResponseEndFrame`).
2. **[`apps/pipecat-worker/tests/test_production_bug_fixes_p0.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/tests/test_production_bug_fixes_p0.py)**
   - Updated and expanded test suite with 15 comprehensive tests covering all 10 state machine scenarios.

---

## B. Exact Functions Changed

1. **`_quiet_caller_nudge_loop()`** ([`main.py:3465-3571`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3465-L3571)):
   - Decoupled silence timing from `turn_tracker.is_assistant_speaking` / `is_tts_active`.
   - Used `serializer.estimated_outbound_speech_end` as the authoritative acoustic boundary for assistant speech playout.
   - Replaced `len(turn_tracker.completed_turns)` with timestamp/content-verified `turn_tracker.stt_final` and `transcript_collector.turns` tracking.
2. **`RealtimeStreamingTimingMonitor.process_frame(TTSStoppedFrame)`** ([`main.py:1468-1540`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1468-L1540)):
   - Guaranteed that `self._turn_tracker.record_tts_stop(now_stop)` is executed immediately when `self._tts_in_flight_count == 0`, ensuring `turn_tracker.tts_stop` is never left as `None`.
3. **`RealtimeStreamingTimingMonitor.process_frame(LLMFullResponseEndFrame)`** ([`main.py:1574-1605`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1574-L1605)):
   - Completed turns cleanly if TTS synthesis had already stopped (`tts_stop is not None and _tts_in_flight_count == 0`), recording turn metrics and calling `start_new_turn()`.

---

## C. Root Cause Addressed

1. **Stale Assistant Speaking Lock:**
   When Nudge #1 was synthesized, `TTSStartedFrame` recorded `turn_tracker.tts_start`. In `TTSStoppedFrame`, `is_turn_speech_complete` evaluated to `False` due to in-flight LLM stream synchronization. Consequently, `turn_tracker.record_tts_stop()` was skipped, leaving `turn_tracker.tts_stop == None`.
   This locked `turn_tracker.is_assistant_speaking` and `is_tts_active` to `True`. `_quiet_caller_nudge_loop` evaluated `assistant_speaking == True` on every 500ms iteration, constantly bumping `last_assistant_speech_end[0] = now_mono` and executing `continue`, locking `silence_duration` to `0.0s`.

2. **Counter Contamination via Pipeline Turn Completion:**
   The quiet-caller loop checked `len(turn_tracker.completed_turns) > last_recorded_user_turns` to detect caller responses. However, `completed_turns` logs *all* pipeline turns (including the AI's own nudge turns). If a nudge turn completed, it would increment `completed_turns` and immediately reset `nudge_count` from `1` back to `0`.

---

## D. Fix #1 Implementation: Decouple Silence from Stale Turn Tracker Flags

In `_quiet_caller_nudge_loop()` ([`main.py:3474-3535`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3474-L3535)):
```python
# 1. Check if outbound audio is still playing out acoustically to the caller (authoritative acoustic boundary)
estimated_speech_end = getattr(serializer, "estimated_outbound_speech_end", 0.0)
if now_mono < estimated_speech_end:
    last_assistant_speech_end[0] = estimated_speech_end
    # DO NOT reset nudge_count during assistant audio playout
    continue

...

# 3. Genuine user speaking status (guard against stuck/unfinalized line noise VAD blips >4.0s)
user_speaking = bool(
    turn_tracker
    and turn_tracker.speech_start is not None
    and turn_tracker.speech_stop is None
    and (now_mono - turn_tracker.speech_start < 4.0)
)

# 4. Check if active tool execution is in-flight
has_active_tool = bool(turn_tracker and turn_tracker.has_pending_tool_activity())

# If user is speaking or active tool is in-flight:
# Keep the silence anchor continuously updated to NOW (do NOT reset nudge_count here)
if user_speaking or has_active_tool:
    last_assistant_speech_end[0] = now_mono
    continue

# Ready state: greeting completed and idle waiting for user
is_ready = bool(
    turn_tracker and (turn_tracker.turn_type == "user_turn" or turn_tracker.greeting_completed is not None)
)

# Silence duration strictly measured from when assistant audio finished playing out or last nudge
last_anchor = max(last_assistant_speech_end[0], estimated_speech_end, last_nudge_time)
silence_duration = now_mono - last_anchor
```

---

## E. Fix #2 Implementation: Only Genuine Caller Response Resets `nudge_count`

In `_quiet_caller_nudge_loop()` ([`main.py:3484-3507`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3484-L3507)):
```python
# 2. Check for genuine caller turn / speech to reset unanswered nudge counter
# Genuine caller response must be a NEW non-empty transcript or new user turn in transcript_collector
current_stt_final = getattr(turn_tracker, "stt_final", None) if turn_tracker else None
current_transcript = (getattr(turn_tracker, "last_user_transcript", None) or "").strip() if turn_tracker else ""
has_caller_responded = False

if current_stt_final is not None and current_stt_final > last_seen_stt_final_ts and len(current_transcript) > 0:
    has_caller_responded = True
    last_seen_stt_final_ts = current_stt_final
elif transcript_collector:
    user_turns = [
        t.get("user", {}).get("transcript", "").strip()
        for t in transcript_collector.turns
        if t.get("user") and t.get("user", {}).get("transcript", "").strip()
    ]
    if len(user_turns) > last_recorded_user_turns_count:
        has_caller_responded = True
        last_recorded_user_turns_count = len(user_turns)

if has_caller_responded:
    if nudge_count > 0:
        logger.info(
            f"[QuietCallerNudge] Genuine caller response detected; resetting unanswered nudge_count from {nudge_count} to 0."
        )
    nudge_count = 0
```

---

## F. Fix #3 Implementation: Guarantee TTS State Cleanup

In `RealtimeStreamingTimingMonitor` ([`main.py:1529-1595`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1529-L1595)):
```python
# Fix 3: Always record TTS stopped when all TTS in-flight chunks finish so tts_stop is never left as None
if not is_early_filler_stop and self._tts_in_flight_count == 0 and self._turn_tracker:
    self._turn_tracker.record_tts_stop(now_stop)

# Turn is truly complete ONLY when LLM is done streaming AND all TTS chunks are done synthesizing
is_turn_speech_complete = (not is_llm_generating) and (self._tts_in_flight_count == 0)

if not is_early_filler_stop and is_turn_speech_complete:
    if self._turn_tracker:
        if self._turn_tracker.record_turn_complete_once(now_stop):
            self._turn_tracker.emit_turn_metrics_log()
            self._turn_tracker.start_new_turn()
```
And in `LLMFullResponseEndFrame`:
```python
# Turn completion if TTS has already finished synthesis (tts_stop is set and _tts_in_flight_count == 0) or silent turn
if (
    self._turn_tracker
    and self._turn_tracker.turn_type != "greeting"
    and not has_tool_activity
    and self._tts_in_flight_count == 0
    and (self._turn_tracker.tts_stop is not None or not self._turn_tracker.tts_start)
):
    if self._turn_tracker.record_turn_complete_once():
        self._turn_tracker.emit_turn_metrics_log()
        self._turn_tracker.start_new_turn()
```

---

## G. Tests Added / Updated

In [`tests/test_production_bug_fixes_p0.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/tests/test_production_bug_fixes_p0.py):
1. `test_t1_farewell_warm_http_client_and_margin`: Warm HTTP client reuse with 0.1s drain margin.
2. `test_t2_t3_farewell_multi_chunk_playout_respected`: Playout tracking across multiple farewell chunks.
3. `test_t4_caller_interrupts_farewell`: Interruption handling during farewell.
4. `test_t5_duplicate_end_call_protection`: Guard against redundant end-call executions.
5. `test_t6_transfer_pending_bypasses_rest_delete`: Transfer bypasses carrier REST delete.
6. `test_t7_initial_silence_dynamic_delay_unclamped`: Dynamic configured delay support (4s, 5s, 6s).
7. `test_t8_unanswered_silence_triggers_terminal_hangup`: Complete silence sequence: Nudge 1 -> Nudge 2 -> Terminal Hangup.
8. `test_t9_t10_caller_responds_after_nudge_resets_counter`: Caller response resets `nudge_count` only on genuine transcript.
9. `test_assistant_nudge_and_completed_turns_do_not_reset_nudge_count`: AI nudge completions and `completed_turns` increments do NOT reset `nudge_count`.
10. `test_tts_stopped_frame_guarantees_record_tts_stop`: `TTSStoppedFrame` guarantees `tts_stop` is set when in-flight chunks finish.
11. `test_stale_assistant_speaking_does_not_block_silence_countdown`: Silence countdown starts cleanly when `estimated_outbound_speech_end` passes.
12. `test_comfort_noise_does_not_reset_nudge_count`: Empty/whitespace transcripts do not reset `nudge_count`.
13. `test_t12_stuck_vad_line_noise_does_not_reset_nudge_count`: Line noise VAD blips >4s do not reset `nudge_count`.
14. `test_t11_mid_call_conversational_pause`: Brief 3.5s conversational pause does not trigger nudge when delay=6s.
15. `test_t13_active_appointment_tool_blocks_silence_hangup`: Active tool execution blocks silence nudge/hangup.

---

## H. Test Results

### 1. Focused Production Bug Fixes Suite
```
tests/test_production_bug_fixes_p0.py
======================= 15 passed, 1 warning in 24.35s ========================
```

### 2. Broader Telemetry & Lifecycle Test Suite
```
tests/test_end_call_and_dynamic_nudge.py
tests/test_turn_metrics_and_timing.py
tests/test_p0_forensic_instrumentation.py
tests/test_call_lifecycle_finalization.py
======================= 62 passed, 1 warning in 11.32s ========================
```

**Overall Test Success Rate:** 100% (77/77 tests passed).

---

## I. Edge Cases Addressed

1. **Carrier Line Noise / RTP Comfort Noise:**
   - 20ms RTP comfort noise frames containing silence or empty strings (`"   "`) do not satisfy `len(current_transcript) > 0`, preventing false counter resets.
2. **AI Speaking its Own Nudge:**
   - When Nudge #1 is synthesized, `estimated_outbound_speech_end` prevents the silence timer from counting during acoustic playback.
   - When Nudge #1 finishes playing, `turn_tracker.tts_stop` is recorded, and silence counting starts immediately from `last_anchor = max(last_assistant_speech_end[0], estimated_speech_end, last_nudge_time)`.
3. **Mid-Stream Turn Completion Races:**
   - Whether `TTSStoppedFrame` arrives before or after `LLMFullResponseEndFrame`, `turn_tracker.tts_stop` is recorded on `TTSStoppedFrame`, and the turn is finalized on whichever frame arrives last.

---

## J. PSTN Validation Result

- **Automated Verification:** 77 tests covering unit, integration, and state-machine edge cases passed.
- **Static Verification:** Code paths for Nudge #1 -> Nudge #2 -> Terminal Hangup, caller response isolation, and farewell hangup were statically verified against all 10 requirements.
- **Real PSTN Live Outbound Call:** Ready for end-to-end PSTN verification with the running uvicorn worker and ngrok tunnel.

---

## K. Before vs After State-Machine Timeline

### Before Fix (Real Failure at `01:14:23.453`)
```
READY_FOR_USER (01:14:18.333)
  ↓ (5.1s silence)
Nudge #1 Fired (01:14:23.453)
  ↓ (LLM + TTS synthesis)
Nudge #1 Audio Dispatched to Plivo (01:14:27.871)
  ↓ (TTSStoppedFrame arrives, record_tts_stop skipped)
turn_tracker.is_assistant_speaking STUCK TRUE
  ↓
_quiet_caller_nudge_loop continuously hits 'continue'
  ↓
Silence Duration locked at 0.0s for 45s
  ↓
DEAD SILENCE until WebSocket disconnects at 66.019s
```

### After Fix (Target Behavior)
```
READY_FOR_USER (T0)
  ↓ (5.0s silence)
Nudge #1 Fired (T0 + 5.0s)
  ↓ (LLM + TTS synthesis)
Nudge #1 Audio Dispatched to Plivo (T0 + ~8.0s)
  ↓ (TTSStoppedFrame arrives -> record_tts_stop called immediately)
outbound audio finishes playing at estimated_outbound_speech_end (T0 + ~9.5s)
  ↓
Silence timer re-arms from estimated_outbound_speech_end (T0 + 9.5s)
  ↓ (5.0s silence after Nudge #1 audio finishes)
Nudge #2 Fired (T0 + ~14.5s) [nudge_count = 2]
  ↓ (LLM + TTS synthesis)
Nudge #2 Audio plays out completely (T0 + ~19.0s)
  ↓
Silence timer re-arms from estimated_outbound_speech_end (T0 + 19.0s)
  ↓ (5.0s silence after Nudge #2 audio finishes)
[QuietCallerNudge] Maximum unanswered nudges (2/2) reached
  ↓
_on_plivo_terminal_hangup() cleanly executed
  ↓
Call Terminated Gracefully
```

---

## L. Confirmation: Farewell Hangup Behavior Remains Intact

- The warm HTTP client reuse (`_shared_http_client`), reduced carrier drain margin (`0.1s`), and `_on_end_call_check_fn()` trigger path in `RealtimeStreamingTimingMonitor` were fully preserved and verified by `test_t1_farewell_warm_http_client_and_margin`, `test_t2_t3_farewell_multi_chunk_playout_respected`, and `test_t5_duplicate_end_call_protection`.
