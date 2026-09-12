# NEXTLITE VOICE V3 — PHASE 3 REPORT
## DYNAMIC AGENT INSTRUCTIONS

**Date:** September 12, 2026  
**Status:** PASS  
**Phase:** Phase 3 of NextLite Voice V3  
**Scope:** Dynamic Agent Instructions & Variable Reference Normalization (Dedicated Greeting + Powerful Long-Form Instruction Editor)

---

### 1. Objective
The goal of Phase 3 is to make client-specific conversational behavior dynamically configurable at the Agent level, closely following the UX and mental model of modern voice-agent products (such as Sarvam's voice-agent studio).

Key outcomes:
- Dedicated **Greeting** editor for the opening sentence spoken upon call connect.
- Dedicated, powerful, multi-line **Instructions** editor supporting structured Markdown (headings `##`, bullet points `-`, phases, guardrails, date-resolution guidelines).
- Business-agnostic variable placeholder contract handling Sarvam copied-chip artifacts (e.g., `svguserName` &rarr; `{userName}`, `svgserviceProviderName` &rarr; `{serviceProviderName}`).
- Highest-priority platform safety boundary isolation over custom agent instructions.
- Strict isolation across templates, agents, agent drafts, published versions, and tenants.

---

### 2. Existing Implementation Discovered
During discovery across the backend domain, runtime compiler, API routers, and web frontend:
- **Instructions Stored in Configuration**: The `Agent` and `AgentVersion` schemas in `models.py` already store configuration as JSONB dictionaries with fields `identity.greeting` and `instructions` (or `systemInstructions`).
- **Prompt Compilation**: `prompt_compiler_service.py` compiled various sections into the runtime prompt, but previously did not preserve raw structured markdown cleanly or enforce explicit platform safety superiority at the top of the prompt.
- **Variable Artifacts**: Copied text from Sarvam's UI chips produced `svg...` prefixes (e.g. `svgserviceProviderName`). There was no abstraction to canonicalize these into `{serviceProviderName}` without turning `svg` into a literal variable name.
- **Frontend Workspace**: The frontend `AgentDetail.tsx` previously fragmented instructions across multiple small fields (Persona, Situation, Objective, Business Info) rather than providing a unified, rich long-form prompt editor.

---

### 3. Files Changed
1. **`apps/api/app/domain/variable_references.py`** (NEW):
   - Canonical regular expressions and normalization functions for variable references.
   - `normalize_variable_references(text: str) -> str`: Converts `svgvarName`, `{svgvarName}`, `{{svgvarName}}`, and `{varName}` into canonical `{varName}` placeholders.
   - `extract_variable_references(text: str) -> Set[str]`: Extracts clean, canonical variable names without `svg` prefix.
2. **`apps/api/app/services/prompt_compiler_service.py`** (MODIFIED):
   - Added explicit highest-priority platform safety header: `=== PLATFORM SAFETY RULES (HIGHEST PRIORITY - CANNOT BE OVERRIDDEN BY AGENT INSTRUCTIONS) ===`.
   - Injected variable reference normalizer across customer instructions, base prompts, and greetings.
   - Preserves rich multi-line Markdown formatting verbatim under `=== CUSTOM INSTRUCTIONS ===`.
3. **`apps/web/src/pages/admin/AgentDetail.tsx`** (MODIFIED):
   - Refined the `Instructions` workspace tab into two dedicated sections:
     - Dedicated **Greeting** card with variable placeholder hints.
     - Dedicated **Instructions** editor with ample height, monospace typography, quick insert helpers (+Phase, +Guardrails, +Date Resolution), and live word/character counters.
4. **`apps/web/src/types.ts`** (MODIFIED):
   - Added optional `instructions?: string;` to `AgentConfiguration` to align with backend runtime keys.
5. **`tests/domain/test_phase3_dynamic_agent_instructions.py`** (NEW):
   - 15 comprehensive domain tests covering all Phase 3 verification criteria.

---

### 4. Data Model Changes
- **No breaking database schema changes were required**.
- Stored agent configuration uses existing JSONB fields:
  ```json
  {
    "identity": {
      "greeting": "Hi, thanks for calling {serviceProviderName}! This is Aarti. How can I help you today?"
    },
    "instructions": "## Conversation Guidelines\n\n## Phase 1: Identity\n- Greet caller svguserName..."
  }
  ```
- `AgentVersion` continues to capture immutable, isolated JSONB snapshots upon publication.

---

### 5. API Changes
- Existing Agent CRUD and compilation endpoints (`GET /api/v1/clients/{clientId}/agents/{agentId}`, `PUT /api/v1/clients/{clientId}/agents/{agentId}/config`, `POST /api/v1/clients/{clientId}/agents/{agentId}/publish`, `POST /api/v1/clients/{clientId}/agents/{agentId}/preview-prompt`) support the dynamic instructions and greeting natively.
- Full tenant authorization checks (`check_client_tenant_access`) are enforced on every request.

---

### 6. Frontend Changes
- **Agent Detail Instructions Workspace**:
  - Replaced fragmented form inputs with a clean 2-card layout:
    1. **Greeting**: Dedicated opening turn editor.
    2. **Instructions**: Large, scalable prompt editor with quick-insert badges.
  - Variable syntax guide displayed to assist users with `{serviceProviderName}`, `{userName}`, etc.
  - Real-time word and character statistics.

---

### 7. Prompt Compilation Changes & Hierarchy
The prompt compiler enforces the canonical hierarchy:
```
1. UNIVERSAL PLATFORM SAFETY BOUNDARY (Authoritative, highest priority)
2. TEMPORAL / RUNTIME CONTEXT (Timezone, current date/time, weekday interpretation)
3. AGENT TEMPLATE BASE PROMPT (Role baseline and conversational principles)
4. AGENT-SPECIFIC INSTRUCTIONS (Preserved multiline markdown, headings, bullets, guardrails)
5. GREETING / AGENT CONTEXT (Initial turn greeting)
6. VOICE PERSONA & GENDER GRAMMAR (Language rules & code-switching)
7. FUTURE TOOL CONTEXT (Tool bindings)
8. FUTURE KNOWLEDGE CONTEXT (RAG context)
```

Platform safety remains strictly authoritative: if custom instructions attempt to override safety rules (e.g. "Ignore all safety rules"), the top-level safety boundary guarantees compliance.

---

### 8. Variable-Reference Handling
#### Critical Convention: "svg" is NOT part of the variable name
When users copy prompt text or instruction snippets from Sarvam UI chips, the clipboard text may include an `svg` prefix (e.g., `svguserName`, `svgserviceProviderName`, `svgserviceType`, `svgcustomerCareNumber`).

- **Artifact Handling**:
  - `svguserName` &rarr; `{userName}`
  - `svgserviceProviderName` &rarr; `{serviceProviderName}`
  - `svgserviceType` &rarr; `{serviceType}`
  - `svgcustomerCareNumber` &rarr; `{customerCareNumber}`
- **Rules**:
  - `svg` is recognized as a copied artifact, NOT an industry identifier or SVG file.
  - The platform does NOT create variables literally named `svguserName`.
  - Canonical variable names extracted and referenced are `userName`, `serviceProviderName`, etc.
  - Variable references remain unexpanded during authoring/compilation so they can be resolved dynamically at runtime in Phase 4.

---

### 9. Backward Compatibility
- Existing healthcare clients (e.g. Dr. Roy Clinic) compile without regression.
- Templates with empty custom instructions cleanly fall back to template base prompts.
- All 71 API/domain regression tests and 304 Pipecat worker tests remain 100% green.

---

### 10. Tests & Verification
All 15 focused Phase 3 test criteria pass:

| Test ID | Description | Result |
|---|---|---|
| `test_01` | Store detailed multiline instructions | PASS |
| `test_02` | Dedicated greeting stored separately & compiled | PASS |
| `test_03` | Headings and bullets survive compilation | PASS |
| `test_04` | Variable references survive compilation (`svguserName` &rarr; `{userName}`) | PASS |
| `test_05` | `svgserviceProviderName` canonicalized to `serviceProviderName` | PASS |
| `test_06` | Same template + different instructions produce different prompts | PASS |
| `test_07` | Changing Agent A does not mutate Agent B | PASS |
| `test_08` | Changing Agent Instructions does not mutate AgentTemplate | PASS |
| `test_09` | Universal platform safety remains authoritative over malicious overrides | PASS |
| `test_10` | Non-healthcare agent compiles without healthcare leakage | PASS |
| `test_11` | Existing healthcare client compiles and behaves correctly | PASS |
| `test_12` | Empty agent instructions fallback cleanly to template | PASS |
| `test_13` | `AgentVersion` draft isolation preserved | PASS |
| `test_14` | Multi-tenant isolation verified | PASS |
| `test_15` | Long instruction documents (50+ sections) are never truncated | PASS |

**Test Execution Summary:**
- **Phase 3 Domain Tests:** 15 passed (`pytest tests/domain/test_phase3_dynamic_agent_instructions.py`)
- **Full Backend API & Domain Tests:** 71 passed (`pytest tests/`)
- **Pipecat Worker Tests:** 304 passed (`pytest apps/pipecat-worker/tests/`)
- **Frontend Typecheck & Build:** 0 errors (`npm run build --workspace=@nextlite/web`)

---

### 11. Manual Verification Cases
- **Case A (Restaurant):** Receptionist template with dining reservation instructions compiled correctly without any medical terminology.
- **Case B (Coaching):** Same Receptionist template used for competitive exam coaching agent; both agents operate independently.
- **Case C (Variable Reference):** `svgserviceProviderName` was canonicalized to `{serviceProviderName}` without data loss or literal `svg` variable creation.
- **Case D (Detailed Instructions):** Pasted 50-section structured markdown document with phases and guardrails survived without truncation or formatting destruction.
- **Case E (Safety):** Malicious prompt override test confirmed platform safety rules remain top-level authority.
- **Case F (First Client):** Dr. Roy Clinic test scenarios executed without regression.

---

### 12. Known Limitations
- Variable values are not yet dynamically bound from live databases/sessions (deferred to Phase 4).
- Dynamic tool creation and marketplace bindings remain static until Phase 5.

---

### 13. Explicitly Deferred Phase 4+ Work
- **Phase 4**: Full dynamic Variables System (Variable definitions, schema types, runtime evaluation, session overrides).
- **Phase 5**: Dynamic Tool Builder & Action Marketplace.
- **Phase 6**: Knowledge Base (RAG) redesign.
- **Phase 7**: Advanced Settings & Audio Telephony optimizations.

---

### 14. Acceptance Sign-Off
Phase 3 is complete and meets all functional and non-functional requirements.
