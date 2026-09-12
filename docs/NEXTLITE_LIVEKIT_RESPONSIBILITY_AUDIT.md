# NextLite Voice V3 — LiveKit Responsibility & Behavioral Audit

> **Scope**: Exhaustive Responsibilities of `apps/livekit-worker` (Current Production Reference)  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Categorized Responsibility Breakdown

### A. Core Business Behaviors (Platform Agnostic)
1. **Turn-Taking Guardrails**: Max 1–2 sentences, single question per turn, latest intent priority, anti-self-talk.
2. **Sequential Appointment References**: Returning `A-001` and suppressing internal database UUIDs.
3. **Temporal & Calendar Context**: Injecting current time, date, timezone, and 7-day relative day matrix.
4. **Indic Multilingual Protection**: 12 Indic regex rules, Devanagari script filter, Latin Hinglish/Minglish marker filters.
5. **Caller Phone Fallback**: Using incoming caller phone number when caller says "use this number".

### B. NextLite API Contracts (Platform Agnostic)
1. `GET /api/internal/runtime-config/:deploymentId`
2. `POST /api/internal/knowledge/retrieve`
3. `POST /api/internal/call-sessions`
4. `PATCH /api/internal/call-sessions/:id`
5. `POST /api/internal/leads`
6. `POST /api/internal/appointments`

### C. Realtime Voice Runtime Behaviors
1. **STT Transcription**: Streaming audio to Sarvam Saaras v3 with initial `'unknown'` auto-detect.
2. **LLM Inference**: Streaming conversational tokens from Sarvam-105B or LiveKit Gateway.
3. **TTS Synthesis**: Streaming audio chunks from Sarvam Bulbul v3 with dynamic target language update.
4. **Speech Interruption**: Barge-in detection clearing outbound audio buffer upon user speech onset.
5. **Session Finalization**: Duration calculation, transcript formatting, metrics aggregation.

### D. LiveKit-Specific Infrastructure (DO NOT COPY TO PIPECAT)
1. `livekit-server-sdk` RoomServiceClient, AgentDispatchClient, SipClient.
2. `@livekit/agents` `AgentSession`, `inference.TurnDetector(v1-mini)`, `cli.runApp()`.
3. `@livekit/rtc-node` WebRTC audio tracks.
4. LiveKit room metadata parsing (`ctx.room.metadata`).

### E. Pipecat-Specific Infrastructure (TARGET FOR PIPECAT WORKER)
1. `FastAPIWebsocketTransport` listening on `/ws/plivo`.
2. `PlivoFrameSerializer` handling 8000 Hz μ-law telephony packets.
3. Native Pipecat `Pipeline`, `PipelineWorker`, `WorkerRunner`.
4. `SarvamSTTService`, `SarvamLLMService`, `SarvamTTSService`.
5. `LLMContext` + `LLMContextAggregatorPair` (`LLMUserAggregator`, `LLMAssistantAggregator`).

---

## 2. Definitive Responsibility Matrix

| Responsibility | LiveKit Implementation | NextLite Owner | Pipecat Requirement | Reusable Contract / Logic |
|---|---|---|---|---|
| **Config Resolution** | `runtimeConfigClient.ts:getRuntimeAgentConfig` | `apps/api` (`RuntimeAgentConfigService`) | Fetch via `GET /api/internal/runtime-config/:deploymentId` | `RuntimeAgentConfig` DTO |
| **Active Session Start** | `runtimeConfigClient.ts:createCallSession` | `apps/api` (`CallSessionService`) | Call `POST /api/internal/call-sessions` (status `ACTIVE`) | `CreateCallSessionRequest` |
| **Temporal Context** | `temporalContext.ts:buildTemporalInstruction` | Shared Worker Logic | Port to Python `temporal_context.py` | String template formatter |
| **Calendar Context** | `calendarContext.ts:buildCalendarInstruction` | Shared Worker Logic | Port to Python `calendar_context.py` | 7-day relative matrix |
| **Multilingual Manager** | `languageManager.ts:ConversationLanguageManager` | Shared Worker Logic | Port to Python `language_manager.py` | 12 Indic regex rules & Hinglish filters |
| **Knowledge Retrieval** | `knowledgeTool.ts` &rarr; `POST /api/internal/knowledge/retrieve` | `apps/api` (`KnowledgeService`) | Native Pipecat tool calling `/api/internal/knowledge/retrieve` | `{ deploymentId, query }` &rarr; `{ results }` |
| **Appointment Booking** | `appointmentTool.ts` &rarr; `POST /api/internal/appointments` | `apps/api` (`AppointmentService`) | Native Pipecat tool calling `/api/internal/appointments` | Schema with `appointmentNumber` `A-001` return |
| **Lead Capture** | `leadTool.ts` &rarr; `POST /api/internal/leads` | `apps/api` (`LeadService`) | Native Pipecat tool calling `/api/internal/leads` | Schema with caller phone fallback |
| **Session Finalization** | `main.ts:finalizeCallSession` &rarr; `PATCH /api/internal/call-sessions/:id` | `apps/api` (`CallSessionService`) | Call `PATCH /api/internal/call-sessions/:id` in `finally:` block | Final status, duration, turns, metrics |
| **Telephony Ingress** | LiveKit SIP Gateway + SIP Trunk | Infrastructure | FastAPI WebSocket `/ws/plivo` + `PlivoFrameSerializer` | Bidirectional 8kHz μ-law audio |
| **STT Engine** | `@livekit/agents-plugin-sarvam` STT | Sarvam AI | `pipecat.services.sarvam.stt.SarvamSTTService` | `saaras:v3` |
| **LLM Engine** | `SarvamLLM` custom adapter | Sarvam AI | `pipecat.services.sarvam.llm.SarvamLLMService` | `sarvam-105b` |
| **TTS Engine** | `@livekit/agents-plugin-sarvam` TTS | Sarvam AI | `pipecat.services.sarvam.tts.SarvamTTSService` | `bulbul:v3` |
| **Turn Detection / VAD** | `inference.TurnDetector(v1-mini)` | LiveKit in-process | Native Sarvam STT VAD (`on_speech_started`/`stopped`) | VAD turn event signals |
| **Speech Interruption** | `resolveInterruptionOptions` | LiveKit AgentSession | Pipecat `InterruptionFrame` + Plivo buffer clear | Immediate audio cancel |
