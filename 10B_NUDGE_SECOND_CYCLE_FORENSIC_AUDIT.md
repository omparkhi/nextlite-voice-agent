# Forensic Audit: Quiet-Caller Second Cycle & Terminal Hangup Failure

**Document:** `10B_NUDGE_SECOND_CYCLE_FORENSIC_AUDIT.md`  
**Date:** September 28, 2026  
**Status:** FORENSIC AUDIT ONLY — NO SOURCE CODE MODIFIED  
**Target:** NextLite Voice V3 (`apps/pipecat-worker`)

---

## A. Executive Summary

A real PSTN outbound call was conducted after the initial `nudge_count` regression fix. The call log showed:
1. At `01:14:18.333`, the call transitioned to `READY_FOR_USER`.
2. At `01:14:23.453` (~5.1s of silence), **Nudge #1 was correctly triggered**:
   `[QuietCallerNudge] anchor=178732.453 silence_duration=5.1 nudge_count=1 max_nudges=2 configured_delay=5`
3. Nudge #1 synthesized and streamed audio to Plivo (`01:14:27.871`).
4. **Thereafter, the system entered indefinite dead silence.**
   - No Nudge #2 occurred.
   - No terminal hangup occurred.
   - The call stayed connected until WebSocket disconnection at `01:15:13.268` (total duration 66.019s).
   - The P0 summary reported: `totalTurns=0`, `successfulTurns=0`, `normalTurns=0`.

### Core Findings
1. **Primary Freeze Root Cause (`turn_tracker.tts_stop` & `assistant_speaking` Lock):**
   When Nudge #1 was synthesized, `TTSStartedFrame` recorded `turn_tracker.tts_start` at `01:14:27.865`. When `TTSStoppedFrame` arrived in `RealtimeStreamingTimingMonitor` ([`main.py:1468`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1468)), the condition `is_turn_speech_complete = (not is_llm_generating) and (self._tts_in_flight_count == 0)` evaluated to `False` due to in-flight LLM stream synchronization. Consequently, `turn_tracker.record_tts_stop()` and `start_new_turn()` were **never executed**.
   Because `tts_stop` remained `None` and `tts_start` remained non-None, `turn_tracker.is_assistant_speaking` and `is_tts_active` remained `True` permanently.
   In `_quiet_caller_nudge_loop` ([`main.py:3515-3522`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3515-L3522)), `assistant_speaking` evaluated to `True` on every 500ms loop iteration, continuously resetting `last_assistant_speech_end[0] = now_mono` and executing `continue`. This locked `silence_duration` to `0.0s` for the remainder of the call.

