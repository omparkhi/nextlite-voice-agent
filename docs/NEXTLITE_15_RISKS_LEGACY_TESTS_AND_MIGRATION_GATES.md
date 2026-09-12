# NextLite Voice V3 — Risks, Legacy, Tests & Migration Gates
## Document 15: Legacy Code, Hardcoded Defaults, Test Coverage & Phase 6 Migration Gates

> **Document Type**: Risk Assessment, Test Inventory & Migration Prerequisites  
> **Status**: Verified from Implementation (Read-Only)  
> **Current Migration Phase**: STOPPED AT PHASE 5  
> **Timestamp**: 2026-09-09  

---

## 1. Section A: Legacy & Deprecated Code Classifications

| Code Artifact / File / Route | Classification | Location | Current Behavior | Target / Recommendation |
|---|---|---|---|---|
| `agent_tools` PostgreSQL table | **DEPRECATED** | `apps/api/src/db/schema.ts:172` | Table exists in schema, but V3 runtime resolves tool bindings from `agent_versions.configuration.tools.bindings`. | Preserve in schema for DB backward compatibility; do not reference in new code. |
| `GET /api/admin/clients/:cId/agents/:aId/runtime-config` | **DEPRECATED** | `apps/api/src/routes/agents.ts:459` | Legacy V1/V2 endpoint returning unversioned runtime config. Not used by V3 worker. | Preserve for backward compatibility; V3 uses `/api/internal/runtime-config/:deploymentId`. |
| `AgentService.generateRuntimeConfig()` | **DEPRECATED** | `apps/api/src/services/agent.ts:353` | Helper backing the deprecated admin runtime-config route. | Preserve for legacy route; V3 uses `RuntimeAgentConfigService`. |
| `(config.tools as any).tools` (Legacy tool array shape) | **LEGACY / FALLBACK** | `apps/api/src/services/runtimeAgentConfig.ts:186` | Normalizes legacy `tools.tools` array to canonical `tools.bindings`. | Retain fallback normalizer to safely support older seed versions. |
| `TEST_PROMPT` in Pipecat | **TEMPORARY / TEST-ONLY** | `apps/pipecat-worker/app/config.py:22` | Hardcoded 5-line test prompt used for Phase 4 LLM streaming verification. | Replace in Phase 6 with `RuntimeAgentConfig.prompt.compiledSystemPrompt`. |
| `PHASE2_TEST_VOICE_ID` (`'shubh'`) | **TEMPORARY / TEST-ONLY** | `apps/pipecat-worker/app/config.py:21` | Hardcoded test speaker voice for telephony loopback verification. | Replace in Phase 6 with `RuntimeAgentConfig.voice.voiceId`. |
| `DeterministicTestEchoProcessor` | **TEST-ONLY** | `apps/pipecat-worker/app/main.py:208` | Frame processor echoing user transcripts for Phase 2 test suite. | Retain in test harness; excluded from active conversational pipeline. |
| `/plivo/test-xml` Endpoint | **TEST-ONLY** | `apps/pipecat-worker/app/main.py:71` | Generates Plivo Answer XML for manual test number loopback. | Retain for manual staging diagnostics. |
| `Redis` connection (`db/redis.ts`) | **ACTIVE (Health Check Only)** | `apps/api/src/db/redis.ts` | Pinged by `/api/health`; no voice runtime queuing dependencies. | Keep as peripheral infrastructure. |
| `TelephonyProvider` (`'exotel'` vs `'plivo'`) | **LEGACY / TRANSITIONAL** | `apps/api/src/config/env.ts:52` | Env variable defaults to `'exotel'`, but Plivo numbers and Zentrunk are actively used. | Clarify telephony provider strategy in production deployments. |

---

## 2. Section B: Duplication Analysis

- **Prompt Compilers**: No duplicate prompt compilers exist in the codebase. All prompt compilation is owned by `PromptCompilerService` in `apps/api`.
- **Tool Registries**: LiveKit worker maintains `ToolRegistry` in TypeScript (`apps/livekit-worker/src/tools/toolRegistry.ts`). Pipecat will maintain a parallel Python registry (`apps/pipecat-worker/app/tools/tool_registry.py`) in Phase 6.
- **DTO Definitions**: TypeScript definitions reside in `packages/shared/src/runtimeConfig.ts`. Python equivalents will be typed with Pydantic in `apps/pipecat-worker/app/models.py`.

---

## 3. Section C: Hardcoded Values & Behavioral Neutrality

