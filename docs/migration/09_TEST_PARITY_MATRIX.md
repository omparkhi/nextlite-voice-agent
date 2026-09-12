# Test Behavior Parity Matrix

**Total Test Files:** 73  
**Total Test Cases:** 515+  
**Target Test Framework:** `pytest` + `pytest-asyncio` + `pytest-mock` + `httpx` (for FastAPI)  
**Audit Date:** September 2026

---

## 1. Master Test Suite Overview

| Test Suite | Files | Test Count | Current Runner | Target Migration Strategy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Node.js API Suite** (`apps/api`) | 24 | 253 | Vitest | Migrate to `pytest` using FastAPI `TestClient` / `httpx.AsyncClient` | 100% Mapped |
| **Pipecat Worker Suite** (`apps/pipecat-worker`) | 26 | 267 | Pytest | Retain and expand to include shared domain services | 100% Mapped |
| **LiveKit Legacy Worker Suite** (`apps/livekit-worker`) | 21 | 313 | Vitest | Port behavioral guarantees (prompts, temporal, tools) to Pytest | 100% Mapped |

---

## 2. API Test Files Behavior Matrix (`apps/api/src/__tests__`)

| Test File | Test Cases | System Under Test | Protected Behaviors & Assertions | Target Pytest File | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `auth.test.ts` | 13 | Auth Controller & Middleware | Password hashing, JWT issue, refresh token rotation, invalid credentials | `tests/api/test_auth.py` | REIMPLEMENT_PYTEST |
| `agents.test.ts` | 35 | Agent CRUD & Versions | Agent lifecycle (DRAFT, READY, LIVE), version snapshotting, deployment promotion | `tests/api/test_agents.py` | REIMPLEMENT_PYTEST |
| `agentDeploymentLifecycle.test.ts` | 10 | Deployment Manager | Multi-tenant isolation, version pinning, rollback transitions | `tests/api/test_deployments.py` | REIMPLEMENT_PYTEST |
| `appointmentNumbering.test.ts` | 4 | Tenant Counters | Atomic sequence generation (`APT-1001`), no race conditions | `tests/domain/test_appointment_counter.py` | REIMPLEMENT_PYTEST |
| `internalAppointmentTool.test.ts` | 12 | Internal Appointment API | Slot validation, caller phone injection, UUID suppression | `tests/api/test_internal_tools.py` | REIMPLEMENT_PYTEST |
| `internalLeadTool.test.ts` | 12 | Internal Lead Tool API | Lead creation, priority assignment, tenant isolation | `tests/api/test_internal_tools.py` | REIMPLEMENT_PYTEST |
| `internalKnowledgeRetrieve.test.ts`| 19 | Internal RAG API | pgvector cosine query, score threshold filtering, tenant match | `tests/api/test_internal_knowledge.py` | REIMPLEMENT_PYTEST |
| `internalRuntimeConfig.test.ts` | 11 | Internal Config API | Deployment resolution by ID / phone, compiled prompt, fallback | `tests/api/test_internal_runtime_config.py` | REIMPLEMENT_PYTEST |
| `runtimeAgentConfig.test.ts` | 8 | Runtime Config Service | Zod schema validation, default fallbacks, tool normalization | `tests/domain/test_runtime_config.py` | REIMPLEMENT_PYTEST |
| `promptCompiler.test.ts` | 11 | Prompt Compiler | System prompt injection, guardrails, temporal context | `tests/domain/test_prompt_compiler.py` | REIMPLEMENT_PYTEST |
| `timezoneValidation.test.ts` | 7 | Timezone Resolver | IANA timezone validation, daylight savings, invalid string rejection | `tests/domain/test_timezone.py` | REIMPLEMENT_PYTEST |
| `toolCatalog.test.ts` | 11 | Tool Catalog Service | Tool definitions, JSON schema validation, enabled toggle | `tests/domain/test_tools.py` | REIMPLEMENT_PYTEST |
| `receptionistAppointment.test.ts` | 9 | Public Receptionist API | Public booking token, slot discovery, confirmation | `tests/api/test_receptionist.py` | REIMPLEMENT_PYTEST |
| `clientCrm.test.ts` | 6 | Client CRM Routes | Tenant calls list, lead status update, appointment status update | `tests/api/test_client_crm.py` | REIMPLEMENT_PYTEST |
| `livekitSipOutbound.test.ts` | 14 | SIP / Outbound Service | Outbound dial payload, trunk verification | `tests/domain/test_telephony.py` | REIMPLEMENT_PYTEST |
| `livekitTestToken.test.ts` | 13 | Web Voice Token Service | Room creation, JWT token generation | `tests/domain/test_voice_token.py` | REIMPLEMENT_PYTEST |
| `plivoOutbound.test.ts` | 3 | Plivo REST Adapter | Plivo outbound call trigger, XML response generation | `tests/domain/test_plivo_adapter.py` | REIMPLEMENT_PYTEST |
| `llm.test.ts` | 6 | LLM Client Service | Sarvam / OpenAI completions, streaming chunks | `tests/domain/test_llm_service.py` | REIMPLEMENT_PYTEST |
| `persistence.test.ts` | 20 | Drizzle Database Layer | Foreign key constraints, cascade deletes, transaction rollback | `tests/domain/test_db_persistence.py` | REIMPLEMENT_PYTEST |
| `tokens.test.ts` | 6 | JWT Utilities | Sign, verify, expiration claims, secret handling | `tests/domain/test_tokens.py` | REIMPLEMENT_PYTEST |
| `password.test.ts` | 4 | Password Utilities | Argon2 hash verification, salt generation | `tests/domain/test_password.py` | REIMPLEMENT_PYTEST |
| `templateDefaults.test.ts` | 5 | Agent Templates | Industry template loading (Doctor, Salon, Dental) | `tests/domain/test_templates.py` | REIMPLEMENT_PYTEST |
| `testConversation.test.ts` | 2 | Test Chat Engine | Text-based conversation simulation | `tests/api/test_test_conversation.py` | REIMPLEMENT_PYTEST |
| `env.test.ts` | 5 | Environment Validator | Required env checks, port parsing, default assignment | `tests/core/test_env.py` | REIMPLEMENT_PYTEST |

---

## 3. Pipecat Pytest Suite (`apps/pipecat-worker/tests`)

All 26 test files (267 test cases) are already native Python pytest and remain **100% active and retained**.
Key protected behaviors include:
- `test_call_lifecycle_finalization.py`: Idempotent PATCH, hangup handling, missed call detection.
- `test_language_manager.py`: Hindi / Marathi / Hinglish code switching.
- `test_temporal_context.py`: Indian Standard Time calculation, business hour boundaries.
- `test_tool_registry.py`: Canonical tool mapping, UUID suppression, LLM tool execution.
- `test_phase18c_plivo_startup_and_greeting.py`: Plivo WebSocket handshake and instant greeting playback.
- `test_turn_metrics_and_timing.py`: Sub-millisecond monotonic turn timer calculations.