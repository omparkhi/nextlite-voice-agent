# Security Architecture Forensic Parity

**Audit Date:** September 2026

---

## 1. Multi-Tenant Isolation Enforcement

1. **Database Partitioning by Tenant:**
   - Every tenant-scoped entity (`users`, `agents`, `agent_versions`, `deployments`, `knowledge_sources`, `knowledge_chunks`, `call_sessions`, `leads`, `appointments`, `phone_numbers`) strictly contains a non-nullable `tenant_id` foreign key referencing `tenants.id`.
2. **Control Plane Middleware:**
   - `authMiddleware` extracts `tenantId` and `role` from verified JWT.
   - All queries in FastAPI repositories append `WHERE tenant_id = :tenant_id`.
3. **Internal Worker Security:**
   - Worker API calls require `Authorization: Bearer <INTERNAL_WORKER_SECRET>`.
   - Worker passes `deploymentId`; the backend resolves `tenantId` server-side and enforces tenant constraints on all tool mutations.

---

## 2. Authentication & Credential Handling

- **Password Hashing:** Argon2id with 64MB memory cost, 3 iterations, 4 parallelism.
- **JWT Lifespan:** Access Token: 15 minutes; Refresh Token: 7 days.
- **Refresh Token Rotation:** Every refresh invalidates previous token and issues a new cryptographic pair.
- **Cookies:** `httpOnly: true`, `secure: true` (in production), `sameSite: 'strict'`.

---

## 3. PII & Voice Data Safety

- **UUID Suppression:** Under no circumstances are database UUIDs sent to TTS or caller.
- **Telephone Caller Context:** Real caller number is normalized to E.164 and sanitized.
- **Logging Sanitization:** Authorization headers, passwords, and sensitive database connection strings are masked in Loguru/Pino logs.