| Category | Value / Behavior | Location | Classification | Justification / Impact |
|---|---|---|---|---|
| **Default Timezone** | `'Asia/Kolkata'` | `apps/api/src/services/runtimeAgentConfig.ts:207`, `temporalContext.ts:150` | **Intentional Default** | Standard default timezone for Indian business operations when unconfigured. |
| **Default STT Model** | `'saaras:v3'` | `apps/api/src/services/runtimeAgentConfig.ts`, `apps/livekit-worker/src/main.ts:58` | **Intentional Default** | Sarvam's flagship Indian multilingual speech recognition model. |
| **Default TTS Model** | `'bulbul:v3'` | `apps/api/src/services/runtimeAgentConfig.ts`, `apps/livekit-worker/src/main.ts:59` | **Intentional Default** | Sarvam's flagship Indian multilingual speech synthesis model. |
| **Default LLM Model** | `'sarvam-105b-conversations'` | `apps/api/src/services/runtimeAgentConfig.ts`, `apps/livekit-worker/src/agent.ts:77` | **Intentional Default** | Sarvam's conversational Indic LLM endpoint. |
| **Turn Limits** | Max 1–2 sentences, Max 150 chars, Max 1 question | `apps/api/src/services/promptCompiler.ts:30-31` | **Intentional Safety Rule** | Core Layer A prompt safety boundary to prevent unnatural voice monologues. |
| **Appointment Number Format** | `'A-001'` (3-digit zero padded) | `apps/api/src/services/appointment.ts:65`, `appointmentTool.ts:232` | **Intentional Architecture** | Human-friendly reference format preventing UUID pronunciation. |
| **Worker Secret Default** | `'dev-livekit-worker-secret-v3'` | `apps/api/src/config/env.ts:81`, `appointmentTool.ts:114` | **Development Fallback** | Allows local dev without complex secrets; overridden in production env. |
| **API Base URL Default** | `'http://localhost:3001'` | `apps/livekit-worker/src/runtimeConfigClient.ts:7`, `appointmentTool.ts:109` | **Development Fallback** | Local developer default; overridden by `NEXTLITE_API_URL` in production. |
| **Pipecat Test Prompt** | 5-line static test prompt | `apps/pipecat-worker/app/config.py:22` | **Temporary Migration Artifact** | Used for Phase 4 LLM streaming test; to be replaced in Phase 6. |
| **Pipecat Test Voice ID** | `'shubh'` | `apps/pipecat-worker/app/config.py:21` | **Temporary Migration Artifact** | Used for Phase 2–4 test suites; to be replaced in Phase 6. |
| **Plivo Audio Sampling Rate** | `8000 Hz` (μ-law) | `apps/pipecat-worker/app/main.py:327` | **Telephony Standard** | ITU-T standard for PSTN audio streaming. |
| **Fallback Test IDs** | `'test-tenant'`, `'test-agent'`, `'test-deployment'` | `apps/api/src/services/runtimeAgentConfig.ts:192-200` | **Unit Test Fallback** | Used strictly when `buildRuntimeAgentConfig` is invoked in isolated unit tests without options. |

> [!NOTE]
> **INDUSTRY NEUTRALITY VERIFIED**: The core runtime engine contains zero hardcoded mentions of clinics, hospitals, real estate, edtech, or finance in its Layer A safety rules. All domain facts flow dynamically from `AgentConfiguration.businessInformation` and RAG chunks.

---

## 4. Section D: Complete Test Suite Inventory (41 Test Suites)

### 4.1 Backend REST API (`apps/api/src/__tests__`) — 23 Suites
1. `agentDeploymentLifecycle.test.ts`: Complete lifecycle: create &rarr; save &rarr; publish &rarr; active deployment transitions.
2. `agents.test.ts`: Agent CRUD, validation schemas, version increments.
3. `appointmentNumbering.test.ts`: Concurrency-safe atomic appointment number sequencing (`A-001`, `A-002`).
4. `auth.test.ts`: Login, token refresh, password hashing, verification.
5. `clientCrm.test.ts`: Client calls, leads, appointments, and WhatsApp follow-ups.
6. `env.test.ts`: Environment validation and schema parsing.
7. `internalAppointmentTool.test.ts`: Internal appointment endpoint with deployment tenant isolation.
8. `internalKnowledgeRetrieve.test.ts`: RAG knowledge retrieval and score filtering.
9. `internalLeadTool.test.ts`: Internal lead endpoint with caller phone fallback.
10. `internalRuntimeConfig.test.ts`: `GET /api/internal/runtime-config/:deploymentId` error codes (`404`, `409`).
11. `livekitSipOutbound.test.ts`: LiveKit outbound phone testing SIP dispatch.
12. `livekitTestToken.test.ts`: Web voice test token generation.
13. `llm.test.ts`: LLM integration adapters.
14. `password.test.ts`: Password hashing and verification routines.
15. `persistence.test.ts`: Core database CRUD and relational integrity.
16. `promptCompiler.test.ts`: Layer A core safety rules and Layer B compilation.
17. `runtimeAgentConfig.test.ts`: Resolution of `RuntimeAgentConfig` DTO from version JSONB.
18. `templateDefaults.test.ts`: Agent templates and tool binding validation.
19. `testConversation.test.ts`: Simulated prompt conversation turns.
20. `timezoneValidation.test.ts`: IANA timezone validation in configuration schemas.
21. `tokens.test.ts`: JWT generation and verification.
22. `toolCatalog.test.ts`: Discovery tool catalog alignment checks.
23. `setup.ts`: Global test harness initialization.

