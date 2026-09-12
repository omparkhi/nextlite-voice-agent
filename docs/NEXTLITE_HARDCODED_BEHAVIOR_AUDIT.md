# NextLite Voice V3 — Hardcoded Behavior Audit

> **Scope**: Repository-Wide Audit for Hardcoded Values, Industry Logic, and Defaults  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Hardcoded Values & Defaults Inventory

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

---

## 2. Industry-Specific Leaks Audit

> [!NOTE]
> **AUDIT CONCLUSION: THE CORE RUNTIME ENGINE IS 100% INDUSTRY-NEUTRAL.**

1. **Prompt Compiler**: `PromptCompilerService` contains zero hardcoded mentions of clinics, hospitals, real estate, edtech, or finance in its Layer A safety rules. All domain facts flow dynamically from `AgentConfiguration.businessInformation` and RAG chunks.
2. **Tools**: `book_appointment`, `create_callback_lead`, and `query_knowledge_base` use generic schemas (`title`, `resourceName`, `customerName`, `customerPhone`) that apply equally to medical appointments, property site visits, demo classes, and loan consultations.
3. **Database**: Schema tables (`appointments`, `leads`, `call_sessions`) are completely industry-neutral.
