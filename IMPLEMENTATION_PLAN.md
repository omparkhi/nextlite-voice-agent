# NextLite Voice — MVP Implementation Plan

This document is the implementation plan for building the NextLite Voice MVP. It is a planning document only — it does not override the source-of-truth documents under `docs/`.

---

## 1. Overall Development Strategy

We build phase-by-phase in strict order. Each phase produces a testable, working increment. No phase begins until the previous phase is complete and explicitly authorized by the project owner.

The architecture is a modular monolith — clean internal modules within a single deployable backend — with microservice extraction deferred until scale demands it.

The MVP goal: a working end-to-end pipeline from client creation → agent configuration → live inbound and outbound voice calls → usage tracking → billing, with both dashboards functional.

Post-MVP phases (9–10) handle optimization and scale after real production data exists.

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────┐
│  React + Vite + TypeScript                      │
│  ├── Admin Dashboard                            │
│  └── Client Dashboard                           │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/API
┌──────────────────▼──────────────────────────────┐
│  Node.js + Express + TypeScript (Modular Monolith)│
│  ├── Auth Module (custom JWT + refresh tokens)   │
│  ├── Tenant Module                              │
│  ├── Client Module                              │
│  ├── Agent Module                               │
│  ├── Knowledge Module                           │
│  ├── Voice Runtime Module                       │
│  ├── Deployment Module                          │
│  ├── Billing Module                             │
│  ├── Analytics Module                           │
│  ├── Integration Module (n8n)                   │
│  └── Provider Adapters                          │
│      ├── TelephonyAdapter (Plivo)               │
│      ├── STTAdapter (Sarvam Saaras v3)          │
│      ├── TTSAdapter (Sarvam Bulbul v3)          │
│      ├── LLMAdapter (Gemini/Sarvam)             │
│      ├── PaymentAdapter (Cashfree)              │
│      └── EmailAdapter (Resend)                  │
└────┬──────┬──────┬──────┬──────┬───────────────┘
     │      │      │      │      │
     ▼      ▼      ▼      ▼      ▼
  PostgreSQL Redis BullMQ S3    n8n
  (primary)  (session (jobs)  (storage) (async
  +pgvector)  /cache)          automation)
```

**Realtime voice path (inbound and outbound converge into the same runtime):**
```
Customer → Plivo → Node.js Voice Engine → Sarvam STT → Agent/LLM/Tools → Sarvam TTS → Plivo → Customer
```

n8n is NEVER in the realtime voice path. n8n handles async business automation only.

---

## 3. Phase Dependency Map

```
Phase 0 — Foundation
    │
    ▼
Phase 1 — Client + Admin SaaS Foundation
    │
    ▼
Phase 2 — Agent Builder
    │
    ▼
Phase 3 — Knowledge + Agent Testing
    │
    ▼
Phase 4 — Realtime Voice MVP (inbound + outbound)
    │
    ├──► Phase 5 — Business Tools
    │         │
    │         ▼
    │    Phase 6 — Billing + Deployment
    │         │
    │         ▼
    │    Phase 7 — Client Analytics
    │         │
    │         ▼
    │    Phase 8 — n8n Automation
    │
    ▼
Phase 9 — Optimization (POST-MVP)
    │
    ▼
