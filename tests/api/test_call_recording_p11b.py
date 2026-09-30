import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from apps.api.app.main import app
from apps.api.app.config import settings
from apps.api.app.auth.tokens import generate_access_token
from apps.api.app.models import (
    CallSession, CallRecording, RecordingStatus,
    Tenant, User, UserRole, Agent, AgentTemplate
)
from apps.api.app.db import AsyncSessionLocal, init_db
from apps.api.app.services.template_service import SYSTEM_TEMPLATES

async def get_or_create_default_template(session) -> uuid.UUID:
    default_tmpl = SYSTEM_TEMPLATES[0]
    tmpl = await session.get(AgentTemplate, default_tmpl["id"])
    if not tmpl:
        tmpl = AgentTemplate(
            id=default_tmpl["id"],
            name=default_tmpl["name"],
            description=default_tmpl["description"],
            industry=default_tmpl["industry"],
            defaultConfiguration=default_tmpl["default_configuration"],
            isSystem=True
        )
        session.add(tmpl)
        await session.flush()
    return tmpl.id

@pytest.mark.asyncio
async def test_recording_webhook_exact_call_uuid_correlation():
    """1. Valid CallUUID in Plivo callback attaches to the exact CallSession."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {settings.WORKER_API_SECRET}"}

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    plivo_uuid = f"plivo-corr-{uuid.uuid4().hex[:12]}"
    rec_id = f"REC-{uuid.uuid4().hex[:12]}"
    rec_url = f"https://media.plivo.com/recordings/{rec_id}.mp3"

    async with AsyncSessionLocal() as db:
        tmpl_id = await get_or_create_default_template(db)
        tenant = Tenant(id=tenant_id, name="Cardio Clinic", slug=f"cardio-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Cardio Voice")
        db.add(tenant)
        db.add(agent)
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create CallSession with Plivo CallUUID
        cs_payload = {
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": plivo_uuid,
            "roomName": "room-corr-1",
            "callerNumber": "+919111111111",
            "direction": "INBOUND",
            "status": "ACTIVE"
        }
        res_cs = await ac.post("/api/internal/call-sessions", json=cs_payload, headers=headers)
        assert res_cs.status_code == 201
        session_id = res_cs.json()["id"]

        # Plivo sends recording callback
        webhook_payload = {
            "CallUUID": plivo_uuid,
            "RecordingID": rec_id,
            "RecordUrl": rec_url,
            "RecordingDuration": "45",
            "RecordingFormat": "mp3"
        }
        res_wh = await ac.post("/api/webhooks/plivo/recordings", data=webhook_payload)
        assert res_wh.status_code == 200
        wh_data = res_wh.json()
        assert wh_data["status"] == "attached"
        assert wh_data["callSessionId"] == session_id
        assert wh_data["recordingStatus"] == "AVAILABLE"

        # Verify in DB
        async with AsyncSessionLocal() as db:
            rec = await db.get(CallRecording, uuid.UUID(wh_data["recordingId"]))
            assert rec is not None
            assert rec.callSessionId == uuid.UUID(session_id)
            assert rec.tenantId == tenant_id
            assert rec.plivoCallUuid == plivo_uuid
            assert rec.plivoRecordingId == rec_id
            assert rec.recordingUrl == rec_url
            assert rec.durationSeconds == 45
            assert rec.status == RecordingStatus.AVAILABLE

@pytest.mark.asyncio
async def test_recording_webhook_unknown_call_uuid_stored_as_unmatched():
    """2. & 3. Unknown CallUUID is persisted as UNMATCHED and never attached to existing calls."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {settings.WORKER_API_SECRET}"}

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    existing_uuid = f"plivo-exist-{uuid.uuid4().hex[:12]}"
    unmatched_uuid = f"plivo-orphan-{uuid.uuid4().hex[:12]}"
    rec_id = f"REC-orphan-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        tmpl_id = await get_or_create_default_template(db)
        tenant = Tenant(id=tenant_id, name="Dental Care", slug=f"dental-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Dental Agent")
        db.add(tenant)
        db.add(agent)
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create unrelated CallSession
        cs_payload = {
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": existing_uuid,
            "roomName": "room-exist",
            "callerNumber": "+919222222222"
        }
        res_cs = await ac.post("/api/internal/call-sessions", json=cs_payload, headers=headers)
        assert res_cs.status_code == 201

        # Plivo sends recording with unknown CallUUID
        res_wh = await ac.post("/api/webhooks/plivo/recordings", data={
            "CallUUID": unmatched_uuid,
            "RecordingID": rec_id,
            "RecordUrl": f"https://media.plivo.com/recordings/{rec_id}.mp3",
            "RecordingDuration": "30"
        })
        assert res_wh.status_code == 200
        wh_data = res_wh.json()
        assert wh_data["status"] == "unmatched"
        assert wh_data["recordingStatus"] == "UNMATCHED"

        # Verify recording has no callSessionId
        async with AsyncSessionLocal() as db:
            rec = await db.get(CallRecording, uuid.UUID(wh_data["recordingId"]))
            assert rec is not None
            assert rec.callSessionId is None
            assert rec.tenantId is None
            assert rec.status == RecordingStatus.UNMATCHED
            assert rec.plivoCallUuid == unmatched_uuid

