# VANIFY VOICE V3 — NUDGE TERMINAL REGRESSION FORENSIC AUDIT
## INDEFINITE SILENCE LOOPING & NUDGE_COUNT RESET INVESTIGATION
**Date:** 2026-09-28  
**System:** NextLite Voice / VanifyAI V3 (Pipecat + Plivo + Sarvam AI)  
**Status:** READ-ONLY Forensic Audit Complete (No code modifications applied)  
**Target Document:** `09_NUDGE_TERMINAL_REGRESSION_FORENSIC.md`

---

## 1. Executive Summary

During real-time PSTN verification following the production bug fixes, a critical regression was observed:
- **Farewell Terminal Hangup:** Verified **WORKING CORRECTLY** (warm HTTP client + 0.1s carrier drain drops the line immediately after audible speech).
- **Initial Silence / Nudge State Machine:** **BROKEN / REGRESSED**. The AI repeatedly issued reminders every ~9–10 seconds (Nudge #1 at 12:35:59, Nudge #2 at 12:36:09, Nudge #3 at 12:36:19, Nudge #4 at 12:36:28, Nudge #5 at 12:36:36, Nudge #6 at 12:36:45...) without ever reaching terminal hangup.

### Forensic Finding Summary
The exact root cause is **`nudge_count = 0` being unconditionally executed inside the assistant-speaking and LLM/audio generation guards during the AI's OWN reminder utterance.**
When Nudge #1 is dispatched, `nudge_count` increments to 1. However, as soon as the LLM begins generating the nudge text, Sarvam TTS synthesizes the audio, and the Plivo serializer streams the audio frames (`now_mono < estimated_speech_end`), lines 3477 and 3507 in `main.py` continuously reset `nudge_count = 0` on every 500ms loop tick. By the time Nudge #1 finishes playing, `nudge_count` is back to 0. The cycle repeats indefinitely, making `nudge_count >= max_nudges` completely unreachable.

---

## 2. Observed Regression

### Telemetry Timeline from Real-Time PSTN Call

```
12:35:39  AI Initial Greeting: "नमस्कार! Medicare मल्टीस्पेशालिटी दवाखाना मध्ये तुमचं स्वागत आहे. मी तुमची काय help करू शकतो?"
          [Greeting finishes; caller remains completely silent]

12:35:59  Nudge #1: "तुम्ही ऐकताय का? काही अडचण आहे?"
          [Nudge #1 audio plays out; caller remains silent]

12:36:09  Nudge #2: "माझा आवाज येतोय का तुम्हाला? काही अडचण आहे?"
          [Nudge #2 audio plays out; caller remains silent]

12:36:19  Nudge #3: "हॅलो, माझा आवाज येतोय का तुम्हाला? मी line वरच आहे."
          [Nudge #3 audio plays out; caller remains silent]

12:36:28  Nudge #4: "तुम्ही आहात का line वर? मी ऐकतोय."

12:36:36  Nudge #5: "माझा आवाज येतोय का तुम्हाला? काही बोलायचं आहे का?"

12:36:45  Nudge #6: "मी line वर आहे, बोला ना. काय माहिती हवी आहे तुम्हाला?"
          ... AI continues nudging infinitely without disconnecting ...
```

### Expected vs. Actual State Transitions

| Step | Expected Behavior (`max_nudges = 2`) | Actual Observed Behavior |
|---|---|---|
| 1 | Greeting completes -> wait 6s | Greeting completes -> wait ~10s |
| 2 | Dispatch Nudge #1 (`nudge_count` = 1) | Dispatched Nudge #1 (`nudge_count` set to 1, then reset to 0 during speech) |
| 3 | Nudge #1 completes -> wait 6s | Nudge #1 completes -> wait ~10s (with `nudge_count` = 0) |
| 4 | Dispatch Nudge #2 (`nudge_count` = 2) | Dispatched Nudge #2 (treated as Nudge #1; `nudge_count` reset to 0 during speech) |
| 5 | Nudge #2 completes -> wait 6s | Nudge #2 completes -> wait ~10s (with `nudge_count` = 0) |
| 6 | **Terminal Hangup (Call Terminates)** | **Dispatches Nudge #3 (infinite loop)** |

---

## 3. Exact Current Nudge State Machine

```mermaid
stateDiagram-v2
    [*] --> GREETING_ACTIVE: Call Connected
    GREETING_ACTIVE --> READY_FOR_USER: Greeting audio finishes (nudge_count=0)
    
    state READY_FOR_USER {
        [*] --> COUNTDOWN_SILENCE
        
        COUNTDOWN_SILENCE --> NUDGE_DISPATCHED: silence >= 6s AND nudge_count < 2
        
        state NUDGE_DISPATCHED {
            [*] --> INCREMENT_COUNT: nudge_count += 1 (count becomes 1)
            INCREMENT_COUNT --> QUEUE_LLM: LLM Context Frame Queued
            
            QUEUE_LLM --> LLM_GENERATING: LLM starts streaming text
            LLM_GENERATING --> RESET_TRAP: is_llm_active == True
            
            state RESET_TRAP {
                [*] --> EXECUTE_RESET: lines 3477 & 3507 execute:
                EXECUTE_RESET --> SET_ZERO: nudge_count = 0 !
            }
            
            RESET_TRAP --> TTS_PLAYOUT: Assistant speaks nudge audio (now < est_end)
            TTS_PLAYOUT --> SET_ZERO: line 3477 executes: nudge_count = 0 !
            SET_ZERO --> AUDIO_FINISHED: Audio completes playback
        }
        
        AUDIO_FINISHED --> COUNTDOWN_SILENCE: Last anchor set to audio end, BUT nudge_count IS 0 !
    }
    
    COUNTDOWN_SILENCE --> TERMINAL_HANGUP: silence >= 6s AND nudge_count >= 2 [UNREACHABLE!]
```

---

## 4. Complete `nudge_count` Write Audit

All occurrences and write operations to `nudge_count` across the entire codebase:

| File & Line | Operation | Condition / Context | Can Reset `nudge_count`? | Forensic Impact |
|---|---|---|---|---|
| [`main.py:3466`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3466) | `nudge_count = 0` | Initial loop setup before while loop | YES (Once at startup) | Correct initial value at call start. |
| [`main.py:3477`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3477) | `nudge_count = 0` | `if now_mono < estimated_speech_end:` | **YES (FATAL BUG)** | **Executes on EVERY loop iteration while the AI speaks its own reminder audio!** |
| [`main.py:3507`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3507) | `nudge_count = 0` | `if user_speaking or is_llm_active or assistant_speaking or has_active_tool:` | **YES (FATAL BUG)** | **Executes on EVERY loop iteration while the LLM generates or TTS synthesizes the reminder!** |
| [`main.py:3521`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3521) | `nudge_count += 1` | `if silence_duration >= nudge_delay and nudge_count < max_nudges:` | NO (Increments) | Increments counter from 0 to 1, but is wiped out immediately by lines 3477 & 3507. |

---

## 5. Complete Silence Anchor Write Audit

| Variable | Write Location | Condition | Forensic Purpose & Evaluation |
|---|---|---|---|
| `last_assistant_speech_end[0]` | [`main.py:2559`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L2559) | `time.perf_counter()` | Initial call start anchor. |
| `last_assistant_speech_end[0]` | [`main.py:3476`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3476) | `now_mono < estimated_speech_end` | Tracks end of physical audio playback for greeting, nudges, and normal assistant speech. **(Correct)** |
| `last_assistant_speech_end[0]` | [`main.py:3506`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3506) | `user_speaking or is_llm_active or ...` | Resets anchor to `now_mono` while user/LLM/tool is active. **(Correct for anchor, but should not reset `nudge_count` on AI nudges)** |
| `last_nudge_time` | [`main.py:3522`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3522) | `silence_duration >= nudge_delay` | Records timestamp when nudge frame was queued. **(Correct)** |
| `last_anchor` | [`main.py:3516`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3516) | `max(last_assistant_speech_end[0], estimated_speech_end, last_nudge_time)` | Effective baseline timestamp for calculating elapsed quiet duration. **(Correct)** |

---

## 6. `assistant_speaking` Interaction

### How the Reminder Triggers the Guard

1. In `_quiet_caller_nudge_loop` ([`main.py:3500`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3500)):
   ```python
   assistant_speaking = bool(turn_tracker and turn_tracker.is_assistant_speaking) or is_tts_active
   ```
2. When the nudge LLM context is queued at line 3539, Sarvam LLM streams the check-in sentence (*"तुम्ही ऐकताय का?"*).
3. Sarvam TTS synthesizes audio chunks -> `turn_tracker.tts_start` is set.
4. `assistant_speaking` evaluates to `True`.
5. At line 3505:
   ```python
   if user_speaking or is_llm_active or assistant_speaking or has_active_tool:
       last_assistant_speech_end[0] = now_mono
       nudge_count = 0  # <--- CRITICAL BUG
       continue
   ```
6. **Result:** The system does not differentiate between:
   - **Assistant responding to a user's question** (which SHOULD reset `nudge_count = 0`), and
   - **Assistant speaking its OWN check-in reminder** (which MUST NOT reset `nudge_count`).

---

## 7. `user_speaking` / VAD Interaction

1. During the silent test, the caller spoke nothing.
2. The VAD noise guard `(now_mono - turn_tracker.speech_start < 4.0)` prevented stuck line static from freezing the countdown.
3. Because the caller never spoke, `user_speaking` was `False`.
4. Therefore, `user_speaking` did **not** cause the reset; the reset was 100% driven by `is_llm_active`, `assistant_speaking`, and `now_mono < estimated_speech_end`.

---

## 8. `turn_in_flight` Interaction

1. When the nudge prompt `[SYSTEM/RUNTIME EVENT]` is added to `conversation_context`, Pipecat treats it as an internal LLM turn.
2. `turn_tracker.is_llm_generating` becomes `True`.
3. `is_llm_active` evaluates to `True`.
4. This immediately trips line 3505, executing `nudge_count = 0` before the audio has even finished streaming to the serializer.

---

## 9. Runtime Configuration Values

From production contract and runtime inspection:
- `runtime_config.runtime.nudges.enabled` = `True`
- `runtime_config.runtime.nudges.delay_seconds` = `5` or `6` (resolves to `6` in worker logic)
- `runtime_config.runtime.nudges.max_unanswered_nudges` = `2`
- **Verdict:** Configuration is completely correct (`max_nudges = 2`). The failure to terminate is entirely a code logic bug where the counter is wiped out before it can reach 2.

---

## 10. Multiple Task / Loop Analysis

- Search across the codebase confirms there is **only ONE `_quiet_caller_nudge_loop` task** created per call (`nudge_task` at [`main.py:3555`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3555)).
- It is cleanly cancelled in `finally:` at line 3576.
- There are no duplicate background loops or concurrent tasks.

---

## 11. Terminal Condition Reachability Analysis

In [`main.py:3542-3551`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3542-L3551):
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

- **Is the branch syntax correct?** YES.
- **Is the terminal hangup call correct?** YES (`_on_plivo_terminal_hangup()` works and drops the call).
- **Why is it never reached?** Because `nudge_count` is reset to `0` during every nudge's audio playback. Thus, on every silence expiry, `nudge_count` is always `0` (`0 < 2`), so it always enters the first `if` branch (dispatching another nudge) and NEVER reaches the `elif nudge_count >= max_nudges` branch!

---

## 12. Exact Root Cause

### Root Cause Summary
1. **The silence loop resets `nudge_count = 0` whenever `assistant_speaking == True`, `is_llm_active == True`, or `now_mono < estimated_speech_end`.**
2. **Because speaking a reminder causes the assistant to speak (`assistant_speaking = True`, `now_mono < estimated_speech_end`), the AI wipes its own memory of having nudged the caller.**
3. **Only genuine USER conversational turns (or greeting completion) should reset `nudge_count = 0`. An automated reminder prompt must NEVER reset `nudge_count`.**

---

## 13. Evidence Classification

| Finding | Classification | Evidence Source |
|---|---|---|
| AI dispatched 6 consecutive nudges without hanging up | **CONFIRMED BY LIVE LOG** | Timestamps 12:35:59 through 12:36:45 in real PSTN test. |
| `nudge_count = 0` executes while AI speaks reminder | **CONFIRMED BY CODE** | Lines 3477 and 3507 in `apps/pipecat-worker/app/main.py`. |
| `max_nudges` is configured to 2 in runtime config | **CONFIRMED BY CODE & CONFIG** | `RuntimeNudgeConfig.max_unanswered_nudges = 2`. |
| Single nudge task exists per WebSocket session | **CONFIRMED BY CODE** | `nudge_task` instantiated exactly once at `main.py:3555`. |
| Terminal branch is structurally unreachable due to reset | **CONFIRMED ROOT CAUSE** | Formal control-flow trace: `nudge_count` is 0 at the start of every silence expiry. |

---

## 14. Minimal Safe Fix Strategy (Strategy Only — No Code)

1. **Differentiate User Turns from AI Nudges:**
   - `nudge_count = 0` must ONLY occur when:
     - `user_speaking == True` (genuine caller speech detected), OR
     - A user turn completes and the assistant is responding to the user's inquiry (`turn_tracker.turn_type == "user_turn"` with completed user transcript).
2. **Do NOT Reset `nudge_count` on Assistant Audio Drain or LLM Generation:**
   - In `if now_mono < estimated_speech_end:`:
     - Update `last_assistant_speech_end[0] = estimated_speech_end`.
     - **DO NOT reset `nudge_count = 0`.**
   - In `if is_llm_active or assistant_speaking or has_active_tool:`:
     - Update `last_assistant_speech_end[0] = now_mono`.
     - **DO NOT reset `nudge_count = 0`.**
3. **Reset `nudge_count = 0` ONLY when `user_speaking == True`:**
   - When the caller speaks (`user_speaking == True`), set `nudge_count = 0`.
4. **State Machine Execution with Fix:**
   - Greeting completes -> `nudge_count = 0`.
   - Silence for 6s -> Nudge #1 dispatched -> `nudge_count = 1`.
   - Nudge #1 audio plays -> `last_assistant_speech_end` advances to end of nudge audio -> `nudge_count` **REMAINS 1**.
   - Silence for 6s after Nudge #1 audio -> `nudge_count < max_nudges` (1 < 2) -> Nudge #2 dispatched -> `nudge_count = 2`.
   - Nudge #2 audio plays -> `last_assistant_speech_end` advances to end of nudge audio -> `nudge_count` **REMAINS 2**.
   - Silence for 6s after Nudge #2 audio -> `nudge_count >= max_nudges` (2 >= 2) -> **Executes `await _on_plivo_terminal_hangup()` and cleanly disconnects the call!**

---

## 15. Exact Functions Requiring Modification (In Next Step)

- **File:** [`apps/pipecat-worker/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py)
- **Function:** `_quiet_caller_nudge_loop()` (lines 3462–3553)
- **Changes Needed:**
  - Remove `nudge_count = 0` from line 3477 (`if now_mono < estimated_speech_end`).
  - Remove `nudge_count = 0` from line 3507 (`if user_speaking or is_llm_active...`), isolating `nudge_count = 0` to execute **strictly when `user_speaking` is True**.

---

## 16. Regression Test Plan

1. **Test N1 (Two Nudges Then Hangup):**
   - Caller silent -> Nudge 1 emitted -> Caller silent -> Nudge 2 emitted -> Caller silent -> Line disconnects.
2. **Test N2 (Caller Responds After Nudge 1):**
   - Caller silent -> Nudge 1 emitted -> Caller speaks "Yes I'm here" -> `nudge_count` resets to 0 -> Conversation continues normally.
3. **Test N3 (Caller Responds After Nudge 2):**
   - Caller silent -> Nudge 1 -> Nudge 2 -> Caller speaks -> `nudge_count` resets to 0 -> Conversation continues normally.
4. **Test N4 (Farewell Hangup Regression Check):**
   - Ensure farewell hangup remains fast (<200ms) and unaffected.

---

## 17. Expected Correct State Machine Summary

```
CALL_CONNECTED
      ↓
GREETING_COMPLETED (nudge_count = 0)
      ↓
[6.0s Silence]
      ↓
NUDGE #1 DISPATCHED (nudge_count = 1)
      ↓
[Nudge #1 Audio Playout: ~2.5s] (nudge_count remains 1)
      ↓
[6.0s Silence after Nudge #1 audio]
      ↓
NUDGE #2 DISPATCHED (nudge_count = 2)
      ↓
[Nudge #2 Audio Playout: ~2.5s] (nudge_count remains 2)
      ↓
[6.0s Silence after Nudge #2 audio]
      ↓
MAX UNANSWERED NUDGES REACHED (count=2 >= max=2)
      ↓
_on_plivo_terminal_hangup()
      ↓
CALL DISCONNECTED (Total elapsed call duration: ~23–25s)
```
