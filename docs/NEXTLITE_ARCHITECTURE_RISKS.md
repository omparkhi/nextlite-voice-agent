# NextLite Voice V3 — Architectural Risks & Contradictions Audit

> **Scope**: Repository-Wide Risk Assessment & Architectural Inconsistencies  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Architectural Risks & Contradictions Matrix

### Risk 1: Pipecat Hardcoded `TEST_PROMPT` vs Production Prompt System
- **Severity**: **HIGH**
- **Evidence**: `apps/pipecat-worker/app/config.py:22-28`, `apps/pipecat-worker/app/main.py:368`.
- **Current Behavior**: Pipecat worker initializes `LLMContext` with a static 5-line test prompt from `config.py` rather than fetching the compiled prompt from `RuntimeAgentConfig`.
- **Expected Behavior**: Pipecat worker must fetch `RuntimeAgentConfig.prompt.compiledSystemPrompt` via `GET /api/internal/runtime-config/:deploymentId` and prepend dynamic temporal and calendar instructions.
- **Migration Impact**: Must be wired in Phase 6 before any live agent calls are processed by Pipecat.

---

### Risk 2: Pipecat Hardcoded `PHASE2_TEST_VOICE_ID` vs Stored Agent Voice
- **Severity**: **MEDIUM**
- **Evidence**: `apps/pipecat-worker/app/config.py:21`, `apps/pipecat-worker/app/main.py:383`.
- **Current Behavior**: `SarvamTTSService` is hardcoded to voice `'shubh'`.
- **Expected Behavior**: `SarvamTTSService` must receive `voice=runtime_config.voice.voice_id` from the resolved agent configuration.
- **Migration Impact**: Must be dynamically passed during pipeline instantiation in Phase 6.

---

### Risk 3: Dual Telephony Provider Configuration (`EXOTEL` vs `PLIVO`)
- **Severity**: **LOW**
- **Evidence**: `apps/api/src/config/env.ts:52-64` (`TELEPHONY_PROVIDER: z.enum(['exotel', 'plivo']).default('exotel')`).
- **Current Behavior**: The environment schema defaults `TELEPHONY_PROVIDER` to `'exotel'`, while `phoneNumbers` table and Pipecat worker default to `'plivo'`.
- **Expected Behavior**: Explicitly document or configure `'plivo'` as the standard telephony provider for NextLite V3 realtime voice pipelines.
- **Migration Impact**: Low runtime impact; ensure production environment explicitly sets `TELEPHONY_PROVIDER=plivo`.

---

### Risk 4: Deprecated `agent_tools` Table vs Canonical `tools.bindings`
- **Severity**: **LOW**
- **Evidence**: `apps/api/src/db/schema.ts:172`, `apps/api/src/services/runtimeAgentConfig.ts:182-188`.
- **Current Behavior**: `agent_tools` table remains in database schema from V1/V2, while V3 runtime resolves tools exclusively from `agent_versions.configuration.tools.bindings`.
- **Expected Behavior**: Clarify in documentation that `agent_tools` is deprecated and retained strictly for schema backward compatibility.
- **Migration Impact**: None. Runtime resolution logic correctly reads `agent_versions.configuration.tools.bindings`.

---

### Risk 5: Deprecated Admin Runtime-Config Endpoint
- **Severity**: **LOW**
- **Evidence**: `apps/api/src/routes/agents.ts:459` (`GET /api/admin/clients/:clientId/agents/:agentId/runtime-config`).
- **Current Behavior**: Legacy endpoint returns an unversioned runtime config snapshot.
- **Expected Behavior**: V3 production workers use `GET /api/internal/runtime-config/:deploymentId`.
- **Migration Impact**: None. Production workers do not call the legacy admin route.
