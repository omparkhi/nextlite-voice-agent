# Node to Python Migration Master Checklist

**Status:** PHASE 0 COMPLETE — READY FOR PHASE 1  
**Audit Date:** September 2026

---

## Master Migration Checklist

### 1. Database & Schema Parity (20 Tables, 13 Enums)
- [ ] `tenants`
- [ ] `users`
- [ ] `refresh_tokens`
- [ ] `audit_logs`
- [ ] `verification_tokens`
- [ ] `subscriptions`
- [ ] `agent_templates`
- [ ] `agents`
- [ ] `agent_versions`
- [ ] `deployments`
- [ ] `agent_tools`
- [ ] `knowledge_sources`
- [ ] `knowledge_chunks` (pgvector 1024)
- [ ] `config_change_proposals`
- [ ] `call_sessions`
- [ ] `leads`
- [ ] `appointments`
- [ ] `tenant_appointment_counters`
- [ ] `phone_numbers`
- [ ] `follow_ups`

### 2. FastAPI Control Plane Routes (65 Endpoints)
- [ ] Health Check (`/api/health`, `/api/ready`)
- [ ] Auth Routes (`/api/auth/register`, `login`, `refresh`, `logout`, `verify-email`, `forgot-password`, `reset-password`)
- [ ] Internal Routes (`/api/internal/runtime-agent-config`, `call-sessions`, `tools/execute`, `knowledge/retrieve`)
- [ ] Admin Agent Routes (`/api/admin/agents`, versions, deploy, runtime-preview)
- [ ] Admin Knowledge Routes (`/api/admin/knowledge/upload`, sources, delete)
- [ ] Client CRM Routes (`/api/client/dashboard`, calls, leads, appointments, whatsapp)
- [ ] Public Receptionist Routes (`/api/appointments/*`)

### 3. Shared Domain Services
- [ ] Password / Argon2 Hashing & Verification
- [ ] JWT Sign / Verify / Refresh Rotation
- [ ] Prompt Compiler & System Prompt Generation
- [ ] Dynamic Temporal Context & Business Hours Resolver
- [ ] Multilingual Engine & Language Manager
- [ ] Tool Execution Registry (`query_knowledge_base`, `book_appointment`, `create_callback_lead`)
- [ ] UUID Suppression & Safe Display ID Sanitizer
- [ ] pgvector RAG Embedding & Cosine Retrieval

### 4. Pipecat Realtime Worker
- [ ] Retain native `FastAPIWebsocketTransport` & `PlivoFrameSerializer`
- [ ] Direct import of Python Shared Domain Services
- [ ] Monotonic Turn Timing Latches (`turn_timing.py`)
- [ ] Idempotent Session Finalization (`call_session.py`)

### 5. Verification & Acceptance
- [ ] 100% Pytest suite passing (515+ tests migrated/verified)
- [ ] Live PSTN Plivo verification call
- [ ] React UI end-to-end verification
- [ ] Zero-loss regression sign-off