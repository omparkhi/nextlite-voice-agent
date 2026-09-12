# RuntimeAgentConfig End-to-End Forensic Parity

**Source Contract:** `packages/shared/src/runtimeConfig.ts`  
**API Service:** `apps/api/src/services/runtimeAgentConfig.ts`  
**Worker Implementation:** `apps/pipecat-worker/app/runtime_config.py`  
**Pipecat Pipeline Consumer:** `apps/pipecat-worker/app/main.py` & `sarvam_llm.py`  
**Audit Date:** September 2026

---

## 1. End-to-End Dataflow Architecture

```
PostgreSQL Database (agents, agent_versions, deployments, phone_numbers)
      ↓ (Loaded by deploymentId or inbound dialed phoneNumber)
FastAPI Control Plane / RuntimeAgentConfigService
      ↓ (Compiled System Prompt + Injected Variables + Resolved Voice/Language/Tools)
Worker Ingestion (HTTP GET /api/internal/runtime-agent-config)
      ↓ (Parsed into Pydantic RuntimeAgentConfig model)
Pipecat Realtime Engine Pipeline
      ├─ STT Frame Processor (Sarvam STT model, language: hi-IN / en-IN / mr-IN)
      ├─ UserAggregator & Early Turn Endpointing
      ├─ LLM Context (System Prompt + Dynamic Temporal Context + Tools)
      ├─ Tool Execution Engine (query_knowledge_base, book_appointment, create_callback_lead)
      └─ TTS Frame Processor (Sarvam TTS Bulbul v3 / Priya / Rahul / Pitch / Speed)
```

---

## 2. Complete Field-by-Field Parity Inventory

