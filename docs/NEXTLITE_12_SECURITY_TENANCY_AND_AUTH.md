# NextLite Voice V3 — Security, Tenancy & Authentication Architecture
## Document 12: Multi-Tier Isolation, Authentication & Threat Assessment

> **Document Type**: Security Architecture & Multi-Tenant Boundary Audit  
> **Status**: Verified from Implementation (Read-Only)  
> **Auth Middleware**: `apps/api/src/middleware/auth.ts`, `workerAuth.ts`  
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

## 2. Security Tier Specifications

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
- **Result**: Even if a compromised LLM attempted to manipulate tool arguments, the backend authoritatively overrides `tenantId` and `agentId` using the database relationship of the validated `deploymentId`.

### Tier 4: Caller Phone Handling & Spoofing Protection
- **Trusted Source**: Telephony ingress (LiveKit SIP participant identity or Plivo stream metadata).
- **Worker Injection** (`apps/livekit-worker/src/main.ts:line 171`, `appointmentTool.ts:line 140`):
  - Injected into tool runtime context as `trustedCallerPhone`.
  - If the caller says "use this number", the LLM passes an empty `customerPhone`, and the tool runtime automatically falls back to `trustedCallerPhone`.
  - If neither is available, the tool explicitly returns an error prompting the caller for their phone number rather than inventing fake data.

---

## 3. Threat Model & Security Vulnerability Assessment

| Security Dimension | Threat Description | Architectural Defense | Rating |
|---|---|---|---|
| **IDOR (Insecure Direct Object Reference)** | Client attempts to query/modify calls, leads, or appointments belonging to another tenant. | Every database query in `client.ts` and domain services filters by `eq(table.tenantId, tenantId)`. | **LOW RISK (PROTECTED)** |
| **Client-Controlled Tenant ID Injection** | Attacker passes `?tenantId=victim-uuid` in client query parameters. | `resolveTenantId()` in `client.ts` strictly ignores query `tenantId` for non-admin users and binds exclusively to `req.user.tenantId`. | **LOW RISK (PROTECTED)** |
| **Worker Database Compromise** | Attacker breaches voice worker process and attempts to steal database records. | Workers do not have PostgreSQL connection strings, drivers, or credentials. | **ZERO RISK (PROTECTED)** |
| **Secret Exposure in Prompts / Logs** | Attacker asks LLM for system instructions or credentials. | Layer A core prompt boundary explicitly forbids prompt exposure; tool results sanitize raw UUIDs and credentials. | **LOW RISK (PROTECTED)** |
| **Raw UUID Leakage to Voice Callers** | LLM pronounces internal 36-character database UUIDs during speech calls. | `getUserSafeDisplayId()` in `packages/shared/src/runtimeConfig.ts` and `PromptCompilerService` enforce that only human-friendly reference IDs (`A-001`) are spoken; raw UUIDs are strictly suppressed. | **LOW RISK (PROTECTED)** |
| **Unauthenticated Worker Ingress** | Malicious actor sends fake tool calls or config queries to internal APIs. | `/api/internal/*` strictly requires `WORKER_API_SECRET`. | **LOW RISK (PROTECTED)** |
| **Pipecat Telephony Ingress Security** | Malicious caller opens unauthorized WebSocket stream to `/ws/plivo`. | Plivo WebSockets must validate shared webhook token / secret query parameter before accepting stream. | **ACTION REQUIRED FOR PHASE 6 (MEDIUM)** |
