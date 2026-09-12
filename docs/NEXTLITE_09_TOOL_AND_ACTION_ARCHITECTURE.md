# NextLite Voice V3 — Tool & Action Architecture
## Document 09: Platform Tool Catalog, Normalization & Execution Registry

> **Document Type**: Tool & Function Calling Architecture  
> **Status**: Verified from Implementation (Read-Only)  
> **Contract Source**: `packages/shared/src/runtimeConfig.ts`  
> **Catalog Service**: `apps/api/src/services/toolCatalog.ts`  
> **Worker Registry**: `apps/livekit-worker/src/tools/toolRegistry.ts`  
> **Timestamp**: 2026-09-09  

---

## 1. Tool Architectural Hierarchy

```
[Platform Tool Catalog (PLATFORM_TOOL_CATALOG)]
   │
   ├─► Admin Studio UI (Admin selects & configures tools)
   │     └─► PUT /api/admin/.../config (Saves configuration.tools.bindings)
   │
   ├─► Runtime Resolution (RuntimeAgentConfigService)
   │     └─► Normalizes tool IDs via normalizeToolId()
   │     └─► Injects into RuntimeAgentConfig.tools.tools
   │
   └─► Worker Tool Registry (ToolRegistry)
         ├─► Matches toolId to registered ToolFactory
         ├─► Injects trusted ToolRuntimeContext (deploymentId, callSessionId, callerPhone)
         ├─► Exposes valid identifier function to LLM
         └─► Wraps execute() with monotonic latency instrumentation
```

---

## 2. Canonical Platform Tools Specification

### 2.1 Tool: `query_knowledge_base`
- **Canonical Tool ID**: `query_knowledge_base`
- **Aliases Normalized**: `'query knowledge base'`, `'query_knowledge_base_tool'`, `'knowledge base'`, `'knowledge search'`, `'search knowledge base'`.
- **Category**: Knowledge / RAG
- **LLM Description**: `"Retrieve authoritative business, organizational, and domain-specific knowledge from the configured knowledge base. Use this tool when the answer depends on specific business facts, operating hours, services, staff/resource information, procedures, pricing, or policies."`
- **Parameters**:
  - `query` (`string`, required): Natural language search query.
- **Trusted Context Injected by Worker**: `deploymentId`, `apiUrl`, `workerSecret`.
- **Backend API Endpoint**: `POST /api/internal/knowledge/retrieve`
- **Database Side Effects**: Read-only vector search over `knowledge_chunks` filtered by `tenantId` & `agentId`.
- **Response Format**: `{ results: Array<{ content: string, score: number, sourceId: string }> }`.

---

### 2.2 Tool: `book_appointment`
- **Canonical Tool ID**: `book_appointment`
- **Aliases Normalized**: `'book appointment'`, `'book doctor appointment'`, `'book demo class'`, `'book service slot'`, `'book site visit'`, `'book advisor call'`, `'schedule appointment'`, `'appointment booking'`.
- **Category**: Scheduling / Booking
- **LLM Description**: `"Record an appointment, consultation, site visit, demo session, or meeting request when the caller provides requested date, time, and customer details. You MUST call this tool when the user wants to submit or book an appointment. Note: Records an unconfirmed request (REQUESTED status); team verifies availability."`
- **Parameters Schema** (`createBookAppointmentArgsSchema`):
  - `customerName` (`string`, required, 1–255 chars): Full customer name.
  - `customerPhone` (`string`, optional, max 50 chars): Contact phone number. If omitted by caller, automatically falls back to `runtimeContext.callerPhone`.
  - `title` (`string`, required, 1–255 chars): Purpose/title of booking (e.g., "Doctor Consultation", "Site Visit").
  - `resourceName` (`string`, optional, max 255 chars): Specific doctor, advisor, teacher, or property unit.
  - `bookingDate` (`string`, required, max 50 chars): Requested date (e.g. `YYYY-MM-DD`).
  - `bookingTime` (`string`, required, max 50 chars): Requested time (e.g. `10:00 AM`, `15:30`).
  - `notes` (`string`, optional, max 2000 chars): Additional symptoms or notes.
  - `metadata` (`record`, optional): Structured custom attributes.
