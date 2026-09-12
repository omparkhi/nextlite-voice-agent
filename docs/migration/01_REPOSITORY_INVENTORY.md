# Repository Forensic Inventory

**Total Scanned Files:** 414  
**Audit Date:** September 2026

---

## 1. File Type Summary

| File Extension | Count | Primary Purpose |
| :--- | :--- | :--- |
| `.ts` | 134 | TypeScript Source / Config |
| `.md` | 113 | Markdown Documentation / Spec |
| `.py` | 52 | Python Source / Tests |
| `.tsx` | 50 | TypeScript Source / Config |
| `.json` | 22 | JSON Configuration / Schema |
| `[no extension]` | 17 | Other Assets / Config |
| `.sql` | 7 | SQL Migration |
| `.yaml` | 4 | Other Assets / Config |
| `.example` | 4 | Other Assets / Config |
| `.yml` | 2 | Other Assets / Config |
| `.js` | 2 | Other Assets / Config |
| `.local` | 1 | Other Assets / Config |
| `.png` | 1 | Other Assets / Config |
| `.toml` | 1 | Other Assets / Config |
| `.tag` | 1 | Other Assets / Config |
| `.html` | 1 | Other Assets / Config |
| `.tsbuildinfo` | 1 | Other Assets / Config |
| `.css` | 1 | Other Assets / Config |

---

## 2. Directory & Application Breakdown

### 2.1 `apps/api` (Node.js / Express / TypeScript Control Plane)
- **Role:** Express REST API for Auth, Admin, CRM, Knowledge Base, Agent Management, and Worker-facing internal APIs.
- **ORM:** Drizzle ORM with PostgreSQL (`pg` driver) and Redis (`ioredis`).
- **Test Framework:** Vitest (24 active test files, 253 tests).
- **Migration Status:** **TARGET FOR COMPLETE MIGRATION TO PYTHON FASTAPI.**

### 2.2 `apps/pipecat-worker` (Python Realtime Voice Worker)
- **Role:** Native Pipecat realtime voice agent handling Plivo WebSockets and Sarvam STT/TTS/LLM pipelines.
- **Framework:** Python 3.11+, FastAPI WebSocket server, Pipecat AI 1.8.1.
- **Test Framework:** Pytest + pytest-asyncio (26 active test files, 267 tests).
- **Migration Status:** **RETAINED & EXPANDED to directly import Python Shared Domain Services.**

### 2.3 `apps/livekit-worker` (Legacy Node.js LiveKit Worker)
- **Role:** Previous LiveKit + Sarvam agent implementation.
- **Status:** **LEGACY / DEPRECATED** (Superseded by `apps/pipecat-worker` in Phases 14-22). Contains valuable domain logic test suites that must be preserved in Python.

### 2.4 `apps/web` (React / TypeScript Frontend)
- **Role:** Single-page application for Admin Agent Builder, CRM Dashboard, Receptionist Portal, and Web Voice Tester.
- **Framework:** React 18, Vite, React Router, TailwindCSS.
- **Migration Status:** **PRESERVED AS-IS.** Connects seamlessly to Python FastAPI Control Plane.

### 2.5 `packages/shared` (TypeScript Shared Definitions)
- **Role:** Shared types and `RuntimeAgentConfig` interface definitions.
- **Migration Status:** **CONVERT TO PYTHON SHARED DOMAIN LAYER (Pydantic models / Domain types).**

---

## 3. Comprehensive File Manifest

