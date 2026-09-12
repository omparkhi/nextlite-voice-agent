# NextLite Voice V3 — Master Repository & Architecture Audit

> **Document Type**: Master Architecture & Production Engineering Audit  
> **Status**: Comprehensive Read-Only Audit (Completed)  
> **Migration Phase**: STOPPED AT PHASE 5 (Zero Phase 6+ Implementation)  
> **Author**: Antigravity Autonomous Systems Engineering Team  
> **Repository Root**: `e:\NextLite\nextlite-voice-engineering-spec`  
> **Timestamp**: 2026-09-09  

---

## Executive Summary

This document serves as the **single master entry point** for the complete repository, architecture, configuration, security, and migration audit of **NextLite Voice V3**. 

Every conclusion and architectural statement in this audit has been verified directly from active source code, schemas, and test suites without making assumptions or altering any source code.

---

## 1. Document Index & Specialist Audit Reports

For exhaustive deep-dives into specific subsystems, refer to the accompanying audit documents generated in the `docs/` directory:

1. [NEXTLITE_REPOSITORY_MAP.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_REPOSITORY_MAP.md) — Comprehensive directory map, runtimes, owners, and file responsibilities.
2. [NEXTLITE_FILE_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_FILE_AUDIT.md) — File-by-file dependency graph, reachability analysis, and classifications.
3. [NEXTLITE_ACTUAL_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_ACTUAL_ARCHITECTURE.md) — Production architecture flows for Control Plane, LiveKit, and Pipecat.
4. [NEXTLITE_CONFIGURATION_SOURCE_OF_TRUTH.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_CONFIGURATION_SOURCE_OF_TRUTH.md) — Source of truth audit answering 15 core provenance questions.
5. [NEXTLITE_AGENT_LIFECYCLE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_AGENT_LIFECYCLE.md) — Agent creation, versioning, deployment, and runtime row resolution.
6. [NEXTLITE_PROMPT_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_PROMPT_ARCHITECTURE.md) — Layer A core safety rules, Layer B customer config, temporal/calendar injection.
7. [NEXTLITE_RUNTIME_CONFIG_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_RUNTIME_CONFIG_AUDIT.md) — Tabular field-by-field specification of `RuntimeAgentConfig`.
8. [NEXTLITE_DATA_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_DATA_ARCHITECTURE.md) — PostgreSQL data model, 15 tables, constraints, and worker access boundaries.
9. [NEXTLITE_SECURITY_BOUNDARY_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_SECURITY_BOUNDARY_AUDIT.md) — Multi-tier tenant isolation, JWT, RBAC, and worker secrets.
10. [NEXTLITE_RAG_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_RAG_ARCHITECTURE.md) — Ingestion, chunking, embeddings, vector search, and API boundaries.
11. [NEXTLITE_TOOL_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_TOOL_ARCHITECTURE.md) — Tool catalog, canonical normalization, sequential numbering, and schemas.
12. [NEXTLITE_CALL_LIFECYCLE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_CALL_LIFECYCLE.md) — Call session states (`ACTIVE`, `COMPLETED`, `MISSED`, `FAILED`), metrics, and failure modes.
13. [NEXTLITE_TELEPHONY_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_TELEPHONY_ARCHITECTURE.md) — Plivo DIDs, routing lookups, caller ID trust, and stream security.
14. [NEXTLITE_CRM_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_CRM_ARCHITECTURE.md) — Leads, appointments, follow-ups, WhatsApp messaging, and analytics.
15. [NEXTLITE_LANGUAGE_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_LANGUAGE_ARCHITECTURE.md) — BCP-47 tags, 12 Indic regexes, and Hinglish/Minglish marker filters.
16. [NEXTLITE_VOICE_RUNTIME_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_VOICE_RUNTIME_AUDIT.md) — Sarvam STT/LLM/TTS, LiveKit Gateway, and latency telemetry.
17. [NEXTLITE_FRONTEND_CONFIG_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_FRONTEND_CONFIG_AUDIT.md) — UI controls to API schemas and runtime effects.
18. [NEXTLITE_API_CONTRACT_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_API_CONTRACT_AUDIT.md) — Inventory of all REST API routes, schemas, and error codes.
19. [NEXTLITE_ASYNC_ARCHITECTURE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_ASYNC_ARCHITECTURE.md) — Verification of zero background queue dependencies.
20. [NEXTLITE_LIVEKIT_RESPONSIBILITY_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_LIVEKIT_RESPONSIBILITY_AUDIT.md) — LiveKit responsibility matrix.
21. [NEXTLITE_PIPECAT_CURRENT_STATE.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_PIPECAT_CURRENT_STATE.md) — Audit of Pipecat Phases 1–5 and git status.
22. [NEXTLITE_LIVEKIT_PIPECAT_BOUNDARY.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_LIVEKIT_PIPECAT_BOUNDARY.md) — Definitive migration matrix and non-ownership boundaries.
23. [NEXTLITE_LEGACY_DUPLICATION_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_LEGACY_DUPLICATION_AUDIT.md) — Classification of legacy, deprecated, and test artifacts.
24. [NEXTLITE_HARDCODED_BEHAVIOR_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_HARDCODED_BEHAVIOR_AUDIT.md) — Default values, safety constants, and industry neutrality.
25. [NEXTLITE_TEST_COVERAGE_AUDIT.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_TEST_COVERAGE_AUDIT.md) — Inventory of 41 test suites across API, LiveKit, and Pipecat.
26. [NEXTLITE_CONFIGURATION_GRAPH.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_CONFIGURATION_GRAPH.md) — Visual and text dependency graph.
27. [NEXTLITE_DO_NOT_TOUCH_BOUNDARIES.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_DO_NOT_TOUCH_BOUNDARIES.md) — Strict non-negotiable system boundaries.
28. [NEXTLITE_PIPECAT_REQUIREMENTS.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_PIPECAT_REQUIREMENTS.md) — Categorized migration requirements.
29. [NEXTLITE_ARCHITECTURE_RISKS.md](file:///e:/NextLite/nextlite-voice-engineering-spec/docs/NEXTLITE_ARCHITECTURE_RISKS.md) — Architectural risks and contradictions.

---

## 2. Definitive Authoritative Source-of-Truth Matrix

| Domain | Authoritative Source | Derived Source | Consumer | Legacy Source | Notes |
|---|---|---|---|---|---|
| **Tenant** | `tenants` table (`id`, `name`) | JWT payload (`tenantId`) | All Control Plane APIs | None | Core root entity. |
| **Agent Entity** | `agents` table (`id`, `name`, `status`) | `RuntimeAgentConfig.agent` | Control Plane & Worker | None | Master agent record. |
| **Template** | `agent_templates` table | Initial `agent_versions` row v1 | `AgentService.createAgent` | None | Initial defaults preset. |
| **Agent Version** | `agent_versions.configuration` (JSONB) | `RuntimeAgentConfig` | Worker via internal API | None | Frozen snapshot on publish. |
| **Deployment** | `deployments` table | `deploymentId` parameter | Control Plane & Worker | None | Binds version to env (`TEST` / `PRODUCTION`). |
| **System Prompt** | `PromptCompilerService` output | `RuntimeAgentConfig.prompt.compiledSystemPrompt` | LLM Context in Worker | `DEFAULT_SYSTEM_PROMPT` | Layer A safety + Layer B customer spec. |
| **Voice Config** | `agent_versions.configuration.voice` | `RuntimeAgentConfig.voice` | Sarvam STT & TTS | Static test voices | Controls speaker & pace. |
| **Language Config** | `agent_versions.configuration.language` | `RuntimeAgentConfig.language` | `ConversationLanguageManager` | Static fallback | 12 Indic regex rules & Hinglish filters. |
| **Tools Binding** | `agent_versions.configuration.tools.bindings` | `RuntimeAgentConfig.tools.tools` | `ToolRegistry` in Worker | `agent_tools` table (Deprecated) | Platform tools (`query_knowledge_base`, etc.). |
| **RAG Knowledge** | `knowledge_sources` & `knowledge_chunks` | Vector search scores | `POST /api/internal/knowledge/retrieve` | None | S3 / B2 storage + Nvidia/Gemini embeddings. |
| **Leads** | `leads` table | Client CRM Dashboard | `POST /api/internal/leads` | None | Captured during calls. |
| **Appointments** | `appointments` table | Client CRM Dashboard | `POST /api/internal/appointments` | None | Sequential `A-001` format via atomic counters. |
| **Call Sessions** | `call_sessions` table | Client CRM Dashboard | `POST/PATCH /api/internal/call-sessions` | None | Tracks duration, turns, metrics, transcripts. |
| **Phone Numbers** | `phone_numbers` table | Inbound routing lookup | `GET /api/internal/phone-numbers/lookup` | None | Resolves `deploymentId` from dialed DID. |
| **Secrets** | Environment Variables (`.env`) | `env` object (`apps/api/src/config/env.ts`) | Control Plane & Worker | Default fallback secrets | Mandatory startup validation. |

---

## 3. Recommended Migration Sequence for Phase 6+

1. **Step 1: Python Control Plane HTTP Client**: Implement async client in `apps/pipecat-worker/app/runtime_config_client.py` calling `/api/internal/*` with `WORKER_API_SECRET`.
2. **Step 2: Python Multilingual Language Manager**: Port `ConversationLanguageManager` and 12 Indic regex rules to `apps/pipecat-worker/app/language_manager.py`.
3. **Step 3: Python Temporal & Calendar Context**: Port temporal and 7-day calendar formatters to `apps/pipecat-worker/app/context.py`.
4. **Step 4: Dynamic Configuration Wiring**: Update `apps/pipecat-worker/app/main.py` on WebSocket connect to:
   - Extract `deploymentId` from query or reverse DID lookup.
   - Fetch `RuntimeAgentConfig`.
   - Create `ACTIVE` call session record.
   - Set compiled prompt + temporal/calendar instructions in `LLMContext`.
   - Set configured voice ID, pace, and language in Sarvam services.
5. **Step 5: Native Pipecat Tool Registry**: Register `query_knowledge_base`, `book_appointment`, and `create_callback_lead` as native Pipecat tool functions calling `/api/internal/*`.
6. **Step 6: Call Session Finalizer**: Implement `finally:` finalizer in `main.py` calling `PATCH /api/internal/call-sessions/:id` with final status (`COMPLETED`/`MISSED`), duration, turns JSON, and metrics.
7. **Step 7: Automated Integration Verification**: Run end-to-end simulated calls verifying prompt compliance, RAG retrieval, appointment booking (`A-001`), and CRM persistence.

---

## 4. Exact Prerequisites Before Starting Phase 6

- [x] Read-only audit completed across all 32 dimensions.
- [x] All 29 specialist documentation artifacts created in `docs/`.
- [x] Zero code modifications to tracked production files verified (`git status --short`).
- [x] Clear human decision on telephony provider strategy (`PLIVO` as standard).
- [ ] User review and explicit approval of this Master Architecture Audit.
