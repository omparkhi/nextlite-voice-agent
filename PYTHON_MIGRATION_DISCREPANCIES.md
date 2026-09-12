# NextLite Voice V3 — Forensic Discrepancies Log

**Audit Date:** September 2026

---

## 1. Pre-Migration Baseline Discrepancies

1. **`apps/api/src/routes/client.ts:222` Typecheck Anomaly:**
   - **Finding:** TypeScript static analysis identifies `error TS2304: Cannot find name 'callSessions'` on line 222 of `client.ts` in Node API.
   - **Resolution:** Python FastAPI implementation will use properly typed SQLAlchemy queries against the `CallSession` model, eliminating this type reference defect.
2. **Dual Prompt Compiler Implementations:**
   - **Finding:** Prompt compilation logic was partially duplicated across `apps/api/src/services/promptCompiler.ts` (TypeScript) and `apps/pipecat-worker/app/prompt_builder.py` (Python).
   - **Resolution:** Unified into one authoritative Python `PromptCompilerService` in `packages/domain/prompts.py`.
3. **HTTP Internal Boundary Overhead:**
   - **Finding:** Worker tool execution (`/api/internal/tools/execute`) and call session finalization (`/api/internal/call-sessions/:id`) traversed HTTP localhost loopback.
   - **Resolution:** Python Shared Domain Layer enables direct async service calls from Pipecat while preserving REST endpoints for external distributed worker nodes.