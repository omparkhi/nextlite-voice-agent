# Phase 1: Business-Agnostic Runtime Architectural Report

**Platform:** NextLite Voice V3  
**Status:** PASS  
**Phase:** Phase 1 — Business-Agnostic Runtime & Boundary Hardening  
**Target Milestone:** Production Multi-Tenant AI Voice SaaS Foundation  

---

## 1. Executive Summary

NextLite Voice V3 has successfully completed **Phase 1: Business-Agnostic Runtime Architecture**. 
The backend and realtime execution engine have been refactored to eliminate hardcoded assumptions from the original healthcare/appointment MVP while preserving 100% backward compatibility for existing healthcare workflows.

The platform now strictly enforces a hierarchical separation of concerns:
```
PLATFORM ENGINE (Universal audio transport, Pipecat pipelines, safety bounds, multi-tenancy)
    ↓
AGENT TEMPLATE (Reusable role/personality foundation e.g. Receptionist, Assistant, Sales)
    ↓
CLIENT CONFIGURATION (Business-specific metadata, hours, location, policies)
    ↓
VARIABLES & FACTS (Structured key-value pairs e.g. menu items, doctor list, courses)
    ↓
TOOLS (Platform & domain capabilities e.g. query_knowledge_base, book_appointment, create_callback_lead)
    ↓
KNOWLEDGE (RAG documents & unstructured business facts)
    ↓
SETTINGS (STT/TTS/LLM models, language, telephony, silence timeouts)
```

All 348 automated tests across the backend control plane and Pipecat voice worker pass with 0 errors.

---

## 2. Repository Areas Inspected

| Component | Path | Purpose Inspected |
|---|---|---|
| **API Control Plane** | `apps/api/app/` | FastAPI routers, domain services, DB models, auth dependencies |
| **Pipecat Voice Worker** | `apps/pipecat-worker/app/` | Plivo WebSockets, Sarvam STT/LLM/TTS pipeline, language manager, tools |
| **Shared Contracts** | `packages/shared/src/` | TypeScript RuntimeAgentConfig DTOs, tool aliases, user-safe display utils |
| **Knowledge Base** | `knowledge_base/` | RAG markdown documents for first-client healthcare data |
| **Web Frontend** | `apps/web/src/` | Identification of client-side fixtures and API contract dependencies |
| **Test Suites** | `tests/` and `apps/pipecat-worker/tests/` | Domain tests, prompt tests, API parity tests, latency & telemetry tests |

---

## 3. Hardcoded Findings Discovered & Classified

| File | Line/Area | Finding | Classification | Action in Phase 1 | Architectural Reason |
|---|---|---|---|---|---|
| `apps/api/app/services/prompt_compiler_service.py` | Line 42 | `compile_system_prompt` required mandatory `configuration` argument | **A. Platform Infrastructure** | Fixed signature to `configuration: Any = None` with fallback support | Prompts can be compiled from templates, strings, or config dicts |
| `apps/api/app/services/prompt_compiler_service.py` | Line 22 | `CORE_SAFETY_BOUNDARY` had appointment-specific wording | **A. Platform Infrastructure** | Generalized into universal action & mutation safety rule | Platform safety rules apply to any domain action (orders, visits, bookings) |
| `apps/api/app/services/runtime_config_service.py` | Line 55 | `query_knowledge_base` description had "and clinic details" | **E. Tool Domain Logic** | Updated to "and business details" | Knowledge search is a universal tool capability |
| `apps/api/app/services/runtime_config_service.py` | Line 27 | `book_appointment.resourceName` had "Requested staff, doctor, or specialist" | **E. Tool Domain Logic** | Updated to "Requested staff member, host, specialist, or service provider" | Appointment booking applies to multiple industries |
| `apps/api/app/services/agent_service.py` | Line 136 | Default agent template fallback had `"role": "Receptionist & Scheduling Assistant"` | **B. Agent Template Behavior** | Replaced with generic `"AI Voice Assistant"` | Technical default must not assume a business role |
| `apps/api/app/models.py` | Line 359 | `Appointment.title` column defaulted to `"Consultation"` | **E. Tool Domain Logic** | Changed default to `"Appointment"` | Neutral domain default for appointments |
| `apps/api/app/routers/internal.py` | Line 184 | Fallback service title was `"General Consultation"` | **E. Tool Domain Logic** | Changed fallback to `"General Appointment"` | Prevents medical terminology leakage on generic bookings |
| `apps/api/app/services/tool_execution_service.py` | Line 65 | Fallback service title was `"General Consultation"` | **E. Tool Domain Logic** | Changed fallback to `"General Appointment"` | Prevents medical terminology leakage on generic bookings |
| `apps/pipecat-worker/app/tools/appointment_tool.py` | Line 48 | `resourceName` parameter description had "Requested staff or doctor" | **E. Tool Domain Logic** | Updated to "Requested staff member, host, specialist, or service provider" | Tool description sent to LLM should be domain-neutral |
| `apps/api/app/routers/receptionist.py` | Lines 9-84 | `SAMPLE_DOCTORS` and mock endpoints | **G. Test Fixture / Demo Data** | Preserved intact for existing MVP demo UI compatibility | Demo fixtures to be decommissioned in Phase 3 dynamic UI |
| `knowledge_base/*.md` | Entire folder | Healthcare clinic articles | **F. Knowledge** | Preserved as first-client RAG dataset | Business knowledge is externalized content, not engine logic |

