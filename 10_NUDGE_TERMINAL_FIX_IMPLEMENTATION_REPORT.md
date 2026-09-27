# VANIFY VOICE V3 — NUDGE TERMINAL FIX IMPLEMENTATION REPORT
## COUNTER STATE ISOLATION & TERMINAL DISCONNECT ENFORCEMENT
**Date:** 2026-09-28  
**System:** NextLite Voice / VanifyAI V3 (Pipecat + Plivo + Sarvam AI)  
**Status:** Automated verification complete; real PSTN validation pending  
**Test Results:** **435 Passed / 0 Failed (100% Pass Rate)**

---

## 1. Root Cause Summary

In the previous silence implementation, `_quiet_caller_nudge_loop()` contained two unconditional `nudge_count = 0` assignments inside the audio drain check (`now_mono < estimated_speech_end`) and the active execution guard (`if user_speaking or is_llm_active or assistant_speaking or has_active_tool:`).

Because speaking an automated check-in reminder causes the LLM to generate text, TTS to synthesize audio, and serializer to drain outbound frames, the AI continuously reset `nudge_count` back to `0` on every 500ms loop tick during its own speech. As a result, by the time Nudge #1 finished playing, `nudge_count` was back to `0`. On every subsequent silence interval, the AI repeatedly treated the next reminder as Nudge #1, causing indefinite looping (Nudge #1 -> Nudge #2 -> Nudge #3 -> Nudge #4 -> Nudge #5...) and preventing `nudge_count >= max_nudges` from ever being reached.

---

## 2. Exact Lines and Functions Modified

### File: [`apps/pipecat-worker/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3460-L3555)

**Function:** `_quiet_caller_nudge_loop()`

```diff
-                        if now_mono < estimated_speech_end:
-                            last_assistant_speech_end[0] = estimated_speech_end
-                            nudge_count = 0
-                            continue
+                        if now_mono < estimated_speech_end:
+                            last_assistant_speech_end[0] = estimated_speech_end
+                            # DO NOT reset nudge_count during assistant audio playout
+                            continue

+                        # Check for genuine caller turn / speech to reset unanswered nudge counter
+                        current_user_turns = len(turn_tracker.completed_turns) if turn_tracker else 0
+                        has_caller_responded = (
+                            current_user_turns > last_recorded_user_turns
+                            or (turn_tracker and (turn_tracker.stt_final is not None or turn_tracker.user_aggregation_finalized is not None or turn_tracker.stt_first_partial is not None))
+                        )
+                        if has_caller_responded:
+                            last_recorded_user_turns = current_user_turns
+                            if nudge_count > 0:
+                                logger.info(
+                                    f"[QuietCallerNudge] Genuine caller response detected; resetting unanswered nudge_count from {nudge_count} to 0."
+                                )
+                            nudge_count = 0

-                        # If user is speaking, LLM is generating, assistant is speaking, or tool is active:
-                        # Keep the silence anchor continuously updated to NOW and reset nudge count.
-                        if user_speaking or is_llm_active or assistant_speaking or has_active_tool:
-                            last_assistant_speech_end[0] = now_mono
-                            nudge_count = 0
-                            continue
+                        # If user is speaking, LLM is generating, assistant is speaking, or tool is active:
+                        # Keep the silence anchor continuously updated to NOW (do NOT reset nudge_count here)
+                        if user_speaking or is_llm_active or assistant_speaking or has_active_tool:
+                            last_assistant_speech_end[0] = now_mono
+                            continue
```

---

## 3. Exact Behavioral Change

1. **AI Nudge Playout Counter Invariance:**
   - While Nudge #1 is generating and speaking, `nudge_count` **strictly remains 1**.
   - While Nudge #2 is generating and speaking, `nudge_count` **strictly remains 2**.
2. **Terminal Disconnect Guaranteed:**
   - For `max_nudges = 2`, after Nudge #2 audio finishes and a second 6s silence interval elapses without caller speech, `nudge_count >= max_nudges` (2 >= 2) evaluates to `True`.
   - The loop logs: `[QuietCallerNudge] Maximum unanswered nudges (2/2) reached; initiating terminal disconnect.`
   - Executes `await _on_plivo_terminal_hangup()` and breaks.
   - **Zero Nudge #3, #4, #5 dispatches.**
3. **Genuine Caller Response Resets Counter:**
   - If the caller speaks at any point (e.g. after Nudge #1 or Nudge #2), Sarvam STT emits transcript (`turn_tracker.stt_final` or `user_aggregation_finalized`), and `nudge_count` is reset to `0`.
   - Spurious ambient noise / VAD static (>4s without speech stop or transcript) does NOT reset the counter.

---

## 4. Test Results

### Focused Test Suite ([`tests/test_production_bug_fixes_p0.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/tests/test_production_bug_fixes_p0.py))
- **TEST 1 (`test_t8_unanswered_silence_triggers_terminal_hangup`):** PASSED (Nudge 1 -> Nudge 2 -> Terminal hangup; verified exactly 2 nudges and 0 Nudge 3).
- **TEST 2 & 3 (`test_t9_t10_caller_responds_after_nudge_resets_counter`):** PASSED (Caller speech transcript resets `nudge_count` to 0).
- **TEST 4 (`test_assistant_nudge_does_not_reset_nudge_count`):** PASSED (`is_llm_active`, `assistant_speaking`, `now_mono < estimated_speech_end` all preserve `nudge_count = 1`).
- **TEST 5 (`test_t12_stuck_vad_line_noise_does_not_reset_nudge_count`):** PASSED (Spurious VAD noise blips without transcript do not reset counter).
- **TEST 6 (`test_t1_farewell_warm_http_client_and_margin`):** PASSED (Warm client reuse and 0.1s carrier margin verified).

---

## 5. Full Test Suite & Regression Verification

- **Execution Command:** `.\.venv\Scripts\python.exe -m pytest`
- **Total Tests:** **435 items**
- **Passed:** **435 passed (100%)**
- **Failed:** **0 failed**
- **Regressions:** **0 regressions**
- **Execution Time:** 64.59s

---

## 6. Farewell Regression Verification

- The farewell terminal disconnect optimization remains 100% intact:
  - Reuses warm `shared_http_client`.
  - Minimal 0.1s carrier drain margin.
  - Plivo REST `DELETE` takes < 200ms.
  - Total time from legitimate speech completion to line drop remains < 300ms.
  - Zero modifications were made to the farewell code path.

---

## 7. Remaining Real-PSTN Validation Steps

> [!IMPORTANT]
> **Automated verification complete; real PSTN validation pending.**

### Step 1: Initial Silence Test Call
1. Dial the production Plivo phone number.
2. Listen to the initial greeting; remain completely silent.
3. **Verify:**
   - At ~6s after greeting: AI speaks Nudge #1 (*"तुम्ही ऐकताय का?"*).
   - Continue remaining silent.
   - At ~6s after Nudge #1 audio completes: AI speaks Nudge #2 (*"माझा आवाज येतोय का तुम्हाला?"*).
   - Continue remaining silent.
   - At ~6s after Nudge #2 audio completes: Call disconnects automatically.
   - Total call duration: ~20–25s. **NO Nudge #3.**

### Step 2: Caller Speaks After Nudge #1
1. Dial the production Plivo phone number.
2. Remain silent until Nudge #1 is spoken.
3. Respond: *"हो मी ऐकतोय, मला appointment हवी आहे."*
4. **Verify:** AI acknowledges and proceeds with booking without hanging up.
