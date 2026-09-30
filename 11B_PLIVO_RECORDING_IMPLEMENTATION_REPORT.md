# Implementation Report: Task 11B — Plivo Call Recording + Exact Call Correlation

**Core Invariant:** *"One dashboard call must never display the recording of another call."*

---

## 1. Executive Summary

Task 11B completes the end-to-end integration for Plivo Call Recordings in NextLite Voice V3. It strictly enforces the core invariant by linking recordings to call sessions exclusively through the **Plivo `CallUUID`**.

### Hard Boundary Decisions:
1. **Zero External/Custom Audio Storage:** Plivo is the sole audio recording storage provider. No S3, AWS, Azure Blob, Cloudflare R2, or local audio downloading is used. NextLite stores only recording metadata, status, and the exact correlation link.
2. **Deterministic Correlation Key:** Correlating recordings by phone number, timestamp, duration, agent, or fuzzy heuristics is strictly disallowed. Only `Plivo CallUUID -> CallSession.plivo_call_uuid -> CallRecording.plivo_call_uuid` is permitted.
3. **Fail-Safe Unmatched Handling:** If Plivo delivers a recording callback before a `CallSession` is created or if no session matches, the recording is stored safely as `UNMATCHED` and automatically reconciled when the matching session is initialized or finalized.
4. **Zero Voice Pipeline Regression:** Recording is configured asynchronously via Plivo XML `<Record recordSession="true" ... />`. The live audio pipeline (Sarvam STT, Sarvam LLM, Sarvam TTS, VAD, tools, interruption) executes without any blocking operations.

---

## 2. Architecture Diagram

```
Plivo PSTN Inbound / Outbound Call
      │
      ├───────────────────────────────────┐
      ▼                                   ▼
Plivo XML Answer                     Plivo Media Stream
<Record recordSession="true" ...>    <Stream ...>
      │                                   │
      │ (Audio recording in background)   ▼
      │                             Pipecat Worker
      │                             (Realtime Audio Loop)
      │                             Sarvam STT ↔ LLM ↔ TTS
      │                                   │
      │                             _bg_create_call_session
      │                             (plivoCallUuid = CallUUID)
      │                                   │
      │                                   ▼
      │                             PostgreSQL
      │                             call_sessions.plivo_call_uuid
      ▼
Call Hangup / Recording Completed
      │
      ▼
Plivo Callback (POST /api/webhooks/plivo/recordings)
[CallUUID, RecordingID, RecordUrl, Duration]
      │
      ├─► [EXACT MATCH]  ──► CallRecording (status=AVAILABLE, callSessionId=UUID)
      └─► [NO MATCH YET] ──► CallRecording (status=UNMATCHED, callSessionId=NULL)
                                  │
                                  ▼ (Auto-reconciled on session init/finalization)

Authenticated Dashboard Client
GET /api/client/calls/{call_id}/recording
      │ (Validates authenticated tenant == CallSession.tenant_id == CallRecording.tenant_id)
      ▼
Returns { status: "AVAILABLE", recordingUrl: "https://media.plivo.com/...", streamUrl: "/api/client/calls/:id/recording/stream" }
      │
      ▼
CallDetailsDrawer UI Audio Player
```

---

## 3. Plivo Recording Configuration

Plivo call recording is configured directly in the Plivo XML generation layer without restructuring call routing:

