# NextLite Voice V3 — Frontend Configuration & UI Mapping Audit

> **Frontend Root**: `apps/web/src/`  
> **Key Pages**: `apps/web/src/pages/admin/AgentDetail.tsx`, `AgentBuilder.tsx`, `KnowledgeManager.tsx`, `apps/web/src/pages/client/*`  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. UI Control to Runtime Behavior Traceability Matrix

| UI Screen / Tab | UI Control / Field | React State / Payload Field | API Endpoint & Schema | DB Storage Column | `RuntimeAgentConfig` Field | Runtime Effect |
|---|---|---|---|---|---|---|
| **Agent Wizard** | Template Selection Card | `templateId` | `POST /api/admin/clients/:cId/agents` (`createAgentSchema`) | `agents.template_id` | N/A | Copies `agentTemplates.defaultConfiguration` into initial `agent_versions` row v1. |
| **Agent Wizard** | Agent Name Input | `name` | `POST /api/admin/clients/:cId/agents` | `agents.name` | `agent.agentName` | Sets display name and initial version. |
| **Agent Detail / Overview** | Greeting Textarea | `config.identity.greeting` | `PUT /api/admin/.../config` (`agentConfigurationSchema`) | `agent_versions.configuration.identity.greeting` | `prompt.greeting` | Spoken by agent immediately upon call connect. |
| **Agent Detail / Overview** | Business Name Input | `config.businessInformation.businessName` | `PUT /api/admin/.../config` | `configuration.businessInformation.businessName` | `prompt.compiledSystemPrompt` | Injected into Identity section of system prompt. |
| **Agent Detail / Overview** | Timezone Select | `config.businessInformation.timezone` | `PUT /api/admin/.../config` (Validated with `Intl.DateTimeFormat`) | `configuration.businessInformation.timezone` | `prompt.timezone` | Formats current date/time in `buildTemporalInstruction()` and `buildCalendarInstruction()`. |
| **Agent Detail / Persona** | Role / Persona Text | `config.persona.role` | `PUT /api/admin/.../config` | `configuration.persona.role` | `prompt.compiledSystemPrompt` | Injected into Persona section of system prompt. |
| **Agent Detail / Persona** | Tone & Formality | `config.persona.tone`, `formality` | `PUT /api/admin/.../config` | `configuration.persona.tone` | `prompt.compiledSystemPrompt` | Sets voice persona tone in system prompt. |
| **Agent Detail / Languages**| Primary Language Select | `config.language.primary` | `PUT /api/admin/.../config` | `configuration.language.primary` | `language.primary` | Initial STT/TTS language in `ConversationLanguageManager`. |
| **Agent Detail / Languages**| Supported Languages Multiselect | `config.language.supported` | `PUT /api/admin/.../config` | `configuration.language.supported` | `language.supportedLanguages` | Whitelist of allowed languages for dynamic switching. |
| **Agent Detail / Languages**| Auto-Detect Toggle | `config.language.autoDetect` | `PUT /api/admin/.../config` | `configuration.language.autoDetect` | `language.autoDetectEnabled` | Sets initial Saaras v3 STT code to `'unknown'`. |
| **Agent Detail / Languages**| Language Switch Toggle | `config.language.languageSwitchEnabled` | `PUT /api/admin/.../config` | `configuration.language.languageSwitchEnabled` | `language.languageSwitchingEnabled` | Gates runtime turn-by-turn language switching. |
| **Agent Detail / Voice** | Voice Speaker Select | `config.voice.voiceId` | `PUT /api/admin/.../config` | `configuration.voice.voiceId` | `voice.voiceId` | Configures Sarvam TTS speaker and masculine/feminine Hindi grammar in prompt. |
| **Agent Detail / Voice** | Speaking Speed Slider | `config.voice.speakingSpeed` | `PUT /api/admin/.../config` | `configuration.voice.speakingSpeed` | `voice.speakingSpeed` | Passed as `pace` option to Sarvam TTS. |
| **Agent Detail / Tools** | Platform Tools Toggles | `config.tools.bindings` (`query_knowledge_base`, `book_appointment`, `create_callback_lead`) | `PUT /api/admin/.../config` (Validated against `KNOWN_PLATFORM_TOOL_IDS`) | `configuration.tools.bindings` | `tools.tools` | `ToolRegistry` instantiates corresponding native tools for LLM. |
| **Agent Detail / Tools** | Tool Description Override | `binding.description` | `PUT /api/admin/.../config` | `configuration.tools.bindings[].description` | `tools.tools[].description` | Overrides default tool description presented to LLM. |
| **Agent Detail / Knowledge**| Knowledge Toggle | `config.knowledge.enabled` | `PUT /api/admin/.../config` | `configuration.knowledge.enabled` | `knowledge.enabled` | Enables RAG knowledge retrieval capability. |
| **Agent Detail / Knowledge**| Document Upload File Picker | Multipart file (`.pdf`, `.md`, `.txt`) | `POST /api/admin/knowledge/upload` | `knowledge_sources`, `knowledge_chunks` | N/A (Indexed in vector DB) | Chunks and embeds document for vector search during calls. |
| **Agent Detail / Variables**| Input Variables Builder | `config.variables.input` | `PUT /api/admin/.../config` | `configuration.variables.input` | `variables.inputVariables` | Defines caller/runtime context parameters. |
| **Agent Detail / Variables**| Output Variables Builder| `config.variables.output` | `PUT /api/admin/.../config` | `configuration.variables.output` | `variables.outputVariables` | Defines extraction targets for post-call CRM lead notes. |
| **Agent Detail / Settings** | LLM Model Provider | `config.runtimeSettings.modelProvider` | `PUT /api/admin/.../config` | `configuration.runtimeSettings.modelProvider` | `runtime.modelProvider` | Selects LLM adapter (`SarvamLLM` vs `inference.LLM`). |
| **Agent Detail / Settings** | LLM Model Name | `config.runtimeSettings.llmModel` | `PUT /api/admin/.../config` | `configuration.runtimeSettings.llmModel` | `runtime.llmModel` | Specifies LLM endpoint (e.g. `sarvam-105b-conversations`). |
| **Agent Detail / Settings** | Interruption Mode Select | `config.runtimeSettings.interruptionMode` | `PUT /api/admin/.../config` | `configuration.runtimeSettings.interruptionMode` | `runtime.interruptionMode` | Maps to LiveKit/Pipecat interruption options (`adaptive`, `always`, `disabled`). |
| **Agent Detail / Testing**  | Web Microphone Test Modal | WebRTC audio stream | `POST /api/admin/.../test-token` | N/A | N/A | Connects browser microphone to LiveKit test room using active `TEST` deployment. |
| **Agent Detail / Testing**  | Phone Call Test Modal | `phoneNumber` (E.164) | `POST /api/admin/.../phone-test` | N/A | N/A | Dials destination phone number via LiveKit SIP Outbound trunk. |
| **Agent Detail / Publish**  | Publish Agent Button | `publish` trigger | `POST /api/admin/.../publish` | `agent_versions.status = 'PUBLISHED'`, `deployments.environment = 'PRODUCTION'` | `deployment.versionId` | Activates version snapshot for all incoming telephony calls. |

---

## 2. Unconnected UI Controls & Backend Fields without UI

### A. Backend Fields without Frontend UI Controls:
1. `config.runtimeSettings.noiseCancellationModel`: Supported in `RuntimeAgentConfig.runtime.noiseCancellationModel` and schema, but `SettingsEditor.tsx` does not render a selector for noise cancellation models.
2. `config.runtimeSettings.maxCallLengthSeconds`: Supported in schema and `RuntimeAgentConfig.runtime.maxCallDurationSeconds`, but no slider exists in `SettingsEditor.tsx`.
3. `config.businessInformation.customFacts`: Supported in `PromptCompilerService` and schema, but currently edited only via JSON / AI Assistant.

### B. Legacy / Deprecated Fields Handled Transparently:
1. `config.tools.tools` (Legacy tool array): Automatically normalized to `config.tools.bindings` by `AgentService.createAgent()` and `saveConfiguration()`.
2. `agentTools` table: Excluded from runtime resolution; UI edits `agent_versions.configuration.tools.bindings`.
