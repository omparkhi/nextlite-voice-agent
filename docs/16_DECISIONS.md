# Architecture Decisions

## ADR-001: Node.js instead of Python

Decision:
Use Node.js + Express + TypeScript for the main application/runtime.

Reason:
The product is heavily realtime/event-driven and the team can use one TypeScript stack across frontend and backend.

## ADR-002: PostgreSQL instead of MongoDB as primary DB

Decision:
PostgreSQL is the source of truth.

Reason:
The product has relational entities, billing, permissions, deployments, usage, calls and business transactions.

## ADR-003: Redis for active call state

Decision:
Use Redis for ephemeral realtime/session/cache data.

Reason:
Fast access and TTL-friendly state.

## ADR-004: LangChain.js

Decision:
Use LangChain.js where it accelerates agent/tool/RAG development.

Constraint:
Do not allow the framework to obscure critical realtime logic. Voice transport and call state remain under NextLite's control.

## ADR-005: n8n outside realtime voice path

Decision:
n8n handles asynchronous business automation.

Reason:
Live voice requires low latency and deterministic control.

## ADR-006: Provider adapters

Decision:
Wrap telephony, STT, TTS and LLM providers behind internal interfaces.

Reason:
Provider prices/capabilities can change and NextLite should not be locked to one vendor.

## ADR-007: Modular monolith first

Decision:
Start as one deployable backend with clean modules.

Reason:
Faster development and lower operational complexity. Extract services only when justified.

## ADR-008: Payment at deployment

Decision:
Collect payment when the agent is ready and the client approves deployment.

Reason:
Better B2B sales flow: demo/build first, payment when client says deploy.

## ADR-009: Structured agent configuration

Decision:
Configuration is structured data; prompts are generated from it.

Reason:
Improves maintainability, UI editing, versioning and AI-assisted configuration.

## ADR-010: Custom JWT + refresh tokens for authentication

Decision:
Custom JWT-based authentication with refresh tokens. No external auth platform.

Status: RESOLVED

Requirements:
- login
- logout/session handling
- email verification
- password reset
- secure password hashing (bcrypt/argon2)
- access token (short-lived)
- refresh token (long-lived, stored server-side)
- server-side authorization

Do not introduce Clerk, Supabase Auth, NextAuth, or another external auth platform unless explicitly approved later.

## ADR-011: Resend for email

Decision:
Use Resend for transactional email delivery.

Status: RESOLVED

Use cases:
- onboarding email
- email verification
- password reset
- important account/deployment notifications

Implementation:
- Internal EmailService abstraction
- Resend as the underlying provider
- No tight coupling to Resend in business logic

## ADR-012: Cashfree for payments

Decision:
Use Cashfree as the payment provider for subscription/deployment billing.

Status: RESOLVED

Requirements:
- accessed through an internal PaymentProvider → CashfreeAdapter pattern
- Do not spread Cashfree-specific logic throughout the application
- Before Phase 6, verify exact API contracts from official documentation

Verified capabilities (from official Cashfree docs, API version 2026-01-01):

### Create Order (one-time checkout)
- POST /orders — creates an order, returns payment_session_id
- Frontend uses payment_session_id to render Cashfree checkout
- Supports: UPI, cards, net banking, wallets
- Webhooks: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK, PAYMENT_USER_DROPPED_WEBHOOK

### Subscriptions (recurring)
- POST /subscriptions — create subscription mandate
- Supports: e-Mandate (net banking/debit/Aadhaar), Physical NACH, UPI AutoPay, Card SI
- Plan management: PERIODIC or ON_DEMAND plans
- Webhooks: SUBSCRIPTION_STATUS_CHANGED, SUBSCRIPTION_AUTH_STATUS, SUBSCRIPTION_PAYMENT_SUCCESS, SUBSCRIPTION_PAYMENT_FAILED, SUBSCRIPTION_PAYMENT_CANCELLED

### Webhook Signature Verification
- Headers: x-webhook-signature, x-webhook-timestamp, x-webhook-version
- Verification: HMAC-SHA256 of (timestamp + rawBody) using merchant secret key
- Must use raw body (not parsed JSON) for signature verification
- SDK available: cashfree-pg (Node.js: `Cashfree.PGVerifyWebhookSignature()`)

### Sandbox/Test
- Sandbox environment: https://sandbox.cashfree.com/pg
- Production: https://api.cashfree.com/pg
- API version header: x-api-version: 2026-01-01

### Environment requirements
- x-client-id and x-client-secret for authentication
- Webhook endpoint must be HTTPS and publicly accessible
- Return 2xx for successful webhook receipt

## ADR-013: Simple roles for MVP

Decision:
Use simple enum-based roles instead of full RBAC for MVP.

Status: RESOLVED

Roles:
- ADMIN — full access to all tenants and resources
- CLIENT_OWNER — full access to own tenant resources
- CLIENT_VIEWER — read-only access to own tenant resources

Do NOT build:
- roles table
- permissions table
- role_permissions
- user_roles

unless explicitly requested later.

Server-side authorization is still mandatory. Tenant ID derived from authenticated context.

## ADR-014: Outbound calling is part of MVP

Decision:
Core outbound calling capability is part of the MVP scope.

Status: RESOLVED

MVP outbound scope:
- manual/basic outbound call initiation
- agent selection
- lead/customer selection
- context passing
- realtime AI conversation (same voice runtime as inbound)
- tools
- transcript
- outcome
- usage/cost metering
- failed/busy/no-answer handling
- human handoff where supported

Post-MVP (deferred):
- advanced campaigns
- predictive dialing
- bulk campaign management
- sophisticated scheduling
- advanced segmentation
- advanced campaign analytics

Architecture:
Inbound and outbound calls converge into the SAME Voice Runtime.

Inbound: Plivo → realtime session → Voice Runtime
Outbound: NextLite Backend → Plivo outbound call → realtime session → SAME Voice Runtime

Do not create two separate voice engines.

## ADR-015: Plivo as primary telephony provider

Decision:
Plivo is the primary telephony provider.

Status: ARCHITECTURE RESOLVED — capability verification documented below.

## ADR-016: Sarvam STT/TTS

Decision:
Use Sarvam for STT and TTS with provider adapter pattern.

Status: ARCHITECTURE RESOLVED — capability verification documented below.