Phase 10 — Scale (POST-MVP)
```

Phase 4 includes both inbound and outbound calling. Phases 5–8 build on top of the working voice runtime.

---

## 4. Detailed Phase Plans

---

### Phase 0 — Foundation

**Objective:** Establish the project skeleton, core infrastructure, authentication, tenant model, and development tooling so all subsequent phases have a secure, working foundation.

**Why:** Without this, nothing else can be built safely. Multi-tenancy, auth, and database foundations are prerequisites for every feature.

**Backend:**
- Monorepo structure with shared TypeScript config
- Express server with middleware pipeline (CORS, body parsing, request logging, error handling)
- Environment configuration management (dotenv, env validation)
- Structured logging (correlation IDs, request tracing)
- Centralized error handling middleware
- Health check endpoint

**Frontend:**
- React + Vite project initialization with TypeScript
- Basic layout/shell structure
- Environment configuration for API base URL

**Database:**
- PostgreSQL connection with connection pooling
- Redis connection setup
- Initial migration system
- `tenants` table: id, name, slug, status, created_at, updated_at
- `users` table: id, tenant_id (nullable for admin), email, password_hash, role (ADMIN|CLIENT_OWNER|CLIENT_VIEWER), email_verified, created_at, updated_at
- `audit_logs` table: id, tenant_id, actor_id, action, entity_type, entity_id, metadata, created_at

**Security:**
- Password hashing (bcrypt/argon2)
- JWT access token + refresh token foundation
- Tenant ID derived from authenticated context (never from request body)
- Secrets loaded from environment, never hardcoded
- CORS configuration

**Testing:**
- Unit: auth token generation/validation, tenant model creation
- Integration: PostgreSQL connection, Redis connection, migration up/down
- Lint/typecheck pass

**Definition of Done:**
- Server starts and responds to health check
- PostgreSQL migrations run cleanly
- Redis connects
- Auth tokens can be created and validated
- User can be created with tenant association
- Lint and type checks pass

**Explicitly NOT building:**
- Dashboard UI beyond basic shell
- Email sending
- Agent logic
- Voice logic
- Billing logic
- n8n integration

---

### Phase 1 — Client + Admin SaaS Foundation

**Objective:** Enable admin to create clients, clients to verify accounts and log in, and both dashboards to have functional shells with proper authorization.

**Why:** The product requires two authenticated user types (admin and client) with tenant isolation before any feature work can proceed.

**Backend:**
- Auth endpoints: login, logout, email verification, password reset
- Client management endpoints (admin-only): create client, list clients, get client, update client
- Onboarding email flow: system sends verification email via Resend on client creation
- Client endpoints: get current user, account settings
- Tenant authorization middleware: every tenant-scoped request validates tenant_id from auth context
- Role-based access: ADMIN routes require ADMIN role; CLIENT routes require CLIENT_OWNER or CLIENT_VIEWER

**Frontend:**
- Admin Dashboard shell: login, dashboard home, clients list, client detail, navigation
- Client Dashboard shell: login, email verification, dashboard home, account settings
- Auth state management (context/provider)
- Protected route wrappers (admin-only, client-only)

**Database:**
- `subscriptions` table: id, tenant_id, plan_name, status (PENDING/PAYMENT_PENDING/ACTIVE/PAST_DUE/CANCELLED/EXPIRED), started_at, current_period_end, created_at, updated_at

**Integrations:**
- Resend email service integration (EmailService abstraction)

**Security:**
- Auth tokens with expiry and refresh mechanism
- Admin routes require ADMIN role
- Client routes require CLIENT_OWNER or CLIENT_VIEWER role
- All tenant-scoped queries filter by tenant_id from auth context
- Rate limiting on auth endpoints

**Testing:**
- Unit: auth middleware, role checking, tenant scoping
- Integration: full auth flow (create user → verify → login → access protected resource)
- E2E: admin login → create client → client verify → client login

**Definition of Done:**
- Admin can log in and see client list
- Admin can create a client
- Client receives onboarding email with verification link
- Client can verify email
- Client can log in
- Both dashboards show authenticated shells
- Unauthorized access is blocked
- Tenant isolation enforced

**Explicitly NOT building:**
- Agent configuration
- Voice logic
- Billing
- Analytics
- Phone number management

---

### Phase 2 — Agent Builder

**Objective:** Build the structured agent configuration system — templates, agent creation, versioned configuration, and the admin agent workspace — so agents can be fully configured before testing.

**Why:** Agents are the core product. The structured configuration model must be established before knowledge, testing, or voice runtime can be built.

**Backend:**
- Agent CRUD endpoints (admin-only, tenant-scoped)
- Template CRUD endpoints
- Agent versioning (each config change creates immutable `agent_version` record)
- Agent configuration schema:
  - Identity: name, greeting
  - Role: role description
  - Goal: primary objective
  - Voice: voice_id, provider
  - Language: primary language, supported languages
  - Personality: tone, style, formality
  - Business Information: business name, type, hours, location, description
  - Conversation Rules: max_turns, greeting style, fallback behavior
  - Tools: enabled tool list with config
  - Appointment Rules: slot duration, buffer, working hours, booking rules
  - Lead Rules: required fields, qualification criteria
  - Escalation/Handoff Rules: trigger conditions, transfer number, timeout
  - System Instructions: custom instructions text
- Runtime configuration generation service:
  Template + Client config + Business data + Knowledge refs + Tools + Rules → Effective system prompt + tool definitions

**Frontend:**
- Admin Agent Workspace (per client):
  - Overview tab (agent status, version history)
  - Configuration tabs: Identity & Role, Voice & Language, Business Information, Personality & Behavior, Conversation Rules, Tools & Integrations, Appointment Rules, Lead Rules, Escalation Rules, System Instructions
  - Template selection modal
  - Version history viewer
  - "Preview runtime config" viewer

**Database:**
- `agents` table: id, tenant_id, template_id, name, status (DRAFT/READY/LIVE/PAUSED/ARCHIVED), created_at, updated_at
- `agent_versions` table: id, agent_id, version_number, configuration (JSONB), created_by, created_at, notes
- `agent_templates` table: id, name, description, industry, default_configuration (JSONB), is_system, created_at
- `agent_tools` table: id, agent_id, tool_name, tool_config (JSONB), enabled, created_at

**Testing:**
- Unit: configuration schema validation, runtime config generation, template application
- Integration: create agent from template → modify config → generate runtime config → verify output

**Definition of Done:**
- Admin can select a template and create an agent for a client
- Admin can configure all agent sections
- Each save creates a versioned record
- Runtime configuration can be generated and previewed
- Agent status transitions work (DRAFT → READY when config is complete)

**Explicitly NOT building:**
- Knowledge upload/retrieval
- Test conversation interface
- AI configuration assistant
- Voice runtime
- Actual tool execution

---

### Phase 3 — Knowledge + Agent Testing

**Objective:** Enable knowledge document upload, chunking, vector storage, retrieval, and provide a test conversation interface so agents can be validated before going live.

**Why:** Agents need business knowledge to be useful, and admins need to test agents before deployment.

**Backend:**
- Knowledge source CRUD: upload document, list sources, delete source
- Document processing pipeline: file upload to Backblaze B2 (S3-compatible) → text extraction → chunking → embedding generation → store in pgvector
- Knowledge retrieval service: pgvector similarity search (tenant-scoped)
- Test conversation endpoint: admin sends messages to agent config, receives responses
- Scenario test runner: predefined test scenarios with expected behavior checks
- Agent configuration assistant:
  - Receives natural language request
  - LLM interprets against current structured config
  - Returns proposed config changes as structured diff
  - Admin reviews and approves/rejects before apply
  - Changes create a new agent version

**Frontend:**
- Knowledge management tab: upload documents, view/delete sources, chunk preview
- Test conversation panel: chat-like interface, knowledge chunk visibility
- AI Configuration Assistant: chat input, diff display, approve/reject, version creation

**Database:**
- `agent_knowledge_sources` table: id, agent_id, tenant_id, file_name, file_path (S3), file_type, chunk_count, status (PROCESSING/READY/FAILED), created_at
- `knowledge_chunks` table: id, source_id, agent_id, tenant_id, content, embedding (pgvector), chunk_index, metadata (JSONB), created_at
- Enable pgvector extension

**Testing:**
- Unit: chunking logic, embedding storage, retrieval similarity, config assistant logic
- Integration: upload → chunk → embed → retrieve relevant chunks
- Integration: test conversation flow
- Integration: AI config assistant: propose change → diff → approve → new version

**Definition of Done:**
- Admin can upload knowledge documents
- Documents are chunked and embedded in pgvector
- Knowledge retrieval returns relevant chunks
- Admin can test agent via text conversation
- Scenario tests run and report
- AI config assistant proposes structured changes
- Config changes create versioned records

**Explicitly NOT building:**
- Real voice calls
- Plivo integration
- Billing
- n8n automation

---

### Phase 4 — Realtime Voice MVP

**Objective:** Build the complete realtime voice pipeline with three testing modes — Chat Test (existing), Web Voice Test (browser-based), and Real Phone Call (Plivo). All three modes share ONE Agent Runtime. This is the core differentiator of the product.

**Why:** Without live voice calls, the product has no value. The Web Voice test mode allows testing STT/TTS/conversation without Plivo or phone charges.

#### Architecture — ONE Agent Runtime, THREE Transports

```
                    ┌──────────────────────┐
                    │    AGENT RUNTIME     │
                    │                      │
                    │ Agent Config         │
                    │ Conversation State   │
                    │ Knowledge/RAG        │
                    │ LLM (Sarvam)         │
                    │ Tools                │
                    │ Safety Rules         │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
           CHAT TEST       WEB VOICE        PHONE VOICE
           (Phase 3)       (NEW)            (PLIVO)
              │                │                │
            Text            Browser          Telephone
                             Audio             Audio
