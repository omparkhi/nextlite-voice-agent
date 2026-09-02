# AGENTS.md — Instructions for OpenCode

You are implementing NextLite Voice. Treat this repository specification as the product contract.

## 1. Before coding

Always inspect:
- `README.md`
- relevant files under `docs/`
- existing code
- existing database/schema/migrations
- existing environment configuration

Do not assume that a feature exists because it is mentioned in a future phase.

## 2. Development philosophy

Build phase-by-phase. Do not implement future phases early unless explicitly requested.

Prefer:
- simple architecture
- modular services
- TypeScript
- explicit types
- validation
- small changes
- migrations
- tests
- clear error handling

Avoid:
- premature microservices
- unnecessary abstractions
- Kubernetes
- self-hosting STT/TTS/LLM models in MVP
- putting n8n in the realtime audio path
- making MongoDB the primary database
- giant unstructured prompts
- hard-coded provider prices
- fake/mock production behavior disguised as real functionality

## 3. Realtime rule

The live voice path must be optimized for low latency.

Preferred path:
Plivo → Node.js realtime voice engine → STT → agent/LLM/tool layer → TTS → Plivo.

n8n is NOT part of the realtime voice loop.

n8n is for asynchronous business automation/integrations.

Inbound and outbound calls use the SAME voice runtime.

## 4. AI agent rule

Agent configuration is structured data first:
- identity
- role
- language
- voice
- business information
- knowledge
- goals
- conversation rules
- tools
- appointment rules
- escalation rules
- system instructions

A runtime prompt/configuration is generated from structured configuration.

Do not require admins to maintain one giant prompt manually.

## 5. Multi-tenancy

Every client-owned resource must be tenant-scoped. Never allow cross-client access.

## 6. Payment/deployment rule

Client payment occurs at deployment approval.

Required lifecycle:
PENDING → PAYMENT_PENDING → PAYMENT_SUCCESS → DEPLOYING → ACTIVE/LIVE

Do not mark a subscription active merely because the frontend says payment succeeded. Use a verified payment webhook from Cashfree.

## 7. UI rule

There are two dashboards:
- Client Dashboard: simple business-facing experience
- NextLite Admin Dashboard: full technical agent-building/deployment experience

Do not expose the full technical builder to clients in the initial product.

## 8. Authentication

Custom JWT + refresh tokens. No external auth platform.

Roles: ADMIN, CLIENT_OWNER, CLIENT_VIEWER (simple enum-based).

## 9. Providers

Telephony: Plivo
STT: Sarvam Saaras v3
TTS: Sarvam Bulbul v3
Payments: Cashfree
Email: Resend
LLM: Gemini / Sarvam through provider abstraction

All providers accessed through clean adapter interfaces.

## 10. When uncertain

Do not hallucinate.

Write down the uncertainty and ask for clarification or use the relevant specification. If implementation can safely proceed without choosing a product behavior, isolate the decision behind a configuration/interface.

## 11. Definition of done

A feature is not done unless:
- code compiles
- lint/type checks pass
- relevant tests pass
- migrations are included when needed
- error states are handled
- tenant authorization is enforced
- documentation is updated if behavior changed
