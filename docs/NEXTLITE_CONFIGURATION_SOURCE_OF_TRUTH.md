# NextLite Voice V3 — Configuration Source of Truth Audit

> **Audit Type**: Exhaustive Configuration Provenance & Hierarchy Analysis  
> **Status**: Verified from Implementation (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Executive Configuration Provenance Chain

```
Agent Creation (Template defaultConfiguration)
  ↓
Agent Version Draft (agent_versions.configuration JSONB snapshot, version_number = 1)
  ↓
Save Configuration (Admin updates UI -> PUT /api/admin/.../config -> new agent_versions row, version_number = N)
  ↓
Active Deployment (deployments table: binds environment ['TEST' | 'PRODUCTION'] to version_id)
  ↓
Runtime Resolution (GET /api/internal/runtime-config/:deploymentId -> RuntimeAgentConfigService)
  ↓
Prompt Compilation (PromptCompilerService -> Layer A Safety Rules + Layer B Customer Spec)
  ↓
RuntimeAgentConfig DTO (Pure, immutable contract across process/network boundaries)
  ↓
Worker Process (LiveKit / Pipecat Worker consumes RuntimeAgentConfig)
  ↓
Realtime Pipeline (STT, LLM, TTS, Tools, Dynamic Multilingual Language Manager)
```

---

## 2. Definitive Answers to the 15 Core Configuration Questions

| # | Question | Verification / Implementation Answer | Evidence File & Line |
|---|---|---|---|
| **1** | **Where is it defined?** | Defined initially in `agent_templates.defaultConfiguration` JSONB, edited via Admin UI (`AgentDetail.tsx`), validated by Zod schema (`agentConfigurationSchema`), and saved as `agent_versions.configuration` JSONB. | `apps/api/src/services/template.ts` (lines 45–196), `apps/api/src/routes/agents.ts` (lines 67–248) |
| **2** | **Where is it stored?** | Stored in PostgreSQL `agent_versions.configuration` (JSONB) associated with an immutable `version_number`. | `apps/api/src/db/schema.ts` (lines 136–145) |
| **3** | **Who changes it?** | Changed by Admin users via `PUT /api/admin/clients/:clientId/agents/:agentId/config`. Every save creates a new `agent_versions` row. | `apps/api/src/services/agent.ts` (lines 113–192) |
| **4** | **Who reads it?** | Read by `RuntimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId)` when resolving runtime config for an active call or test session. | `apps/api/src/services/runtimeAgentConfig.ts` (lines 22–163) |
| **5** | **What transforms it?** | `PromptCompilerService.compileAgentPrompt()` transforms persona, business hours, phases, guardrails, and voice gender into `compiledSystemPrompt`. `buildRuntimeAgentConfig()` transforms the JSONB into `RuntimeAgentConfig`. | `apps/api/src/services/promptCompiler.ts`, `apps/api/src/services/runtimeAgentConfig.ts` (lines 169–281) |
| **6** | **What is the runtime source of truth?** | The **`deployments` table row joined with its linked `agent_versions.configuration` snapshot**. The worker NEVER reads templates or draft unsaved state. | `apps/api/src/services/runtimeAgentConfig.ts` (lines 34–42) |
| **7** | **What is the fallback?** | Fallbacks defined in `buildRuntimeAgentConfig()`: Timezone default `Asia/Kolkata`, STT `saaras:v3`, TTS `bulbul:v3`, voice `shubh` or `priya`, LLM `sarvam-105b-conversations` / `google/gemma-4-31b-it`. | `apps/api/src/services/runtimeAgentConfig.ts` (lines 181–280) |
| **8** | **Can frontend override it?** | **NO**. Frontend cannot override runtime configuration during a call. Frontend can only mutate draft configuration by issuing an authenticated API PUT request. | `apps/api/src/routes/agents.ts` (lines 383–403) |
| **9** | **Can database override it?** | **YES**. The database is the authoritative storage source. Directly updating `agent_versions.configuration` or pointing `deployments.version_id` to a different version changes runtime configuration immediately on subsequent resolution. | `apps/api/src/db/schema.ts` (lines 147–165) |
| **10** | **Can environment variables override it?** | Infrastructure secrets (`SARVAM_API_KEY`, `LIVEKIT_URL`, `DATABASE_URL`) originate from environment variables. Business configuration (prompts, voices, languages, tools) is **database-driven** and NOT overridden by env vars. | `apps/api/src/config/env.ts` (lines 6–65) |
| **11** | **Is it hardcoded?** | Layer A core safety rules (turn length max 1–2 sentences, single question, anti-self-talk, reference number sanitization `A-001`) are code-enforced in `PromptCompilerService`. All business attributes are dynamic. | `apps/api/src/services/promptCompiler.ts` (lines 28–41) |
| **12** | **Is it tenant-specific?** | **YES**. Every agent and deployment is strictly bound to a `tenant_id` foreign key. Cross-tenant resolution is rejected. | `apps/api/src/db/schema.ts` (line 128, 149), `apps/api/src/services/runtimeAgentConfig.ts` (line 99) |
| **13** | **Is it agent-specific?** | **YES**. Bound to `agent_id` in `agents`, `agent_versions`, and `deployments`. | `apps/api/src/db/schema.ts` (lines 138, 150) |
| **14** | **Is it deployment-specific?** | **YES**. Resolved strictly by `deploymentId` (distinguishing `TEST` environment from `PRODUCTION` environment). | `apps/api/src/db/schema.ts` (lines 147–165) |
| **15** | **Is it versioned?** | **YES**. Explicit integer versioning (`version_number` 1, 2, 3...) stored in `agent_versions`. Version rows with status `PUBLISHED` are immutable. | `apps/api/src/db/schema.ts` (lines 136–145), `apps/api/src/services/agent.ts` (lines 220–225) |

---

## 3. Configuration Inventory & Hierarchy Table

| Configuration Group | Field Name | Authoritative Source | Runtime Resolution Path | Fallback Value | Override Priority |
|---|---|---|---|---|---|
| **Identity** | `displayName`, `agentName` | `agent_versions.configuration.identity` | `RuntimeAgentConfig.agent.agentName` | Agent DB record name | DB Version > DB Agent Record |
| **Identity** | `greeting` | `agent_versions.configuration.identity.greeting` | `RuntimeAgentConfig.prompt.greeting` | `"Greet the user in a helpful manner."` | DB Version > Static Default |
| **Business Info** | `timezone` | `agent_versions.configuration.businessInformation.timezone` | `RuntimeAgentConfig.prompt.timezone` | `"Asia/Kolkata"` | DB Version > Default `"Asia/Kolkata"` |
| **Prompt** | `compiledSystemPrompt` | `PromptCompilerService.compileAgentPrompt()` | `RuntimeAgentConfig.prompt.compiledSystemPrompt` | `DEFAULT_SYSTEM_PROMPT` | Compiled Output > `DEFAULT_SYSTEM_PROMPT` |
| **Voice** | `provider` | `agent_versions.configuration.voice.provider` | `RuntimeAgentConfig.voice.provider` | `"sarvam"` | DB Version > `"sarvam"` |
| **Voice** | `voiceId` | `agent_versions.configuration.voice.voiceId` | `RuntimeAgentConfig.voice.voiceId` | `"shubh"` (Male) / `"priya"` (Female) | DB Version > Default Voice |
| **Voice** | `sttModel` | `agent_versions.configuration.voice.sttModel` | `RuntimeAgentConfig.voice.sttModel` | `"saaras:v3"` | DB Version > `"saaras:v3"` |
| **Voice** | `ttsModel` | `agent_versions.configuration.voice.ttsModel` | `RuntimeAgentConfig.voice.ttsModel` | `"bulbul:v3"` | DB Version > `"bulbul:v3"` |
| **Voice** | `speakingSpeed` | `agent_versions.configuration.voice.speakingSpeed` | `RuntimeAgentConfig.voice.speakingSpeed` | `1.0` | DB Version > `1.0` |
| **Language** | `primary` | `agent_versions.configuration.language.primary` | `RuntimeAgentConfig.language.primary` | `"en-IN"` | DB Version > `"en-IN"` |
| **Language** | `supported` | `agent_versions.configuration.language.supported` | `RuntimeAgentConfig.language.supportedLanguages` | `[primary]` | DB Version > `[primary]` |
| **Language** | `autoDetect` | `agent_versions.configuration.language.autoDetect` | `RuntimeAgentConfig.language.autoDetectEnabled` | `true` | DB Version > `true` |
| **Language** | `languageSwitchEnabled` | `agent_versions.configuration.language.languageSwitchEnabled` | `RuntimeAgentConfig.language.languageSwitchingEnabled` | `true` | DB Version > `true` |
| **Runtime LLM** | `modelProvider` | `agent_versions.configuration.runtimeSettings.modelProvider` | `RuntimeAgentConfig.runtime.modelProvider` | `"sarvam"` | DB Version > `"sarvam"` |
| **Runtime LLM** | `llmModel` | `agent_versions.configuration.runtimeSettings.llmModel` | `RuntimeAgentConfig.runtime.llmModel` | `"sarvam-105b-conversations"` | DB Version > Default Model |
| **Runtime LLM** | `modelTemperature` | `agent_versions.configuration.runtimeSettings.modelTemperature` | `RuntimeAgentConfig.runtime.temperature` | `undefined` (Provider default) | DB Version > Provider Default |
| **Interruption** | `interruptionMode` | `agent_versions.configuration.runtimeSettings.interruptionMode` | `RuntimeAgentConfig.runtime.interruptionMode` | `"adaptive"` | DB Version > `"adaptive"` |
| **Preemption** | `preemptiveGenerationEnabled` | `agent_versions.configuration.runtimeSettings.preemptiveGenerationEnabled` | `RuntimeAgentConfig.runtime.preemptiveGenerationEnabled` | `false` | DB Version > `false` |
| **Expressive** | `expressiveModeEnabled` | `agent_versions.configuration.runtimeSettings.expressiveModeEnabled` | `RuntimeAgentConfig.runtime.expressiveModeEnabled` | `true` | DB Version > `true` |
| **Knowledge** | `enabled` | `agent_versions.configuration.knowledge.enabled` | `RuntimeAgentConfig.knowledge.enabled` | `false` | DB Version > `false` |
| **Knowledge** | `topK` | `agent_versions.configuration.knowledge.retrievalConfig.topK` | `RuntimeAgentConfig.knowledge.retrievalConfig.topK` | `5` | DB Version > `5` |
| **Tools** | `bindings` | `agent_versions.configuration.tools.bindings` | `RuntimeAgentConfig.tools.tools` | `[]` (or legacy `(tools as any).tools`) | DB Version > Legacy Shape > `[]` |
| **Variables** | `input`, `output` | `agent_versions.configuration.variables` | `RuntimeAgentConfig.variables` | `[]` | DB Version > `[]` |
| **Infrastructure Secrets**| `SARVAM_API_KEY`, etc. | Environment Variables (`.env`) | Process environment | None (Mandatory startup failure) | Process Env > Fatal Error |