```

#### Implementation Sequence (Step by Step)

**Step 1 — Voice Runtime Interfaces & Session Model**
Define the core interfaces that all three transports share:
- `VoiceRuntime` interface: `processAudio()`, `processText()`, `getSession()`, `endSession()`
- `VoiceSession` class: session_id, agent_id, tenant_id, transport_type, conversation_history, state, timestamps
- `AudioFormat` types: `mulaw_8k`, `pcm_16k`, `mp3_browser`
- Session state machine: IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING (loop)
- Store sessions in Redis (ephemeral, TTL = max call duration)
- Load agent config from PostgreSQL on session start
- No new database tables needed for sessions (Redis sufficient)

**Step 2 — Audio Conversion Layer**
- μ-law 8kHz → PCM 16kHz conversion (for Plivo → Sarvam STT)
- PCM 16kHz → μ-law 8kHz conversion (for Sarvam TTS → Plivo)
- Browser audio (PCM 16kHz via Web Audio API) → no conversion needed for Web Voice
- Sarvam TTS output (mp3/mulaw) → browser-compatible format (mp3/PCM)
- Use `mu-law` npm package or manual conversion utility
- Test conversion with known audio samples

**Step 3 — Sarvam STT Adapter**
- WebSocket: `wss://api.sarvam.ai/speech-to-text/ws`
- Config: model=saaras:v3, language_code (from agent config), sample_rate=8000 (telephony) or 16000 (web), input_audio_codec=pcm_s16le, high_vad_sensitivity=true, vad_signals=true
- Audio formats supported: WAV, PCM (pcm_s16le, pcm_l16, pcm_raw) only
- IMPORTANT: JS SDK `connect()` does NOT support `mode` parameter — use raw WebSocket with `?mode=` query parameter
- Handle events: speech_start, speech_end, transcript (partial/final)
- Send periodic silent audio as keep-alive (60s idle timeout)
- Timeout handling: connection timeout, speech timeout, silence timeout

**Step 4 — Sarvam TTS Adapter**
- WebSocket: `wss://api.sarvam.ai/text-to-speech/ws`
- Config: model=bulbul:v3, speaker (from agent config voice.voiceId), language_code, speech_sample_rate=8000 (telephony) or 16000 (web), output_audio_codec=mulaw (telephony) or mp3 (web)
- First message must be config type with all parameters
- Send text chunks (under 500 chars for lowest latency)
- Receive audio chunks as base64-encoded data
- Handle completion event (event_type: "final")
- Support flush signal to force immediate processing
- Support ping signal to keep connection alive