@pytest.mark.asyncio
async def test_reconciliation_when_call_session_created_after_recording():
    """11. An UNMATCHED recording is automatically reconciled when CallSession is later created."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {settings.WORKER_API_SECRET}"}

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    plivo_uuid = f"plivo-race-{uuid.uuid4().hex[:12]}"
    rec_id = f"REC-early-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        tmpl_id = await get_or_create_default_template(db)
        tenant = Tenant(id=tenant_id, name="Neuro Clinic", slug=f"neuro-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Neuro Agent")
        db.add(tenant)
        db.add(agent)
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Step 1: Recording arrives early before CallSession creation
        res_wh = await ac.post("/api/webhooks/plivo/recordings", data={
            "CallUUID": plivo_uuid,
            "RecordingID": rec_id,
            "RecordUrl": f"https://media.plivo.com/recordings/{rec_id}.mp3",
            "RecordingDuration": "60"
        })
        assert res_wh.status_code == 200
        assert res_wh.json()["recordingStatus"] == "UNMATCHED"
        rec_db_id = res_wh.json()["recordingId"]

        # Step 2: CallSession is now created with the matching plivo_call_uuid
        res_cs = await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": plivo_uuid,
            "roomName": "room-race"
        }, headers=headers)
        assert res_cs.status_code == 201
        session_id = res_cs.json()["id"]

        # Step 3: Verify the early UNMATCHED recording was automatically attached!
        async with AsyncSessionLocal() as db:
            rec = await db.get(CallRecording, uuid.UUID(rec_db_id))
            assert rec is not None
            assert rec.callSessionId == uuid.UUID(session_id)
            assert rec.tenantId == tenant_id
            assert rec.status == RecordingStatus.AVAILABLE

@pytest.mark.asyncio
async def test_same_phone_number_different_recordings_isolation():
    """4. & 5. Two consecutive calls from the same phone number have distinct CallUUIDs and separate recordings."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {settings.WORKER_API_SECRET}"}

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    phone = "+919657954641"
    uuid_a = f"plivo-call-A-{uuid.uuid4().hex[:8]}"
    uuid_b = f"plivo-call-B-{uuid.uuid4().hex[:8]}"
    rec_a = f"REC-A-{uuid.uuid4().hex[:8]}"
    rec_b = f"REC-B-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        tmpl_id = await get_or_create_default_template(db)
        tenant = Tenant(id=tenant_id, name="MultiCall Clinic", slug=f"multicall-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Agent")
        db.add(tenant)
        db.add(agent)
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create Call A
        res_a = await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": uuid_a,
            "roomName": "stream-A",
            "callerNumber": phone
        }, headers=headers)
        session_id_a = res_a.json()["id"]

        # Create Call B
        res_b = await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": uuid_b,
            "roomName": "stream-B",
            "callerNumber": phone
        }, headers=headers)
        session_id_b = res_b.json()["id"]

        # Post Webhook for Call A
        await ac.post("/api/webhooks/plivo/recordings", data={
            "CallUUID": uuid_a,
            "RecordingID": rec_a,
            "RecordUrl": f"https://media.plivo.com/{rec_a}.mp3",
            "RecordingDuration": "20"
        })

        # Post Webhook for Call B
        await ac.post("/api/webhooks/plivo/recordings", data={
            "CallUUID": uuid_b,
            "RecordingID": rec_b,
            "RecordUrl": f"https://media.plivo.com/{rec_b}.mp3",
            "RecordingDuration": "40"
        })

        # Verify DB separation
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            q_a = await db.execute(select(CallRecording).where(CallRecording.callSessionId == uuid.UUID(session_id_a)))
            r_a = q_a.scalar_one_or_none()
            assert r_a is not None
            assert r_a.plivoRecordingId == rec_a
            assert r_a.durationSeconds == 20

            q_b = await db.execute(select(CallRecording).where(CallRecording.callSessionId == uuid.UUID(session_id_b)))
            r_b = q_b.scalar_one_or_none()
            assert r_b is not None
            assert r_b.plivoRecordingId == rec_b
            assert r_b.durationSeconds == 40

            assert r_a.id != r_b.id

