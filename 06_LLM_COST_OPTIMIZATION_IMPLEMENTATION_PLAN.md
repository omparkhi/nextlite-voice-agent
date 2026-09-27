# Vanify Voice V3 — LLM Cost Optimization Implementation Plan
## Phase 1: Prompt & Context Token Compression (Read-Only Plan)
**Document ID:** `06_LLM_COST_OPTIMIZATION_IMPLEMENTATION_PLAN.md`  
**Execution Status:** Strictly Plan Only — No Code/Config Modified  
**Repository Branch:** `migration/node-to-python`  
**Target Milestone:** Phase 1 — Context Token Compression & Redundancy Elimination  

---

## 1. Executive Summary

This plan provides an implementation-ready roadmap for the **Single First Optimization Target** identified in our forensic audit: **Prompt & Context Token Compression**.

In our baseline PSTN call (1.3 minutes / 78 seconds), the runtime incurred **62,190 input tokens** across 15 discrete HTTP POST requests (~4,146 tokens/request), driving **₹1.84 in LLM costs (42.2% of total call cost)** and introducing **568 ms – 895 ms** of GPU attention prefill latency on every turn.

### Core Architectural Solution:
Rather than hardcoding responses or deleting dynamic tenant flexibility, this plan establishes a clean separation between:
1. **Universal Safety & Conversational Mechanics (Layer A)**: Compressed into a tight, ultra-lean, high-density contract (~280 tokens).
2. **Dynamic Client Facts & Configuration (Layer B)**: Preserving 100% of Admin Panel configurability without repeating universal behavioral rules (~320 tokens).
3. **Structured Runtime Clock & State (Layer C)**: Replaced verbose natural-language calendar tables with a compact 4-line clock grounding anchor (~60 tokens).
4. **Tool Schema Scoping & Lifecycle Management**: Suppressing tool schemas on pure post-tool response turns and compressing parameter descriptions (~250 tokens vs ~650 tokens).
5. **Deterministic History Management**: Windowing chat history to the last 4 active turns while maintaining core appointment entity state.

**Expected Target:** Reduce per-request payload from **~4,146 tokens to < 920 tokens** and total call tokens from **62.2K to < 11.5K** for comparable appointment calls (saving **~78% of LLM spend** with **~200 ms lower latency**).

---

## 2. Current Architecture & Token Flow

```
Admin Panel (PostgreSQL agents.configuration)
    │
    ▼
RuntimeConfigService (apps/api/app/services/runtime_config_service.py)
    │
    ▼
PromptCompilerService (apps/api/app/services/prompt_compiler_service.py)
    │ [Compiles 15 Canonical Sections: ~3,160 tokens]
    ▼
Worker Telephony Ingest (apps/pipecat-worker/app/main.py)
    │ [+ Calendar instructions (~350 tokens) + Hangup policy (~180 tokens)]
    ▼
LanguageManager.build_full_instructions (~250 tokens)
    │
    ▼
Initial System Message in LLMContext (~3,940 tokens)
    │
    ▼ [+ 5 Tool JSON Schemas (~650 tokens) + Growing History]
Every User Turn / Post-Tool / Nudge / Warmup Request (~4,146 to ~4,800 tokens)
    │
    ▼ [Stateless HTTP POST /v1/chat/completions to api.sarvam.ai]
Sarvam GPU Prefill Engine (15 requests/call = 62,190 input tokens)
```

---

## 3. Current Token Economics (Fresh PSTN Baseline)

| Component | Measured Baseline (1.3 min call) | Unit Rate | Computed Cost | % of Spend |
| :--- | :--- | :--- | :--- | :--- |
| **LLM Input Tokens** | **62,190 tokens (15 requests)** | ₹0.029 / 1K tokens | **₹1.80** | **42.25%** |
| **LLM Output Tokens** | **244 tokens** | ₹0.16 / 1K tokens | **₹0.04** | **0.94%** |
| **TTS Characters** | **680 characters (8 requests)** | ₹3.00 / 1K chars | **₹2.04** | **47.89%** |
| **STT Stream** | **1.3 minutes** | ₹0.29 / min | **₹0.38** | **8.92%** |
| **TOTAL CALL** | — | — | **₹4.26** | **100.00%** |

---

## 4. Root Causes of Token Inefficiency

