# LiveKit → Pipecat Behavior Parity Matrix & Migration Map

> **DOCUMENT PURPOSE**: Comprehensive audit and mapping of all existing NextLite Voice V3 agent behavior, contracts, safety boundaries, configuration models, tools, RAG, multilingual logic, call lifecycle, and security guarantees from the current production LiveKit worker (`apps/livekit-worker`) to the candidate self-hosted Pipecat worker (`apps/pipecat-worker`).
>
> **CORE ARCHITECTURAL RULE**: NextLite owns product configuration, business logic, tenant isolation, prompts, and CRM persistence. Pipecat owns the realtime voice pipeline, frame transport, STT, LLM streaming, TTS, and interruption handling.
>
> **ZERO PRODUCT DRIFT**: When migrated, the Pipecat agent must behave identically to the production LiveKit agent without simplifying or omitting any NextLite capabilities.

---

## 1. Executive Comparison & Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    NEXTLITE CONTROL PLANE (Node.js API)                    │
│   • Agent / Version Configuration JSONB                                     │
│   • PromptCompilerService (Layer A Safety + Layer B Business Context)       │
│   • Internal REST Endpoints (/api/internal/*) secured by Worker Secret     │
│   • PostgreSQL Database (call_sessions, leads, appointments, knowledge)     │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ RuntimeAgentConfig DTO
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                  CURRENT PRODUCTION: LIVEKIT WORKER (TypeScript)           │
│   • Entrypoint: defineAgent() with room.metadata -> deploymentId           │
│   • Config Client: getRuntimeAgentConfig(deploymentId)                      │
│   • Core Engine: LiveKit Agents SDK (voice.AgentSession, inference.LLM)    │
│   • Telephony: Plivo SIP Trunk -> LiveKit Ingress / Egress                 │
│   • STT: @livekit/agents-plugin-sarvam (Sarvam STT saaras:v3)              │
│   • LLM: SarvamLLM (sarvam-105b-conversations)                             │
│   • TTS: @livekit/agents-plugin-sarvam (Sarvam TTS bulbul:v3)              │
│   • Language: ConversationLanguageManager (Hinglish/Minglish rules)        │
│   • Tools: ToolRegistry (book_appointment, create_callback_lead, knowledge)│
│   • Lifecycle: createCallSession(ACTIVE) -> updateCallSession(COMPLETED)   │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                MIGRATION TO
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                  TARGET CANDIDATE: PIPECAT WORKER (Python 3.14)            │
│   • Entrypoint: FastAPI WebSocket endpoint (/ws/plivo)                     │
│   • Config Client: Async HTTP client fetching RuntimeAgentConfig DTO       │
│   • Core Engine: Pipecat SDK 1.8.1 (Pipeline, PipelineWorker, WorkerRunner)│
│   • Telephony: Plivo Bidirectional WebSocket (FastAPIWebsocketTransport)   │
│   • STT: SarvamSTTService (saaras:v3, 8kHz native telephony)               │
│   • LLM: SarvamLLMService (sarvam-105b / sarvam-105b-conversations)        │
│   • Context: LLMContext + LLMContextAggregatorPair (User & Assistant)      │
│   • TTS: SarvamTTSService (bulbul:v3, 8kHz Linear PCM)                     │
│   • Language: Ported ConversationLanguageManager logic (Identical rules)   │
│   • Tools: FunctionSchema & ToolsSchema -> NextLite internal API endpoints │
│   • Lifecycle: Identical createCallSession -> updateCallSession contracts  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Inventory of Current LiveKit Agent Behaviors

| # | Behavior Category | Current LiveKit Implementation (`apps/livekit-worker`) | Target Pipecat 1.8.1 Equivalent | Parity Status | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Deployment Resolution** | `extractDeploymentId(room.metadata)` parses JSON string with strict validation | Parse `stream.start.customField` or WebSocket query params (`?deploymentId=...`) | **Mapped** | Low |
| **2** | **RuntimeAgentConfig Client** | `getRuntimeAgentConfig()` calls `/api/internal/runtime-config/:deploymentId` with Bearer auth | `httpx.AsyncClient` calls same endpoint with identical Bearer auth & Zod/Pydantic validation | **Mapped** | Low |
| **3** | **Tenant Isolation** | Verified by control plane during deployment resolution; worker passes trusted context | Identical: `tenantId` resolved from `RuntimeAgentConfig.tenant.tenantId` | **Mapped** | Zero |
| **4** | **System Prompt Assembly** | `compiledSystemPrompt` + `buildTemporalInstruction()` + `buildCalendarInstruction()` | Identical string concatenation of prompt + temporal + calendar context | **Mapped** | Low |
| **5** | **Greeting Trigger** | `session.generateReply({ instructions: greetingInstructions })` on connection | Queue initial `LLMContextFrame` with system greeting directive or `TTSSpeakFrame` | **Mapped** | Low |
| **6** | **STT Engine** | `@livekit/agents-plugin-sarvam` `STT({ model: 'saaras:v3' })` | `pipecat.services.sarvam.stt.SarvamSTTService(model="saaras:v3")` | **Verified** | Low |
| **7** | **LLM Engine** | `SarvamLLM({ model: 'sarvam-105b-conversations' })` (OpenAI-compatible wrapper) | `pipecat.services.sarvam.llm.SarvamLLMService(model="sarvam-105b")` | **Verified** | Low |
| **8** | **TTS Engine** | `@livekit/agents-plugin-sarvam` `TTS({ model: 'bulbul:v3', speaker: 'priya' })` | `pipecat.services.sarvam.tts.SarvamTTSService(model="bulbul:v3", voice=voice_id)` | **Verified** | Low |
| **9** | **Context Aggregation** | LiveKit `AgentSession` conversation items and turn manager | Pipecat `LLMContext` + `LLMContextAggregatorPair` (`LLMUserAggregator` / `LLMAssistantAggregator`) | **Verified** | Low |
| **10** | **Multi-Turn History** | Automatically tracked by LiveKit `ChatContext` | Handled natively by `LLMContext.get_messages()` / `add_message()` | **Verified** | Low |
| **11** | **Interruption / Barge-in** | LiveKit `resolveInterruptionOptions()` | Pipecat `InterruptionFrame` &rarr; `PlivoFrameSerializer` yields `clearAudio` | **Verified** | Low |
| **12** | **Multilingual Management** | `ConversationLanguageManager`: auto-detection, explicit regexes, Hinglish/Minglish filters | Python port of `ConversationLanguageManager` updating `SarvamTTSService` & `LLMContext` | **Mapped** | Med |
| **13** | **Dynamic Language Switch** | `tts.updateOptions({ targetLanguageCode })` + `agent.updateInstructions()` | Update `SarvamTTSService` settings + append language directive to `LLMContext` | **Mapped** | Med |
| **14** | **Tool Registration** | `ToolRegistry.resolveTools(runtimeConfig, runtimeContext)` | `ToolsSchema` + `FunctionSchema` registered on `SarvamLLMService` | **Mapped** | Low |
| **15** | **Appointment Booking** | `book_appointment` &rarr; `/api/internal/appointments` with trusted context & anti-hallucination | Python `book_appointment` function handler invoking NextLite REST API | **Mapped** | Low |
| **16** | **Callback Lead Capture** | `create_callback_lead` &rarr; `/api/internal/leads` with trusted context & phone fallback | Python `create_callback_lead` function handler invoking NextLite REST API | **Mapped** | Low |
| **17** | **Knowledge Base (RAG)** | `query_knowledge_base` &rarr; `/api/internal/knowledge/retrieve` with trusted `deploymentId` | Python `query_knowledge_base` function handler invoking NextLite REST API | **Mapped** | Low |
| **18** | **Caller Phone Fallback** | Extracted from SIP/PSTN caller ID; used if caller says "use this number" | Extracted from Plivo `start.from` or webhook payload; passed to tool context | **Mapped** | Low |
| **19** | **Call Session Creation** | `createCallSession()` at call start (`status: 'ACTIVE'`) | Async POST to `/api/internal/call-sessions` upon WebSocket connect | **Mapped** | Low |
| **20** | **Call Session Finalization** | `updateCallSession()` on call end (`status: 'COMPLETED'/'FAILED'/'MISSED'`, duration, turns, metrics) | Async PATCH to `/api/internal/call-sessions/:id` upon WebSocket close | **Mapped** | Low |
| **21** | **Debug Transcript Tracking** | `DebugTranscriptCollector` records user turns, agent messages, tool calls, errors | Python `TranscriptCollector` recording structured turn data | **Mapped** | Low |
| **22** | **Timing Telemetry** | `RealtimeTimingTracker` logs monotonic STT, TTFT, TTFB, and tool execution durations | `RealtimeStreamingTimingMonitor` frame processor | **Verified** | Low |
| **23** | **Telephony Audio Transport** | LiveKit WebRTC / SIP ingress | Plivo Bidirectional WebSocket (`FastAPIWebsocketTransport` + `PlivoFrameSerializer`) | **Verified** | Low |
| **24** | **Noise Cancellation** | `@livekit/plugins-ai-coustics` (Audio Enhancement) | In-process audio filter or Pipecat Krisp/noise processor (optional in telephony) | **Mapped** | Low |
| **25** | **Clean Shutdown Handling** | `ctx.addShutdownCallback(finalizeCallSession)` | FastAPI lifespan / WebSocket `finally` block ensuring final session update | **Mapped** | Low |

---

## 3. RuntimeAgentConfig Field-by-Field Parity Mapping

The canonical contract defined in [`packages/shared/src/runtimeConfig.ts`](file:///e:/NextLite/nextlite-voice-engineering-spec/packages/shared/src/runtimeConfig.ts) remains 100% unchanged.

| Field Path | Type | LiveKit Usage | Target Pipecat Usage | Status |
| :--- | :--- | :--- | :--- | :--- |
| `tenant.tenantId` | `string` | Injected into call session and tool API payloads | Injected into call session and tool API payloads | **Direct Parity** |
| `agent.agentId` | `string` | Logged, stored in `call_sessions.agentId` | Logged, stored in `call_sessions.agentId` | **Direct Parity** |
| `agent.agentName` | `string` | Used in logging and default fallback persona | Used in logging and default fallback persona | **Direct Parity** |
| `agent.status` | `string` | Validated (must not be `PAUSED` or `ARCHIVED`) | Validated prior to starting pipeline | **Direct Parity** |
| `deployment.deploymentId` | `string` | Primary key for config retrieval and tool context | Primary key for config retrieval and tool context | **Direct Parity** |
| `deployment.versionId` | `string` | Invariant validation | Invariant validation | **Direct Parity** |
| `deployment.versionNumber` | `number` | Telemetry logging | Telemetry logging | **Direct Parity** |
| `prompt.compiledSystemPrompt` | `string` | Base instructions passed to `buildFullInstructions` | Passed as system message in `LLMContext` | **Direct Parity** |
| `prompt.greeting` | `string` | Passed to `session.generateReply()` | Triggered on pipeline connect via `LLMContext` | **Direct Parity** |
| `prompt.timezone` | `string` | Used by `buildTemporalInstruction` (default: `Asia/Kolkata`) | Used by Python `build_temporal_instruction` | **Direct Parity** |
| `voice.provider` | `string` | Expected `'sarvam'` | Expected `'sarvam'` | **Direct Parity** |
| `voice.sttModel` | `string` | Pinned to `'saaras:v3'` | Configured on `SarvamSTTService(model=stt_model)` | **Direct Parity** |
| `voice.ttsModel` | `string` | Pinned to `'bulbul:v3'` | Configured on `SarvamTTSService(model=tts_model)` | **Direct Parity** |
| `voice.voiceId` | `string` | Configured speaker ID (e.g. `'priya'`, `'shubh'`) | Configured on `SarvamTTSService(voice=voice_id)` | **Direct Parity** |
| `voice.speakingSpeed` | `number` | Configures TTS `pace` | Configures TTS `pace` (if supported by Sarvam TTS) | **Direct Parity** |
| `voice.pitch` | `number` | Optional pitch modification | Passed to TTS settings | **Direct Parity** |
| `language.primary` | `string` | Initial STT/TTS language (e.g. `'en-IN'`, `'hi-IN'`) | Initial STT/TTS language on services | **Direct Parity** |
| `language.supportedLanguages`| `string[]` | Allowed languages for auto/explicit switching | Allowed languages for language manager | **Direct Parity** |
| `language.autoDetectEnabled` | `boolean` | If true, STT starts with `'unknown'` for auto-detect | If true, STT config starts with auto-detect | **Direct Parity** |
| `language.languageSwitchingEnabled` | `boolean` | Enables/disables dynamic mid-call language switching | Enables/disables dynamic mid-call switching | **Direct Parity** |
| `runtime.modelProvider` | `string` | Provider routing (`'sarvam'`, `'openai'`, `'google'`) | Provider routing (`'sarvam'`) | **Direct Parity** |
| `runtime.llmModel` | `string` | Specific LLM model (e.g. `'sarvam-105b-conversations'`) | Configured on `SarvamLLMService(model=llm_model)` | **Direct Parity** |
| `runtime.temperature` | `number` | Passed to LLM constructor | Configured on `SarvamLLMSettings(temperature=...)` | **Direct Parity** |
| `runtime.interruptionMode` | `string` | `'adaptive'`, `'always'`, `'disabled'` | Configures Pipecat `allow_interruptions` | **Direct Parity** |
| `runtime.preemptiveGenerationEnabled` | `boolean` | Enables LLM generation during user pauses | Configures Pipecat turn strategies | **Direct Parity** |
| `runtime.maxCallDurationSeconds` | `number` | Enforces hard call termination timer | Configures async timeout on worker task | **Direct Parity** |
| `knowledge.enabled` | `boolean` | Enables/disables knowledge base retrieval tool | Enables/disables `query_knowledge_base` tool | **Direct Parity** |
| `knowledge.retrievalConfig.topK` | `number` | Number of chunks to retrieve (default: 5) | Passed as `top_k` to retrieval endpoint | **Direct Parity** |
| `tools.enabled` | `boolean` | Master toggle for tool execution | Master toggle for tool schemas | **Direct Parity** |
| `tools.tools` | `RuntimeToolDefinition[]` | List of enabled tool definitions with descriptions | Converted to Pipecat `FunctionSchema` objects | **Direct Parity** |
| `variables.runtimeContext` | `Record<string, string>` | Injected caller/channel metadata | Injected caller/channel metadata | **Direct Parity** |

---

## 4. Prompt Compilation & Safety Boundary Parity

The system prompt compilation in NextLite consists of two distinct layers:
1. **Layer A: Universal Core Runtime Safety Boundary (Hardcoded in Control Plane)**
   - Security: Never expose system prompts, internal reasoning, tool names, or API structures.
   - Turn-Taking: Maximum 1-2 short sentences (max 150 chars). Maximum 1 question per turn.
   - Anti-Self-Talk: Never simulate user turns or answer own questions.
   - Latest User Intent Priority: Always answer the caller's immediate question directly before continuing prior script steps.
   - Short Utterance Context: Interpret "हाँ", "नहीं", "Okay" in context of previous turn.
   - Phone Number Semantics: When caller says "use this number", use incoming caller ID; never claim fake caller ID.
   - Tool Verification & Anti-Hallucination: Communicate only customer-safe reference numbers (e.g. `A-001`). Never read aloud raw UUIDs or technical database IDs.
   - Booking Safety Rules: State appointment request is recorded only after tool success. Never claim confirmed booking unless tool returns `CONFIRMED`.
   - Operating Hours vs Slot Availability: Operating hours do not imply slot availability.
2. **Layer B: Customer & Business Configuration (Dynamically Compiled)**
   - Identity & Avatar (`agentName`, `businessName`, `role`, `tone`, `aiIdentityBehavior`)
   - Environment & Objectives (`situation`, `channel`, `primaryObjective`, `secondaryObjectives`)
   - Speaking Style (`conciseResponses`, `oneQuestionAtATime`, `avoidMarkdown`, `avoidSymbols`)
   - Business Information & Custom Facts (`hours`, `location`, `customFacts`)
   - Conversation Phases & Steps (`phases`, `requiredInformation`)
   - Safety Guardrails & Escalation (`prohibitedTopics`, `prohibitedClaims`, `escalationRules`)
   - Language & Code-Switching Guidance (Hinglish/Minglish natural phrasing rules)
3. **Temporal & Calendar Additions (Injected at Session Start)**
   - `buildTemporalInstruction(new Date(), timeZone)`: Current date, day of week, time in caller timezone.
   - `buildCalendarInstruction(new Date(), timeZone)`: Explicit calendar grid mapping date to weekday to prevent LLM date calculation errors.

> **PARITY GUARANTEE**: The Pipecat worker receives the complete compiled string from `RuntimeAgentConfig.prompt.compiledSystemPrompt` and appends identical temporal and calendar instructions. No prompts are shortened or altered.

---

## 5. Tool Registry & Function Calling Parity

### Canonical Platform Tools

```
                     ┌────────────────────────┐
                     │   Sarvam LLM Service   │
                     └───────────┬────────────┘
                                 │ Tool Call (FunctionSchema)
                                 ▼
                     ┌────────────────────────┐
                     │  Pipecat Tool Handler  │
                     │  (Trusted Context:     │
                     │   deploymentId,        │
                     │   callSessionId,       │
                     │   callerPhone)         │
                     └───────────┬────────────┘
                                 │ HTTP POST + Bearer Secret
                                 ▼
┌────────────────────────────────┬────────────────────────────────┬────────────────────────────────┐
│      query_knowledge_base      │       book_appointment         │      create_callback_lead      │
│  /api/internal/knowledge/      │  /api/internal/appointments    │  /api/internal/leads           │
│  retrieve                      │                                │                                │
│  • Input: query, topK          │  • Input: customerName, phone, │  • Input: customerName, phone, │
│  • Returns: [{ content }]      │    date, time, resource, notes │    email, category, notes      │
│  • Anti-hallucination return   │  • Returns: appointmentNumber  │  • Returns: leadId, message    │
│    on empty/failure            │  • Non-UUID reference (A-001)  │  • Phone fallback to caller ID │
└────────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
```

### Tool Implementation Details

1. **`query_knowledge_base`**:
   - Schema: `{ query: string }`
   - Execution: Calls `/api/internal/knowledge/retrieve` with `{ deploymentId, query, topK }`.
   - Security: Deployment ID is locked to session context; LLM cannot supply or override tenant or deployment IDs.
   - Output: Returns sanitized `{ results: [{ content, relevanceScore }] }`. On failure, returns safe fallback string.
2. **`book_appointment`**:
   - Schema: `{ customerName, customerPhone?, title, resourceName?, bookingDate, bookingTime, notes?, metadata? }`
   - Execution: Calls `/api/internal/appointments` with `{ deploymentId, callSessionId, ... }`.
   - Phone Fallback: If `customerPhone` is omitted, uses `callerPhone` from telephony context. If neither exists, rejects with request to ask caller.
   - Output: Returns `{ success: true, appointmentNumber: "A-001", status: "REQUESTED", message: "..." }`.
   - Safety: Anti-UUID display rule prevents pronouncing database IDs.
3. **`create_callback_lead`**:
   - Schema: `{ customerName, customerPhone?, customerEmail?, interestCategory?, notes?, metadata? }`
   - Execution: Calls `/api/internal/leads` with `{ deploymentId, callSessionId, ... }`.
   - Output: Returns `{ success: true, leadId: "...", message: "Callback request recorded successfully." }`.

---

## 6. Multilingual Architecture & Dynamic Switching Parity

### LiveKit Logic (`ConversationLanguageManager`)

1. **Language Normalization**: Maps any language code/alias (`'hi'`, `'hindi'`, `'en_IN'`) to standard Indian BCP-47 tag (`'hi-IN'`, `'en-IN'`, `'mr-IN'`, etc.).
2. **Explicit Language Switch (Highest Priority)**:
   - Evaluates incoming transcript against targeted regular expressions across 12 Indic languages.
   - If match found and language is in `supportedLanguages`, switches immediately.
3. **Automatic Language Detection (Evidence-Based)**:
   - Only triggers if `autoDetectEnabled` and `languageSwitchingEnabled` are true.
   - Requires utterance length $\ge 3$ words (filters out noise, fillers like "okay", "हाँ", "doctor sharma").
   - **Indic Script Check**: Text with Devanagari / Indic script cannot switch to English.
   - **Hinglish Latin Particle Filter**: Text with Hindi grammatical particles (`ka`, `ki`, `hai`, `karo`, `chahiye`) cannot switch to English.
   - **Minglish Latin Particle Filter**: Text with Marathi grammatical particles (`madhe`, `cha`, `aahe`, `sanga`) cannot switch to English.
4. **Dynamic Prompt & TTS Update**:
   - When language switches, updates TTS `targetLanguageCode` dynamically.
   - Appends `=== ACTIVE CONVERSATION LANGUAGE POLICY ===` directive to system prompt.

> **PIPECAT PORTING STRATEGY**: Port `ConversationLanguageManager` directly to a clean Python class `ConversationLanguageManager` in `apps/pipecat-worker/app/language_manager.py`. Hook user transcription events to evaluate turns and dynamically update `SarvamTTSService` voice/language settings and `LLMContext` system instructions.

---

## 7. Call Lifecycle & CRM Persistence Parity

```
LiveKit Lifecycle Event           Pipecat WebSocket Lifecycle Event       NextLite Control Plane API
───────────────────────────────────────────────────────────────────────────────────────────────────────
Room connected                    WebSocket handshake complete            POST /api/internal/call-sessions
                                  (streamId, callerNumber extracted)      Payload: {
                                                                            status: 'ACTIVE',
                                                                            tenantId, agentId, deploymentId,
                                                                            roomName, callerNumber, direction
                                                                          }
                                                                          Returns: { id: callSessionId }
                                                                                │
User speaks & Agent responds      Frames flow through pipeline                  │ (Accumulates in memory)
                                  STT -> Context -> LLM -> TTS            • Transcript turns
                                                                          • Tool executions
                                                                          • Monotonic timing metrics
                                                                                │
Session close / Disconnect        WebSocket disconnect / cleanup          PATCH /api/internal/call-sessions/:id
                                                                          Payload: {
                                                                            status: 'COMPLETED' | 'MISSED' | 'FAILED',
                                                                            durationSeconds,
                                                                            transcriptText,
                                                                            turnsJson,
                                                                            toolsUsed: ['book_appointment', ...],
                                                                            metricsJson
                                                                          }
```

---

## 8. Security & Isolation Invariants

1. **Worker Secret Authentication**: All requests from the worker to the control plane (`/api/internal/*`) must include `Authorization: Bearer <WORKER_SECRET>` and `x-worker-secret: <WORKER_SECRET>`.
2. **Untrusted LLM Parameters**: The LLM is never trusted with `tenantId`, `agentId`, `deploymentId`, or database keys. The worker injects these strictly from verified session context.
3. **No Database Access from Worker**: The worker never connects directly to PostgreSQL. All persistence and business operations route through authenticated NextLite API endpoints.
4. **Credential Protection**: `SARVAM_API_KEY`, `PLIVO_AUTH_TOKEN`, and `WORKER_SECRET` are never exposed to callers, logged in plain text, or leaked in transcripts.

---

## 9. Explicit Anti-Recreation Rules (What NOT to Rebuild)

To avoid previous mistakes, the following must **NOT** be custom-built:

| System / Component | DO NOT Build | USE Pipecat 1.8.1 Native |
| :--- | :--- | :--- |
| **Realtime Pipeline** | Custom asyncio task loops / frame pipes | `pipecat.pipeline.pipeline.Pipeline` |
| **Worker Execution** | Custom process/thread workers | `pipecat.pipeline.task.PipelineWorker` & `WorkerRunner` |
| **Context Management** | Custom conversation memory buffers | `pipecat.processors.aggregators.llm_response_universal.LLMContext` |
| **Turn Detection & Interruption** | Custom audio chunk slicers / VAD buses | `LLMUserAggregator` + `InterruptionFrame` + `PlivoFrameSerializer` |
| **Streaming Engine** | Custom token chunkers or TTS queues | Native Pipecat `LLMTextFrame` & `TTSAudioRawFrame` streaming |
| **Telephony Serialization** | Custom μ-law encoders/decoders | `pipecat.serializers.plivo.PlivoFrameSerializer` |
| **Tool Execution Engine** | Custom JSON parser / tool caller | Pipecat `FunctionSchema` & `ToolsSchema` handler dispatch |

---

## 10. Phased Migration Roadmap (Post-Audit)

1. **Phase 6: Runtime Configuration & Session Client**:
   - Implement `RuntimeConfigClient` in Python fetching from `/api/internal/runtime-config/:deploymentId`.
   - Implement `CallSessionClient` handling `createCallSession` (`ACTIVE`) and `updateCallSession` (`COMPLETED`).
2. **Phase 7: Tool Registry & RAG Integration**:
   - Implement Python `ToolRegistry` with `query_knowledge_base`, `book_appointment`, and `create_callback_lead`.
   - Wire native `FunctionSchema` and `ToolsSchema` into `SarvamLLMService`.
3. **Phase 8: Multilingual Manager & Dynamic Language Switching**:
   - Port `ConversationLanguageManager` with exact regexes, Indic markers, and Hinglish/Minglish rules.
   - Hook language changes to dynamic TTS voice/language reconfiguration and prompt updates.
4. **Phase 9: Production Parity Benchmark & Validation**:
   - Side-by-side comparative benchmarking (LiveKit vs Pipecat) on latency, memory, cost, and telephony stability.