---

## 4. Changes Implemented

### 1. Universal Prompt Compiler Boundary
- **Old Behavior:** `PromptCompilerService.compile_system_prompt()` assumed a dictionary configuration always and included appointment-specific action guidelines in its core safety boundary.
- **New Behavior:** `compile_system_prompt(configuration=None, base_prompt=None, ...)` handles dict, string, or base prompt inputs. The core safety boundary now enforces generic action mutation safety, anti-hallucination, and customer reference number rules (e.g. `APT-1001`, `LEAD-1001`).
- **Files Modified:** `apps/api/app/services/prompt_compiler_service.py`

### 2. Canonical Tool Definitions Neutrality
- **Old Behavior:** `query_knowledge_base` explicitly mentioned querying "clinic details". `book_appointment` specified "doctor, or specialist".
- **New Behavior:** `query_knowledge_base` queries "facts, pricing, policies, and business details". `book_appointment` accepts "staff member, host, specialist, or service provider".
- **Files Modified:** `apps/api/app/services/runtime_config_service.py`, `apps/pipecat-worker/app/tools/appointment_tool.py`

### 3. Agent Creation Platform Defaults
- **Old Behavior:** Default agent creation without an explicit template injected a healthcare-leaning Receptionist & Scheduling Assistant persona.
- **New Behavior:** Platform default is a neutral `AI Voice Assistant` persona ("Assist callers with inquiries and handle requests accurately and politely"). Specialized personas are loaded via templates or client configuration.
- **Files Modified:** `apps/api/app/services/agent_service.py`

### 4. Appointment & CRM Fallbacks
- **Old Behavior:** Missing appointment title defaulted to `"Consultation"` or `"General Consultation"`.
- **New Behavior:** Default is `"Appointment"` or `"General Appointment"`.
- **Files Modified:** `apps/api/app/models.py`, `apps/api/app/routers/internal.py`, `apps/api/app/services/tool_execution_service.py`

---

## 5. Prompt Architecture: Before vs After

### Before
```
CORE SAFETY RULES (Contained hardcoded appointment rules)
+ TEMPORAL CONTEXT
+ IDENTITY & PERSONA
+ BUSINESS FACTS
+ LANGUAGE RULES
+ CUSTOM INSTRUCTIONS
```

