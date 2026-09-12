# NextLite Voice V3 — RuntimeAgentConfig Deep Field-by-Field Audit

> **Contract Reference**: `packages/shared/src/runtimeConfig.ts`  
> **Resolution Service**: `apps/api/src/services/runtimeAgentConfig.ts`  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Complete Field-by-Field Specification Matrix

| Field Path | Type | Source (DB/Entity) | Transformation | LiveKit Worker Usage | Pipecat Intended Usage | Default / Fallback | Scope | Versioned? | Security Notes |
|---|---|---|---|---|---|---|---|---|---|
| `tenant.tenantId` | `string (UUID)` | `deployments.tenantId` | Direct assignment | Tool API calls, call session creation, logs | Tool API calls, call session creation, logs | None (Mandatory) | Tenant | Indirectly (via Deployment) | Authoritatively derived from DB deployment; untrusted caller cannot alter |
| `agent.agentId` | `string (UUID)` | `agents.id` | Direct assignment | Call session creation, logging | Call session creation, logging | None (Mandatory) | Agent | No (Entity ID) | Enforces agent ownership boundary |
| `agent.agentName` | `string` | `agents.name` | Direct assignment | Diagnostic logging, transcript metadata | Diagnostic logging, transcript metadata | `'Test Agent'` | Agent | No | Non-sensitive display name |
| `agent.status` | `string` | `agents.status` | Direct assignment | Validates not `ARCHIVED` or `PAUSED` | Validates not `ARCHIVED` or `PAUSED` | `'active'` | Agent | No | Rejects session if agent is paused |
| `deployment.deploymentId` | `string (UUID)` | `deployments.id` | Direct assignment | Injected into tool runtime context | Injected into tool runtime context | None (Mandatory) | Deployment | No (Deployment ID) | Crucial security token for internal API isolation |
| `deployment.versionId` | `string (UUID)` | `agent_versions.id` | Direct assignment | Session tracking | Session tracking | None (Mandatory) | Version | Yes | Points to frozen immutable snapshot |
| `deployment.versionNumber`| `number` | `agent_versions.versionNumber` | Direct assignment | Diagnostic logging | Diagnostic logging | `1` | Version | Yes | Monotonically incrementing integer |
| `prompt.compiledSystemPrompt` | `string` | `agent_versions.configuration` | Compiled by `PromptCompilerService` | Base system prompt for LLM context | Base system prompt for LLM context | `DEFAULT_SYSTEM_PROMPT` | Version | Yes | Contains non-negotiable Layer A safety boundaries |
| `prompt.greeting` | `string` | `configuration.identity.greeting` | Direct string extraction | Initial turn generation (`generateReply`) | Initial greeting synthesis | `'Greet the user...'` | Version | Yes | Spoken greeting on call connect |
| `prompt.timezone` | `string` | `configuration.businessInformation.timezone` | Direct string extraction | Input to `buildTemporalInstruction()` and `buildCalendarInstruction()` | Input to temporal and calendar context | `'Asia/Kolkata'` | Version | Yes | Must be a valid IANA timezone string |
| `voice.provider` | `string` | `configuration.voice.provider` | Direct string extraction | Selects voice provider adapter | Selects voice provider adapter | `'sarvam'` | Version | Yes | Provider routing |
| `voice.sttModel` | `string` | `configuration.voice.sttModel` | Direct string extraction | Configures `sarvam.STT` model | Configures `SarvamSTTService` model | `'saaras:v3'` | Version | Yes | Fast Indian multilingual STT |
| `voice.ttsModel` | `string` | `configuration.voice.ttsModel` | Direct string extraction | Configures `sarvam.TTS` model | Configures `SarvamTTSService` model | `'bulbul:v3'` | Version | Yes | Indian multilingual TTS |
| `voice.voiceId` | `string` | `configuration.voice.voiceId` | Direct string extraction | Configures TTS speaker; determines Hindi grammar gender in prompt | Configures TTS speaker | `'shubh'` (Male) / `'priya'` (Female) | Version | Yes | Matches registered Sarvam speaker IDs |
| `voice.gender` | `'male' \| 'female' \| 'neutral'` | `configuration.voice.gender` | Voice registry lookup | Prompts masculine/feminine verb agreement | Prompts masculine/feminine verb agreement | `'female'` | Version | Yes | Prevents grammatical errors in Hindi/Marathi |
| `voice.speakingSpeed` | `number` | `configuration.voice.speakingSpeed` | Passed as `pace` option | Configures TTS pace | Configures TTS pace | `1.0` | Version | Yes | Clamped between 0.5 and 2.0 |
| `voice.pitch` | `number` | `configuration.voice.pitch` | Passed to TTS | Reserved for TTS pitch adjustment | Reserved for TTS pitch adjustment | `0` | Version | Yes | Non-critical audio property |
| `language.primary` | `string` | `configuration.language.primary` | Normalized via `normalizeLanguageCode()` | Initial active language in `ConversationLanguageManager` | Initial active language in `ConversationLanguageManager` | `'en-IN'` | Version | Yes | BCP-47 standard tag |
| `language.supportedLanguages` | `string[]` | `configuration.language.supported` | Normalized array | Valid targets for language switching | Valid targets for language switching | `[primary]` | Version | Yes | Prevents switching to unconfigured languages |
| `language.autoDetectEnabled` | `boolean` | `configuration.language.autoDetect` | Defaults to true if not false | Sets initial STT language to `'unknown'` for Saaras v3 | Sets initial STT language to `'unknown'` | `true` | Version | Yes | Controls dynamic speech recognition detection |
| `language.languageSwitchingEnabled` | `boolean` | `configuration.language.languageSwitchEnabled` | Defaults to true if not false | Allows turn-by-turn TTS/LLM updates | Allows turn-by-turn TTS/LLM updates | `true` | Version | Yes | Gates dynamic language switching |
| `runtime.modelProvider` | `string` | `configuration.runtimeSettings.modelProvider` | Direct extraction | Selects LLM class (`SarvamLLM` vs `inference.LLM`) | Selects `SarvamLLMService` | `'sarvam'` | Version | Yes | Supported: `sarvam`, `google`, `openai`, `livekit` |
| `runtime.llmModel` | `string` | `configuration.runtimeSettings.llmModel` | Direct extraction | Configures LLM model identifier | Configures `SarvamLLMSettings.model` | `'sarvam-105b-conversations'` | Version | Yes | Model endpoint routing |
| `runtime.temperature` | `number` | `configuration.runtimeSettings.modelTemperature` | Direct extraction | Passed to LLM options | Passed to LLM options | `undefined` (Provider default) | Version | Yes | Temperature clamped between 0.0 and 2.0 |
| `runtime.interruptionMode` | `'adaptive' \| 'always' \| 'disabled'` | `configuration.runtimeSettings.interruptionMode` | Maps to LiveKit `interruption` config | Configures LiveKit turn detection interruption | Configures Pipecat interruption handling | `'adaptive'` | Version | Yes | Protects speech flow |
| `runtime.preemptiveGenerationEnabled` | `boolean` | `configuration.runtimeSettings.preemptiveGenerationEnabled` | Boolean check | Enables LiveKit speculative token generation | Reserved for LLM streaming preemption | `false` | Version | Yes | Performance latency toggle |
| `runtime.responseEagerness` | `'low' \| 'medium' \| 'high'` | `configuration.runtimeSettings.eagernessToRespond` | Direct extraction | Influences endpointing delay | Influences VAD endpointing delay | `'medium'` | Version | Yes | Adjusts silence threshold |
| `runtime.noiseCancellationModel` | `string` | `configuration.runtimeSettings.noiseCancellationModel` | Direct extraction | Reserved for audio enhancement plugins | Reserved for noise suppression | `undefined` | Version | Yes | Background noise reduction |
| `runtime.expressiveModeEnabled` | `boolean` | `configuration.runtimeSettings.expressiveModeEnabled` | Defaults to true if not false | Enables Sarvam expressive audio synthesis | Enables Sarvam expressive audio synthesis | `true` | Version | Yes | Improves emotional cadence |
| `runtime.maxCallDurationSeconds` | `number` | `configuration.runtimeSettings.maxCallLengthSeconds` | Direct extraction | Worker session timeout watchdog | Worker session timeout watchdog | `undefined` (No hard limit) | Version | Yes | Protects against runaway telephony charges |
| `knowledge.enabled` | `boolean` | `configuration.knowledge.enabled` | Direct boolean extraction | Gates `query_knowledge_base` resolution | Gates `query_knowledge_base` resolution | `false` | Version | Yes | Enables RAG retrieval tool |
| `knowledge.retrievalConfig.topK` | `number` | `configuration.knowledge.retrievalConfig.topK` | Direct number extraction | Maximum knowledge chunks returned | Maximum knowledge chunks returned | `5` | Version | Yes | Vector search limit |
| `knowledge.retrievalConfig.scoreThreshold` | `number` | `configuration.knowledge.retrievalConfig.similarityThreshold` | Direct number extraction | Minimum cosine similarity score | Minimum cosine similarity score | `undefined` (No cutoff) | Version | Yes | Rejection threshold for vector search |
| `tools.enabled` | `boolean` | `configuration.tools.enabled` | Direct boolean extraction | Gates tool registry resolution | Gates tool registry resolution | `false` | Version | Yes | Master tool capability switch |
| `tools.tools` | `RuntimeToolDefinition[]` | `configuration.tools.bindings` | Normalized via `normalizeToolId()` | Resolved by `ToolRegistry` into native tools | Resolved by Pipecat Tool Registry into native functions | `[]` | Version | Yes | Canonical bindings: `query_knowledge_base`, `book_appointment`, `create_callback_lead` |
| `variables.inputVariables` | `RuntimeVariableDefinition[]` | `configuration.variables.input` | Normalized variable list | Injected into runtime context | Injected into runtime context | `[]` | Version | Yes | Input parameter definitions |
| `variables.outputVariables`| `RuntimeVariableDefinition[]` | `configuration.variables.output` | Normalized variable list | Post-call variable extraction target | Post-call variable extraction target | `[]` | Version | Yes | CRM lead extraction targets |
| `variables.runtimeContext` | `Record<string, string>` | Session metadata (callerPhone, etc.) | Injected at runtime | Caller phone, session IDs | Caller phone, session IDs | `{}` | Session | No | Dynamic call attributes |
