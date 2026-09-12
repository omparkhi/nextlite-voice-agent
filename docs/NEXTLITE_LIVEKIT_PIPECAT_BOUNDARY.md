# NextLite Voice V3 — LiveKit vs. Pipecat Boundary & Migration Matrix

> **Scope**: Definitive Migration Parity Matrix & Domain Boundary Separation  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Definitive LiveKit &rarr; Pipecat Migration Matrix

| Capability | Current Owner | Current LiveKit Implementation | NextLite API Contract | LiveKit Specific? | Pipecat Specific? | Must Preserve? | Pipecat Migration Action | Risk Level |
|---|---|---|---|---|---|---|---|---|
| **Telephony Transport** | LiveKit SIP | LiveKit SIP Inbound Trunk & WebRTC Room | None (LiveKit native) | **YES** | **YES** (Plivo WS) | **NO** (Replacing transport) | Replace with FastAPI WebSocket `/ws/plivo` + `PlivoFrameSerializer` | **LOW** (Verified in Phase 1) |
| **Audio Encoding** | LiveKit RTC | 48kHz WebRTC transcode | None | **YES** | **YES** (8kHz μ-law) | **NO** | Stream 8kHz native μ-law telephony packets directly | **LOW** (Verified in Phase 3) |
| **STT Ingestion** | Sarvam AI | `@livekit/agents-plugin-sarvam` STT (`saaras:v3`) | None | No | No | **YES** | Use `pipecat.services.sarvam.stt.SarvamSTTService` | **LOW** (Verified in Phase 2) |
| **LLM Inference** | Sarvam AI | `SarvamLLM` custom adapter (`sarvam-105b`) | None | No | No | **YES** | Use `pipecat.services.sarvam.llm.SarvamLLMService` | **LOW** (Verified in Phase 4) |
| **TTS Synthesis** | Sarvam AI | `@livekit/agents-plugin-sarvam` TTS (`bulbul:v3`) | None | No | No | **YES** | Use `pipecat.services.sarvam.tts.SarvamTTSService` | **LOW** (Verified in Phase 2) |
| **System Prompt** | NextLite API | `PromptCompilerService.compileAgentPrompt()` | `RuntimeAgentConfig.prompt.compiledSystemPrompt` | No | No | **YES** | Consume `compiledSystemPrompt` from internal API; do not alter | **ZERO** |
| **Temporal Context** | Worker Logic | `temporalContext.ts:buildTemporalInstruction` | Shared contract | No | No | **YES** | Port to Python `temporal_context.py` | **LOW** |
| **Calendar Context** | Worker Logic | `calendarContext.ts:buildCalendarInstruction` | Shared contract | No | No | **YES** | Port to Python `calendar_context.py` | **LOW** |
| **Language Manager** | Worker Logic | `languageManager.ts:ConversationLanguageManager` | Shared contract | No | No | **YES** | Port to Python `language_manager.py` (12 Indic regex rules & Hinglish filters) | **MEDIUM** |
| **Knowledge (RAG)** | NextLite API | `knowledgeTool.ts` &rarr; `POST /api/internal/knowledge/retrieve` | `POST /api/internal/knowledge/retrieve` | No | No | **YES** | Expose `query_knowledge_base` tool in Pipecat calling internal REST endpoint | **LOW** |
| **Appointments** | NextLite API | `appointmentTool.ts` &rarr; `POST /api/internal/appointments` | `POST /api/internal/appointments` | No | No | **YES** | Expose `book_appointment` tool in Pipecat calling internal REST endpoint | **LOW** |
| **Leads** | NextLite API | `leadTool.ts` &rarr; `POST /api/internal/leads` | `POST /api/internal/leads` | No | No | **YES** | Expose `create_callback_lead` tool in Pipecat calling internal REST endpoint | **LOW** |
| **Call Start** | NextLite API | `POST /api/internal/call-sessions` (status `ACTIVE`) | `POST /api/internal/call-sessions` | No | No | **YES** | Call `POST /api/internal/call-sessions` on Plivo `start` event | **LOW** |
| **Call Finalization** | NextLite API | `PATCH /api/internal/call-sessions/:id` (status `COMPLETED`) | `PATCH /api/internal/call-sessions/:id` | No | No | **YES** | Call `PATCH /api/internal/call-sessions/:id` in `finally:` handler | **LOW** |
| **Turn Accumulation** | Worker Memory | `DebugTranscriptCollector` in `debugTranscript.ts` | Shared contract | No | No | **YES** | Accumulate user turns & agent messages in Python memory for final transcript | **LOW** |
| **Timing Telemetry** | Worker Memory | `RealtimeTimingTracker` in `realtimeTiming.ts` | Shared contract | No | No | **YES** | Track STT, TTFT, TTFB, turn latency in `RealtimeStreamingTimingMonitor` | **LOW** |
| **Worker Auth** | NextLite API | Pre-shared secret header (`x-worker-secret`) | `WORKER_API_SECRET` | No | No | **YES** | Inject `WORKER_API_SECRET` into all outbound HTTP requests | **LOW** |
| **Tenant Isolation** | NextLite API | Authoritatively derived from `deploymentId` | `deployments` FK | No | No | **YES** | Pass `deploymentId` in all tool and session calls | **ZERO** |

---

## 2. Systems Pipecat MUST NOT Own

> [!CRITICAL]
> **THINGS PIPECAT MUST NEVER OWN, IMPLEMENT, OR DUPLICATE:**

1. **PostgreSQL Database**: Pipecat must NOT connect to PostgreSQL or execute SQL queries.
2. **Document Ingestion & Chunking**: Pipecat must NOT parse files, chunk markdown, or count tokens.
3. **Vector Embeddings**: Pipecat must NOT call Nvidia or Gemini embedding APIs.
4. **Prompt Compilation**: Pipecat must NOT assemble Layer A or Layer B prompts; it consumes `compiledSystemPrompt`.
5. **Sequential Appointment Counter**: Pipecat must NOT calculate appointment numbers (`A-001`); NextLite API returns it.
6. **Agent Versioning & State Machine**: Pipecat must NOT touch versions or deployments.
7. **CRM Business Rules**: Pipecat must NOT manage lead funnels or follow-up dispatches.
8. **User Identity & JWT Verification**: Pipecat does not handle user logins or client auth.
