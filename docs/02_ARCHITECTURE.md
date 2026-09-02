# System Architecture

## Three Testing Modes (Shared Agent Runtime)

```text
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
           (Phase 3)       (Phase 4)        (Phase 4)
              │                │                │
            Text            Browser          Telephone
                             Audio             Audio
```

## High-level architecture

```text
Customer (Inbound)              Customer/Lead (Outbound)
   |                                ^
   v                                |
Plivo Telephony                Plivo Telephony
   |                                ^
   | realtime audio/events          | same realtime path
   v                                |
Node.js + Express + TypeScript
Realtime Voice Engine
   |
   +-- WebSocket/audio streaming
   +-- call/session manager
   +-- VAD/interruption handling
   +-- runtime state
   |
   v
Agent Runtime / LangChain.js
   |
   +-- LLM
   +-- tool calling
   +-- memory/state
   +-- RAG
   |
   +------------------+
   |                  |
   v                  v
Sarvam STT          Business Tools
   |                  |
   |             +----+----+-----+
   |             |    |    |     |
   |            DB   CRM Calendar n8n
   |
   v
Sarvam TTS
   |
   v
Plivo
   |
   v
Customer
```

## Application architecture

```text
React + Vite + TypeScript
        |
        v
Node.js + Express + TypeScript
        |
        +---- PostgreSQL
        |       +-- pgvector
        |
        +---- Redis
        |
        +---- BullMQ (background jobs)
        |
        +---- Object Storage (Backblaze B2 — S3-compatible, Phase 3 MVP)
        |     Future: Cloudflare R2
        |
        +---- n8n integrations (async only)
        |
        +---- Provider Adapters
        |       +-- PlivoAdapter (telephony)
        |       +-- SarvamSTTAdapter
        |       +-- SarvamTTSAdapter
        |       +-- LLMAdapter (Gemini/Sarvam)
        |       +-- CashfreeAdapter (payments)
        |       +-- ResendAdapter (email)
        |
        +---- Auth Module (custom JWT + refresh tokens)
        |
        +---- Role System (ADMIN/CLIENT_OWNER/CLIENT_VIEWER)
```

## Separation of responsibilities

### Voice layer
Responsible for:
- telephony events (Plivo webhooks)
- audio streaming (Plivo bidirectional WebSocket)
- low-latency turn handling
- interruption/barge-in (clearAudio event)
- call lifecycle
- session state (Redis)
- inbound AND outbound calls (same runtime)

### Agent layer
Responsible for:
- intent/conversation reasoning
- tools
- knowledge retrieval (pgvector)
- structured outputs
- business rules

### Business layer
Responsible for:
- appointments
- leads
- customer data
- CRM actions
- subscriptions (Cashfree)
- usage
- tenant authorization

### Automation layer
n8n handles (asynchronous only, NOT in realtime voice path):
- asynchronous integrations
- notifications
- CRM synchronization
- WhatsApp/email workflows
- post-call workflows

## Important

Do not place n8n between live audio, STT, LLM and TTS.

Do not turn the MVP into many independent microservices. Start as a modular monolith with clear internal modules. Extract services only when scale or operational needs justify it.

Inbound and outbound calls MUST use the same Voice Runtime. Do not create two separate voice engines.