1. **Stateless HTTP Context Ingestion**: Because Sarvam's API does not maintain conversational server-side session cache across distinct HTTP requests, every single request re-transmits the entire system prompt.
2. **Multi-Step Tool Invocations**: A single user turn requesting an appointment triggers:
   - Request 1: LLM Tool Selection (4,200 tokens in)
   - Tool execution (e.g. `check_available_slots`)
   - Request 2: LLM Tool Result Interpretation (4,300 tokens in)
   - Result: **8,500 tokens burned for one user turn**.
3. **Redundant Cross-Layer Proliferation**: The same business rules (working hours, emergency phone numbers, past slots rules, Devanagari rules, and hangup policies) are repeated across 3–4 distinct prompt sections.
4. **Verbose Prose Guidelines**: Guidelines are formatted as long instructional essays rather than terse declarative constraints.
5. **Over-Broad Tool Schemas on Conversational & Post-Tool Turns**: Full schemas for all 5 tools are included even when the turn is strictly generating post-tool speech to the caller.

---

## 5. Prompt Duplication Map

| Information Element | Current Location | Duplicate Locations | Required? | Canonical Owner | Action | Rationalization / Why |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **Core Safety Rules** | Compiler Sec 1 | Worker Main, Custom Prompt | YES | Compiler Layer A | **COMPRESS** | Dense 4-bullet rule replaces 32-line essay. |
| **Current Date & Time** | Compiler Sec 2 | Worker Main Calendar table | YES | Worker Runtime Clock | **STRUCTURE** | 3-line clock anchor replaces duplicate calendar table. |
| **7-Day Offset Table** | Worker Main `build_temporal...` | Compiler Sec 2 | NO | — | **REMOVE** | LLM already knows weekdays; 1.8KB table is pure bloat. |
| **Working Hours & Shifts** | Compiler Sec 8 | Custom instructions, Knowledge | YES | Dynamic Client Config | **MOVE** | Kept strictly in Business Info; stripped from custom instructions. |
| **Emergency Transfer Policy**| Compiler Sec 10 | Tool description, Worker Main | YES | Guardrail Engine | **COMPRESS** | Concise 2-line trigger condition; tool description holds details. |
| **Call Hangup & End Rules** | Compiler Sec 1, 12, 17 | Tool description, Worker Main | YES | Telephony Boundary | **STRUCTURE** | Single 2-line rule at prompt end; delete duplicate sections. |
| **Devanagari Script Rules** | Compiler Sec 11 | LanguageManager wrapping | YES | LanguageManager | **MOVE** | Handled exclusively in LanguageManager; removed from base compiler. |
| **Past Slots Prevention** | Compiler Sec 1, 2 | Temporal helper, Slot Tool | YES | Tool Authority | **MOVE** | Slot Tool validates past slots deterministically; delete 10 lines of prompt prose. |
| **Tool Calling Rules** | Compiler Sec 1, 8, 10 | Tool schemas (`tools=[...]`) | YES | Tool Schemas | **REMOVE** | Prompt should not describe tool argument types already in JSON schemas. |
| **Voice / Gender Grammar** | Compiler Sec 15 | Persona | YES | Voice Config | **COMPRESS** | 1 short sentence (e.g., *"Use masculine Hindi verb endings"*). |

---

## 6. Proposed Clean Prompt Architecture

