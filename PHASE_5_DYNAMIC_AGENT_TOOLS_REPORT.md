# Phase 5 — Dynamic Agent Tools Report
**NextLite Voice V3 — Production Multi-Tenant AI Voice Agent SaaS**

---

## 1. Objective
Transform the previous static, hardcoded Agent Tools mechanism into a dynamic, configuration-driven Tool architecture. Enable agents to bind, enable, disable, and configure individual platform capabilities without arbitrary code execution, while strictly filtering exposed runtime tools to Pipecat and upholding the platform invariant on Tool Truthfulness.

---

## 2. Architecture Overview & Foundational Distinction

```
                TOOL REGISTRY
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
    Tool Definition          Tool Definition
    (What capability is)     (What capability is)
          │                       │
          └───────────┬───────────┘
                      ↓
                AGENT BINDING
             (enabled / disabled)
                      │
                      ↓
              RUNTIME CONFIG
                      │
                      ↓
               PIPECAT / LLM
                      │
                  Tool Call
                      ↓
               Tool Dispatcher
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
   Input Validation        Trusted Context
   (Schema check)          (Tenant/Agent ID injection)
          │                       │
          └───────────┬───────────┘
                      ↓
              Execution Handler
                      │
                      ↓
                  Tool Result
                      │
                      ↓
                     LLM
```

### Core Separation of Concerns
1. **Tool Definition (`ToolDefinition`)**:
   - What the capability is.
   - Platform-wide, reusable metadata: stable machine identifier (`query_knowledge_base`, `book_appointment`, `create_callback_lead`), human-readable display label, LLM instruction description, JSON Schema input parameters, and execution handler identity.
2. **Agent Tool Binding (`AgentToolBinding`)**:
   - Whether and how an individual Agent uses the capability.
   - Stored in `AgentConfiguration.tools.bindings` with `toolId`, `enabled`, and optional execution settings.
3. **Tool Execution Handler**:
   - How the action actually executes server-side, enforcing argument validation and trusted runtime context injection (`tenantId`, `agentId`, `callSessionId`).

---

## 3. Existing Tools Inventory & Classification

| Tool ID | Display Name | Category | Classification | Description & Compatibility |
| :--- | :--- | :--- | :--- | :--- |
| `query_knowledge_base` | Knowledge Retrieval | Knowledge | **A. Generic Platform Tool** | Queries business documents/knowledge chunks via vector similarity or text search. |
| `book_appointment` | Appointment Booking | Scheduling | **B. Generic with Specialized Defaults** | Creates calendar/slot bookings (appointments, reservations, visits). Fully backward-compatible with the first client while using generic field contracts. |
| `create_callback_lead` | Lead Capture & Callback | CRM | **A. Generic Platform Tool** | Captures caller contact details, inquiries, and follow-up requirements into CRM. |

---

## 4. Hardcoding Audit & Findings
- **Zero Inappropriate Branching**: Evaluated `tool_registry.py`, `runtime_config_service.py`, `tool_execution_service.py`, and `ToolsManager.tsx` against keywords (`hospital`, `clinic`, `doctor`, `patient`, `OPD`, `restaurant`, `table`, `course`). Found **0** hardcoded industry branches.
- **Generic Appointment Handling**: Booking schemas accept generic parameters (`customerName`, `customerPhone`, `title`, `bookingDate`, `bookingTime`, `durationMinutes`, `notes`). Legacy parameters like `doctor_name` or `department` are safely mapped to `notes` / `title` without breaking healthcare workflows.

---

## 5. Tool Registry Architecture (`apps/api/app/domain/tool_registry.py`)
- **Canonical Registry**: `CANONICAL_TOOL_REGISTRY` contains immutable tool definitions.
- **Normalization**: `normalize_tool_id()` resolves legacy labels and snake_case variants to stable machine IDs.
- **Input Schema Validation**: `validate_tool_arguments()` validates required types, presence, and enum constraints against JSON Schema before invoking execution handlers.
- **Context Protection**: `sanitize_tool_arguments()` strips protected keys (`tenantId`, `agentId`, `callSessionId`, `authContext`) so untrusted LLM arguments cannot spoof tenant boundaries.
- **Runtime Tool Resolution**: `filter_agent_runtime_tools()` filters agent bindings, deduplicates IDs, and yields only enabled `RuntimeToolDefinition` objects.

---

