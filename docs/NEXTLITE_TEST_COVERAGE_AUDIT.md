# NextLite Voice V3 — Test Coverage & Verification Audit

> **Test Runners**: Vitest (`apps/api`, `apps/livekit-worker`), Pytest (`apps/pipecat-worker`)  
> **Status**: Verified from Test Execution Logs & Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Test Suite Inventory

### 1.1 Backend REST API (`apps/api/src/__tests__`) — 23 Suites
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

### 1.2 LiveKit Worker (`apps/livekit-worker/src/__tests__` & `*.test.ts`) — 14 Suites
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

### 1.3 Pipecat Telephony Worker (`apps/pipecat-worker/tests`) — 4 Suites (27 Tests)
1. `test_plivo_echo.py` (7 tests): Plivo WebSocket handshake, start/connected events, audio loopback.
2. `test_sarvam_pipeline.py` (6 tests): Sarvam STT & TTS frame flow, audio chunk delivery.
3. `test_realtime_streaming.py` (7 tests): 8kHz audio serialization, timing telemetry, interruption handling.
4. `test_sarvam_llm_pipeline.py` (7 tests): Sarvam-105B LLM streaming, `LLMContextAggregatorPair`, conversational turns.

---

## 2. Well-Tested vs Untested Critical Paths

### Well-Tested Areas:
- Multilingual language switching logic and Latin Hinglish/Minglish marker filtering.
- Prompt compilation and Layer A core safety rule enforcement.
- Concurrency-safe sequential appointment numbering (`A-001`).
- Deployment lifecycle (`TEST` draft updates vs `PRODUCTION` immutable freezes).
- Internal worker API tenant isolation derived from `deploymentId`.
- Pipecat 8kHz Plivo WebSocket audio transport, STT, LLM, and TTS streaming.

### Untested / Weakly Tested Areas:
- **E2E Telephony Inbound Routing**: Inbound Plivo DID reverse lookup in `phone_numbers` table leading to Pipecat WebSocket initialization (requires Phase 6 integration).
- **Long-Running Telephony Resilience**: WebSocket reconnects on 15+ minute continuous calls under high network packet loss.
- **Concurrent High-Load Stress Testing**: Multiple simultaneous live phone calls accessing the vector database and LLM endpoints.