### After
```
1. UNIVERSAL SYSTEM RULES (Safety, anti-hallucination, brevity, UUID suppression)
2. TEMPORAL CONTEXT (Dynamic timezone, date, calendar grounding)
3. IDENTITY & PERSONA (Agent name, business name, role, tone)
4. ENVIRONMENT & CONTEXT (Situation, channel, audience)
5. OBJECTIVES (Primary & secondary goals)
6. SPEAKING STYLE (Concise voice phrasing, one question at a time)
7. BUSINESS INFORMATION & KEY FACTS (Resolved business variables & facts)
8. CONVERSATION PHASES & STEPS (Configured conversational workflow)
9. SAFETY GUARDRAILS & ESCALATION (Prohibited topics, triggers)
10. LANGUAGE & CODE-SWITCHING RULES (Hinglish/Minglish natural speech policies)
11. CUSTOM INSTRUCTIONS / TEMPLATE PROMPT (Domain-specific instructions)
12. RELEVANT KNOWLEDGE CONTEXT (Dynamic RAG retrieval chunks)
13. INITIAL GREETING GUIDANCE (Configured business greeting)
14. VOICE PERSONA & GENDER GRAMMAR (Voice ID, Hindi gender inflection)
```

---

## 6. Runtime Configuration: Before vs After

- **Before:** `RuntimeAgentConfig` definitions partially coupled knowledge retrieval to clinic facts.
- **After:** Strict contract boundary where `RuntimeAgentConfig` contains purely structured configurations:
  - `tenant`, `agent`, `deployment` metadata
  - `prompt`: compiled system prompt + greeting + timezone
  - `voice`: provider, models, voice ID, speed, pitch
  - `language`: primary, supported languages, switching policy
  - `runtime`: LLM model, temperature, interruption mode, duration
  - `knowledge`: topK, threshold, retrieval settings
  - `tools`: resolved list of canonical or custom tool schemas
  - `variables`: input/output schema definitions and runtime context

---

## 7. Tool Architecture: Before vs After

- **Before:** Tools contained healthcare-oriented schemas in descriptions.
- **After:** Tools provide clean capability boundaries:
  - `query_knowledge_base`: Semantic vector search against tenant-specific knowledge store.
  - `create_callback_lead`: Capture caller contact and requirement with priority.
  - `book_appointment`: Submit unconfirmed appointment requests with staff/resource specification.
  - Custom tools: Fully supported via `RuntimeToolDefinition` JSONSchema bindings.

---

## 8. Language Architecture: Before vs After

- Universal language engine (`ConversationLanguageManager`) handles:
  - ISO-639-1 / BCP-47 normalization (22 Indic languages + English)
  - Explicit language request regex detection ("हिंदी में बताओ", "Speak in English", "मराठीत बोला")
  - Automatic STT detection confidence checks
  - Code-switching natural conversational policies (Hinglish/Minglish)
- **Decoupled from Business Data:** Zero doctor, clinic, patient, or consultation phrases hardcoded in language engine.

---

## 9. Booking/CRM Boundary: Before vs After

- **Core CRM:** Generic tables `leads`, `call_sessions`, `follow_ups` operate entirely business-agnostic.
- **Appointment Domain:** `appointments` table uses `status = REQUESTED` and generates sequence `APT-1001` per tenant.
- Default title is `"Appointment"`. When a healthcare client configures `"Consultation"` or a salon configures `"Haircut & Styling"`, the title is passed transparently without hardcoding in the runtime.

---

## 10. Database Changes

- **Schema Modifications:** Zero destructive database migrations required.
- **Model Default:** `Appointment.title` column default updated from `"Consultation"` to `"Appointment"` in SQLAlchemy model.

---

## 11. Tests Added / Modified

1. `tests/domain/test_phase1_business_agnostic_runtime.py` **[NEW]**:
   - `test_1_generic_agent_configuration_loads_without_healthcare`: Validates coaching institute agent prompt.
   - `test_2_restaurant_configuration_runtime_prompt_no_healthcare`: Validates "ABC Restaurant" prompt with dine-in and takeaway options (0 healthcare keywords).
   - `test_3_healthcare_configuration_still_works_for_first_client`: Validates first-client healthcare configuration preserves all doctor/OPD instructions.
   - `test_4_tool_definitions_are_business_agnostic`: Validates canonical tool definitions in API and worker.
   - `test_5_missing_business_configuration_does_not_invent_healthcare`: Validates fallback prompt generation.
   - `test_6_language_manager_does_not_require_hardcoded_healthcare`: Validates language manager neutrality.
   - `test_7_database_appointment_default_is_business_neutral`: Validates DB model column defaults.
   - `test_8_multi_tenant_isolation_and_runtime_config_contract`: Validates tenant isolation in configuration.