| File Path | Lines | Size (Bytes) | Category | Status |
| :--- | :--- | :--- | :--- | :--- |
| `.gitignore` | 37 | 365 | Doc/Config | AUDIT |
| `AGENTS.md` | 128 | 3266 | Doc/Config | AUDIT |
| `IMPLEMENTATION_PLAN.md` | 1149 | 43809 | Doc/Config | AUDIT |
| `PHASE21C_REALTIME_LATENCY_FORENSIC_REPORT.md` | 852 | 36946 | Doc/Config | AUDIT |
| `PHASE22_REALTIME_LATENCY_IMPLEMENTATION_REPORT.md` | 296 | 18096 | Doc/Config | AUDIT |
| `README.md` | 69 | 2269 | Doc/Config | AUDIT |
| `apps/api/.env` | 69 | 2132 | Doc/Config | AUDIT |
| `apps/api/.env.example` | 57 | 1437 | Doc/Config | AUDIT |
| `apps/api/.gitignore` | 9 | 82 | Doc/Config | AUDIT |
| `apps/api/drizzle.config.ts` | 14 | 325 | Doc/Config | AUDIT |
| `apps/api/drizzle/0000_opposite_baron_strucker.sql` | 112 | 4233 | Doc/Config | AUDIT |
| `apps/api/drizzle/0001_stormy_quicksilver.sql` | 74 | 2841 | Doc/Config | AUDIT |
| `apps/api/drizzle/0002_faithful_dracula.sql` | 56 | 3987 | Doc/Config | AUDIT |
| `apps/api/drizzle/0003_new_silhouette.sql` | 25 | 2218 | Doc/Config | AUDIT |
| `apps/api/drizzle/0004_parallel_night_thrasher.sql` | 106 | 7738 | Doc/Config | AUDIT |
| `apps/api/drizzle/0005_friendly_appointment_number.sql` | 8 | 636 | Doc/Config | AUDIT |
| `apps/api/drizzle/0006_follow_ups_messaging.sql` | 32 | 1608 | Doc/Config | AUDIT |
| `apps/api/drizzle/meta/0000_snapshot.json` | 512 | 12711 | Doc/Config | AUDIT |
| `apps/api/drizzle/meta/0001_snapshot.json` | 818 | 20500 | Doc/Config | AUDIT |
| `apps/api/drizzle/meta/0002_snapshot.json` | 1254 | 32248 | Doc/Config | AUDIT |
| `apps/api/drizzle/meta/0003_snapshot.json` | 1474 | 37988 | Doc/Config | AUDIT |
| `apps/api/drizzle/meta/0004_snapshot.json` | 2429 | 63246 | Doc/Config | AUDIT |
| `apps/api/drizzle/meta/_journal.json` | 41 | 792 | Doc/Config | AUDIT |
| `apps/api/package.json` | 60 | 1727 | Doc/Config | AUDIT |
| `apps/api/src/__tests__/agentDeploymentLifecycle.test.ts` | 483 | 15413 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/agents.test.ts` | 553 | 19274 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/appointmentNumbering.test.ts` | 206 | 5838 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/auth.test.ts` | 181 | 5461 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/clientCrm.test.ts` | 237 | 8264 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/env.test.ts` | 88 | 3041 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/internalAppointmentTool.test.ts` | 434 | 14550 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/internalKnowledgeRetrieve.test.ts` | 390 | 15013 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/internalLeadTool.test.ts` | 369 | 12598 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/internalRuntimeConfig.test.ts` | 201 | 8294 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/livekitSipOutbound.test.ts` | 399 | 13647 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/livekitTestToken.test.ts` | 354 | 13381 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/llm.test.ts` | 115 | 4113 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/password.test.ts` | 36 | 1248 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/persistence.test.ts` | 583 | 20922 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/plivoOutbound.test.ts` | 142 | 5280 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/promptCompiler.test.ts` | 180 | 8638 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/receptionistAppointment.test.ts` | 237 | 8032 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/runtimeAgentConfig.test.ts` | 280 | 10404 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/setup.ts` | 15 | 719 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/templateDefaults.test.ts` | 602 | 23468 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/testConversation.test.ts` | 162 | 5503 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/timezoneValidation.test.ts` | 173 | 5857 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/tokens.test.ts` | 70 | 2164 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/__tests__/toolCatalog.test.ts` | 401 | 14171 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/config/env.ts` | 93 | 3135 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/db/index.ts` | 11 | 312 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/db/redis.ts` | 23 | 495 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/db/schema.ts` | 698 | 26360 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/errors/runtimeConfigError.ts` | 17 | 539 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/index.ts` | 81 | 2441 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/lib/logger.ts` | 17 | 445 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/lib/password.ts` | 11 | 308 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/lib/tokens.ts` | 63 | 1639 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/auth.ts` | 98 | 2572 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/correlationId.ts` | 17 | 481 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/errorHandler.ts` | 56 | 1190 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/rateLimit.ts` | 55 | 1245 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/requestLogger.ts` | 24 | 738 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/validate.ts` | 17 | 494 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/middleware/workerAuth.ts` | 38 | 1414 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/admin.ts` | 297 | 9126 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/agents.ts` | 685 | 26121 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/auth.ts` | 327 | 10134 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/client.ts` | 550 | 16931 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/config-assistant.ts` | 133 | 4254 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/health.ts` | 38 | 883 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/internal.ts` | 467 | 18242 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/knowledge.ts` | 126 | 4278 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/receptionist.ts` | 380 | 11090 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/routes/test-conversation.ts` | 86 | 2737 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/scripts/clean-clients.ts` | 49 | 1783 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/scripts/seed.ts` | 69 | 2476 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/scripts/test-create-client.ts` | 23 | 818 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/scripts/test-email.ts` | 30 | 825 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/scripts/transcribe_chunks.ts` | 60 | 1860 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/scripts/transcribe_recording.py` | 65 | 2418 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/agent.ts` | 395 | 13064 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/agentChecklist.ts` | 115 | 5974 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/analytics.ts` | 205 | 7361 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/appointment.ts` | 203 | 7032 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/callSession.ts` | 165 | 5832 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/chunking.ts` | 55 | 1233 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/config-assistant.ts` | 365 | 13393 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/email/index.ts` | 14 | 524 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/email/resendAdapter.ts` | 58 | 1969 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/email/types.ts` | 4 | 198 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/embedding.ts` | 142 | 4275 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/followUp.ts` | 91 | 2830 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/index.ts` | 61 | 2488 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/knowledge.ts` | 165 | 5381 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/lead.ts` | 156 | 5022 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/livekit.ts` | 319 | 10569 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/llm.ts` | 147 | 4627 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/phoneNumber.ts` | 155 | 5096 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/plivo.ts` | 97 | 3087 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/promptCompiler.ts` | 214 | 13539 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/runtimeAgentConfig.ts` | 283 | 9859 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/storage.ts` | 110 | 3494 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/template.ts` | 881 | 40492 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/test-conversation.ts` | 52 | 1903 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/toolCatalog.ts` | 166 | 5075 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/variableInterpolator.ts` | 68 | 1950 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/voiceRegistry.ts` | 54 | 2957 | API Source | MIGRATE TO FASTAPI |
| `apps/api/src/services/whatsapp.ts` | 173 | 5418 | API Source | MIGRATE TO FASTAPI |
| `apps/api/tsconfig.json` | 27 | 627 | Doc/Config | AUDIT |
| `apps/api/vitest.config.ts` | 15 | 309 | Doc/Config | AUDIT |
| `apps/livekit-worker/.agents/skills/livekit-agents/SKILL.md` | 285 | 13470 | Doc/Config | AUDIT |
| `apps/livekit-worker/.agents/skills/livekit-agents/references/freshness-rules.md` | 168 | 5695 | Doc/Config | AUDIT |
| `apps/livekit-worker/.claude/skills/livekit-agents/SKILL.md` | 285 | 13470 | Doc/Config | AUDIT |
| `apps/livekit-worker/.claude/skills/livekit-agents/references/freshness-rules.md` | 168 | 5695 | Doc/Config | AUDIT |
| `apps/livekit-worker/.dockerignore` | 66 | 817 | Doc/Config | AUDIT |
| `apps/livekit-worker/.env.example` | 3 | 53 | Doc/Config | AUDIT |
| `apps/livekit-worker/.env.local` | 7 | 348 | Doc/Config | AUDIT |
| `apps/livekit-worker/.github/assets/livekit-mark.png` | 9 | 832 | Doc/Config | AUDIT |
| `apps/livekit-worker/.github/workflows/template-check.yml` | 31 | 1166 | Doc/Config | AUDIT |
| `apps/livekit-worker/.github/workflows/tests.yml` | 74 | 1633 | Doc/Config | AUDIT |
| `apps/livekit-worker/.gitignore` | 225 | 3049 | Doc/Config | AUDIT |
| `apps/livekit-worker/.npmrc` | 1 | 20 | Doc/Config | AUDIT |
| `apps/livekit-worker/.nvmrc` | 1 | 4 | Doc/Config | AUDIT |
| `apps/livekit-worker/.prettierignore` | 2 | 20 | Doc/Config | AUDIT |
| `apps/livekit-worker/.prettierrc` | 12 | 344 | Doc/Config | AUDIT |
| `apps/livekit-worker/AGENTS.md` | 55 | 4954 | Doc/Config | AUDIT |
| `apps/livekit-worker/CLAUDE.md` | 5 | 190 | Doc/Config | AUDIT |
| `apps/livekit-worker/Dockerfile` | 79 | 2773 | Doc/Config | AUDIT |
| `apps/livekit-worker/GEMINI.md` | 5 | 192 | Doc/Config | AUDIT |
| `apps/livekit-worker/LICENSE` | 21 | 1092 | Doc/Config | AUDIT |
| `apps/livekit-worker/README.md` | 147 | 8336 | Doc/Config | AUDIT |
| `apps/livekit-worker/eslint.config.ts` | 14 | 385 | Doc/Config | AUDIT |
| `apps/livekit-worker/package.json` | 41 | 1126 | Doc/Config | AUDIT |
| `apps/livekit-worker/pnpm-lock.yaml` | 3636 | 124793 | Doc/Config | AUDIT |
| `apps/livekit-worker/pnpm-workspace.yaml` | 4 | 85 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/appointmentTool.test.ts` | 572 | 21126 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/callSessionPersistence.test.ts` | 686 | 23391 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/dynamicToolCalling.test.ts` | 629 | 26968 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/endpointingAndTiming.test.ts` | 123 | 5512 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/leadTool.test.ts` | 362 | 13643 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/realToolCalling.test.ts` | 658 | 26172 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/realtimeVoiceRuntime.test.ts` | 210 | 8075 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/safeDisplayId.test.ts` | 50 | 2300 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/sarvamLlmWhitespace.test.ts` | 187 | 6852 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/timezoneTemporal.test.ts` | 162 | 8124 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/__tests__/toolRegistry.test.ts` | 271 | 8998 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/agent.test.ts` | 99 | 3897 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/agent.ts` | 180 | 9056 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/agentConfigMapping.test.ts` | 362 | 13671 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/calendarContext.test.ts` | 105 | 5276 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/calendarContext.ts` | 128 | 4218 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/callLifecycle.ts` | 101 | 3530 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/debugTranscript.test.ts` | 398 | 15084 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/debugTranscript.ts` | 548 | 18419 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/genericPromptSafety.test.ts` | 45 | 2374 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/knowledgeTool.test.ts` | 440 | 16660 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/knowledgeTool.ts` | 105 | 3864 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/languageManager.ts` | 602 | 21556 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/languageSwitching.test.ts` | 618 | 27718 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/main.ts` | 390 | 16236 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/realtimeTiming.ts` | 176 | 8490 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/runnerStability.test.ts` | 77 | 3706 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/runtimeConfigClient.test.ts` | 300 | 10952 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/runtimeConfigClient.ts` | 670 | 20893 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/runtimeConfigLoading.test.ts` | 278 | 11159 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/sarvamE2e.test.ts` | 45 | 1410 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/sarvamLlm.test.ts` | 199 | 7184 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/sarvamLlm.ts` | 397 | 13267 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/sarvamToolSmoke.test.ts` | 395 | 13149 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/temporalContext.test.ts` | 60 | 2680 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/temporalContext.ts` | 84 | 2453 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/tools/appointmentTool.ts` | 279 | 10587 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/tools/index.ts` | 3 | 104 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/tools/leadTool.ts` | 255 | 9071 | Doc/Config | AUDIT |
| `apps/livekit-worker/src/tools/toolRegistry.ts` | 281 | 10929 | Doc/Config | AUDIT |
| `apps/livekit-worker/taskfile.yaml` | 80 | 2778 | Doc/Config | AUDIT |
| `apps/livekit-worker/tsconfig.json` | 31 | 1138 | Doc/Config | AUDIT |
| `apps/pipecat-worker/.env` | 5 | 173 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/.env.example` | 14 | 367 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/.pytest_cache/.gitignore` | 2 | 37 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/.pytest_cache/CACHEDIR.TAG` | 4 | 191 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/.pytest_cache/README.md` | 8 | 302 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/.pytest_cache/v/cache/lastfailed` | 1 | 2 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/.pytest_cache/v/cache/nodeids` | 270 | 23382 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/Dockerfile` | 23 | 515 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/LIVEKIT_TO_PIPECAT_BEHAVIOR_PARITY_MATRIX.md` | 298 | 28525 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE14A_LLM_TTFT_AUDIT.md` | 178 | 10656 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE14B_LLM_TTFT_OPTIMIZATION.md` | 125 | 6887 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE15A_REAL_PSTN_ACCEPTANCE.md` | 187 | 11334 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE15B_POST_14B_E2E_REGRESSION.md` | 144 | 8382 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE16A_CRITICAL_LATENCY_AUDIT.md` | 245 | 25909 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE16B_TELEMETRY_AND_TURN_STATE_REPORT.md` | 325 | 22695 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE16C_TURN_ENDPOINTING_OPTIMIZATION.md` | 257 | 10552 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE16D_CALL_TRANSCRIPT_AND_TIMING.md` | 213 | 10570 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE16E_REAL_PSTN_DELAY_ROOT_CAUSE.md` | 349 | 18115 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE17A_LIVEKIT_VS_PIPECAT_STARTUP_FORENSIC.md` | 312 | 19514 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE17B17C_FINAL_LATENCY_OPTIMIZATION.md` | 348 | 16595 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE18A_CALL_LIFECYCLE_TRANSCRIPT_LATENCY_REPORT.md` | 120 | 8057 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE18C_PLIVO_STARTUP_FORENSICS_REPORT.md` | 360 | 20461 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE18D_PIPECAT_DIRECT_USAGE_FORENSIC_REPORT.md` | 525 | 32837 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE19A_TTS_FORENSIC_REPORT.md` | 314 | 19530 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE19B_TTS_RACE_FIX_REPORT.md` | 280 | 16797 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE20A_REAL_PSTN_LATENCY_FORENSIC_REPORT.md` | 559 | 30684 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE20B_LLM_HTTP_TTS_RECONNECT_FORENSIC_REPORT.md` | 484 | 28554 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE21A_SENTENCE_AGGREGATION_OPTIMIZATION_REPORT.md` | 285 | 16590 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE21B_LLM_CONNECTION_OPTIMIZATION_REPORT.md` | 269 | 14362 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE21C_REALTIME_LATENCY_FORENSIC_REPORT.md` | 578 | 29436 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE21_FINAL_LATENCY_OPTIMIZATION_REPORT.md` | 136 | 10571 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PHASE22_REALTIME_LATENCY_IMPLEMENTATION_REPORT.md` | 296 | 18096 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PIPECAT_OWNERSHIP_AUDIT.md` | 54 | 7629 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/PIPECAT_REFERENCE_VS_NEXTLITE.md` | 65 | 6695 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/README.md` | 191 | 7053 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/__init__.py` | 1 | 51 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/aggregators/__init__.py` | 4 | 182 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/aggregators/early_release_aggregator.py` | 265 | 11546 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/call_lifecycle.py` | 302 | 10605 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/call_session_client.py` | 338 | 13768 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/config.py` | 53 | 1741 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/greeting_cache.py` | 118 | 3957 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/language_manager.py` | 445 | 21523 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/language_processor.py` | 80 | 3292 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/main.py` | 1564 | 73003 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/runtime_config_client.py` | 537 | 21875 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/temporal_context.py` | 343 | 14267 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/tools/__init__.py` | 45 | 1145 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/tools/appointment_tool.py` | 291 | 12014 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/tools/knowledge_tool.py` | 122 | 4475 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/tools/lead_tool.py` | 240 | 9641 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/tools/tool_registry.py` | 480 | 18933 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/app/turn_timing.py` | 1132 | 57065 | Pipecat Worker | RETAIN & INTEGRATE |
| `apps/pipecat-worker/benchmark_phase21a_results.json` | 741 | 25455 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/phase19b_5calls_validation.json` | 4165 | 141637 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/phase21_combined_benchmark.json` | 32 | 571 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/phase21a_5calls_pstn_validation.json` | 7636 | 276647 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/phase21b_pstn_turn_metrics_summary.json` | 3109 | 110522 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/pyproject.toml` | 29 | 670 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/scratch/benchmark_phase13.py` | 98 | 4059 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/scratch/phase14a_ttft_benchmark.py` | 453 | 19692 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/scratch/phase21a_parsed_pstn_turns.json` | 768 | 26159 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/scratch/test_pipeline_e2e.py` | 211 | 7642 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/scratch/test_stt_benchmark.py` | 95 | 3714 | Doc/Config | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/__init__.py` | 1 | 43 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_call_lifecycle_finalization.py` | 491 | 20103 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_call_session_client.py` | 800 | 32450 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_language_manager.py` | 119 | 5327 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase18b_lifecycle_and_turn_telemetry.py` | 222 | 9918 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase18c_plivo_startup_and_greeting.py` | 349 | 16606 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase19_production_voice_latency.py` | 139 | 6322 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase19b_tts_race_and_telemetry.py` | 292 | 13110 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase21a_early_release_aggregation.py` | 211 | 7398 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase21b_shared_llm_connection.py` | 166 | 6569 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase22_latency_optimizations.py` | 67 | 2676 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase22a_cache_audio_correction.py` | 239 | 9015 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase22a_greeting_fast_path.py` | 77 | 2457 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phase6b_runtime_config_mapping.py` | 312 | 11786 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phone_pipeline_turnaround.py` | 470 | 18661 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_phone_transcript_and_timing.py` | 302 | 14673 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_plivo_echo.py` | 154 | 5333 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_realtime_streaming.py` | 220 | 8551 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_runtime_config_client.py` | 506 | 20673 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_runtime_gap_closure.py` | 44 | 1822 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_sarvam_llm_pipeline.py` | 200 | 7522 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_sarvam_pipeline.py` | 139 | 4479 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_temporal_context.py` | 242 | 10810 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_tool_registry.py` | 1178 | 44651 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/pipecat-worker/tests/test_turn_metrics_and_timing.py` | 737 | 30323 | Pipecat Test | RETAIN & INTEGRATE |
| `apps/web/.env` | 2 | 73 | Frontend | PRESERVE |
| `apps/web/.env.example` | 2 | 71 | Frontend | PRESERVE |
| `apps/web/index.html` | 17 | 803 | Frontend | PRESERVE |
| `apps/web/package.json` | 30 | 700 | Frontend | PRESERVE |
| `apps/web/postcss.config.js` | 6 | 81 | Frontend | PRESERVE |
| `apps/web/src/App.tsx` | 83 | 3634 | Frontend | PRESERVE |
| `apps/web/src/components/AdminLayout.tsx` | 76 | 2742 | Frontend | PRESERVE |
| `apps/web/src/components/ClientLayout.tsx` | 86 | 3172 | Frontend | PRESERVE |
| `apps/web/src/components/PhoneCallTest.tsx` | 882 | 43735 | Frontend | PRESERVE |
| `apps/web/src/components/ProtectedRoute.tsx` | 41 | 1369 | Frontend | PRESERVE |
| `apps/web/src/components/WebVoiceTest.tsx` | 318 | 11693 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/ChecklistPanel.tsx` | 126 | 5952 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/GuardrailsEditor.tsx` | 164 | 7157 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/PhaseBuilder.tsx` | 187 | 8586 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/PromptPreviewModal.tsx` | 79 | 3003 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/SettingsEditor.tsx` | 238 | 11490 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/ToolsManager.tsx` | 288 | 11623 | Frontend | PRESERVE |
| `apps/web/src/components/agent-builder/VariablesManager.tsx` | 246 | 10702 | Frontend | PRESERVE |
| `apps/web/src/components/client/ActivityFeed.tsx` | 112 | 4876 | Frontend | PRESERVE |
| `apps/web/src/components/client/AnalyticsChart.tsx` | 301 | 12562 | Frontend | PRESERVE |
| `apps/web/src/components/client/AppointmentDetailsDrawer.tsx` | 223 | 9057 | Frontend | PRESERVE |
| `apps/web/src/components/client/CallDetailsDrawer.tsx` | 323 | 14415 | Frontend | PRESERVE |
| `apps/web/src/components/client/CrmSidebar.tsx` | 192 | 8007 | Frontend | PRESERVE |
| `apps/web/src/components/client/CrmTopbar.tsx` | 70 | 2586 | Frontend | PRESERVE |
| `apps/web/src/components/client/EmptyState.tsx` | 25 | 1148 | Frontend | PRESERVE |
| `apps/web/src/components/client/LeadDetailsDrawer.tsx` | 210 | 8201 | Frontend | PRESERVE |
| `apps/web/src/components/client/LoadingSkeleton.tsx` | 38 | 1492 | Frontend | PRESERVE |
| `apps/web/src/components/client/MetricCard.tsx` | 65 | 1873 | Frontend | PRESERVE |
| `apps/web/src/components/client/TranscriptViewer.tsx` | 141 | 4941 | Frontend | PRESERVE |
| `apps/web/src/components/client/WhatsAppComposer.tsx` | 311 | 13413 | Frontend | PRESERVE |
| `apps/web/src/contexts/AuthContext.tsx` | 77 | 1952 | Frontend | PRESERVE |
| `apps/web/src/index.css` | 259 | 5619 | Frontend | PRESERVE |
| `apps/web/src/main.tsx` | 13 | 330 | Frontend | PRESERVE |
| `apps/web/src/pages/ForgotPassword.tsx` | 95 | 4211 | Frontend | PRESERVE |
| `apps/web/src/pages/Home.tsx` | 413 | 22964 | Frontend | PRESERVE |
| `apps/web/src/pages/Login.tsx` | 127 | 5519 | Frontend | PRESERVE |
| `apps/web/src/pages/ResetPassword.tsx` | 111 | 4417 | Frontend | PRESERVE |
| `apps/web/src/pages/VerifyEmail.tsx` | 152 | 6197 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/AgentBuilder.tsx` | 270 | 11488 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/AgentDetail.tsx` | 682 | 33642 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/AgentList.tsx` | 100 | 3242 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/ClientDetail.tsx` | 118 | 4540 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/ClientList.tsx` | 132 | 5921 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/ConfigAssistant.tsx` | 248 | 9934 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/CreateClient.tsx` | 202 | 8460 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/Dashboard.tsx` | 60 | 3474 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/KnowledgeManager.tsx` | 321 | 11209 | Frontend | PRESERVE |
| `apps/web/src/pages/admin/TestConversation.tsx` | 229 | 8918 | Frontend | PRESERVE |
| `apps/web/src/pages/client/Analytics.tsx` | 196 | 7957 | Frontend | PRESERVE |
| `apps/web/src/pages/client/Appointments.tsx` | 288 | 12385 | Frontend | PRESERVE |
| `apps/web/src/pages/client/Calls.tsx` | 313 | 13096 | Frontend | PRESERVE |
| `apps/web/src/pages/client/Dashboard.tsx` | 246 | 9035 | Frontend | PRESERVE |
| `apps/web/src/pages/client/FollowUps.tsx` | 252 | 10349 | Frontend | PRESERVE |
| `apps/web/src/pages/client/Leads.tsx` | 292 | 12112 | Frontend | PRESERVE |
| `apps/web/src/pages/client/PhoneAgents.tsx` | 189 | 8936 | Frontend | PRESERVE |
| `apps/web/src/pages/receptionist/ReceptionistDashboard.tsx` | 826 | 37000 | Frontend | PRESERVE |
| `apps/web/src/services/api.ts` | 355 | 13315 | Frontend | PRESERVE |
| `apps/web/src/types.ts` | 712 | 18731 | Frontend | PRESERVE |
| `apps/web/src/vite-env.d.ts` | 9 | 157 | Frontend | PRESERVE |
| `apps/web/tailwind.config.js` | 70 | 1599 | Frontend | PRESERVE |
| `apps/web/tsconfig.json` | 24 | 589 | Frontend | PRESERVE |
| `apps/web/tsconfig.tsbuildinfo` | 1 | 2058 | Frontend | PRESERVE |
| `apps/web/vite.config.ts` | 25 | 448 | Frontend | PRESERVE |
| `docs/01_PRODUCT_REQUIREMENTS.md` | 122 | 2918 | Doc/Config | AUDIT |
| `docs/02_ARCHITECTURE.md` | 149 | 4161 | Doc/Config | AUDIT |
| `docs/03_TECH_STACK.md` | 86 | 2643 | Doc/Config | AUDIT |
| `docs/04_USER_FLOWS.md` | 159 | 2316 | Doc/Config | AUDIT |
| `docs/05_AGENT_SYSTEM.md` | 112 | 2131 | Doc/Config | AUDIT |
| `docs/06_VOICE_RUNTIME.md` | 176 | 6216 | Doc/Config | AUDIT |
| `docs/07_DATA_MODEL.md` | 135 | 3142 | Doc/Config | AUDIT |
| `docs/08_API_CONTRACTS.md` | 81 | 1468 | Doc/Config | AUDIT |
| `docs/09_BILLING_DEPLOYMENT.md` | 106 | 2377 | Doc/Config | AUDIT |
| `docs/10_ADMIN_CLIENT_WORKSPACE.md` | 85 | 1296 | Doc/Config | AUDIT |
| `docs/11_CLIENT_DASHBOARD.md` | 53 | 838 | Doc/Config | AUDIT |
| `docs/12_N8N_INTEGRATION.md` | 53 | 855 | Doc/Config | AUDIT |
| `docs/13_SECURITY.md` | 89 | 2304 | Doc/Config | AUDIT |
| `docs/14_TESTING.md` | 73 | 1150 | Doc/Config | AUDIT |
| `docs/15_IMPLEMENTATION_PHASES.md` | 173 | 3871 | Doc/Config | AUDIT |
| `docs/16_DECISIONS.md` | 224 | 6293 | Doc/Config | AUDIT |
| `docs/17_INDEX.md` | 18 | 447 | Doc/Config | AUDIT |
| `docs/DESIGN-elevenlabs.md` | 504 | 20943 | Doc/Config | AUDIT |
| `docs/NEXTLITE_01_MASTER_ARCHITECTURE.md` | 249 | 23782 | Doc/Config | AUDIT |
| `docs/NEXTLITE_02_REPOSITORY_AND_FILE_ARCHITECTURE.md` | 315 | 21876 | Doc/Config | AUDIT |
| `docs/NEXTLITE_03_CONFIGURATION_AND_RUNTIME_CONFIG.md` | 172 | 22691 | Doc/Config | AUDIT |
| `docs/NEXTLITE_04_AGENT_VERSIONING_DEPLOYMENT_LIFECYCLE.md` | 166 | 9907 | Doc/Config | AUDIT |
| `docs/NEXTLITE_05_PROMPT_LANGUAGE_VOICE_ARCHITECTURE.md` | 185 | 13588 | Doc/Config | AUDIT |
| `docs/NEXTLITE_06_DATABASE_DATA_ARCHITECTURE.md` | 213 | 13818 | Doc/Config | AUDIT |
| `docs/NEXTLITE_07_API_AND_SERVICE_ARCHITECTURE.md` | 89 | 13194 | Doc/Config | AUDIT |
| `docs/NEXTLITE_08_RAG_AND_KNOWLEDGE_ARCHITECTURE.md` | 119 | 6079 | Doc/Config | AUDIT |
| `docs/NEXTLITE_09_TOOL_AND_ACTION_ARCHITECTURE.md` | 116 | 8144 | Doc/Config | AUDIT |
| `docs/NEXTLITE_10_TELEPHONY_AND_CALL_RUNTIME.md` | 124 | 7794 | Doc/Config | AUDIT |
| `docs/NEXTLITE_11_CRM_BUSINESS_ARCHITECTURE.md` | 91 | 4411 | Doc/Config | AUDIT |
| `docs/NEXTLITE_12_SECURITY_TENANCY_AND_AUTH.md` | 90 | 6324 | Doc/Config | AUDIT |
| `docs/NEXTLITE_13_FRONTEND_INTEGRATION_AND_PRODUCT_FLOW.md` | 53 | 7843 | Doc/Config | AUDIT |
| `docs/NEXTLITE_14_LIVEKIT_PIPECAT_MIGRATION_ARCHITECTURE.md` | 91 | 9195 | Doc/Config | AUDIT |
| `docs/NEXTLITE_15_RISKS_LEGACY_TESTS_AND_MIGRATION_GATES.md` | 212 | 16002 | Doc/Config | AUDIT |
| `docs/NEXTLITE_ACTUAL_ARCHITECTURE.md` | 125 | 8430 | Doc/Config | AUDIT |
| `docs/NEXTLITE_AGENT_LIFECYCLE.md` | 159 | 9390 | Doc/Config | AUDIT |
| `docs/NEXTLITE_API_CONTRACT_AUDIT.md` | 71 | 11467 | Doc/Config | AUDIT |
| `docs/NEXTLITE_ARCHITECTURE_RISKS.md` | 52 | 3249 | Doc/Config | AUDIT |
| `docs/NEXTLITE_ASYNC_ARCHITECTURE.md` | 36 | 2269 | Doc/Config | AUDIT |
| `docs/NEXTLITE_CALL_LIFECYCLE.md` | 124 | 6566 | Doc/Config | AUDIT |
| `docs/NEXTLITE_CONFIGURATION_GRAPH.md` | 53 | 4487 | Doc/Config | AUDIT |
| `docs/NEXTLITE_CONFIGURATION_SOURCE_OF_TRUTH.md` | 82 | 9884 | Doc/Config | AUDIT |
| `docs/NEXTLITE_CRM_ARCHITECTURE.md` | 84 | 4244 | Doc/Config | AUDIT |
| `docs/NEXTLITE_DATA_ARCHITECTURE.md` | 205 | 12793 | Doc/Config | AUDIT |
| `docs/NEXTLITE_DO_NOT_TOUCH_BOUNDARIES.md` | 72 | 5501 | Doc/Config | AUDIT |
| `docs/NEXTLITE_FILE_AUDIT.md` | 309 | 19730 | Doc/Config | AUDIT |
| `docs/NEXTLITE_FRONTEND_CONFIG_AUDIT.md` | 51 | 7682 | Doc/Config | AUDIT |
| `docs/NEXTLITE_HARDCODED_BEHAVIOR_AUDIT.md` | 35 | 3752 | Doc/Config | AUDIT |
| `docs/NEXTLITE_LANGUAGE_ARCHITECTURE.md` | 106 | 5970 | Doc/Config | AUDIT |
| `docs/NEXTLITE_LEGACY_DUPLICATION_AUDIT.md` | 34 | 3431 | Doc/Config | AUDIT |
| `docs/NEXTLITE_LIVEKIT_PIPECAT_BOUNDARY.md` | 46 | 5283 | Doc/Config | AUDIT |
| `docs/NEXTLITE_LIVEKIT_RESPONSIBILITY_AUDIT.md` | 66 | 5360 | Doc/Config | AUDIT |
| `docs/NEXTLITE_MASTER_ARCHITECTURE_AUDIT.md` | 101 | 11161 | Doc/Config | AUDIT |
| `docs/NEXTLITE_PIPECAT_CURRENT_STATE.md` | 72 | 4992 | Doc/Config | AUDIT |
| `docs/NEXTLITE_PIPECAT_REQUIREMENTS.md` | 76 | 5202 | Doc/Config | AUDIT |
| `docs/NEXTLITE_PROMPT_ARCHITECTURE.md` | 153 | 9343 | Doc/Config | AUDIT |
| `docs/NEXTLITE_RAG_ARCHITECTURE.md` | 108 | 5635 | Doc/Config | AUDIT |
| `docs/NEXTLITE_REPOSITORY_MAP.md` | 177 | 14450 | Doc/Config | AUDIT |
| `docs/NEXTLITE_RUNTIME_CONFIG_AUDIT.md` | 51 | 10156 | Doc/Config | AUDIT |
| `docs/NEXTLITE_SECURITY_BOUNDARY_AUDIT.md` | 88 | 5629 | Doc/Config | AUDIT |
| `docs/NEXTLITE_TELEPHONY_ARCHITECTURE.md` | 79 | 4513 | Doc/Config | AUDIT |
| `docs/NEXTLITE_TEST_COVERAGE_AUDIT.md` | 73 | 4845 | Doc/Config | AUDIT |
| `docs/NEXTLITE_TOOL_ARCHITECTURE.md` | 107 | 7029 | Doc/Config | AUDIT |
| `docs/NEXTLITE_VOICE_RUNTIME_AUDIT.md` | 56 | 4659 | Doc/Config | AUDIT |
| `docs/PHASE17A_LIVEKIT_VS_PIPECAT_STARTUP_FORENSIC.md` | 312 | 19514 | Doc/Config | AUDIT |
| `docs/PHASE17B17C_FINAL_LATENCY_OPTIMIZATION.md` | 348 | 16595 | Doc/Config | AUDIT |
| `docs/PHASE18A_CALL_LIFECYCLE_TRANSCRIPT_LATENCY_REPORT.md` | 120 | 8057 | Doc/Config | AUDIT |
| `docs/PHASE18B_REAL_PSTN_LIFECYCLE_STARTUP_FORENSICS_REPORT.md` | 173 | 10481 | Doc/Config | AUDIT |
| `docs/PHASE19_PRODUCTION_VOICE_LATENCY_OPTIMIZATION_REPORT.md` | 143 | 8863 | Doc/Config | AUDIT |
| `knowledge_base/01_clinic_overview.md` | 101 | 5058 | Doc/Config | AUDIT |
| `knowledge_base/02_doctors_and_opd_schedule.md` | 124 | 6317 | Doc/Config | AUDIT |
| `knowledge_base/03_consultation_fees_and_appointments.md` | 106 | 5264 | Doc/Config | AUDIT |
| `knowledge_base/04_faqs_emergency_and_policies.md` | 102 | 7310 | Doc/Config | AUDIT |
| `package-lock.json` | 12874 | 400973 | Doc/Config | AUDIT |
| `package.json` | 24 | 724 | Doc/Config | AUDIT |
| `packages/shared/package.json` | 25 | 552 | Shared | AUDIT |
| `packages/shared/src/index.ts` | 2 | 64 | Shared | AUDIT |
| `packages/shared/src/runtimeConfig.ts` | 225 | 6737 | Shared | AUDIT |
| `packages/shared/src/types.ts` | 290 | 6946 | Shared | AUDIT |
| `packages/shared/tsconfig.json` | 16 | 383 | Shared | AUDIT |
| `pnpm-lock.yaml` | 9 | 114 | Doc/Config | AUDIT |
| `scratch/benchmark_phase22_master.py` | 295 | 14969 | Doc/Config | AUDIT |
| `scratch/inspect_sarvam_chunks.py` | 73 | 2904 | Doc/Config | AUDIT |
| `scratch/test_live_tts_frame.py` | 64 | 2195 | Doc/Config | AUDIT |
| `scratch/test_sarvam_sample_rates.py` | 73 | 2574 | Doc/Config | AUDIT |