- **Trusted Context Injected by Worker**: `deploymentId`, `callSessionId`, `callerPhone`.
- **Backend API Endpoint**: `POST /api/internal/appointments`
- **Database Side Effects**:
  1. Atomically increments `tenant_appointment_counters.last_number`.
  2. Inserts new row in `appointments` table with `status = 'REQUESTED'` and formatted `appointment_number` (e.g. `A-001`).
- **Anti-Hallucination & Anti-UUID Rules**:
  - Worker returns: `{ success: true, appointmentNumber: 'A-001', status: 'REQUESTED', message: 'Your appointment request has been recorded with appointment number A-001...' }`.
  - Layer A prompt safety boundary strictly forbids the LLM from inventing reference numbers, claiming confirmed status, or pronouncing internal database UUIDs.

---

### 2.3 Tool: `create_callback_lead`
- **Canonical Tool ID**: `create_callback_lead`
- **Aliases Normalized**: `'create callback lead'`, `'callback lead'`, `'record callback lead'`, `'lead capture'`, `'lead_capture'`.
- **Category**: Leads / CRM
- **LLM Description**: `"Record a customer lead or callback request when the caller explicitly asks for follow-up, requests a callback, or clearly wants a team member to contact them about a product or service."`
- **Parameters Schema** (`createCallbackLeadArgsSchema`):
  - `customerName` (`string`, required, 1–255 chars): Customer name.
  - `customerPhone` (`string`, optional, max 50 chars): Contact phone number (falls back to `trustedCallerPhone`).
  - `customerEmail` (`string`, optional, valid email or empty): Customer email.
  - `interestCategory` (`string`, optional, max 255 chars): Service/product of interest.
  - `notes` (`string`, optional, max 2000 chars): Request summary or callback time preference.
  - `metadata` (`record`, optional): Structured metadata.
- **Trusted Context Injected by Worker**: `deploymentId`, `callSessionId`, `callerPhone`.
- **Backend API Endpoint**: `POST /api/internal/leads`
- **Database Side Effects**: Inserts new row in `leads` table with `status = 'NEW'`, linked to `call_session_id`.
- **Customer-Visible Output**: Natural acknowledgment: `"Callback request recorded successfully. Our team will contact you."`

---

## 3. Tool Normalization, Aliasing & Safety Rules

1. **Canonical Identifier Mapping**: `normalizeToolId(rawId)` in `packages/shared/src/runtimeConfig.ts` maps legacy and human-readable aliases to exact canonical platform IDs (`query_knowledge_base`, `book_appointment`, `create_callback_lead`).
2. **Identifier Validity for LLM**: LLM tool names must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. If a custom tool binding has an invalid name, `ToolRegistry` falls back to the canonical `factory.toolId`.
3. **Deduplication**: `ToolRegistry.resolveTools()` tracks `seenToolNames` to guarantee no duplicate tool definitions are passed to the LLM.
4. **Unknown Tool Safety**: If a tool binding in `RuntimeAgentConfig` references an unknown `toolId` with no registered factory, `ToolRegistry` logs a warning and **skips the tool without executing arbitrary code**.
5. **Legacy Schema Handling**: `agent_tools` table is deprecated. Tool bindings are authoritatively resolved from `agent_versions.configuration.tools.bindings`.

---

## 4. Architectural Ownership: Business Logic vs Voice Engine Orchestration

> [!CRITICAL]
> **NEXTLITE OWNS TOOL BUSINESS LOGIC. WORKERS (LIVEKIT / PIPECAT) ONLY ORCHESTRATE.**

| Tool Responsibility | NextLite Control Plane (Owner) | Worker Runtime (Orchestrator Only) |
|---|---|---|
| **Tool Catalog & Schemas** | Authoritative definition in `toolCatalog.ts` & `@nextlite/shared` | Exposes schemas to LLM function calling context |
| **Atomic Sequential Numbering** | `tenant_appointment_counters` (`A-001`) | Receives formatted number in tool response JSON |
| **Multi-Tenant Isolation** | Derives `tenantId` authoritatively from `deploymentId` | Injects `deploymentId` in HTTP request payload |
| **Caller Phone Fallback** | Applies caller phone if customer phone omitted | Passes `trustedCallerPhone` from telephony stream |
| **Database Persistence** | Inserts into `appointments` and `leads` | Issues HTTP POST to `/api/internal/*` |
| **Tool Execution Telemetry** | Persists execution in `call_sessions.turns_json` | Measures execution latency and logs debug trace |
