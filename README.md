# NextLite Voice — Engineering Specification

This repository is the source of truth for building NextLite Voice.

## Product

NextLite Voice is a multi-tenant SaaS platform that deploys AI voice employees for businesses such as hospitals, clinics, coaching institutes, finance/loan companies, automobile businesses, real estate, and other service businesses.

Examples:
- AI Receptionist
- Appointment Booking Agent
- Sales Agent
- Lead Qualification Agent
- Follow-up Agent
- Customer Support Agent

## Core principle

NextLite owns the product/orchestration layer. Third-party services are initially used for telephony, speech recognition, speech synthesis, and LLM inference.

Target variable voice cost:
- Initial target: approximately ₹2–₹3 per connected minute
- Optimize further with volume and engineering
- Never hard-code vendor pricing; keep provider rates configurable and verify before production.

## Stack

- Frontend: React + Vite + TypeScript (`apps/web/`)
- Backend Control Plane: Python FastAPI (`apps/api/app/`)
- Realtime Voice Worker: Python Pipecat (`apps/pipecat-worker/`)
- Database: PostgreSQL + pgvector
- Cache/Session: Redis
- Telephony: Plivo
- STT: Sarvam Saaras v3
- TTS: Sarvam Bulbul v3
- LLM: Sarvam / Gemini (provider abstraction)
- Payments: Cashfree
- Email: Resend
- Auth: Custom JWT + refresh tokens

## Source-of-truth documents

Read these before implementing:
1. `AGENTS.md`
2. `docs/01_PRODUCT_REQUIREMENTS.md`
3. `docs/02_ARCHITECTURE.md`
4. `docs/03_TECH_STACK.md`
5. `docs/04_USER_FLOWS.md`
6. `docs/05_AGENT_SYSTEM.md`
7. `docs/06_VOICE_RUNTIME.md`
8. `docs/07_DATA_MODEL.md`
9. `docs/08_API_CONTRACTS.md`
10. `docs/09_BILLING_DEPLOYMENT.md`
11. `docs/10_ADMIN_CLIENT_WORKSPACE.md`
12. `docs/11_CLIENT_DASHBOARD.md`
13. `docs/12_N8N_INTEGRATION.md`
14. `docs/13_SECURITY.md`
15. `docs/14_TESTING.md`
16. `docs/15_IMPLEMENTATION_PHASES.md`
17. `docs/16_DECISIONS.md`
18. `docs/17_INDEX.md`

## Non-negotiable

Do not invent product behavior, APIs, database fields, workflows, provider capabilities, or pricing when the specification does not define them.

If a requirement is missing, stop and identify the ambiguity rather than silently designing a new behavior.
