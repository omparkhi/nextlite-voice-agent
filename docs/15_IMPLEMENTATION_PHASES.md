# Phase-Wise Implementation Plan

Do not build the entire product in one pass.

## Phase 0 — Foundation

Build:
- monorepo/project structure
- TypeScript
- environment handling
- PostgreSQL
- Redis
- authentication foundation (custom JWT + refresh tokens)
- tenant model
- simple roles (ADMIN/CLIENT_OWNER/CLIENT_VIEWER)
- logging/error handling
- basic CI checks

Deliverable:
A secure skeleton that can run locally and in staging.

## Phase 1 — Client + Admin SaaS foundation

Build:
- Admin login
- Client creation
- onboarding email (Resend) / verification
- client login
- client dashboard shell
- admin client list
- tenant authorization
- basic subscription records

No realtime voice yet.

## Phase 2 — Agent Builder

Build:
- agent templates
- agent creation
- structured configuration
- agent versions
- business information
- voice/language settings
- instructions
- tools model
- knowledge source model
- generated runtime configuration
- admin agent workspace

## Phase 3 — Knowledge + Agent Testing

Build:
- document upload
- chunking/indexing
- pgvector retrieval
- knowledge attachment
- test conversation interface
- scenario tests
- agent configuration assistant
- version/audit support

## Phase 4 — Realtime Voice MVP

Build:
- Shared Agent Runtime (one runtime, three transports)
- Sarvam STT adapter (Saaras v3)
- Sarvam TTS adapter (Bulbul v3)
- LLM adapter (reuse existing Sarvam adapter)
- Voice session manager
- Audio conversion layer (μ-law ↔ PCM)
- Interruption/barge-in handling
- Web Voice test mode (browser microphone → backend)
- Plivo integration (inbound AND outbound)
- Bidirectional WebSocket audio streaming
- Call lifecycle (inbound and outbound)
- Tool calling framework
- Transcript storage
- Call records
- Cost/usage metering
- Outbound call initiation
- Busy/no-answer/failed call handling
- Human transfer (Plivo Dial XML)

This is the first true voice-agent milestone.

### Three Testing Modes

Mode 1 — Chat Test (existing Phase 3):
Admin types text → Agent Runtime → Sarvam LLM → Text response

Mode 2 — Web Voice Test (NEW):
Browser microphone → WebSocket → Backend → Voice Runtime → Sarvam STT → LLM → Sarvam TTS → Browser playback

Mode 3 — Real Phone Call:
Phone → Plivo → Bidirectional WebSocket → Voice Runtime → Sarvam STT → LLM → Sarvam TTS → Plivo → Phone

## Phase 5 — Business Tools

Build initial tools:
- appointment availability
- appointment booking
- reschedule/cancel
- lead creation
- lead update
- human transfer (Plivo Dial XML)
- CRM integration interface

Use direct backend tools for critical realtime actions.

## Phase 6 — Billing + Deployment

Build:
- plans
- checkout (Cashfree Create Order)
- subscription management (Cashfree Subscriptions)
- payment webhook verification (HMAC-SHA256)
- number method selection
- telephony provisioning/connection (Plivo)
- deployment state machine
- real-call verification
- subscription activation
- retry/failure handling

## Phase 7 — Client Analytics

Build:
- usage
- calls
- duration
- outcomes
- leads
- appointments
- transfers
- plan usage
- billing view

## Phase 8 — n8n Automation

Build:
- post-call events
- CRM sync
- WhatsApp/email
- follow-up automation
- authenticated n8n webhooks

## Phase 9 — Optimization

Measure:
- telephony cost
- STT cost (Sarvam: ₹30/hr)
- TTS characters (Sarvam: ₹30/10K chars)
- LLM tokens
- infrastructure cost
- cost/min
- latency
- call success
- task completion

Optimize toward ₹2–₹3/min initially.

## Phase 10 — Scale

Only after meaningful production usage:
- provider volume pricing
- caching
- model routing
- concurrency optimization
- autoscaling
- selective self-hosting evaluation
- advanced observability

Do not self-host STT/TTS/LLM merely because it sounds cheaper. Compare measured total cost and quality first.
