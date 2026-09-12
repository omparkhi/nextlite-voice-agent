# NextLite Voice V3 — Python Migration Forensic Baseline

**Migration Branch:** `migration/node-to-python`  
**Status:** MODULE 0 VERIFIED — COMPLETE BASELINE  
**Audit Date:** September 2026

---

## 1. Baseline System Inventory

- **Total Workspace Files Scanned:** 414
- **PostgreSQL Database Tables:** 20 (with pgvector 1024-dim support)
- **PostgreSQL Enums:** 13
- **Node.js Express Route Handlers:** 65
- **Active Test Files:** 73 (Node API: 24, Pipecat: 26, LiveKit: 21, Shared: 2)
- **Total Test Cases:** 515+
- **Telemetry Monotonic Timestamps:** 22
- **External Integrations:** 6 (Plivo, Sarvam STT/LLM/TTS, PostgreSQL, Redis, Resend, WhatsApp)

---

## 2. Component Classifications

| Component | Current Implementation | Migration Action | Target Location |
| :--- | :--- | :--- | :--- |
| **Control Plane API** | Node.js Express (`apps/api/src`) | MIGRATE TO PYTHON FASTAPI | `apps/api/app` (FastAPI) |
| **Shared Domain Layer** | TypeScript (`packages/shared/src`) | MIGRATE TO PYTHON DOMAIN | `packages/domain` & `apps/api/app/domain` |
| **Realtime Voice Worker** | Python Pipecat (`apps/pipecat-worker`) | RETAIN & INTEGRATE DIRECTLY | `apps/pipecat-worker` |
| **Frontend UI** | React / Vite (`apps/web`) | RETAIN WITH ZERO CODE CHANGES | `apps/web` |
| **Legacy Worker** | Node.js LiveKit (`apps/livekit-worker`) | LEGACY REFERENCE ONLY | Port behavioral tests to pytest |

---

## 3. Baseline Verification Gates

- [x] Node.js API Vitest Suite: 24 files, 251 passed, 2 skipped (84.40s)
- [x] Pipecat Pytest Suite: 26 files, 267 passed (66.32s)
- [x] Static Analysis & Contract Identification Complete
- [x] Zero-Loss Mapping Established