## 6. API Changes
- **`GET /api/admin/tools`**: Returns catalog of available platform tools dynamically generated from `list_canonical_tools()` in the canonical Tool Registry.
- **`GET /api/admin/agents/{agent_id}` & `PUT /api/admin/agents/{agent_id}`**: Manages `tools` configuration with `enabled` (master toggle) and `bindings` (`List[AgentToolBinding]`).
- **`GET /api/internal/runtime-agent-config/{deployment_id}`**: Compiles runtime configuration where `config.tools.tools` contains strictly the active, enabled tool definitions.

---

## 7. Frontend Upgrades (`apps/web/src/components/agent-builder/ToolsManager.tsx`)
- **Dynamic Catalog Consumption**: Fetches platform tools from `/api/admin/tools` rather than a static list.
- **Dynamic Tool Workspace**:
  - Displays **Active Tools count (`X / Y`)**.
  - **Tool Execution Active** master toggle.
  - **`+ Add Tool`** modal to bind available platform capabilities with duplicate binding prevention.
  - Individual tool cards with category badges, description, parameter inspection toggle, enable/disable switches, and unbind/remove button.
- **Design System Consistency**: Fully styled using Tailwind/shadcn glassmorphism and card tokens matching the Phase 3/4 design language.

---

## 8. Runtime & Pipecat Worker Integration
- **Worker Exposure**: `RuntimeAgentConfig.tools.tools` is deserialized by Pipecat worker's `ToolRegistry`. Disabled tools are omitted completely from LLM tool definitions sent to the LLM (Sarvam / OpenAI).
- **Execution Dispatching**: Tool invocations dispatched via `/api/internal/tools/execute` validate schema and inject server-side trusted context before routing to `ToolExecutionService`.

---

## 9. Platform Invariant: Tool Truthfulness
- The platform enforces that an Agent must **never claim an action succeeded unless the tool execution returned `success: true`**.
- Execution failures return structured `{ "success": False, "error": "...", "message": "..." }`, preventing hallucinated confirmations.

---

## 10. Multi-Tenant, Agent & Version Isolation
- **Tenant Isolation**: Tenant A and Tenant B configure independent tool bindings; cross-tenant tool access is strictly blocked server-side.
- **Agent Isolation**: Modifying Agent A's enabled tools does not mutate Agent B's configuration.
- **Version Isolation**: Published deployments read immutable configuration snapshots in `AgentVersion`. Draft changes do not affect live production workers until published.

---

## 11. Verification & Test Suite Results

### A. Phase 5 Focused Domain Suite (`tests/domain/test_phase5_dynamic_agent_tools.py`)
All **26 / 26** test cases **PASSED**:
1. Canonical Tool Registry loads valid tool definitions
2. Tools have stable machine identities
3. Display name is separate from machine identity
4. Agent can bind an available tool
5. Duplicate tool bindings are prevented
6. Agent can enable a tool
7. Agent can disable a tool
8. Disabled tools are not exposed to runtime
9. Only enabled tools are included in RuntimeAgentConfig
10. Tool input schema validates required fields
11. Invalid tool arguments are rejected
12. Protected context cannot be overridden by LLM arguments
13. Successful tool execution produces success result
14. Failed tool execution produces failure result
15. Truthfulness invariant enforced on tool failure
16. Agent A tool bindings do not affect Agent B
17. Tenant A tool bindings do not affect Tenant B
18. Template does not acquire Agent-specific tool bindings
19. Published AgentVersion remains isolated from draft tool changes
20. Existing Knowledge Retrieval tool continues to work
21. Existing Booking tool continues to work
22. Existing Lead Capture tool continues to work
23. Existing healthcare client continues functioning
24. Non-healthcare Agent uses same Tool architecture
25. Tool definitions remain consistent across layers
26. Canonical catalog single source of truth

### B. Full Backend & API Regression Suite
- `pytest tests/ -q`: **122 passed, 0 failed** in 18.62s.

### C. Pipecat Worker Test Suite
- `pytest apps/pipecat-worker/tests/ -q`: **304 passed, 0 failed** in 56.42s.

### D. Frontend Build & Typecheck
- `npm run build --workspace=@nextlite/web`: **TypeScript check & Vite build passed with 0 errors**.

---

## 12. Known Limitations & Explicitly Deferred Phase 6+ Work
- **Knowledge/RAG Redesign (Phase 6)**: The `query_knowledge_base` tool is registered dynamically as a first-class tool; full chunking, vector database migration, and re-ranking are deferred to Phase 6.
- **Custom Tool Creation**: Arbitrary code/script upload is intentionally out of scope. Future phases may introduce parameterized HTTP webhook tools with strict sandboxing.
