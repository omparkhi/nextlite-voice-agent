# NEXTLITE VOICE V3 — IDENTITY & QUESTION INTERPRETATION GROUNDING REMEDIATION REPORT

## Executive Summary
This report documents the targeted remediation for the identity & origin question grounding defect identified in `NEXTLITE_IDENTITY_AND_QUESTION_INTERPRETATION_FORENSIC_AUDIT.md`.

In the live Plivo runtime, `agentName` was reaching the LLM correctly (answering *"Aapka naam kya hai?"* with `agentName = "Rakesh"`). However, on origin/identity inquiries (*"Aap kaha se baat kar rahe hai?"*), the LLM responded with *"Main Medicare Clinic ka digital assistant hoon."*

The remediation establishes platform-level semantic grounding for identity and origin inquiries, removes redundant baseline AI declarations, and strictly scopes AI disclosure to explicit automation/AI queries while preserving full business-agnostic and multi-tenant isolation.

---

## 1. Root Cause Confirmed
1. **LLM Synthesis, Not a Database Hardcode**: `"digital assistant"` was an LLM synthesis resulting from redundant AI descriptors across the prompt hierarchy:
   - `template_service.py`: *"You are a professional AI receptionist and front-desk voice assistant."*
   - `template_service.py`: *"If asked if you are an AI, answer honestly that you are an AI phone assistant for the business."*
   - `agent_service.py`: `role: "AI Voice Assistant"`, `systemPrompt: "You are a professional AI voice assistant..."`
2. **Missing Grounding for Origin/Identity Inquiries**: The system lacked platform-level conversational guidance directing the LLM to ground questions about caller origin, caller identity, and representation (*"Aap kaun hain?"*, *"Aap kaha se baat kar rahe hain?"*, *"Kis company se bol rahe ho?"*, *"Who is this?"*) in the configured `agentName` and `businessName` (and `businessAddress`/location for physical address questions), rather than volunteering technical AI descriptors.

---

## 2. Files Modified