### 4.2 LiveKit Worker (`apps/livekit-worker/src/__tests__` & `*.test.ts`) — 14 Suites
1. `agent.test.ts`: Agent creation and fallback prompt tests.
2. `agentConfigMapping.test.ts`: Mapping `RuntimeAgentConfig` to LiveKit session parameters.
3. `calendarContext.test.ts`: 7-day relative calendar matrix formatting.
4. `debugTranscript.test.ts`: In-memory turn, message, and tool event accumulator.
5. `genericPromptSafety.test.ts`: Safety boundary prompt checks.
6. `knowledgeTool.test.ts`: Knowledge tool instantiation and retrieval mocks.
7. `languageSwitching.test.ts`: 12 Indic regex rules, Hinglish/Minglish marker filters, and persistence.
8. `runnerStability.test.ts`: Process lifecycle and shutdown handlers.
9. `runtimeConfigClient.test.ts`: HTTP client wrapper calling `/api/internal/*`.
10. `runtimeConfigLoading.test.ts`: Loading configuration with invalid/missing deployment IDs.
11. `sarvamE2e.test.ts`: Sarvam STT/TTS integration smoke tests.
12. `sarvamLlm.test.ts`: Sarvam-105B LLM adapter formatting.
13. `sarvamToolSmoke.test.ts`: End-to-end tool execution smoke tests.
14. `temporalContext.test.ts`: Temporal instruction formatting across timezones.

### 4.3 Pipecat Telephony Worker (`apps/pipecat-worker/tests`) — 4 Suites (27 Tests)
1. `test_plivo_echo.py` (7 tests): Plivo WebSocket handshake, start/connected events, audio loopback.
2. `test_sarvam_pipeline.py` (6 tests): Sarvam STT & TTS frame flow, audio chunk delivery.
3. `test_realtime_streaming.py` (7 tests): 8kHz audio serialization, timing telemetry, interruption handling.
4. `test_sarvam_llm_pipeline.py` (7 tests): Sarvam-105B LLM streaming, `LLMContextAggregatorPair`, conversational turns.

---

## 5. Section E: Architectural Risks & Severity Ratings

1. **Pipecat Static `TEST_PROMPT` vs Production Prompt System** (**HIGH SEVERITY**):
   - *Evidence*: `apps/pipecat-worker/app/config.py:22-28`, `apps/pipecat-worker/app/main.py:368`.
   - *Detail*: Pipecat currently runs a static test prompt; must be replaced in Phase 6 by dynamic resolution of `RuntimeAgentConfig.prompt.compiledSystemPrompt`.
2. **Pipecat Hardcoded `PHASE2_TEST_VOICE_ID`** (**MEDIUM SEVERITY**):
   - *Evidence*: `apps/pipecat-worker/app/config.py:21`, `apps/pipecat-worker/app/main.py:383`.
   - *Detail*: `SarvamTTSService` must receive `voice=runtime_config.voice.voice_id` dynamically.

---

## 6. Section F: Contradictions Requiring Review

> [!WARNING]
> **CONTRADICTION REQUIRES REVIEW — Telephony Provider Configuration (`EXOTEL` vs `PLIVO`)**:
> - `apps/api/src/config/env.ts:52` defines `TELEPHONY_PROVIDER: z.enum(['exotel', 'plivo']).default('exotel')`.
> - `apps/api/src/db/schema.ts:182` defines `phone_numbers.provider` defaulting to `'plivo'`.
> - `apps/pipecat-worker` exclusively implements Plivo WebSocket integration (`PlivoFrameSerializer`).
> - *Status*: Contradiction requires human review to confirm Plivo as the single production standard for V3.

> [!WARNING]
> **CONTRADICTION REQUIRES REVIEW — Deprecated `agent_tools` Table vs `tools.bindings`**:
> - `apps/api/src/db/schema.ts:172` maintains `agent_tools` table from V1/V2 schema migrations.
> - `apps/api/src/services/runtimeAgentConfig.ts:182` derives tools strictly from `agent_versions.configuration.tools.bindings`.
> - *Status*: `agent_tools` is deprecated and unused at runtime; retained solely for database schema backward compatibility.

