# Call Lifecycle & PSTN Session Management Parity

**Telephony Engine:** Plivo WebSocket Media Stream  
**Worker Implementation:** `apps/pipecat-worker/app/main.py`, `call_session.py`, `turn_timing.py`  
**Database Model:** `call_sessions` table (17 columns)  
**Audit Date:** September 2026

---

## 1. End-to-End Call State Machine

```
[ INBOUND CALL ] ──> Plivo Answer ──> WebSocket Connect (/ws/plivo)
                                             │
                                             ▼
                                     [ STARTUP PHASE ]
                                     1. Parse Plivo 'start' Event (CallUUID, From, To)
                                     2. Fetch RuntimeAgentConfig (Deployment Resolution)
                                     3. POST /api/internal/call-sessions (Status: 'ACTIVE')
                                     4. Start Pipecat Pipeline
                                     5. Play Instant Cached/Generated Greeting Audio
                                             │
                                             ▼
                                     [ ACTIVE CONVERSATION ]
                              ┌─────────────────────────────┐
                              │ Turn Loop:                  │
                              │ 1. User Audio in (Plivo WS) │
                              │ 2. Sarvam STT Transcription │
                              │ 3. UserAggregator Endpoint  │
                              │ 4. Sarvam LLM TTFT Streaming│
                              │ 5. Tool Call (if requested) │
                              │ 6. Sarvam Bulbul TTS Audio  │
                              │ 7. Audio Out to Plivo WS    │
                              │ 8. Barge-in / Interruption  │
                              └─────────────────────────────┘
                                             │
                                             ▼
                                    [ CALL TERMINATION ]
                           (Caller Hangup / Timeout / Max Duration / Error)
                                             │
                                             ▼
                                   [ IDEMPOTENT FINALIZATION ]
                                   1. Latch Final Turn Timers
                                   2. Flush Transcript & Tool Logs
                                   3. Compute P50/P90/P95 Metrics
                                   4. Terminal PATCH /api/internal/call-sessions/:id
                                      - Status: COMPLETED / FAILED / MISSED
                                      - Duration, Transcript JSON, Metrics JSON
```

---

## 2. Terminal PATCH Idempotency Contract

The worker guarantees exact-once terminal session persistence:
1. **Finalization Latch:** An atomic boolean `_is_finalized` prevents duplicate teardown requests.
2. **Fallback on Exception:** If pipeline encounters a fatal error, an emergency teardown handler sets `status = 'FAILED'`, captures traceback, and issues terminal PATCH.
3. **Missed Call Trap:** If a call connects but terminates before any user audio or greeting completes (< 3 seconds), status is recorded as `'MISSED'`.