**Step 5 — LLM Integration (Reuse Existing)**
- Reuse existing `SarvamLLMAdapter` from `services/llm.ts`
- Reuse existing `KnowledgeService.retrieveRelevant()` for RAG
- Reuse existing system prompt generation from `test-conversation.ts`
- Add voice-specific prompt additions:
  - "Respond in spoken language style"
  - "Keep responses concise (1-2 sentences)"
  - "Ask one question at a time"
  - "Do not use markdown or formatting"
  - "No unnecessary filler words"
- Stream LLM response where supported for lower latency

**Step 6 — Web Voice Transport (Browser → Backend)**
- Transport: WebSocket (best for bidirectional streaming with Node/Express)
- Flow: Browser microphone → Web Audio API (PCM 16kHz) → WebSocket → Backend
- Backend receives PCM audio, sends to STT → LLM → TTS → returns audio to browser
- Browser plays TTS audio via Web Audio API
- Interrupt mechanism: browser detects speech, sends interrupt signal via WebSocket, backend cancels TTS
- Do NOT use WebRTC (complexity not justified for Phase 4 test mode)
- Do NOT expose SARVAM_API_KEY to browser

**Step 7 — Plivo Telephony Adapter**
- Plivo bidirectional WebSocket: `wss://your-domain.com/telephony/stream`
- Stream XML: `<Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">`
- Audio: μ-law 8kHz, base64-encoded, ~20ms frames
- Events received: start, media, dtmf, stop
- Events sent: playAudio, clearAudio, sendDTMF
- Status callbacks: stream connected, stopped, timeout, failed
- Plivo Make Call API for outbound calls
- Answer URL returns Stream XML for both inbound and outbound

**Step 8 — Shared Voice Runtime**
- `VoiceRuntime` class that works identically for all three transports
- On session start: load agent config, initialize conversation history in Redis
- On each user input (text or transcript):
  1. Append to conversation history
  2. Retrieve relevant knowledge chunks from pgvector
  3. Build system prompt (reuse from test-conversation.ts)
  4. Call LLM with tool definitions
  5. Handle tool calls if LLM requests them
  6. Return response text
  7. Convert to speech (if voice mode)
  8. Stream audio to transport
- On interruption: cancel TTS, process new input
- On session end: persist transcript, calculate costs, cleanup Redis

**Step 9 — Interruption / Barge-in**
- STT detects speech during TTS playback (speech_start event while agent is speaking)
- Backend sends clearAudio event to Plivo (stops current playback)
- If LLM response not yet complete: cancel generation (abort controller)
- Start new STT stream from interruption point
- New conversation turn begins
- For Web Voice: browser sends interrupt signal via WebSocket

**Step 10 — Tool Calling Framework**
- Tool registry: tools defined in agent config are registered as callable functions
- For each tool call from LLM:
  1. Validate input against tool schema
  2. Execute tool with tenant context
  3. Return result to LLM
  4. LLM incorporates result into response
- Log all tool calls to call_events table
- Phase 4 includes tool framework; actual business tools (appointment, lead) are Phase 5

**Step 11 — Inbound Calling**
- Plivo number answer_url returns Stream XML
- Accept inbound WebSocket connection
- Validate Plivo webhook signature
- Establish voice session in Redis
- Start Voice Runtime
- On call end: persist transcript, calculate costs

**Step 12 — Outbound Calling**
- Admin initiates outbound call via API endpoint
- POST to Plivo Make Call API (from, to, answer_url)
- Handle call status: ringing, in-progress, completed, failed, busy, no-answer
- On answer, Plivo fetches answer_url → same Stream XML as inbound
- Outbound calls converge into the same Voice Runtime
- Idempotency: prevent duplicate calls with request ID

**Step 13 — Human Transfer**
- When escalation rule triggers or user requests human:
  1. Agent announces transfer to caller
  2. Plivo Dial XML with Number or SIP User
  3. Supports authenticated SIP transfer
  4. Fallback message if transfer fails
  5. Call record marked as transferred
- For Web Voice test: show "Transfer requested — simulated in test mode"

**Step 14 — Call Lifecycle & Persistence**
- `calls` table: id, tenant_id, agent_id, phone_number, direction (inbound/outbound/web_test), status, started_at, connected_at, ended_at, duration_seconds, transport_type
- `call_events` table: id, call_id, event_type, payload (JSONB), timestamp
- `transcripts` table: id, call_id, tenant_id, agent_id, messages (JSONB array of {role, content, timestamp}), created_at
- Handle Plivo status callbacks (call-status webhook)
- Write-through to PostgreSQL on call end

**Step 15 — Failure Handling**
- STT timeout: request repeat from caller, or transfer to human
- STT disconnect: attempt reconnect, fallback to text-based transfer message
- LLM timeout: agent apologizes, offers to transfer to human
- LLM provider error: graceful fallback response, log error
- TTS timeout: fallback to text-based transfer message
- TTS provider error: log error, attempt fallback voice
- Plivo disconnect: log event, cleanup session
- WebSocket disconnect: cleanup session, log event
- Database failure: log to file, attempt retry
- Redis failure: fallback to in-memory state (degraded mode)
- Malformed audio: skip frame, log warning
- Empty speech: prompt user to speak again
- Long silence: timeout after configurable seconds, end call
- Unsupported language: inform caller, offer transfer