---

## 7. Section G: Technical Unknowns

1. **Telephony Provider Consolidation**: Finalize removal of legacy Exotel references in `env.ts`.
2. **Worker Shared Secret Rotation**: Determine whether `WORKER_API_SECRET` should transition from static environment variable to signed short-lived tokens.

---

## 8. Sections H–L: Categorized Migration Requirements

### Section H: MUST PRESERVE
1. `RuntimeAgentConfig` Schema & DTO Contract (`packages/shared/src/runtimeConfig.ts`).
2. `PromptCompilerService` Output (Layer A safety boundary + Layer B customer configuration).
3. Database Schema & Migrations (All 15 PostgreSQL tables in `apps/api/src/db/schema.ts`).
4. Internal Worker REST Endpoints (`/api/internal/*`).
5. Sequential Appointment Numbering (`A-001` format generated by `tenant_appointment_counters`).
6. UUID Suppression Rule (Database UUIDs never spoken to callers).
7. CRM Data Models (`CallSession`, `Lead`, `Appointment`, `FollowUp`).
8. Client Dashboard & Admin Studio React applications.

### Section I: MUST REUSE THROUGH API
1. `GET /api/internal/runtime-config/:deploymentId`
2. `POST /api/internal/knowledge/retrieve`
3. `POST /api/internal/appointments`
4. `POST /api/internal/leads`
5. `POST /api/internal/call-sessions`
6. `PATCH /api/internal/call-sessions/:id`
7. `GET /api/internal/phone-numbers/lookup`

### Section J: MUST PORT TO PIPECAT (Phase 6+)
1. HTTP Client (`runtime_config_client.py`) calling `/api/internal/*` with `WORKER_API_SECRET`.
2. Multilingual Language Manager (`language_manager.py`) porting 12 Indic regex rules & Hinglish filters.
3. Temporal Context Generator (`temporal_context.py`).
4. Calendar Context Generator (`calendar_context.py`).
5. Native Tool Registry (`tools/`) registering the 3 canonical tools.
6. Turn & Debug Transcript Collector (`debug_transcript.py`).
7. Dynamic Voice & Model Wiring on call start.

### Section K: MUST NOT PORT (LiveKit Specifics to Discard)
1. `@livekit/agents` and `livekit-server-sdk`.
2. LiveKit SIP Gateway configuration and SIP trunk IDs.
3. `@livekit/rtc-node` WebRTC audio codecs.
4. `inference.TurnDetector(v1-mini)`.

### Section L: MUST NOT DUPLICATE (Control Plane Owned)
1. Do NOT build a database connection layer in Python.
2. Do NOT build vector search or embedding generation in Python.
3. Do NOT build a prompt compiler in Python.
4. Do NOT build appointment counter sequencing in Python.
5. Do NOT build WhatsApp messaging in Python.

---

## 9. Section M: Strict "Do-Not-Touch" Boundaries

1. **PostgreSQL Database**: Pipecat must **NEVER** install PostgreSQL drivers or run SQL queries.
2. **RAG Knowledge Pipeline**: Pipecat must **NEVER** parse files, chunk markdown, or compute vector embeddings.
3. **Prompt Compilation**: Pipecat must **NEVER** re-implement prompt assembly in Python.
4. **Appointment Counters**: Pipecat must **NEVER** mutate `tenant_appointment_counters`.
5. **CRM & Follow-ups**: Pipecat must **NEVER** interact directly with WhatsApp APIs.
6. **Frontend Web App**: Pipecat migration does **NOT** alter frontend React code.
7. **Agent Versioning**: Pipecat must **NEVER** create or mutate `agent_versions` or `deployments`.

---

## 10. Sections N & O: Phase 6 Prerequisites & Go/No-Go Criteria

### Section N: Phase 6 Prerequisites
- [x] Read-only audit completed across all 32 dimensions.
- [x] All 15 consolidated master documentation artifacts created in `docs/`.
- [x] Zero code modifications to tracked production files verified (`git status --short`).
- [x] Clear decision on telephony provider strategy (`PLIVO` as standard).
- [ ] User review and explicit human approval of this Master Audit.

### Section O: Go/No-Go Criteria
- **GO**: User explicitly approves Master Audit and authorizes commencement of Phase 6 Python Control Plane integration.
- **NO-GO**: Any unapproved code modification, unresolved architecture contradiction, or missing prerequisite blocks Phase 6 execution.
