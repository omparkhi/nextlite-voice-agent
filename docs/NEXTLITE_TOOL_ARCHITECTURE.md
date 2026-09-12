# NextLite Voice V3 — Complete Tool System & Execution Audit

> **Contract Reference**: `packages/shared/src/runtimeConfig.ts`  
> **Catalog Service**: `apps/api/src/services/toolCatalog.ts`  
> **Worker Registry**: `apps/livekit-worker/src/tools/toolRegistry.ts`  
> **Status**: Verified from Codebase (Read-Only)  
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
- **Canonical ID**: `query_knowledge_base`
- **Aliases Normalized**: `'query knowledge base'`, `'query_knowledge_base_tool'`, `'knowledge base'`, `'knowledge search'`, `'search knowledge base'`
- **Category**: Knowledge
- **LLM Description**: `"Retrieve authoritative business, organizational, and domain-specific knowledge from the configured knowledge base. Use this tool when the answer depends on specific business facts, operating hours, services, staff/resource information, procedures, pricing, or policies."`
- **Parameters**:
  - `query` (`string`, required): Natural language search query.
- **Trusted Context Injected**: `deploymentId`, `apiUrl`, `workerSecret`.
- **Backend API Endpoint**: `POST /api/internal/knowledge/retrieve`
- **Database Side Effects**: Read-only vector search over `knowledge_chunks`.
- **Customer-Visible Output**: Natural spoken factual response synthesized by LLM.

---

### 2.2 Tool: `book_appointment`
- **Canonical ID**: `book_appointment`
- **Aliases Normalized**: `'book appointment'`, `'book doctor appointment'`, `'book demo class'`, `'book service slot'`, `'book site visit'`, `'book advisor call'`, `'schedule appointment'`, `'appointment booking'`
- **Category**: Scheduling / Booking
- **LLM Description**: `"Record an appointment, consultation, site visit, demo session, or meeting request when the caller provides requested date, time, and customer details. You MUST call this tool when the user wants to submit or book an appointment. Note: Records an unconfirmed request (REQUESTED status); team verifies availability."`
- **Parameters Schema** (`createBookAppointmentArgsSchema`):
  - `customerName` (`string`, required, 1–255 chars): Full customer name.
  - `customerPhone` (`string`, optional, max 50 chars): Contact phone number. If omitted by caller, automatically falls back to trusted `runtimeContext.callerPhone`.
  - `title` (`string`, required, 1–255 chars): Purpose/title of booking (e.g., "Doctor Consultation", "Site Visit").
  - `resourceName` (`string`, optional, max 255 chars): Specific doctor, advisor, teacher, or property unit.
  - `bookingDate` (`string`, required, max 50 chars): Requested date (e.g. `YYYY-MM-DD`).
  - `bookingTime` (`string`, required, max 50 chars): Requested time (e.g. `10:00 AM`, `15:30`).
  - `notes` (`string`, optional, max 2000 chars): Additional symptoms or notes.
  - `metadata` (`record`, optional): Structured custom attributes.
- **Trusted Context Injected**: `deploymentId`, `callSessionId`, `callerPhone`.
- **Backend API Endpoint**: `POST /api/internal/appointments`
- **Database Side Effects**:
  1. Atomically increments `tenant_appointment_counters.last_number`.
  2. Inserts new row in `appointments` table with `status = 'REQUESTED'` and formatted `appointment_number` (e.g. `A-001`).
- **Anti-Hallucination & Anti-UUID Rules**:
  - Worker returns `{ success: true, appointmentNumber: 'A-001', status: 'REQUESTED', message: 'Your appointment request has been recorded with appointment number A-001...' }`.
  - Layer A prompt safety boundary strictly forbids the LLM from inventing reference numbers, claiming confirmed status, or pronouncing database UUIDs.

---

### 2.3 Tool: `create_callback_lead`
- **Canonical ID**: `create_callback_lead`
- **Aliases Normalized**: `'create callback lead'`, `'callback lead'`, `'record callback lead'`, `'lead capture'`, `'lead_capture'`
- **Category**: Leads / CRM
- **LLM Description**: `"Record a customer lead or callback request when the caller explicitly asks for follow-up, requests a callback, or clearly wants a team member to contact them about a product or service."`
- **Parameters Schema** (`createCallbackLeadArgsSchema`):
  - `customerName` (`string`, required, 1–255 chars): Customer name.
  - `customerPhone` (`string`, optional, max 50 chars): Contact phone number (falls back to `trustedCallerPhone`).
  - `customerEmail` (`string`, optional, valid email or empty): Customer email.
  - `interestCategory` (`string`, optional, max 255 chars): Service/product of interest.
  - `notes` (`string`, optional, max 2000 chars): Request summary or callback time preference.
  - `metadata` (`record`, optional): Structured metadata.
- **Trusted Context Injected**: `deploymentId`, `callSessionId`, `callerPhone`.
- **Backend API Endpoint**: `POST /api/internal/leads`
- **Database Side Effects**: Inserts new row in `leads` table with `status = 'NEW'`, linked to `call_session_id`.
- **Customer-Visible Output**: Natural acknowledgment: `"Callback request recorded successfully. Our team will contact you."`

---

## 3. Tool Normalization & Deduplication Rules

1. **Identifier Validity**: LLM tool names must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. If a custom tool binding has an invalid name, `toolRegistry` falls back to the canonical `factory.toolId`.
2. **Deduplication**: `ToolRegistry.resolveTools()` tracks `seenToolNames` to guarantee no duplicate tool definitions are passed to the LLM.
3. **Unknown Tool Safety**: If a tool binding in `RuntimeAgentConfig` references an unknown `toolId` with no registered factory, `ToolRegistry` logs a warning and **skips the tool without executing arbitrary code**.

---

## 4. Pipecat Tool Integration Requirements (Phase 6+)

In Phase 6+, Pipecat MUST implement a matching `PipecatToolRegistry` that:
1. Registers the exact 3 canonical tool schemas (`query_knowledge_base`, `book_appointment`, `create_callback_lead`).
2. Converts schemas into native Pipecat tool functions (`piping frames/tool definitions`).
3. Injects `deploymentId`, `callSessionId`, and `callerPhone` into HTTP requests sent to `/api/internal/*`.
4. Returns sanitized structured JSON to the native Pipecat LLM context aggregator.
5. Does NOT create custom tool endpoints or bypass NextLite Control Plane APIs.