| File | Nature of Change |
|---|---|
| [`apps/api/app/services/prompt_compiler_service.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/services/prompt_compiler_service.py) | Added `CALLER IDENTITY & ORIGIN GROUNDING` rule to `CORE_SAFETY_BOUNDARY`; labeled persona AI behavior as `Explicit AI Inquiry Policy`. |
| [`apps/api/app/services/template_service.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/services/template_service.py) | Cleaned redundant AI descriptors from baseline template prompts and descriptions; scoped `aiIdentityBehavior` strictly to explicit AI queries. |
| [`apps/api/app/services/agent_service.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/services/agent_service.py) | Updated fallback default agent role from `"AI Voice Assistant"` to `"Customer Representative"` and cleaned fallback system prompt. |
| [`tests/domain/test_phase2_dynamic_agent_templates.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/tests/domain/test_phase2_dynamic_agent_templates.py) | Updated assertion to reflect clean template base prompt. |
| [`tests/domain/test_identity_and_origin_grounding.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/tests/domain/test_identity_and_origin_grounding.py) | Added 9 comprehensive unit tests verifying agent identity, origin grounding, AI disclosure scoping, and multi-business isolation. |

---

## 3. Exact Functions & Sections Modified

### A. `apps/api/app/services/prompt_compiler_service.py`
- **`CORE_SAFETY_BOUNDARY`**:
  ```text
  - CALLER IDENTITY & ORIGIN GROUNDING: When the caller asks who is speaking, which business they reached, who is calling, or where the call is from (e.g. "Aap kaun hain?", "Aapka naam kya hai?", "Aap kaha se baat kar rahe hain?", "Kis company se bol rahe ho?", "Who is this?", "Which business is this?"):
    * Answer naturally and directly using trusted configured identity and business context.
    * Use configured agentName for your personal or agent identity.
    * Use configured businessName for the represented business or organization.
    * Use configured businessAddress or location when the caller specifically asks for physical location, office, or branch address.
    * Do NOT substitute technical descriptors (such as "digital assistant", "AI bot", "AI software", "computer program") for the configured identity.
    * Natural business representation is paramount. Explicit AI disclosure applies ONLY when the caller explicitly asks whether you are an AI, robot, bot, or automated system.
  ```
- **`compile_system_prompt`**:
  Updated persona section to format:
  ```python
  if persona.get("aiIdentityBehavior"):
      parts.append(f"Explicit AI Inquiry Policy: {persona['aiIdentityBehavior']}")
  ```

### B. `apps/api/app/services/template_service.py`
- Base prompts and descriptions in `SYSTEM_TEMPLATES` updated to remove redundant `"AI"` labels (`"AI receptionist" -> "front-desk and phone representative"`, `"AI Customer Support Voice Agent" -> "Customer Support Specialist"`, etc.).
- `aiIdentityBehavior` scoped to:
  `"If explicitly asked if you are an AI, robot, or automated system, acknowledge honestly that you are an AI phone representative for {{businessName}}."`

### C. `apps/api/app/services/agent_service.py`
- Fallback default agent config in `create_agent` updated:
  `role: "Customer Representative"`
  `systemPrompt: "Keep responses concise, direct, and conversational for voice calling."`

---

## 4. What Was Intentionally NOT Changed
- **No Hindi keyword/regex routing**: Zero hardcoded question matching (no `if "kaha se" in text:`).
- **No intent classifier**: Kept end-to-end natural LLM semantic comprehension.
- **No healthcare/clinic hardcoding**: No domain-specific bias or "Medicare" strings in core platform logic.
- **No Pipecat worker changes**: Worker pipeline, runtime config client, and audio loop remain untouched.
- **No Sarvam STT/TTS/LLM configuration changes**: STT/TTS models, buffer sizes, and endpoints remain intact.
- **No Variable / Tool / Knowledge architecture changes**: Retained full variable resolution precedence and multi-tenant database isolation.

---

## 5. Before vs. After Prompt Behavior

| Caller Inquiry | Before Prompt Remediation | After Prompt Remediation |
|---|---|---|
| *"Aap kaun hain?"* | *"Main Medicare Clinic ka digital assistant hoon."* (Inconsistent) | Configured `agentName` representing `businessName` (e.g. *"Main Rakesh bol raha hoon Medicare Clinic se."*) |
| *"Aap kaha se baat kar rahe hain?"* | *"Main Medicare Clinic ka digital assistant hoon."* | Configured `businessName` / office representation (e.g. *"Main Medicare Clinic se baat kar raha hoon."*) |
| *"Aapka address / location kya hai?"* | Unclear / synthesized | Configured `businessAddress` / `location` (e.g. *"Humara clinic Sector 14, Gurugram mein sthit hai."*) |
| *"Kya aap AI hain?"* / *"Are you a robot?"* | Honest disclosure | Honest AI disclosure (explicit policy triggered accurately). |

---

## 6. Test Results

### Focused Test Suite (`tests/domain/test_identity_and_origin_grounding.py`):
- **9 / 9 PASSED (100%)**
  - `test_01_agent_identity_and_business_name_compiled`: PASS
  - `test_02_generic_identity_origin_guidance_in_safety_boundary`: PASS
  - `test_03_ai_disclosure_scope_explicit`: PASS
  - `test_04_no_redundant_default_ai_identity_in_templates`: PASS
  - `test_05_business_agnostic_non_healthcare_cafe`: PASS
  - `test_06_custom_role_preservation`: PASS
  - `test_07_address_and_location_grounding`: PASS
  - `test_08_dynamic_variables_resolve_correctly`: PASS
  - `test_09_three_business_test_matrix`: PASS

### Full Domain & Control Plane Test Suite:
- **116 / 116 PASSED (100%)**

### Full Pipecat Worker Test Suite:
- **310 / 310 PASSED (100%)**

---

## 7. Business-Agnostic Verification Matrix

Tested cross-industry configurations to ensure zero domain leakage:

1. **Healthcare**:
   - `businessName`: *"Medicare Multi-Specialty Clinic"*
   - `agentName`: *"Rakesh"*
   - `location`: *"Sector 14, Gurugram"*
   - Result: Verified clean compilation with accurate clinic identity, zero cross-tenant contamination.
2. **Food & Beverage (Cafe)**:
   - `businessName`: *"Sunrise Cafe"*
   - `agentName`: *"Aarav"*
   - `location`: *"Indiranagar, Bangalore"*
   - Result: Verified clean compilation with zero healthcare keywords (`clinic`, `hospital`, `doctor`, `opd`, `patient`).
3. **Real Estate**:
   - `businessName`: *"Prime Properties"*
   - `agentName`: *"Neha"*
   - `location`: *"BKC, Mumbai"*
   - Result: Verified clean compilation with property consultant identity and zero cross-tenant contamination.

---

## 8. Remaining Risks & Observations
- **Low Risk**: The changes are purely prompt-compiler grounding and template baseline sanitization. No backend APIs, DB schemas, or worker binaries were altered.
- **Recommendation**: During initial live telephony testing with new tenants, confirm that tenant administrators fill in both `agentName` and `businessName` in their agent dashboard so that full origin context is always available.