| Section | Field Name | Type | Optional / Required | Default Value | Validation Rule | Runtime Effect | Database Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tenant** | `tenantId` | `UUID string` | Required | None | Valid UUIDv4 | Multi-tenant isolation filter | `tenants.id` |
| **Agent** | `agentId` | `UUID string` | Required | None | Valid UUIDv4 | Agent identification | `agents.id` |
| | `agentName` | `string` | Required | None | Max 255 chars | Logging & Context | `agents.name` |
| | `status` | `string` | Required | `'READY'` | `versionStatusEnum` | Guard against archived agents | `agents.status` |
| **Deployment** | `deploymentId` | `UUID string` | Required | None | Valid UUIDv4 | Correlation ID for call logs | `deployments.id` |
| | `versionId` | `UUID string` | Required | None | Valid UUIDv4 | Immutable snapshot ID | `deployments.version_id` |
| | `versionNumber` | `integer` | Optional | `1` | Positive int | Version tracking | `agent_versions.version_number` |
| **Prompt** | `compiledSystemPrompt` | `string` | Required | None | Non-empty text | Injected as LLM System message | Compiled from version + template |
| | `greeting` | `string` | Optional | `""` | Text | First spoken message by TTS | `agent_versions.greeting` |
| | `timezone` | `string` | Optional | `'Asia/Kolkata'` | Valid IANA Timezone | Injected in temporal prompt | `agent_versions.timezone` |
| **Voice** | `provider` | `string` | Required | `'sarvam'` | `'sarvam'`, `'fish'` | STT/TTS Provider selection | `agent_versions.voice_provider` |
| | `sttModel` | `string` | Optional | `'saaras:v3'` | Known STT model | Speech-to-text accuracy | `agent_versions.stt_model` |
| | `ttsModel` | `string` | Optional | `'bulbul:v3'` | Known TTS model | Text-to-speech engine | `agent_versions.tts_model` |
| | `voiceId` | `string` | Required | `'priya'` | Recognized voice ID | TTS voice personality | `agent_versions.voice_id` |
| | `gender` | `enum` | Optional | `'female'` | `'male'`, `'female'` | Voice fallback | `agent_versions.voice_gender` |
| | `speakingSpeed` | `float` | Optional | `1.0` | `0.5` to `2.0` | Bulbul TTS pace | `agent_versions.speaking_speed` |
| | `pitch` | `float` | Optional | `0.0` | `-5.0` to `5.0` | Bulbul TTS pitch modulation | `agent_versions.voice_pitch` |
| **Language** | `primary` | `string` | Required | `'en-IN'` | BCP-47 (`hi-IN`, `mr-IN`, etc.) | STT/TTS initial language | `agent_versions.primary_language` |
| | `supportedLanguages` | `string[]` | Required | `['en-IN']` | Array of BCP-47 | Multilingual switcher set | `agent_versions.languages` |
| | `autoDetectEnabled` | `boolean` | Optional | `false` | Boolean | Automatic language detection | `agent_versions.auto_detect` |
| | `languageSwitchingEnabled` | `boolean` | Optional | `false` | Boolean | Dynamic STT code-switching | `agent_versions.lang_switch` |
| **Runtime** | `modelProvider` | `string` | Optional | `'sarvam'` | `'sarvam'`, `'google'` | LLM backend selection | `agent_versions.llm_provider` |
| | `llmModel` | `string` | Optional | `'sarvam-2b-v0.5'` | Known LLM model | LLM inference model | `agent_versions.llm_model` |
| | `temperature` | `float` | Optional | `0.3` | `0.0` to `1.0` | LLM creativity control | `agent_versions.temperature` |
| | `interruptionMode` | `string` | Optional | `'adaptive'` | `'adaptive'`, `'always'` | Audio barge-in sensitivity | `agent_versions.interruption_mode` |
| | `preemptiveGenerationEnabled` | `boolean` | Optional | `false` | Boolean | Fast-turn speculative LLM | `agent_versions.preemptive` |
| | `responseEagerness` | `string` | Optional | `'medium'` | `'low'`, `'medium'`, `'high'` | VAD endpointing silence window | `agent_versions.response_eagerness` |
| | `noiseCancellationModel` | `string` | Optional | `'quailVfS'` | Model string | Ai-coustics background denoising | `agent_versions.noise_model` |
| | `expressiveModeEnabled` | `boolean` | Optional | `false` | Boolean | Bulbul expressive tags | `agent_versions.expressive_mode` |
| | `maxCallDurationSeconds` | `integer` | Optional | `600` | 30 to 3600 | Auto-hangup safety limit | `agent_versions.max_duration` |
| **Knowledge** | `enabled` | `boolean` | Required | `false` | Boolean | Activates RAG tools | `agent_versions.knowledge_enabled` |
| | `topK` | `integer` | Optional | `3` | `1` to `10` | pgvector match count | `agent_versions.rag_top_k` |
| | `scoreThreshold` | `float` | Optional | `0.65` | `0.0` to `1.0` | Cosine similarity cutoff | `agent_versions.rag_threshold` |
| **Tools** | `enabled` | `boolean` | Required | `true` | Boolean | Function calling enablement | `agent_versions.tools_enabled` |
| | `tools` | `RuntimeToolDefinition[]` | Required | `[]` | Valid JSON Schema tools | Injected into Sarvam LLM tools | `agent_tools` table join |
| **Variables** | `inputVariables` | `VariableDefinition[]` | Required | `[]` | Key-type-required triples | Injected dynamic parameters | `agent_versions.variables` |
| | `outputVariables` | `VariableDefinition[]` | Required | `[]` | Key-type-required triples | Extracted post-call variables | `agent_versions.variables` |
| | `runtimeContext` | `Record<string, string>` | Optional | `{}` | Key-value pairs | Dynamic session variables | Computed at call time |

---

## 3. Canonical Platform Tool Normalization

The system enforces canonical tool identification via `normalizeToolId`:
- `query_knowledge_base` (aliases: `'query knowledge base'`, `'knowledge search'`, `'search knowledge base'`)
- `book_appointment` (aliases: `'book appointment'`, `'book doctor appointment'`, `'schedule appointment'`, `'book demo class'`)
- `create_callback_lead` (aliases: `'create callback lead'`, `'record callback lead'`, `'lead capture'`)

## 4. UUID Suppression & User-Safe Display IDs

Under no circumstances may a raw database UUID (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) be spoken to a telephone caller.
The worker strictly extracts user-friendly reference IDs using `getUserSafeDisplayId`:
- `appointmentNumber` (e.g. `APT-10042`)
- `leadNumber` (e.g. `LEAD-5021`)
- `displayNumber`, `referenceNumber`, `bookingNumber`, `confirmationNumber`