2. **Secondary Reset Root Cause (`completed_turns` Counter Contamination):**
   In [`main.py:3482-3486`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3482-L3486), `has_caller_responded` checks `len(turn_tracker.completed_turns) > last_recorded_user_turns`. `turn_tracker.completed_turns` records *all* completed turns emitted in the pipeline (including the AI's own nudge turn). If turn metrics had emitted, the completion of the AI's own nudge audio would increment `completed_turns` and immediately reset `nudge_count` from `1` to `0`.

3. **Tertiary Call Disconnect Cause:**
   The disconnection at `66.019s` was not an intentional quiet-caller hangup; it was triggered by Plivo RTP/WebSocket timeout / the 45s silence watchdog ([`main.py:3431`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3431)) or manual user hangup due to lack of AI response.

---

## B. Exact Runtime Timeline from the Supplied Log

| Monotonic/Wall Time | Component / Event | Log / Telemetry Evidence | State Machine Impact |
|:---|:---|:---|:---|
| `01:14:18.333` | StartupGate | `State transitioned to READY_FOR_USER` | Initial silence countdown begins (`last_assistant_speech_end = now`). |
| `01:14:23.453` | QuietCallerNudge | `anchor=178732.453 silence_duration=5.1 nudge_count=1 max_nudges=2 configured_delay=5` | Silence threshold (5.0s) reached. `nudge_count` increments to 1. Nudge prompt dispatched. |
| `01:14:23.462` | LLM Dispatch | `llm_request_created` | `turn_tracker.llm_start` and `llm_request_created` recorded. `is_llm_generating = True`. |
| `01:14:26.960` | Sarvam LLM | `llm_first_provider_response` | First HTTP headers/bytes received from Sarvam LLM. |
| `01:14:27.025` | Sarvam LLM | `llm_first_text_output` | First token ("तुम्ही") received and released. |
| `01:14:27.289` | Text Aggregator | `text_released_to_tts` | Aggregated sentence pushed to TTS. |
| `01:14:27.865` | Sarvam TTS | `tts_first_audio` | `TTSStartedFrame` / `TTSAudioRawFrame` sets `turn_tracker.tts_start = now`. `tts_stop = None`. |
| `01:14:27.871` | Audio Serializer | `first_audio_sent_to_plivo` | Outbound RTP audio dispatched. `serializer.estimated_outbound_speech_end` set to ~`01:14:29.4`. |
| ~`01:14:29.500` | TimingMonitor | `TTSStoppedFrame` received | `is_turn_speech_complete` evaluates to `False`. `record_tts_stop()` **skipped**. `turn_tracker.tts_stop` remains `None`. |
| `01:14:29.500` – `01:15:13.268` | `_quiet_caller_nudge_loop` | Periodic 500ms ticks | `is_tts_active` and `assistant_speaking` remain `True`. `last_assistant_speech_end[0] = now_mono`. Silence timer remains `0.0s`. |
| `01:15:13.268` | Telephony / WebSocket | `WebSocket disconnected` | Total call duration: `66.019s`. P0 summary reports `totalTurns=0`. |

---

## C. Complete `nudge_count` Lifecycle

All reads and writes of `nudge_count` in [`apps/pipecat-worker/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py):

| Line | Operation | Condition | Value Assigned | Why it Happens |
|:---|:---|:---|:---|:---|
| `3466` | **Write (Init)** | Entry of `_quiet_caller_nudge_loop()` | `0` | Initializes loop local counter upon call session start. |
| `3489` | **Read** | `if nudge_count > 0:` | — | Evaluates whether to log caller response reset. |
| `3491` | **Read** | Inside logger string | — | Diagnostic log format. |
| `3493` | **Write (Reset)** | `if has_caller_responded:` | `0` | Resets counter when genuine caller response is detected. **Bug vector:** Contaminated if `completed_turns` counts AI nudge turn. |
| `3534` | **Read** | `if silence_duration >= nudge_delay and nudge_count < max_nudges:` | — | Determines whether next nudge should fire. |
| `3535` | **Write (Increment)**| Silence duration threshold met and `nudge_count < max_nudges` | `nudge_count + 1` (e.g. `0 -> 1` or `1 -> 2`) | Advances nudge stage when configured silence elapses. |
| `3549` | **Read** | Inside logger string | — | Diagnostic log format. |
| `3556` | **Read** | `elif silence_duration >= nudge_delay and nudge_count >= max_nudges:` | — | Terminal hangup condition check. |
| `3558` | **Read** | Inside logger string | — | Terminal hangup log format. |

### Confirmation on Reset
In the real call, `nudge_count` was incremented to `1` at `01:14:23.453`. It did not reset back to `0` only because the turn tracker never completed the turn (due to the `tts_stop` lock); instead, the loop was completely bypassed via `continue` on line `3522`.

---

## D. Complete Silence-Anchor Lifecycle

1. **`last_assistant_speech_end[0]`**:
   - Initialized at greeting completion (`StartupGate.set_ready_for_user()`) to `time.perf_counter()`.
   - At line `3477`: If `now_mono < estimated_speech_end`, updated to `estimated_speech_end`.
   - At line `3521`: If `user_speaking or is_llm_active or assistant_speaking or has_active_tool`, updated to `now_mono`.
   - At line `3537`: When Nudge is queued, updated to `now_mono`.
2. **`estimated_speech_end`**:
   - Updated in `serializer.write()` whenever audio chunks are serialized to Plivo (`time.perf_counter() + duration_seconds`).
3. **`last_nudge_time`**:
   - Updated in line `3536` to `now_mono` when Nudge #1 is dispatched (`01:14:23.453`).
4. **Calculated `last_anchor` and `silence_duration`**:
   - `last_anchor = max(last_assistant_speech_end[0], estimated_speech_end, last_nudge_time)`
   - `silence_duration = now_mono - last_anchor`
5. **State Immediately After Nudge #1**:
   - During Nudge #1 playout: `estimated_speech_end` anchored silence until ~`01:14:29.4`.
   - After Nudge #1 playout: Because `assistant_speaking` was stuck `True`, line `3521` (`last_assistant_speech_end[0] = now_mono`) ran every `0.5s`, forcing `last_anchor = now_mono` and `silence_duration = 0.0s` indefinitely.

---

## E. Quiet-Caller Task Lifecycle

- **Creation:** Line `3569`: `nudge_task = asyncio.create_task(_quiet_caller_nudge_loop())`.
- **Storage:** Local variable `nudge_task` in `websocket_endpoint()`.
- **Loop Structure:** Permanent `while not is_terminating() and not is_end_call_pending[0]:` loop with `await asyncio.sleep(0.5)`.
- **Execution Path:** The loop **did not exit, cancel, or crash**. It remained running, but on every iteration at line `3520-3522`:
  ```python
  if user_speaking or is_llm_active or assistant_speaking or has_active_tool:
      last_assistant_speech_end[0] = now_mono
      continue
  ```
  It hit `continue` and skipped lines `3525-3563`.
- **Cancellation:** Line `3590` in `finally` block when WebSocket disconnected.

---

## F. Assistant-Speaking Interaction

1. **`turn_tracker.is_assistant_speaking`** ([`turn_timing.py:249-251`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/turn_timing.py#L249-L251)):
   ```python
   @property
   def is_assistant_speaking(self) -> bool:
       return (self.tts_start is not None or self.first_tts_audio is not None) and self.tts_stop is None
   ```
2. **`is_tts_active`** ([`main.py:3508-3512`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3508-L3512)):
   ```python
   is_tts_active = bool(
       turn_tracker
       and turn_tracker.tts_start is not None
       and turn_tracker.tts_stop is None
   )
   ```
3. **Playout Lifecycle during Nudge #1:**
   - Nudge dispatched -> `TTSStartedFrame` received -> `turn_tracker.tts_start = 178736.865`.
   - `TTSAudioRawFrame` received -> `turn_tracker.first_tts_audio = 178736.871`.
   - `TTSStoppedFrame` received -> `turn_tracker.record_tts_stop()` was **not called**.
   - `turn_tracker.tts_stop` remained `None`.
   - `is_assistant_speaking` evaluated to `True` forever.

---

## G. Inbound Audio / Comfort-Noise Interaction

- **RTP Comfort Noise:** Plivo streams continuous 20ms silence/comfort noise audio frames over the WebSocket during PSTN calls.
- In `_quiet_caller_nudge_loop`, `user_speaking` uses:
  ```python
  user_speaking = bool(
      turn_tracker
      and turn_tracker.speech_start is not None
      and turn_tracker.speech_stop is None
      and (now_mono - turn_tracker.speech_start < 4.0)
  )
  ```
- Comfort noise does not hold `speech_start` permanently.
- However, `has_caller_responded` checks:
  ```python
  or (turn_tracker and (turn_tracker.stt_final is not None or turn_tracker.user_aggregation_finalized is not None or turn_tracker.stt_first_partial is not None))
  ```
  If any partial STT frame is emitted by line noise, `turn_tracker.stt_first_partial` becomes non-None. Because `start_new_turn()` was never invoked, this field is never reset, creating a secondary latch.

---

## H. Terminal Branch Reachability

Condition for terminal hangup ([`main.py:3556-3563`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3556-L3563)):
```python
elif silence_duration >= nudge_delay and nudge_count >= max_nudges:
    logger.info(
        f"[QuietCallerNudge] Maximum unanswered nudges ({nudge_count}/{max_nudges}) reached; "
        f"initiating terminal disconnect (silence_duration={silence_duration:.1f}s, configured_delay={nudge_delay}s)."
    )
    if not is_terminating() and not is_end_call_pending[0] and not is_transfer_pending[0]:
        await _on_plivo_terminal_hangup()
        break
```
- **Reachability:** This branch is completely unreachable whenever line `3522` (`continue`) is taken.
- Once `assistant_speaking` is locked to `True`, the execution pointer never reaches line `3533`, rendering both Nudge #2 and the terminal hangup unreachable.

---

## I. 66-Second Disconnect Explanation

The call disconnection at `01:15:13.268` (66.019 seconds) occurred due to one of two external events:
1. **Silence Watchdog (`_hangup_silence_watchdog` at [`main.py:3423-3438`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3423-L3438)): Sleeps 15s initial + 45s inbound audio threshold = 60s total.
2. **PSTN / Plivo / Human Disconnect:** The human caller, receiving no audio check-in for >45 seconds after Nudge #1, hung up the call.
This was **not** the intended `[QuietCallerNudge]` terminal hangup branch.

---

## J. Expected vs Actual State Machine

| State / Event | Expected Behavior | Actual Runtime Behavior | Status |
|:---|:---|:---|:---|
| `READY_FOR_USER` | Silence timer arms at `t=0` | Armed at `01:14:18.333` | **PASS** |
| Nudge #1 Threshold | Fires at `t = 5.0s` | Fired at `01:14:23.453` (`silence_duration=5.1s`) | **PASS** |
| Nudge #1 Generation | LLM + TTS synthesizes check-in | Generated "तुम्ही ऐकताय का?" | **PASS** |
| Nudge #1 Playout | Audio sent to Plivo, finishes ~`01:14:29.4` | Audio sent to Plivo at `01:14:27.871` | **PASS** |
| Turn State Cleanup | `record_tts_stop()` called; `is_assistant_speaking = False` | `record_tts_stop()` **skipped**; `is_assistant_speaking` **stuck `True`** | **FAIL (Root Cause 1)** |
| Silence Timer Re-Arm | Silence anchor set to `estimated_outbound_speech_end` (~`01:14:29.4`) | Anchor continuously forced to `now_mono`; `silence_duration` locked at `0.0s` | **FAIL (Root Cause 1)** |
| Nudge #2 Threshold | Fires at ~`01:14:34.4` (`nudge_count = 2`) | **Never triggered** (0 log entries) | **FAIL** |
| Nudge #2 Playout | Audio plays out; timer re-arms | **Never executed** | **FAIL** |
| Terminal Threshold | Fires at ~`01:14:39.4` (`nudge_count >= 2`) | **Never reached** | **FAIL** |
| Terminal Hangup | Calls `_on_plivo_terminal_hangup()` cleanly | Disconnected at `66s` via watchdog / remote drop | **FAIL** |

---

## K. Exact Root Causes

1. **Root Cause 1: `turn_tracker.tts_stop` Omission during Streaming TTS Turn Completion:**
   In [`main.py:1530-1534`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1530-L1534), `TTSStoppedFrame` only calls `turn_tracker.record_tts_stop()` if `is_turn_speech_complete` is `True`. When LLM token streaming or in-flight counts do not strictly align with `TTSStoppedFrame`, `record_tts_stop()` is skipped. `LLMFullResponseEndFrame` ([`main.py:1584`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1584)) also skips `record_tts_stop()` if `tts_start` is present. This permanently strands `turn_tracker.is_assistant_speaking = True` and `is_tts_active = True`.

2. **Root Cause 2: Quiet-Caller Silence Anchor Dependent on Corrupted Turn Tracker State:**
   In [`main.py:3515-3522`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3515-L3522), `_quiet_caller_nudge_loop` evaluates `assistant_speaking` from `turn_tracker.is_assistant_speaking` rather than checking actual acoustic playout timing (`estimated_outbound_speech_end`). Once `turn_tracker` state is desynchronized, the quiet-caller loop is permanently starved.

3. **Root Cause 3: Unanswered Counter Reset by System/Nudge Turn Completion:**
   In [`main.py:3482-3486`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3482-L3486), `has_caller_responded` considers `len(turn_tracker.completed_turns) > last_recorded_user_turns`. When a system nudge turn completes, `completed_turns` increments, which resets `nudge_count = 0`, preventing `nudge_count` from ever reaching `max_nudges` (2).

---

## L. Exact File/Function/Line Locations Responsible

1. **[`apps/pipecat-worker/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py)**:
   - **Lines 1468–1538 (`RealtimeStreamingTimingMonitor.process_frame(TTSStoppedFrame)`):** Skips calling `turn_tracker.record_tts_stop()` if `is_llm_generating` is true or if `LLMFullResponseEndFrame` hasn't synchronized.
   - **Lines 1574–1604 (`RealtimeStreamingTimingMonitor.process_frame(LLMFullResponseEndFrame)`):** Does not finalize `turn_tracker.record_tts_stop()` when TTS synthesis has completed.
   - **Lines 3482–3494 (`_quiet_caller_nudge_loop`):** Checks `len(turn_tracker.completed_turns)` and static `turn_tracker.stt_final` for caller response detection.
   - **Lines 3508–3522 (`_quiet_caller_nudge_loop`):** Uses `turn_tracker.is_assistant_speaking` / `is_tts_active` to continuously bump `last_assistant_speech_end[0] = now_mono`, bypassing the silence timer.

2. **[`apps/pipecat-worker/app/turn_timing.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/turn_timing.py)**:
   - **Lines 249–251 (`is_assistant_speaking`):** Relies strictly on `self.tts_stop is None` with no timeout or fallback to actual audio serializer timestamps.

---

## M. Minimal Fix Recommendation (Read-Only Specification)

To achieve the deterministic state machine:
```
READY_FOR_USER -> Silence >= 5s -> Nudge #1 -> Audio completes -> Re-arm silence timer -> Silence >= 5s -> Nudge #2 -> Audio completes -> Re-arm silence timer -> Silence >= 5s -> Terminal Hangup
```

The minimal, non-invasive fix consists of three targeted corrections:

1. **Decouple Quiet-Caller Silence Measurement from Stale Turn Tracker Flags:**
   In `_quiet_caller_nudge_loop` ([`main.py:3474-3531`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3474-L3531)):
   - Determine assistant speaking state purely by acoustic audio serialization (`now_mono < serializer.estimated_outbound_speech_end`).
   - If audio is actively playing out (`now_mono < estimated_speech_end`), update `last_assistant_speech_end[0] = estimated_speech_end` and `continue`.
   - Once `now_mono >= estimated_speech_end`, assistant speech has finished playing to the caller; the silence timer immediately begins counting from `last_anchor = max(last_assistant_speech_end[0], estimated_speech_end, last_nudge_time)`.

2. **Isolate Caller Response Detection to Genuine STT Transcripts:**
   - Detect genuine caller response ONLY when `turn_tracker.last_user_transcript` is updated with a non-empty string or when genuine user speech completes (`turn_tracker.speech_stop is not None and turn_tracker.stt_final is not None`).
   - Do NOT check `len(turn_tracker.completed_turns)` (which increments on system nudges) and do not check unfinalized/stale partial VAD frames.

3. **Ensure `record_tts_stop()` Guarantees Clean State on `TTSStoppedFrame`:**
   In `RealtimeStreamingTimingMonitor` ([`main.py:1534`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1534)):
   - Call `self._turn_tracker.record_tts_stop()` whenever `TTSStoppedFrame` is received and `_tts_in_flight_count == 0`, ensuring `turn_tracker.tts_stop` is never left as `None` after audio finishes.

*No changes to prompt optimization, STT/TTS providers, or voice telephony architecture are required.*