2. `tests/domain/test_prompt_and_runtime_config.py` **[MODIFIED]**:
   - Updated assertions for universal runtime safety boundary.
3. `tests/api/test_auth.py` & `tests/integration/test_phase15_to_19_shadow_and_hardening.py` **[MODIFIED]**:
   - Standardized `TestClient(app)` for clean Windows asyncio testing.

---

## 12. Exact Test Commands & Results

### Command 1: Phase 1 Business-Agnostic Test Suite
```powershell
apps\pipecat-worker\.venv\Scripts\python.exe -m pytest tests/domain/test_phase1_business_agnostic_runtime.py -v
```
**Result:** `8 passed in 1.90s` (100% Pass)

### Command 2: Full API & Domain Tests
```powershell
apps\pipecat-worker\.venv\Scripts\python.exe -m pytest tests/
```
**Result:** `44 passed in 6.86s` (100% Pass)

### Command 3: Full Pipecat Worker Test Suite
```powershell
apps\pipecat-worker\.venv\Scripts\python.exe -m pytest apps/pipecat-worker/tests/
```
**Result:** `304 passed in 23.35s` (100% Pass)

**Total Test Count:** **348 Passed / 0 Failed**

---

## 13. Remaining Hardcoded Findings Intentionally NOT Changed in Phase 1

| Location | Finding | Why It Remains | Future Phase |
|---|---|---|---|
| `apps/api/app/routers/receptionist.py` | `SAMPLE_DOCTORS` fixture data | Powers current MVP healthcare demo UI until frontend redesign | Phase 3 (Dynamic Tool & Admin UI) |
| `knowledge_base/01-04_*.md` | Healthcare clinic RAG articles | Serves as authoritative test knowledge for first-client healthcare workflows | Phase 4 (Knowledge Base Management) |
| `packages/shared/src/runtimeConfig.ts` | Tool alias `'book doctor appointment'` | Keyword mapping alias ensuring natural spoken utterances resolve to `book_appointment` | Retained as platform alias |

---

## 14. Known Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Stale connection handles across tests on Windows | Low | Handled by setting `NullPool` during test execution |
| First-client appointment regression | Medium | Verified with dedicated healthcare regression test (`test_3`) |
| Language code switching regression | Low | Tested with 14 test cases in `test_language_manager.py` |

---

## 15. Manual Verification Walkthrough

1. **Start Services:** Start FastAPI control plane (`uvicorn app.main:app`) and Pipecat worker.
2. **First-Client Healthcare Workflow:** Load deployment with City Health Clinic configuration -> verify doctor names, consultation fees, and OPD timings compile into prompt and execute `book_appointment`.
3. **Non-Healthcare Restaurant Workflow:** Load deployment with ABC Restaurant configuration -> verify prompt contains dine-in/takeaway facts and 0 occurrences of `doctor`, `patient`, `clinic`, `hospital`, `opd`.
4. **Tools & Execution:** Verify `query_knowledge_base`, `book_appointment`, and `create_callback_lead` execute with customer-safe references (`APT-1001`, `LEAD-1001`).
5. **Multi-Tenant Isolation:** Verify Tenant B cannot access Tenant A's leads or appointments.

---

## 16. Recommended Phase 2

- **Phase 2 Scope:** Dynamic Agent Template Engine & Instructions Builder.
- Introduce template definitions for:
  - *Receptionist*
  - *Sales & Outbound Agent*
  - *Customer Support Agent*
  - *Booking & Reservation Specialist*
  - *Lead Qualification Agent*
- Provide prompt variable interpolation (`{{business_name}}`, `{{services}}`, `{{hours}}`) and dynamic tool bindings.
