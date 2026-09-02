# Technology Stack

## Frontend

- React
- Vite
- TypeScript
- React Router for client-side routing
- Modern component/UI system

## Backend

- Node.js
- Express
- TypeScript

## Realtime

- WebSocket-based realtime communication
- Provider-supported audio streaming (Plivo bidirectional WebSocket)
- Voice session manager
- VAD/interruption handling

## AI

- LangChain.js for agent/tool orchestration where it provides value
- LLM provider: Gemini / Sarvam through provider abstraction
- STT: Sarvam Saaras v3 (23 languages, streaming WebSocket, modes: transcribe/translate/verbatim/translit/codemix)
- TTS: Sarvam Bulbul v3 (35+ voices, 11 Indian languages, WebSocket streaming, sub-250ms first-byte)

Do not tightly couple business logic to one model provider. Use provider interfaces/adapters.

## Telephony

- Plivo as the primary telephony provider
- Telephony provider abstraction should exist so another provider can be added later
- Inbound and outbound calls use the SAME voice runtime

## Data

- PostgreSQL as primary database
- pgvector for knowledge retrieval where appropriate
- Redis for realtime/session/cache
- BullMQ for asynchronous jobs when required
- Backblaze B2 (S3-compatible) for object storage — Phase 3 MVP
- Cloudflare R2 (S3-compatible) — future production option

## Automation

- n8n for asynchronous business workflows/integrations

## Payments

- Cashfree as the payment provider
- Accessed through PaymentProvider → CashfreeAdapter abstraction
- Supports: one-time payments (orders), subscriptions (UPI AutoPay, Card SI, e-Mandate, NACH)
- Webhook signature verification: HMAC-SHA256

## Email

- Resend for transactional email delivery
- Accessed through internal EmailService abstraction
- Use cases: onboarding, verification, password reset, notifications

## Authentication

- Custom JWT + refresh tokens
- No external auth platform (Clerk, Supabase Auth, NextAuth, etc.)
- Access token (short-lived) + refresh token (long-lived, stored server-side)
- Password hashing: bcrypt or argon2

## Roles

- Simple enum-based roles for MVP (ADMIN, CLIENT_OWNER, CLIENT_VIEWER)
- No full RBAC system (no roles/permissions tables)

## Deployment

Start simple. A modular application can be deployed on a suitable cloud VM/container platform. Do not introduce Kubernetes until there is a concrete operational need.

## Why not MongoDB as primary DB?

The platform has strongly relational data:
clients, users, agents, phone numbers, calls, usage, subscriptions, payments, appointments, tools and permissions.

PostgreSQL is the primary source of truth. MongoDB is not required for the initial architecture.
