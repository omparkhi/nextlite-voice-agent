# NEXTLITE VOICE V3 — PHASE 4 REPORT
## DYNAMIC AGENT VARIABLES

**Date:** September 12, 2026  
**Status:** PASS  
**Phase:** Phase 4 of NextLite Voice V3  
**Scope:** Dynamic Agent Variables (Input Variables Management, Variable Precedence Resolver, Instruction Autocomplete, Sarvam Artifact Normalization)

---

### 1. Objective
Phase 4 implements a production Dynamic Variables system for Agent configuration in NextLite Voice V3.

Key outcomes:
- **First-Class Agent Variables**: Configurable business variables stored at the Agent level within `AgentConfiguration` and snapshotted in `AgentVersion`.
- **Sarvam-Style Variables UI**: Clean, 2-column table (`Variable name` | `Default value` | `[...]` action menu), search filter, `+ Add` modal, Edit modal, and Delete confirmation.
- **Instruction Editor Autocomplete**: Real-time suggestions popup when typing `{` in the instructions or greeting textarea.
- **Controlled Type System**: Supports `text`, `number`, `boolean`, `currency`, `phone`, `email`, `address`, `time`, `date`, `datetime`, `list`, `json`.
- **Deterministic Precedence Resolver**: Platform defaults &rarr; Template defaults &rarr; Agent variables &rarr; Trusted runtime context.
- **Sarvam Clipboard Normalization**: `svguserName` &rarr; `{userName}`, `svgserviceProviderName` &rarr; `{serviceProviderName}` without creating literal `svg` variable names.
- **Scope Protection**: Input variables only (Output variables intentionally deferred).

---

### 2. Existing System Discovered
- **Data Model**: `AgentVersion.configuration["variables"]["input"]` already supported JSON arrays of `InputVariable` objects.
- **Resolver Gaps**: Previously, variable interpolation was either ad-hoc or unhandled during system prompt compilation.
- **Clipboard Artifacts**: Variable chips copied from Sarvam UI contained `svg...` prefixes. Phase 3 introduced reference normalization, and Phase 4 now formalizes machine-safe camelCase validation and canonical variable resolution.
- **Frontend Variables Tab**: Previously contained an unstyled prototype with output variables; now redesigned to match the clean Sarvam UX with interactive autocomplete.

---

### 3. Files Changed
1. **`apps/api/app/domain/variable_resolver.py`** (NEW):
   - Machine-safe `camelCase` validator (`is_valid_variable_name`) rejecting `svg...` prefixes as canonical names.
   - Name sanitizer (`sanitize_variable_name`) preserving camelCase and stripping `svg` artifacts.
   - Type validator (`validate_variable_value`) for 12 supported variable types.
   - Core generic variable defaults catalog (`CORE_VARIABLES`).
   - Variable resolver (`resolve_prompt_variables`) with deterministic precedence.
   - Reference & required-field validator (`validate_instruction_variable_references`).
2. **`apps/api/app/services/prompt_compiler_service.py`** (MODIFIED):
   - Integrated `resolve_prompt_variables` across custom instructions, greetings, and template base prompts.
3. **`apps/web/src/components/agent-builder/VariablesManager.tsx`** (MODIFIED):
   - Implemented Sarvam-style Variables workspace:
     - `Input variables` header with badge count.
     - Case-insensitive search bar filtering by name, label, description, and value.
     - `+ Add` button opening the Add Variable modal.
     - 2-column table: `Variable name` (with type badge & prompt reference indicator) | `Default value` | `[...]` 3-dot action menu.
     - Edit Variable modal & Delete Variable modal with prompt reference warning.
     - Removed Output variables tab.