@pytest.mark.asyncio
async def test_duplicate_webhook_callback_idempotency():
    """7. Duplicate Plivo recording callbacks update existing row without creating duplicates."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {settings.WORKER_API_SECRET}"}

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    plivo_uuid = f"plivo-dup-{uuid.uuid4().hex[:12]}"
    rec_id = f"REC-dup-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        tmpl_id = await get_or_create_default_template(db)
        tenant = Tenant(id=tenant_id, name="Idempotent Care", slug=f"idemp-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Agent")
        db.add(tenant)
        db.add(agent)
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": plivo_uuid,
            "roomName": "stream-dup"
        }, headers=headers)

        payload = {
            "CallUUID": plivo_uuid,
            "RecordingID": rec_id,
            "RecordUrl": f"https://media.plivo.com/{rec_id}.mp3",
            "RecordingDuration": "25"
        }
        res1 = await ac.post("/api/webhooks/plivo/recordings", data=payload)
        assert res1.status_code == 200
        rec_id_1 = res1.json()["recordingId"]

        # Duplicate delivery
        res2 = await ac.post("/api/webhooks/plivo/recordings", data=payload)
        assert res2.status_code == 200
        rec_id_2 = res2.json()["recordingId"]

        assert rec_id_1 == rec_id_2

@pytest.mark.asyncio
async def test_client_recording_api_tenant_security():
    """6., 10., & 12. Client Recording API enforces tenant boundary and returns correct playback state."""
    await init_db()
    transport = ASGITransport(app=app)
    headers_worker = {"Authorization": f"Bearer {settings.WORKER_API_SECRET}"}

    tenant_a_id = uuid.uuid4()
    tenant_b_id = uuid.uuid4()
    agent_a_id = uuid.uuid4()
    agent_b_id = uuid.uuid4()

    uuid_a = f"plivo-tA-{uuid.uuid4().hex[:8]}"
    rec_id_a = f"REC-tA-{uuid.uuid4().hex[:8]}"
    rec_url_a = f"https://media.plivo.com/{rec_id_a}.mp3"

    async with AsyncSessionLocal() as db:
        tmpl_id = await get_or_create_default_template(db)
        t_a = Tenant(id=tenant_a_id, name="Tenant A", slug=f"ta-{uuid.uuid4().hex[:6]}")
        t_b = Tenant(id=tenant_b_id, name="Tenant B", slug=f"tb-{uuid.uuid4().hex[:6]}")
        u_a = User(id=uuid.uuid4(), tenantId=tenant_a_id, email=f"userA_{uuid.uuid4().hex[:6]}@test.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        u_b = User(id=uuid.uuid4(), tenantId=tenant_b_id, email=f"userB_{uuid.uuid4().hex[:6]}@test.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        ag_a = Agent(id=agent_a_id, tenantId=tenant_a_id, templateId=tmpl_id, name="Agent A")
        ag_b = Agent(id=agent_b_id, tenantId=tenant_b_id, templateId=tmpl_id, name="Agent B")
        db.add_all([t_a, t_b, u_a, u_b, ag_a, ag_b])
        await db.commit()

    token_a = generate_access_token(user_id=str(u_a.id), tenant_id=str(tenant_a_id), role="CLIENT_OWNER")
    token_b = generate_access_token(user_id=str(u_b.id), tenant_id=str(tenant_b_id), role="CLIENT_OWNER")

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create Call Session for Tenant A
        res_cs = await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_a_id),
            "agentId": str(agent_a_id),
            "plivoCallUuid": uuid_a,
            "roomName": "stream-ta"
        }, headers=headers_worker)
        session_a_id = res_cs.json()["id"]

        # Before recording arrives: Client A sees UNAVAILABLE or PENDING
        res_pre = await ac.get(f"/api/client/calls/{session_a_id}/recording", headers={"Authorization": f"Bearer {token_a}"})
        assert res_pre.status_code == 200
        assert res_pre.json()["status"] in ["PENDING", "UNAVAILABLE"]

        # Plivo callback arrives for Tenant A
        await ac.post("/api/webhooks/plivo/recordings", data={
            "CallUUID": uuid_a,
            "RecordingID": rec_id_a,
            "RecordUrl": rec_url_a,
            "RecordingDuration": "50"
        })

        # Authorized Client A fetches recording: SUCCESS
        res_a = await ac.get(f"/api/client/calls/{session_a_id}/recording", headers={"Authorization": f"Bearer {token_a}"})
        assert res_a.status_code == 200
        data_a = res_a.json()
        assert data_a["status"] == "AVAILABLE"
        assert data_a["recordingUrl"] == rec_url_a
        assert data_a["durationSeconds"] == 50

        # Authorized Client A accesses stream URL: 307 Redirect to Plivo
        res_stream = await ac.get(f"/api/client/calls/{session_a_id}/recording/stream", headers={"Authorization": f"Bearer {token_a}", "follow_redirects": "false"})
        assert res_stream.status_code == 307
        assert res_stream.headers["location"] == rec_url_a

        # Unauthorized Client B attempts to fetch Tenant A's recording: 404 FORBIDDEN / NOT FOUND
        res_b = await ac.get(f"/api/client/calls/{session_a_id}/recording", headers={"Authorization": f"Bearer {token_b}"})
        assert res_b.status_code == 404

        # Unauthorized Client B attempts to access stream: 404 FORBIDDEN / NOT FOUND
        res_b_stream = await ac.get(f"/api/client/calls/{session_a_id}/recording/stream", headers={"Authorization": f"Bearer {token_b}"})
        assert res_b_stream.status_code == 404

@pytest.mark.asyncio
async def test_malformed_missing_identifiers_ignored():
    """8. & 9. Missing recording_id or call_uuid is safely ignored."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Missing recording_id
        res1 = await ac.post("/api/webhooks/plivo/recordings", data={"CallUUID": "uuid-123"})
        assert res1.status_code == 200
        assert res1.json()["status"] == "ignored"

        # Missing call_uuid
        res2 = await ac.post("/api/webhooks/plivo/recordings", data={"RecordingID": "rec-123"})
        assert res2.status_code == 200
        assert res2.json()["status"] == "ignored"