The new prompt architecture will assemble in this lean, non-redundant hierarchy:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. UNIVERSAL SAFETY & VOICE CONTRACT (Layer A)             ~180 tokens │
│    - Role: Voice Receptionist (2-8 words/turn, human warmth)           │
│    - Telephony constraints (no AI jargon, no markdown, no UUIDs)       │
│    - Single question at a time; direct answer first                    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. RUNTIME CLOCK ANCHOR (Layer C)                           ~60 tokens │
│    - Current Time, Date, Day, Timezone                                 │
├────────────────────────────────────────────────────────────────────────┤
│ 3. DYNAMIC TENANT BUSINESS FACTS (Layer B)                 ~280 tokens │
│    - Business Name, Type, Address, Operating Hours                     │
│    - Provider / Doctor name & consultation rules                       │
│    - Active variables (fees, services)                                 │
├────────────────────────────────────────────────────────────────────────┤
│ 4. ACTIVE LANGUAGE & SCRIPT POLICY (Layer D)                ~90 tokens │
│    - Current Active Language & Script (Devanagari vs Minglish)         │
├────────────────────────────────────────────────────────────────────────┤
│ 5. RELEVANT KNOWLEDGE (Turn-specific RAG if retrieved)     ~0-150 toks │
├────────────────────────────────────────────────────────────────────────┤
│ 6. TELEPHONY ACTION BOUNDARY                                ~60 tokens │
│    - Emergency transfer condition (1 line)                             │
│    - Farewell hangup rule (1 line)                                     │
└────────────────────────────────────────────────────────────────────────┘
TOTAL BASELINE SYSTEM PROMPT: ~670 to ~820 TOKENS (Down from 3,940 tokens)
```

---

## 7. Dynamic Prompt Separation Plan

We maintain 100% backward compatibility with the Admin Panel UI:

| Admin Panel Field | Current Behavior | Proposed Clean Separation |
| :--- | :--- | :--- |
| `businessInformation` | Injected with verbose prose | Serialized as crisp key-value pairs (`Business: X, Hours: Y, Address: Z`). |
| `variables` | Serialized with variable explanations | Injected as clean key-value grounding (`- fee: ₹500`). |
| `persona` / `tone` | Generates 4 paragraphs of roleplay | Injected as 1 line: `Persona: Warm professional receptionist.` |
| `guardrails` | Elaborate multi-case instructions | Encoded into crisp operational boundaries. |
| `instructions` (Custom) | Appended without validation | User instructions stripped of redundant safety/language rules before injection. |

---

## 8. Structured Conversation State Plan

To stop the LLM from repeatedly scanning history and asking duplicate questions, conversation state will be tracked in a structured dictionary:

```python
# Conceptual State Model (To be implemented in Phase 2)
class CallWorkflowState:
    appointment_date: Optional[str] = None      # e.g. "2026-09-28"
    appointment_time: Optional[str] = None      # e.g. "11:00 AM"
    patient_name: Optional[str] = None          # e.g. "Ramesh"
    patient_age: Optional[str] = None           # e.g. "32"
    service_type: Optional[str] = None          # e.g. "Dental Checkup"
    availability_checked: bool = False
    booking_confirmed: bool = False
    active_language: str = "mr-IN"
```

### How LLM Sees State:
Instead of forcing the LLM to re-read 8 history turns, a 2-line state summary is placed at the end of the context:
```
=== CURRENT APPOINTMENT STATE ===
- Date: 2026-09-28 | Time: 11:00 AM | Name: Ramesh | Status: Slot Available (Pending Booking Confirmation)
```
This guarantees the model will never re-ask *"What is your name?"* or *"What date did you want?"*.

---

## 9. Tool Schema Optimization Plan

### Current Inefficiency:
5 full JSON schemas (~650 tokens) are attached to every single request, even on:
- Warmup requests
- Post-tool conversational response requests
- Silence nudge turns

### Proposed Tool Management Strategy:
1. **Schema Compression**: Tighten parameter descriptions in [apps/pipecat-worker/app/tools/](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/tools/) by removing redundant prose and examples (saving ~220 tokens across schemas).
2. **Post-Tool Schema Suppression**: On post-tool turns (`messages[-1]["role"] == "tool"`), suppress tool schemas (`tools=NOT_GIVEN`), unless `transfer_call` or `end_call` is specifically permissible. This saves **~450 tokens on every single post-tool request**.

---

## 10. History Optimization Plan

### History Retention Policy:
1. **Sliding Window**: Keep only the last **4 conversational turns** (User + Assistant pairs) in active context.
2. **Tool Call History Compaction**:
   - Once a tool execution is completed and acknowledged, collapse the verbose intermediate `tool_calls` JSON payload and raw JSON database responses into a 1-line summary message.
3. **Silence Nudge Ephemerality**: Remove unanswered silence nudge turns from LLM context once the user resumes speaking.

---

## 11. Background Warmup Analysis

- **Current Implementation**: [apps/pipecat-worker/app/main.py#L3110-L3142](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3110-L3142) fires a full `client.chat.completions.create` request with `max_tokens=1` after initial greeting.
- **Cost**: Burns **~3,810 input tokens (₹0.11)** per call.
- **Forensic Assessment**:
  - Because Sarvam is a shared cloud API, prefill KV-cache is **not guaranteed to remain pinned** across distinct client connections.
  - Furthermore, warmup consumes GPU bandwidth during call connect.
- **Recommendation**:
  - **Option A (Recommended)**: Disable background KV warmup completely.
  - **Option B**: If benchmark testing demonstrates a measurable TTFT advantage, execute warmup with a minimal 50-token dummy payload instead of the full 3.8K prompt.

---

## 12. Request Categorization & Necessity Audit

| Request Category | Average Input Tokens | Invocations per Call | Necessity Classification | Optimization Action |
| :--- | :---: | :---: | :---: | :--- |
| **Background Warmup** | 3,810 | 1 | 🔴 **POTENTIALLY REDUNDANT** | Disable or replace with micro-payload. |
| **Initial User Turn** | 3,873 | 1 | 🟢 **NECESSARY** | Compressed to ~850 tokens. |
| **Tool Invocation Turn** | 3,944 | 1–2 | 🟢 **NECESSARY** | Compressed to ~900 tokens. |
| **Post-Tool Response Turn**| 3,985 | 1–2 | 🟡 **CONDITIONALLY NECESSARY** | Suppress tool schemas; compressed to ~750 tokens. |
| **Silence Recovery Nudge** | 4,140 | 1–2 | 🟡 **CONDITIONALLY NECESSARY** | Use pre-cached static phrase or ultra-lean prompt. |
| **Interruption Context Sync**| 4,302 | 1 | 🟢 **NECESSARY** | Trimmed history window applies. |

---

## 13. Token Budget Comparison (Current vs Proposed)

```
CURRENT (Per Request Average):
┌─────────────────────────────────────────────────────────────┐
│ Universal Core Safety Boundary:                 1,420 tokens│
│ Dynamic Client Prompt:                          1,740 tokens│
│ Tool JSON Schemas:                                650 tokens│
│ History & State:                                  310 tokens│
│ Current User Turn:                                 26 tokens│
│ TOTAL CURRENT INPUT / REQUEST:                 ~4,146 tokens│
└─────────────────────────────────────────────────────────────┘