**Step 16 — Cost Metering**
- Track per-call: telephony_cost, stt_seconds, tts_characters, llm_input_tokens, llm_output_tokens
- After call ends, aggregate costs:
  - Plivo: duration × per-minute rate (from config)
  - Sarvam STT: duration × rate (₹30/hr = ₹0.50/min)
  - Sarvam TTS: character count × rate (₹30/10K chars)
  - LLM: input_tokens × input_rate + output_tokens × output_rate
- Provider pricing stored in configuration (not hardcoded)
- Write to `usage_records` table

**Step 17 — Frontend Updates**
- Update AgentDetail.tsx Test tab with three sub-modes:
  ```
  [ Chat ] [ Web Voice ] [ Real Call ]
  ```
- Chat: existing Phase 3 chat (no changes)
- Web Voice:
  - "Start Voice Test" button
  - Microphone permission request
  - Connection status indicator
  - Speaking/listening indicator
  - Mute button
  - End test button
  - Real-time transcript display
  - Latency/status information
  - Error state display
- Real Call:
  - Phone number input
  - Call button
  - Call status display
  - Connection status
  - End call button
  - Basic call result

**Step 18 — API Endpoints**

Web Voice test:
- POST /api/admin/clients/:clientId/agents/:agentId/voice-test/start → creates session, returns session_id + WebSocket URL
- WebSocket /api/admin/.../voice-test/stream → bidirectional audio streaming

Real call:
- POST /api/admin/clients/:clientId/agents/:agentId/calls/outbound → initiates outbound call
- GET /api/admin/.../calls/:callId → get call status/details
- POST /api/admin/.../calls/:callId/end → end call

Plivo telephony:
- POST /api/telephony/answer → returns Stream XML for inbound calls
- WebSocket /api/telephony/stream → bidirectional audio streaming from Plivo
- POST /api/telephony/status → call status callback
- POST /api/telephony/events → stream status callback

**Step 19 — Environment Variables**

Backend-only (never exposed to frontend):
```
SARVAM_API_KEY=your-sarvam-api-key
PLIVO_AUTH_ID=your-plivo-auth-id
PLIVO_AUTH_TOKEN=your-plivo-auth-token
PLIVO_FROM_NUMBER=+91XXXXXXXXXX
PUBLIC_API_URL=https://your-domain.com
```

Frontend-safe:
```
VITE_API_URL=http://localhost:3001
```

**Step 20 — Dependencies**

New npm packages (backend only):
- `ws` — WebSocket client for Sarvam STT/TTS and Plivo connections
- `mu-law` — μ-law ↔ PCM audio conversion (or implement manually)

No new frontend dependencies required (native WebSocket + Web Audio API).

**Testing:**
- Unit: audio conversion (μ-law ↔ PCM), session state machine, interruption state, language configuration, provider error handling, timeout handling, cost calculation
- Integration: STT connection (mocked), TTS connection (mocked), LLM connection, Web Voice transport, Plivo streaming
- Realtime: full Web Voice test conversation, full inbound call lifecycle, full outbound call lifecycle
- Realtime: interruption during TTS playback, tool call during conversation, provider error handling, call timeout, human transfer, busy/no-answer handling

**Definition of Done:**
- Chat test (Phase 3) still works unchanged
- Web Voice test: browser microphone → STT → LLM → TTS → browser playback works
- Web Voice test: interruptions work
- Web Voice test: language switching works
- Real Phone: inbound call to Plivo number connects to voice engine
- Real Phone: outbound call from backend to customer connects to same voice engine
- Audio streams bidirectionally for both Web Voice and Real Phone
- User speech is transcribed via Sarvam STT
- LLM generates contextual responses using agent config + knowledge
- TTS audio plays back to caller/browser
- Interruptions are handled gracefully
- Tool calling framework executes during conversation
- Call records, events, and transcripts are persisted
- Cost metering captures all provider usage
- Human transfer works when configured
- Admin can test via all three modes
- Busy/no-answer/failed calls are handled

**Explicitly NOT building:**
- Full business tools (Phase 5 — appointment, lead, etc.)
- Billing/payment (Phase 6)
- n8n automation (Phase 8)
- Client dashboard analytics (Phase 7)
- Advanced outbound campaigns
- Recording storage (transcripts only)
- Multi-language optimization beyond configuration

---

### Phase 5 — Business Tools

**Objective:** Implement the actual business tools that agents call during conversations — appointment management, lead creation, and human transfer with proper tenant-scoped execution.

**Why:** Voice calls without business actions are just chatbots. Tools make agents useful employees.

**Backend:**
- Tool execution framework with typed schemas, tenant context, timeout, error handling, logging
- Appointment tools: checkAvailability, book, reschedule, cancel
- Lead tools: create, update
- Transfer tool: transferCall (Plivo Dial XML)
- CRM integration interface (abstract, for future n8n integration)

**Database:**
- `appointments` table: id, tenant_id, agent_id, call_id, customer_name, customer_phone, date, time, duration, status, notes, metadata (JSONB), created_at, updated_at

