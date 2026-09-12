# NextLite Voice V3 — Tenant Isolation & Security Boundary Audit

> **Audit Scope**: Authentication, Authorization, Worker Boundaries, and Multi-Tenant Isolation  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Multi-Tier Security Boundary Architecture

```
[Public Internet / Client Browser]
   │
   ▼ (Tier 1: JWT Authentication & Role Verification)
[Express Public & Client Routes: /api/auth/*, /api/client/*, /api/admin/*]
   │  - Tokens signed with HS256 JWT_SECRET
   │  - Roles: ADMIN (global scope), CLIENT_OWNER (tenant write), CLIENT_VIEWER (tenant read-only)
   │  - Enforces requireTenantContext and requireSameTenant
   │
   ▼ (Tier 2: Business Logic & Tenant-Scoped DB Queries)
[NextLite Control Plane Services: appointmentService, leadService, knowledgeService]
   │  - Every SQL query enforces `where: eq(table.tenantId, tenantId)`
   │  - Foreign key validation on referenced entities (agents, callSessions)
   │
   ▼ (Tier 3: Internal Worker Boundary)
[Internal REST Endpoints: /api/internal/*]
   │  - Protected by authenticateWorkerSecret (x-worker-secret or Bearer WORKER_API_SECRET)
   │  - LLM cannot specify tenantId or agentId directly
   │  - TenantId authoritatively derived from deploymentId
   │
   ▼ (Tier 4: Voice Worker Runtime Context)
[LiveKit / Pipecat Worker Process]
   │  - Zero direct database access
   │  - Receives trusted deploymentId and callerPhone from telephony stream
```

---

## 2. Security Tier Details & Verification

### Tier 1: User & Client Authentication
- **Mechanism**: JWT Access Tokens (`15m` TTL) and Refresh Tokens (`7d` TTL) stored in `refresh_tokens` table.
- **Verification Middleware** (`apps/api/src/middleware/auth.ts`):
  - `authenticateToken`: Validates Bearer token header, decodes `userId`, `email`, `role`, and `tenantId`.
  - `requireRole('ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER')`: Blocks unauthorized role execution.
  - `requireTenantContext`: Ensures non-admin requests have a valid `tenantId`.
  - `requireSameTenant`: Prevents a user in Tenant A from supplying `tenantId` of Tenant B in query or body parameters.
  - `requireMutationRole` (`apps/api/src/routes/client.ts`): Blocks `CLIENT_VIEWER` from modifying leads, appointments, or sending WhatsApp messages (returns `403 Forbidden`).

### Tier 2: Internal Worker Authentication
- **Mechanism**: Pre-shared secret header (`x-worker-secret`) or Bearer token (`Authorization: Bearer <secret>`).
- **Verification Middleware** (`apps/api/src/middleware/workerAuth.ts`):
  - Validates provided token against `env.WORKER_API_SECRET` / `env.LIVEKIT_WORKER_SECRET`.
  - Rejects missing or invalid credentials with `401 Unauthorized`.
  - All `/api/internal/*` routes are strictly guarded by this middleware.

### Tier 3: Deployment-Derived Tenant Isolation
- **Problem Prevented**: Malicious LLM hallucination or prompt injection attempting to pass arbitrary `tenantId` or `agentId` to create leads/appointments in another tenant's CRM.
- **Implementation** (`apps/api/src/routes/internal.ts:lines 268–282, 359–373`):
  ```typescript
  if (deploymentId) {
    const runtimeConfig = await runtimeAgentConfigService.resolveRuntimeAgentConfig(deploymentId);
    effectiveTenantId = runtimeConfig.tenant.tenantId;
    effectiveAgentId = runtimeConfig.agent.agentId;
  }
  ```
- **Result**: Even if a compromised LLM attempted to manipulate tool arguments, the backend authoritatively overrides `tenantId` and `agentId` using the cryptographic/database relationship of the validated `deploymentId`.

### Tier 4: Caller Phone Handling & Spoofing Protection
- **Trusted Source**: Telephony ingress (LiveKit SIP participant identity or Plivo stream metadata).
- **Worker Injection** (`apps/livekit-worker/src/main.ts:line 171`, `appointmentTool.ts:line 140`):
  - Injected into tool runtime context as `trustedCallerPhone`.
  - If the caller says "use this number", the LLM passes an empty `customerPhone`, and the tool runtime automatically falls back to `trustedCallerPhone`.
  - If neither is available, the tool explicitly returns an error prompting the caller for their phone number rather than inventing fake data.

---

## 3. Threat Model & Architectural Risk Assessment

| Risk Area | Architectural Defense | Status / Rating |
|---|---|---|
| **IDOR (Cross-Tenant Access)** | Every database query in `client.ts` and domain services filters by `eq(table.tenantId, tenantId)`. | **PROTECTED / LOW RISK** |
| **Client-Controlled Tenant ID** | `resolveTenantId()` in `client.ts` strictly ignores query `tenantId` for non-admin users and binds exclusively to `req.user.tenantId`. | **PROTECTED / LOW RISK** |
| **Worker Direct Database Compromise** | Workers do not have PostgreSQL connection strings or database drivers. | **PROTECTED / ZERO RISK** |
| **Secret Exposure in Prompts / Logs** | Layer A core prompt boundary explicitly forbids prompt exposure; tool results sanitize raw UUIDs and credentials. | **PROTECTED / LOW RISK** |
| **Raw UUID Leakage to Voice Callers** | `getUserSafeDisplayId()` in `packages/shared/src/runtimeConfig.ts` and `PromptCompilerService` enforce that only human-friendly reference IDs (`A-001`) are spoken; database UUIDs are strictly suppressed. | **PROTECTED / LOW RISK** |
| **Unauthenticated Worker Ingress** | `/api/internal/*` strictly requires `WORKER_API_SECRET`. | **PROTECTED / LOW RISK** |
| **Pipecat Telephony Ingress Security** | Plivo WebSockets must validate shared webhook token / secret query parameter before accepting stream. | **ACTION REQUIRED FOR PHASE 6** |