PROPOSED (Per Request Average):
┌─────────────────────────────────────────────────────────────┐
│ Universal Voice Contract & Core Safety:           180 tokens│
│ Dynamic Client Business Facts:                    280 tokens│
│ Runtime Clock Anchor:                              60 tokens│
│ Language / Script Directives:                      90 tokens│
│ Active Tool Schemas (Scoped):                     250 tokens│
│ Windowed History & State Summary:                 120 tokens│
│ Current User Turn:                                 26 tokens│
│ TOTAL PROPOSED INPUT / REQUEST:                  ~906 tokens│
└─────────────────────────────────────────────────────────────┘
```

### Projected Scenario Token Budgets:
- **Normal Conversational Turn**: **~780 tokens**
- **Appointment Tool Turn**: **~950 tokens**
- **Post-Tool Spoken Confirmation Turn**: **~720 tokens**
- **Emergency Transfer Turn**: **~880 tokens**

---

## 14. Exact File-Level Implementation Plan

| File Path | Component / Class | Proposed Change | Rationale | Risk & Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| [apps/api/app/services/prompt_compiler_service.py](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/services/prompt_compiler_service.py) | `PromptCompilerService.compile_system_prompt` | Refactor `CORE_SAFETY_BOUNDARY` into a concise 180-token specification. Eliminate verbose prose in Sections 3, 5, 6, 7, 9, 10. | Eliminates ~2,200 tokens of duplicate instructional prose. | **Low**: Retains all essential safety boundaries and variables. |
| [apps/pipecat-worker/app/main.py](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L2985-L3020) | `websocket_plivo_endpoint` (Prompt Assembly) | Remove duplicate 7-day calendar table injection; use lean 3-line clock anchor. | Saves ~350 tokens per request. | **Low**: Tested and validated by temporal unit tests. |
| [apps/pipecat-worker/app/main.py](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L1116-L1138) | `InstrumentedSarvamLLMService.build_chat_completion_params` | Suppress `tools` payload on post-tool turns (`is_post_tool`). | Saves ~450–650 tokens on every tool confirmation turn. | **Low**: Model does not need tools when speaking confirmation text. |
| [apps/pipecat-worker/app/main.py](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L3110-L3142) | `_warm_llm_prompt_kv_cache` | Disable full-prompt warmup call or gate behind feature flag. | Saves 3,810 tokens on call connect. | **Low**: Measure TTFT with and without warmup. |
| [apps/pipecat-worker/app/language_manager.py](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/language_manager.py#L471) | `build_full_instructions` | Condense active language policy injection to a 2-line directive. | Saves ~160 tokens per request. | **Low**: Devanagari regex guarantees script integrity. |
| [apps/pipecat-worker/app/tools/](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/tools/) | All tool schema definitions | Condense docstrings and parameter descriptions across 5 tools. | Saves ~220 tokens across schemas. | **Low**: Pydantic validation guarantees type safety. |

---

## 15. Migration & Reversible Rollback Strategy

To ensure zero risk to production:
1. **Dynamic Compression Feature Flag**:
   - Controlled via environment variable: `ENABLE_LEAN_PROMPT_COMPRESSION=true/false` (or via tenant config `runtime.enable_lean_prompts`).
   - If set to `false`, runtime falls back to the legacy compilation pipeline instantly.
2. **Shadow Telemetry Logging**:
   - Worker logs both `[PromptMetrics] Legacy Length: X chars` and `[PromptMetrics] Lean Length: Y chars` to compare token savings in real time.

---

## 16. Post-Implementation Validation Plan

After implementation is authorized, we will measure:

### 1. Cost & Token Metrics:
- Total input tokens per standard 1.5-min call (Target: **`< 12,000`** vs 62,190 baseline).
- Average tokens per request (Target: **`< 920`** vs 4,146 baseline).
- Total Sarvam call cost (Target: **`< ₹1.30`** vs ₹4.26 baseline).

### 2. Behavioral Verification:
- Appointment booking success (`book_appointment` executed with correct date/time/name/age).
- Availability lookup accuracy (`check_available_slots` called before claiming availability).
- Emergency transfer fidelity (`transfer_call` executed on acute symptoms).
- Language switching agility (Marathi <-> Hindi <-> English).
- Absence of AI self-talk or robotic explanations.

---

## 17. 10-Scenario Test Matrix

| # | Test Scenario | Language | Expected Turn Count | Target Input Tokens | Expected Result |
|---|:---|:---:|:---:|:---:|:---|
| **1** | Direct Appointment Booking | Marathi (`mr-IN`) | 4 turns | < 10,500 | Slot verified & booked; concise confirmation. |
| **2** | Direct Appointment Booking | Hindi (`hi-IN`) | 4 turns | < 10,500 | Slot verified & booked in Hindi. |
| **3** | Availability Check (In-Hours) | English (`en-IN`) | 2 turns | < 5,000 | Available shifts stated directly. |
| **4** | Out-of-Hours Inquiry | Marathi (`mr-IN`) | 1 turn | < 2,500 | Fast-path rejection; no tool call. |
| **5** | Acute Medical Emergency | Marathi (`mr-IN`) | 2 turns | < 6,000 | Reassuring phrase + `transfer_call` triggered. |
| **6** | Routine Discomfort (Non-Emergency)| Hindi (`hi-IN`) | 3 turns | < 8,500 | Explains doctor availability; offers booking. |
| **7** | Doctor / Provider Inquiry | Minglish | 2 turns | < 5,000 | Answers doctor name directly from variables. |
| **8** | Dynamic Language Code-Switch | Hindi -> English | 3 turns | < 8,000 | Switches language cleanly without glitch. |
| **9** | Silence / Quiet Caller Nudge | Marathi (`mr-IN`) | 2 turns | < 5,500 | Polite short nudge; resumes on response. |
| **10**| Call Farewell / Hangup | Marathi (`mr-IN`) | 1 turn | < 2,500 | Closing phrase + `end_call` executed. |

---

## 18. Risks & Mitigations

| Identified Risk | Severity | Mitigation in Plan |
| :--- | :---: | :--- |
| **Prompt over-pruning causes hallucinated availability** | HIGH | Tool execution boundaries remain non-negotiable; prompt explicitly retains: *"Never claim confirmed slot until tool executes"*. |
| **Model outputs Latin script instead of Devanagari** | MEDIUM | Retain strict Devanagari script constraint in LanguageManager contract. |
| **Emergency escalations missed** | CRITICAL | Emergency acute symptom triggers preserved in full fidelity. |
| **Admin Panel custom instructions ignored** | LOW | Resolved custom instructions appended directly after business facts. |

---

## 19. Success Criteria

1. **Primary Success Metric**:
   - Total LLM input token consumption for a 1.3-minute appointment call drops from **62.2K tokens to < 12K tokens** (**> 75% reduction**).
   - LLM invoice cost drops from **₹1.84 to < ₹0.38 per call**.
2. **Behavioral Invariant**:
   - **Zero regressions** in appointment booking, slot verification, emergency transfers, or language detection across the 10-call test suite.
3. **Latency Secondary Benefit**:
   - Average LLM TTFB decreases by **150 ms – 250 ms** due to reduced GPU attention prefill volume.

---

## 20. Explicit Implementation Status Confirmation

> [!IMPORTANT]
> **STRICT COMPLIANCE CONFIRMATION**:  
> As instructed, this document is an **ARCHITECTURAL IMPLEMENTATION PLAN ONLY**.  
> **NO code has been modified, NO prompts have been altered, NO packages have been installed, and NO services have been restarted.**  
> Implementation will only commence upon explicit review and approval of this plan.