**Testing:**
- Unit: tool schema validation, appointment logic, lead creation
- Integration: tool execution within voice call context
- E2E: voice call → appointment booked → record in database

**Definition of Done:**
- Agent can check availability, book, reschedule, cancel appointments
- Agent can create and update leads
- Agent can transfer to human
- All tool calls logged to call_events
- All records scoped to tenant

---

### Phase 6 — Billing + Deployment

**Objective:** Implement plan selection, payment processing via Cashfree, telephony number provisioning via Plivo, deployment state machine, and subscription activation.

**Why:** Without billing and deployment, the agent can be configured and tested but never goes live with a real phone number.

**Backend:**
- Plan management (plans stored in DB)
- Checkout flow: Cashfree Create Order API → payment_session_id → frontend renders checkout
- Subscription management: Cashfree Subscriptions API for recurring billing
- Payment webhook verification: HMAC-SHA256 (x-webhook-signature, x-webhook-timestamp, raw body)
- Number method selection: new number / existing number (if supported) / call forwarding
- Telephony provisioning: Plivo number rental (requires KYC compliance)
- Deployment state machine:
  ```
  PAYMENT_SUCCESS → DEPLOYING → VERIFYING → ACTIVE
                                        ↘ FAILED → retry
  ```
- Deployment verification: system-initiated test call
- Subscription lifecycle: PENDING → PAYMENT_PENDING → PAYMENT_SUCCESS → ACTIVE

**Pre-implementation verification (sandbox):**
- Cashfree recurring monthly subscription flow
- Cashfree webhook verification
- Subscription lifecycle
- Payment failure/retry behavior
- Plivo India number provisioning for actual account

**Database:**
- `phone_numbers` table: id, tenant_id, agent_id, phone_number, provider, number_type, status, provisioned_at, created_at
- `deployments` table: id, tenant_id, agent_id, phone_number_id, subscription_id, status, deployment_method, created_at, updated_at
- `payments` table: id, tenant_id, subscription_id, amount, currency, provider, provider_transaction_id, status, webhook_received_at, created_at
- `invoices` table: id, tenant_id, subscription_id, amount, period_start, period_end, status, created_at

**Testing:**
- Unit: deployment state machine, plan logic
- Integration: Cashfree webhook processing (sandbox), Plivo provisioning (sandbox)
- Integration: full deployment flow — payment → provision → verify → active

**Definition of Done:**
- Client can select plan and number method
- Cashfree checkout works
- Payment webhook verifies and updates subscription
- Telephony number is provisioned
- Deployment goes through state machine
- Subscription becomes ACTIVE only after webhook verification
- Agent becomes LIVE only after deployment verification
- Failed deployments are recorded and retryable

---

### Phase 7 — Client Analytics

**Objective:** Build analytics, usage tracking, and reporting in the client dashboard.

**Backend:**
- Analytics aggregation endpoints (tenant-scoped)
- Usage tracking (Redis counters + PostgreSQL aggregation)
- Billing summary endpoints

**Frontend:**
- Client Dashboard analytics: call volume, duration, outcomes, leads, appointments, usage vs plan
- Client Dashboard billing: current plan, payment history

**Testing:**
- Unit: aggregation logic, usage calculation
- Integration: analytics endpoints return correct scoped data

**Definition of Done:**
- Client can view call analytics, leads, appointments metrics, usage vs plan, payment history

---

### Phase 8 — n8n Automation

**Objective:** Integrate n8n for asynchronous post-call business automation.

**Backend:**
- Event publishing system (BullMQ)
- n8n webhook endpoints (authenticated, tenant-scoped)
- Post-call workflows: CRM sync, notifications, follow-ups

**Database:**
- `integrations` table: id, tenant_id, type, config (JSONB), status, created_at

**Testing:**
- Integration: event → n8n webhook delivery

**Definition of Done:**
- Post-call events trigger n8n webhooks
- Basic CRM sync workflow functional

---

### Phase 9 — Optimization (POST-MVP)

**Objective:** Measure and optimize toward ₹2–3/min target.

**Work:**
- Detailed cost breakdown per call
- Provider rate comparison
- Latency profiling (STT, LLM, TTS, end-to-end)
- LLM model selection optimization
- Caching for common knowledge retrievals
- Concurrent call optimization
- Prompt engineering for token efficiency
- Call success rate improvement

---

### Phase 10 — Scale (POST-MVP)

**Objective:** Handle growth — more clients, more concurrent calls, higher reliability.

**Work (only as needed):**
- Provider volume pricing
- Infrastructure autoscaling
- Service extraction (if monolith becomes a bottleneck)
- Database read replicas
- Advanced observability

---

## 5. MVP Boundary

**IN MVP (Phases 0–8):**
- Admin and client authentication (custom JWT)
- Client creation and onboarding (Resend email)
- Agent template system
- Structured agent configuration (all sections)
- Agent versioning
- Knowledge upload, chunking, and retrieval (pgvector)
- AI configuration assistant
- Test conversation interface
- Realtime inbound voice calls (Plivo → STT → LLM → TTS → Plivo)
- Realtime outbound voice calls (same voice runtime)
- Interruption/barge-in handling
- Tool calling (appointments, leads, transfer)
- Call records, transcripts, events
- Cost metering (per-provider breakdown)
- Billing and deployment (Cashfree, Plivo provisioning, state machine)
- Client analytics (calls, usage, outcomes, billing view)
- n8n async automation

