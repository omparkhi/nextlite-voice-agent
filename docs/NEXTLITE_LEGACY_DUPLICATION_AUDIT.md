# NextLite Voice V3 — Duplication, Legacy & Dead Code Audit

> **Scope**: Repository-Wide Codebase Artifact & Route Classification  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Classification Definitions

- **ACTIVE**: In active production runtime path.
- **LEGACY**: Functional code from an earlier architectural iteration, maintained for backward compatibility.
- **DEPRECATED**: Explicitly marked for removal; not used by V3 production runtime.
- **DEAD**: Unreachable code that has no callers or references.
- **TEST-ONLY**: Dedicated to unit, integration, or smoke testing harnesses.
- **TEMPORARY**: Migration scratchpad or proof-of-concept code to be replaced in a later phase.
- **UNKNOWN**: Status cannot be definitively proven from code.

---

## 2. Complete Classification Inventory

| Code Artifact / File / Route | Classification | Location | Current Behavior | Target / Recommendation |
|---|---|---|---|---|
| `agent_tools` PostgreSQL table | **DEPRECATED** | `apps/api/src/db/schema.ts:172` | Table exists in schema, but V3 runtime resolves tool bindings from `agent_versions.configuration.tools.bindings`. | Preserve in schema for DB backward compatibility; do not reference in new code. |
| `GET /api/admin/clients/:cId/agents/:aId/runtime-config` | **DEPRECATED** | `apps/api/src/routes/agents.ts:459` | Legacy V1/V2 endpoint returning unversioned runtime config. Not used by V3 worker. | Preserve for backward compatibility; V3 uses `/api/internal/runtime-config/:deploymentId`. |
| `AgentService.generateRuntimeConfig()` | **DEPRECATED** | `apps/api/src/services/agent.ts:353` | Helper backing the deprecated admin runtime-config route. | Preserve for legacy route; V3 uses `RuntimeAgentConfigService`. |
| `(config.tools as any).tools` (Legacy tool array shape) | **LEGACY / FALLBACK** | `apps/api/src/services/runtimeAgentConfig.ts:186` | Normalizes legacy `tools.tools` array to canonical `tools.bindings`. | Retain fallback normalizer to safely support older seed versions. |
| `TEST_PROMPT` in Pipecat | **TEMPORARY / TEST-ONLY** | `apps/pipecat-worker/app/config.py:22` | Hardcoded 5-line test prompt used for Phase 4 LLM streaming verification. | Replace in Phase 6 with `RuntimeAgentConfig.prompt.compiledSystemPrompt`. |
| `PHASE2_TEST_VOICE_ID` (`'shubh'`) | **TEMPORARY / TEST-ONLY** | `apps/pipecat-worker/app/config.py:21` | Hardcoded test speaker voice for telephony loopback verification. | Replace in Phase 6 with `RuntimeAgentConfig.voice.voiceId`. |
| `DeterministicTestEchoProcessor` | **TEST-ONLY** | `apps/pipecat-worker/app/main.py:208` | Frame processor echoing user transcripts for Phase 2 test suite. | Retain in test harness; excluded from active conversational pipeline. |
| `/plivo/test-xml` Endpoint | **TEST-ONLY** | `apps/pipecat-worker/app/main.py:71` | Generates Plivo Answer XML for manual test number loopback. | Retain for manual staging diagnostics. |
| `Redis` connection (`db/redis.ts`) | **ACTIVE (Health Check Only)** | `apps/api/src/db/redis.ts` | Pinged by `/api/health`; no voice runtime queuing dependencies. | Keep as peripheral infrastructure. |
| `TelephonyProvider` (`'exotel'` vs `'plivo'`) | **LEGACY / TRANSITIONAL** | `apps/api/src/config/env.ts:52` | Env variable defaults to `'exotel'`, but Plivo numbers and Zentrunk are actively used. | Clarify telephony provider strategy in production deployments. |