1. **Worker Inbound Gateway ([`apps/pipecat-worker/app/main.py:plivo_inbound_xml`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L440-L465)):**
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <Response>
       <Record action="{callback_url}" callbackUrl="{callback_url}" callbackMethod="POST" recordSession="true" />
       <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=8000">{xml_ws_url}</Stream>
   </Response>
   ```
2. **Telephony Service ([`apps/api/app/services/telephony_service.py:generate_plivo_answer_xml`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/services/telephony_service.py#L20-L35)):**
   - Incorporates `<Record recordSession="true" ... />` when a `callback_url` is supplied.
3. **Outbound Calls:**
   - Outbound calls dispatched via Plivo REST API target the answer XML URL which automatically applies session recording upon recipient answer.

---

## 4. CallUUID Correlation Flow

| Step | Component | Action |
| :--- | :--- | :--- |
| 1 | Plivo PSTN | Initiates call with real Plivo `CallUUID` (e.g. `c748fa2b-65c3-4d4b-944a-d68a91345476`). |
| 2 | Worker WebSocket | Connects to `wss://worker/ws/plivo?callId=c748fa2b...`. |
| 3 | Worker Session Init | Dispatches `CreateCallSessionRequest(room_name=stream_id, plivo_call_uuid=c748fa2b...)`. |
| 4 | Database | Persists `call_sessions` row with `plivo_call_uuid = 'c748fa2b...'`. |
| 5 | Plivo Webhook | Plivo posts recording callback with `CallUUID = 'c748fa2b...'` and `RecordingID = 'rec_1001'`. |
| 6 | Exact Match Query | `SELECT * FROM call_sessions WHERE plivo_call_uuid = 'c748fa2b...'`. |
| 7 | Correlation | Creates `call_recordings` row linked to `call_sessions.id`. |

---

## 5. CallRecording Schema & Database Migration

### Database Schema ([`apps/api/app/models.py:CallRecording`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/models.py#L366-L382)):