**NOT IN MVP:**
- Outbound campaigns (predictive dialing, bulk, scheduling, segmentation)
- Self-hosted STT/TTS/LLM
- Multi-language optimization
- Sentiment analysis
- Call recordings (transcripts only)
- Client self-service agent configuration
- Complex billing (proration, upgrades, multi-plan)
- Industry-specific analytics
- Custom report generation/export
- Advanced observability
- Kubernetes/microservices
- Mobile apps
- WebRTC browser calls

---

## 6. Realtime Voice Implementation Plan

### Inbound Flow

```
Customer dials Plivo number
    │
    ▼
Plivo sends HTTP request to answer_url
    │
    ▼
answer_url returns Stream XML:
<Response>
  <Stream bidirectional="true" keepCallAlive="true">
    wss://voice.nextlite.ai/stream
  </Stream>
</Response>
    │
    ▼
Plivo opens WebSocket to voice engine
    │
    ▼
Voice engine receives 'start' event (call metadata)
    │
    ▼
Voice engine creates VoiceSession in Redis
    │
    ▼
Plivo streams 'media' events (base64 μ-law 8kHz audio, ~20ms frames)
    │
    ▼
Voice engine converts μ-law → PCM
    │
    ▼
Voice engine sends PCM to Sarvam STT WebSocket
    │
    ▼
Sarvam STT returns transcript (partial/final)
    │
    ▼
On final transcript: agent runtime processes utterance
    │
    ├── Retrieve knowledge from pgvector
    ├── Build LLM context
    ├── Call LLM with tools
    ├── Handle tool calls
    └── Return final response text
    │
    ▼
Sarvam TTS converts text → μ-law audio (WebSocket streaming)
    │
    ▼
Voice engine sends playAudio events to Plivo WebSocket
    │
    ▼
Plivo plays audio to caller
    │
    ▼
If user interrupts (speech_start during TTS):
  ├── Send clearAudio to Plivo
  ├── Cancel TTS/LLM
  └── Start new STT stream
```

### Outbound Flow

```
Admin initiates outbound call
    │
    ▼
Backend calls Plivo Make Call API:
POST /v1/Account/{auth_id}/Call/
{
  from: "+91XXXXXXXXXX",  // Plivo-rented number
  to: "+91XXXXXXXXXX",    // customer/lead number
  answer_url: "https://voice.nextlite.ai/answer?outbound=true&lead_id=xxx&agent_id=xxx"
}
    │
    ▼
Plivo dials the customer
    │
    ├── No answer → Plivo callback: CallStatus=no-answer
    ├── Busy → Plivo callback: CallStatus=busy
    └── Answered → Plivo fetches answer_url
    │
    ▼
answer_url returns same Stream XML as inbound
    │
    ▼
From here, SAME Voice Runtime as inbound:
Plivo WebSocket → STT → Agent/LLM/Tools → TTS → Plivo
```

### Voice Session Manager

```
VoiceSession {
  callId: string
  tenantId: string
  agentId: string
  direction: "inbound" | "outbound"
  language: string
  conversationHistory: Message[]
  currentState: "listening" | "thinking" | "speaking" | "tool_calling"
  pendingToolOps: ToolOperation[]
  outboundContext?: { leadId, customerInfo }
  plivoCallUuid: string
  plivoWebSocket: WebSocket
  sttWebSocket: WebSocket
  ttsWebSocket: WebSocket
}
```

### Audio Conversion

```
Plivo → Voice Engine:  μ-law 8kHz (base64)
    ↓ decode base64
    ↓ μ-law → PCM (linear16) conversion
Voice Engine → Sarvam STT:  PCM 8kHz

Sarvam TTS → Voice Engine:  mulaw 8kHz
    ↓ encode base64
Voice Engine → Plivo:  playAudio event (mulaw 8kHz)
```

---

## 7. Agent Runtime Implementation Plan

### Runtime Configuration Generation

```
Template (base config)
    +
Client-specific overrides (identity, voice, language)
    +
Business Information (name, hours, location, services)
    +
Knowledge (retrieved at runtime via pgvector)
    +
Tools (enabled tool definitions)
    +
Rules (conversation, appointment, lead, escalation)
    +
System Instructions (custom text)
    =
Effective System Prompt + Tool Definitions
```

### AI Configuration Assistant

1. Admin types: "Make the agent ask one question at a time"
2. Backend receives request with current agent config
3. LLM call: "Given this structured agent configuration, propose changes to achieve: [request]"
4. LLM returns structured JSON diff (which fields to change, old value, new value)
5. Frontend displays proposed changes
6. Admin reviews → approves or rejects
7. On approval: apply changes → create new agent_version

Guardrails:
- Only modify fields relevant to the request
- Never delete unrelated configuration
- Always create a version (never overwrite in-place)
- Log in audit_logs

---

## 8. Database Implementation Plan

### Entity Relationships