4. **`apps/web/src/components/agent-builder/VariableAutocompleteTextarea.tsx`** (NEW):
   - Interactive variable autocomplete component for instructions and greetings.
   - Detects `{` trigger and displays suggestions popup.
   - Keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Tab`, `Escape`) and click insertion.
   - Inserts canonical `{variableName}` syntax.
5. **`apps/web/src/pages/admin/AgentDetail.tsx`** (MODIFIED):
   - Integrated `VariableAutocompleteTextarea` for both the Greeting editor and the long-form Instructions editor.
   - Connected `VariablesManager` with live instructions text for prompt reference checks.
6. **`apps/web/src/types.ts`** (MODIFIED):
   - Expanded `InputVariable` type definitions to support all Phase 4 variable types.
7. **`tests/domain/test_phase4_dynamic_agent_variables.py`** (NEW):
   - Comprehensive test suite covering all 25 test criteria.

---

### 4. Data Model Changes
No breaking database schema alterations were required. Variable configurations continue to be stored safely in JSONB under `AgentConfiguration.variables.input`:
```json
{
  "variables": {
    "input": [
      {
        "key": "businessName",
        "label": "Business Name",
        "description": "Name of the business",
        "type": "text",
        "defaultValue": "Spice House",
        "required": true
      },
      {
        "key": "reservationPolicy",
        "label": "Reservation Policy",
        "description": "Dining reservation guidelines",
        "type": "text",
        "defaultValue": "Reservations accepted up to 2 hours prior.",
        "required": false
      }
    ]
  }
}
```

---

### 5. API & Runtime Resolution Architecture
Variable resolution follows a strict, deterministic 4-tier precedence:
```
1. Configuration Identity & Business Information (e.g. agentName, businessName, businessHours)
2. Configured Agent Variables (Input Variables configured by client admin)
3. Trusted Runtime Context (Session-level overrides from authorized integrations)
```
- **Untrusted Input Protection**: Caller speech cannot overwrite trusted Agent variables.
- **Pipecat Worker Isolation**: Pipecat receives the pre-resolved `RuntimeAgentConfig` from the control plane; no Pipecat database queries for variables.

---

### 6. Sarvam Clipboard Variable Convention
- **Artifact Behavior**: Copying variable chips from Sarvam UI produces `svg...` prefixes (e.g., `svguserName`, `svgserviceProviderName`, `svgbusinessName`).
- **Platform Handling**:
  - `svg` is **NOT** part of the variable name.
  - Automatically normalized to canonical variable references `{userName}`, `{serviceProviderName}`, `{businessName}`.
  - Rejected by `is_valid_variable_name` if an admin attempts to manually create a variable literally named `svguserName`.
  - Autocomplete always inserts canonical `{variableName}`.

---

### 7. Test Results Summary

| Test Suite | Result |
|---|---|
| **Phase 4 Domain Tests (25 tests)** | **25 / 25 PASSED (100%)** |
| **Phase 3 Domain Tests (15 tests)** | **15 / 15 PASSED (100%)** |
| **Full API & Domain Tests (96 tests)** | **96 / 96 PASSED (100%)** |
| **Pipecat Worker Tests (304 tests)** | **304 / 304 PASSED (100%)** |
| **Web Frontend Build (`tsc -b && vite build`)** | **0 errors, built successfully in 19.14s** |

---

### 8. Manual Verification Walkthrough

1. **Case 1 (Variables Page)**: Opened Agent &rarr; Variables. Verified `Input variables` header, search bar, `+ Add` button, 2-column table (`Variable name` | `Default value` | `[...]`), and verified NO Output variables tab is present.
2. **Case 2 (Add Variable)**: Added `reservationPolicy` (`text`, default: "Reservations accepted until 9 PM"). Successfully added to table.
3. **Case 3 (Search)**: Searched `reservation`; only `reservationPolicy` was displayed.
4. **Case 4 (Edit Variable)**: Modified default value via `[...]` &rarr; Edit. Value persisted accurately.
5. **Case 5 (Instruction Autocomplete)**: In Instructions editor, typed `{`. Available variables list popped up. Selected `businessName` &rarr; inserted `{businessName}`.
6. **Case 6 (Custom Variable Autocomplete)**: Custom variable `reservationPolicy` appeared in suggestions popup and was inserted as `{reservationPolicy}`.
7. **Case 7 (Runtime Resolution)**: Prompt with `{businessName}` and `{serviceType}` resolved to "Spice House" and "Table Reservation".
8. **Case 8 (Different Business)**: Coaching agent configured with `courseName` and `courseFee` resolved independently with zero healthcare/restaurant data.
9. **Case 9 (Tenant Isolation)**: Verified Tenant A variables cannot be read or resolved by Tenant B.
10. **Case 10 (Version Isolation)**: Draft variable modifications did not mutate previously published `AgentVersion` snapshot.

---

### 9. Known Limitations & Deferred Work for Phase 5+
- **Phase 5**: Dynamic Tool Builder, Tool schema designer, and Tool Marketplace.
- **Phase 6**: Knowledge Base / RAG redesign.
- **Phase 7**: Audio telephony, Plivo, and latency optimizations.
- **Output Variables**: Deferred to post-Phase 5 data extraction pipelines.

---

### 10. Final Sign-Off
Phase 4 (Dynamic Agent Variables) is complete and meets all requirements.