```python
class RecordingStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    PENDING = "PENDING"
    UNMATCHED = "UNMATCHED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"

class CallRecording(Base):
    __tablename__ = "call_recordings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[Optional[uuid.UUID]] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    callSessionId: Mapped[Optional[uuid.UUID]] = mapped_column("call_session_id", UUID(as_uuid=True), ForeignKey("call_sessions.id", ondelete="SET NULL"), nullable=True, unique=True, index=True)
    plivoCallUuid: Mapped[str] = mapped_column("plivo_call_uuid", String(100), nullable=False, index=True)
    plivoRecordingId: Mapped[str] = mapped_column("plivo_recording_id", String(100), nullable=False, unique=True, index=True)
    recordingUrl: Mapped[str] = mapped_column("recording_url", Text, nullable=False)
    recordingFormat: Mapped[str] = mapped_column("recording_format", String(20), nullable=False, default="mp3")
    durationSeconds: Mapped[int] = mapped_column("duration_seconds", Integer, default=0, nullable=False)
    status: Mapped[RecordingStatus] = mapped_column(SQLEnum(RecordingStatus, name="recording_status", native_enum=False), nullable=False, default=RecordingStatus.PENDING, index=True)
    metadataJson: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True, default=dict)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

### Idempotent Migration ([`apps/api/app/db.py:init_db`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/db.py#L86-L104)):
```sql
CREATE TABLE IF NOT EXISTS call_recordings (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
    plivo_call_uuid VARCHAR(100) NOT NULL,
    plivo_recording_id VARCHAR(100) NOT NULL,
    recording_url TEXT NOT NULL,
    recording_format VARCHAR(20) NOT NULL DEFAULT 'mp3',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_recordings_plivo_call_uuid ON call_recordings (plivo_call_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_recordings_plivo_recording_id ON call_recordings (plivo_recording_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_recordings_call_session_id ON call_recordings (call_session_id) WHERE call_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_recordings_tenant_id ON call_recordings (tenant_id);
```

---

## 6. Webhook Implementation

- **Endpoint:** `POST /api/webhooks/plivo/recordings` (and worker proxy `/api/v1/telephony/plivo/recordings`)
- **Implemented in:** [`apps/api/app/routers/webhooks.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/routers/webhooks.py)
- **Features:**
  - Extracts `CallUUID`, `RecordingID`, `RecordUrl`, `RecordingDuration`, `RecordingFormat` from form data, query parameters, or JSON payloads.
  - Rejects malformed callbacks missing required keys safely.
  - Queries `CallSession` strictly by `plivo_call_uuid == call_uuid`.

---

## 7. Unmatched Recording Handling & Reconciliation

If a recording arrives before its `CallSession` row exists:
1. `CallRecording` is inserted with `status = RecordingStatus.UNMATCHED`, `callSessionId = NULL`, and `tenantId = NULL`.
2. No guessing or heuristics are applied.
3. When the matching `CallSession` is subsequently created (`create_call_session`) or finalized (`finalize_call_session`), `reconcile_unmatched_recording()` is triggered.
4. The unmatched recording is atomically attached to the exact `CallSession` and promoted to `status = AVAILABLE`.

---

## 8. Duplicate Callback Handling

- The unique constraint `uq_call_recordings_plivo_recording_id` prevents duplicate rows for the same `plivo_recording_id`.
- The webhook checks for existing rows with `plivoRecordingId == clean_recording_id` and updates metadata/status in-place instead of creating duplicate records.

---

## 9. Secure Playback API

Endpoints in [`apps/api/app/routers/client.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/routers/client.py#L130-L225):

1. `GET /api/client/calls/{call_id}/recording`:
   - Authenticates request and resolves tenant ID from JWT.
   - Verifies `CallSession` belongs to authenticated tenant.
   - Returns `{ status: "AVAILABLE", recordingUrl: "...", streamUrl: "..." }`, or `{ status: "PENDING" }` if call is active, or `{ status: "UNAVAILABLE" }`.
   - Never exposes raw Plivo credentials or unmatched recordings to unauthorized callers.

2. `GET /api/client/calls/{call_id}/recording/stream`:
   - Verifies tenant authorization and redirects (HTTP 307) directly to the authenticated Plivo recording URL.

---

## 10. Frontend Changes

Implemented in [`apps/web/src/components/client/CallDetailsDrawer.tsx`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/web/src/components/client/CallDetailsDrawer.tsx):
- State is strictly scoped and reset on `call.id` transitions.
- **Available Recording:** Custom inline player with Play/Pause button, timeline seeker bar, current time / total duration display, and 1x/1.25x/1.5x/2x playback speed toggling.
- **Pending Recording:** Pulsing badge with "Recording processing..." and one-click manual refresh button.
- **Unavailable Recording:** Clean muted badge "Recording unavailable".

---

## 11. Multi-Tenant Security

1. All client endpoints (`/api/client/calls/{id}/recording`) require a valid JWT with tenant scoping.
2. Cross-tenant access attempts fail with `404 Not Found` / `403 Forbidden`.
3. Tenant A can never view, stream, or enumerate recordings belonging to Tenant B.

---

## 12. Voice Pipeline Safety Verification

1. **Zero Blocking DB Operations in Audio Loop:** Plivo recordings are generated asynchronously by Plivo's carrier servers.
2. **Zero STT/LLM/TTS Interference:** Sarvam STT, Sarvam LLM, and Sarvam TTS execution loops are entirely decoupled from recording webhooks.
3. **Fail-Open Resilience:** If recording callbacks are delayed, malformed, or fail, the live conversation is unaffected.

---

## 13. Automated Test Verification Results

### Test Suite 1: Call Recording & Exact Correlation Suite (`tests/api/test_call_recording_p11b.py`)
- `test_recording_webhook_exact_call_uuid_correlation`: **PASSED** (Valid CallUUID attaches to exact CallSession).
- `test_recording_webhook_unknown_call_uuid_stored_as_unmatched`: **PASSED** (Unknown CallUUID stored as UNMATCHED, never attached).
- `test_reconciliation_when_call_session_created_after_recording`: **PASSED** (Automatic race condition reconciliation).
- `test_same_phone_number_different_recordings_isolation`: **PASSED** (Two calls from same number remain isolated).
- `test_duplicate_webhook_callback_idempotency`: **PASSED** (Duplicate callbacks update existing without duplicate rows).
- `test_client_recording_api_tenant_security`: **PASSED** (Multi-tenant authorization and streaming verification).
- `test_malformed_missing_identifiers_ignored`: **PASSED** (Malformed webhooks rejected safely).

**Result:** **7 of 7 PASSED (100%)**

### Test Suite 2: Combined Regression Suite
- `tests/api/test_call_sessions_identity_p11a.py`: **4 of 4 PASSED**
- `tests/api/test_call_recording_p11b.py`: **7 of 7 PASSED**
- `apps/pipecat-worker/tests/test_call_session_client.py`: **24 of 24 PASSED**
- `tests/repositories/test_repositories.py`: **3 of 3 PASSED**
- `tests/api/test_client_and_admin_crm.py`: **3 of 3 PASSED**

**Overall Result:** **41 of 41 PASSED (100%)**

---

## 14. Real PSTN Validation Guidance

For live staging/production PSTN verification:
1. Place Call A to the NextLite DID from test phone (+91XXXXXXXXXX).
2. Talk for 15 seconds, complete appointment/farewell, and hang up.
3. Observe Plivo callback hitting `/api/webhooks/plivo/recordings` with `CallUUID-A` and `RecordingID-A`.
4. Place Call B immediately from the same test phone (+91XXXXXXXXXX).
5. Talk for 30 seconds, then hang up.
6. Open NextLite Dashboard > Calls > Call A drawer: verify only Recording A is loaded and playable.
7. Open Call B drawer: verify only Recording B is loaded and playable.

---

## 15. Files Changed

| File Path | Description of Changes |
| :--- | :--- |
| [`apps/api/app/models.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/models.py#L99-L110) | Added `RecordingStatus` enum and `CallRecording` database entity. |
| [`apps/api/app/db.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/db.py#L86-L104) | Added `call_recordings` table creation and index migrations. |
| [`apps/api/app/routers/webhooks.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/routers/webhooks.py) | Created Plivo recording webhook receiver with exact correlation, unmatched storage, and reconciliation. |
| [`apps/api/app/routers/internal.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/routers/internal.py#L107-L200) | Added automatic recording reconciliation on call creation and finalization. |
| [`apps/api/app/routers/client.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/routers/client.py#L130-L225) | Added `GET /api/client/calls/{id}/recording` and `GET /api/client/calls/{id}/recording/stream` with tenant authorization. |
| [`apps/api/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/main.py#L9-L138) | Mounted `webhooks.router` on FastAPI application. |
| [`apps/api/app/services/telephony_service.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/api/app/services/telephony_service.py#L18-L35) | Added session recording support in Plivo XML generation. |
| [`apps/pipecat-worker/app/main.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/pipecat-worker/app/main.py#L445-L495) | Added `<Record recordSession="true" ... />` to inbound Plivo XML and added webhook forwarding proxy. |
| [`apps/web/src/types.ts`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/web/src/types.ts#L535-L555) | Added `CallRecordingResponse` type definition and `plivoCallUuid` to `CallSession`. |
| [`apps/web/src/services/api.ts`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/web/src/services/api.ts#L220-L235) | Added `getClientCallRecording` client API method. |
| [`apps/web/src/components/client/CallDetailsDrawer.tsx`](file:///e:/NextLite/nextlite-voice-engineering-spec/apps/web/src/components/client/CallDetailsDrawer.tsx) | Implemented interactive Call Recording Audio Player with Play/Pause, seeker, speed toggle, and pending/unavailable states. |
| [`tests/api/test_call_recording_p11b.py`](file:///e:/NextLite/nextlite-voice-engineering-spec/tests/api/test_call_recording_p11b.py) | Created comprehensive test suite verifying all Task 11B scenarios. |

---

## 16. Known Limitations

- Historical `CallSession` records prior to Task 11A do not have a `plivo_call_uuid` and therefore have `status = UNAVAILABLE`.
- Web-based simulator calls do not produce Plivo recordings.

---

## 17. Final Validation Status

- **Status:** **COMPLETE & VERIFIED**
- **Test Suites:** 100% passing across 41 automated tests.
- **Invariant Adherence:** Strictly proven at code and database levels.