```
tenants ─┬─ users (role: enum ADMIN|CLIENT_OWNER|CLIENT_VIEWER)
         │
         ├─ agents ──── agent_versions
         │    │
         │    ├─ agent_knowledge_sources ──── knowledge_chunks (pgvector)
         │    │
         │    ├─ agent_tools
         │    │
         │    ├─ phone_numbers
         │    │
         │    ├─ deployments ──── subscriptions ──── payments ──── invoices
         │    │
         │    ├─ calls ──── call_events
         │    │    │
         │    │    └─ transcripts
         │    │
         │    ├─ leads
         │    │
         │    └─ appointments
         │
         ├─ integrations
         │
         └─ audit_logs
```

### Durable vs. Ephemeral State

**PostgreSQL (durable):**
- All business entities (tenants, users, agents, deployments, subscriptions, payments, calls, transcripts, leads, appointments)
- Agent configuration versions
- Knowledge chunks with embeddings
- Audit logs

**Redis (ephemeral):**
- Active call session state
- Conversation history during call
- Usage counters (periodic flush to PostgreSQL)
- Temporary caching

### Tables Deferred Post-MVP

- customer_contacts — agents manage callers transiently
- call_recordings — transcripts sufficient
- analytics_aggregates — compute on-the-fly

---

## 9. Deployment + Billing Plan

### State Machine

```
TENANT: Created → Active

SUBSCRIPTION: PENDING → PAYMENT_PENDING → PAYMENT_SUCCESS → ACTIVE → PAST_DUE → CANCELLED
                                            ↓ (fail)
                                        (stays, retry)

DEPLOYMENT: NOT_DEPLOYED → PAYMENT_PENDING → PAYMENT_SUCCESS → DEPLOYING → VERIFYING → ACTIVE
                                                  ↓                ↓
                                              (stays)          FAILED → retry
```

### Payment Flow

1. Agent is READY
2. Client approves deployment
3. Client selects plan
4. Client selects number method
5. Backend creates Cashfree order → returns payment_session_id
6. Frontend renders Cashfree checkout
7. Client completes payment
8. Cashfree sends webhook to NextLite
9. Webhook handler:
   a. Verify HMAC-SHA256 signature
   b. Validate payment status
   c. Update payments table (SUCCESS)
   d. Update subscriptions table (PAYMENT_SUCCESS)
   e. Update deployments table (PAYMENT_SUCCESS → DEPLOYING)
   f. Trigger telephony provisioning (BullMQ job)
10. Telephony provisioning:
    a. Provision Plivo number (requires KYC compliance)
    b. Update phone_numbers table
    c. Update deployments table (DEPLOYING → VERIFYING)
11. Verification:
    a. System-initiated test call
    b. Verify agent responds
    c. Update deployments (VERIFYING → ACTIVE)
    d. Update agents (READY → LIVE)
    e. Update subscriptions (ACTIVE)

---

## 10. Testing Strategy

- **Unit:** auth, config validation, state machines, cost calculation, audio conversion
- **Integration:** DB, Redis, provider adapters (mocked), webhooks
- **Realtime:** call lifecycle, interruption, tools, errors, transfer
- **E2E:** create client → configure agent → test → deploy → payment → live call → analytics
- **AI Quality:** scenario test sets for normal inquiry, interruption, appointment booking, escalation, etc.

---

## 11. Security Strategy

- Custom JWT + refresh token auth
- Simple roles: ADMIN, CLIENT_OWNER, CLIENT_VIEWER
- Tenant ID from auth context, never from request body
- Webhook signature verification (Plivo, Cashfree)
- Secrets in environment variables
- Audit logging for config/deployment/billing changes
- No secrets in logs

---

## 12. Provider Verification Gates

### Before Phase 4

Verify experimentally (not assumed):
1. Sarvam STT WebSocket connection protocol with Node.js
2. Sarvam TTS WebSocket connection protocol with Node.js
3. Audio chunk format and framing
4. Plivo μ-law 8kHz → Sarvam PCM conversion
5. Sarvam TTS output → Plivo μ-law playback
6. End-to-end latency
7. Interruption/barge-in behavior

### Before Phase 6

Verify in sandbox:
1. Cashfree recurring monthly subscription flow
2. Cashfree webhook verification
3. Subscription lifecycle
4. Payment failure/retry behavior
5. Plivo India number provisioning
6. Existing-number connection/porting options
7. India-specific compliance requirements

---

## 13. Recommended Coding Order

| Step | Phase | Gate |
|------|-------|------|
| 1 | Phase 0: Foundation | None |
| 2 | Phase 1: Client + Admin | None |
| 3 | Phase 2: Agent Builder | None |
| 4 | Phase 3: Knowledge + Testing | None |
| 5 | Phase 4: Realtime Voice | Provider compatibility test first |
| 6 | Phase 5: Business Tools | Phase 4 complete |
| 7 | Phase 6: Billing + Deployment | Cashfree sandbox verification |
| 8 | Phase 7: Client Analytics | Phase 6 complete |
| 9 | Phase 8: n8n Automation | Phase 5 complete |
| 10 | Phase 9: Optimization | Post-MVP |
| 11 | Phase 10: Scale | Post-MVP |

---

**PLAN COMPLETE. Awaiting authorization to begin Phase 0.**
