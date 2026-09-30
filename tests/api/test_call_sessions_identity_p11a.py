import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from apps.api.app.main import app
from apps.api.app.config import settings
from apps.api.app.models import CallSession, Tenant, Agent, AgentTemplate
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
async def test_create_call_session_with_plivo_uuid_success():
    """Verify internal API creates CallSession with plivoCallUuid and preserves roomName."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {
        "Authorization": f"Bearer {settings.WORKER_API_SECRET}",
        "x-worker-secret": settings.WORKER_API_SECRET
    }

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    plivo_uuid = f"plivo-{uuid.uuid4().hex[:16]}"
    stream_id = f"stream-{uuid.uuid4().hex[:8]}"

    # Seed tenant & agent in DB
    async with AsyncSessionLocal() as db_session:
        tmpl_id = await get_or_create_default_template(db_session)
        tenant = Tenant(id=tenant_id, name="Apex Healthcare", slug=f"apex-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Apex Voice Assistant")
        db_session.add(tenant)
        db_session.add(agent)
        await db_session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": plivo_uuid,
            "roomName": stream_id,
            "callerNumber": "+919657954641",
            "direction": "INBOUND",
            "status": "ACTIVE",
            "primaryLanguage": "en-IN"
        }
        res = await ac.post("/api/internal/call-sessions", json=payload, headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert data["plivoCallUuid"] == plivo_uuid
        assert data["roomName"] == stream_id
        assert data["callerNumber"] == "+919657954641"
        assert data["status"] == "ACTIVE"
        session_id = data["id"]

        # Verify persisted record in DB
        async with AsyncSessionLocal() as db_session:
            db_call = await db_session.get(CallSession, uuid.UUID(session_id))
            assert db_call is not None
            assert db_call.plivoCallUuid == plivo_uuid
            assert db_call.roomName == stream_id
            assert db_call.callerNumber == "+919657954641"

@pytest.mark.asyncio
async def test_duplicate_plivo_call_uuid_idempotency():
    """Verify duplicate plivoCallUuid does not create a duplicate CallSession and returns the existing one."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {
        "Authorization": f"Bearer {settings.WORKER_API_SECRET}",
        "x-worker-secret": settings.WORKER_API_SECRET
    }

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    plivo_uuid = f"plivo-dup-{uuid.uuid4().hex[:16]}"
    stream_id = f"stream-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db_session:
        tmpl_id = await get_or_create_default_template(db_session)
        tenant = Tenant(id=tenant_id, name="City Dental", slug=f"city-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="City Dental Agent")
        db_session.add(tenant)
        db_session.add(agent)
        await db_session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": plivo_uuid,
            "roomName": stream_id,
            "callerNumber": "+919876543210",
            "direction": "INBOUND",
            "status": "ACTIVE"
        }
        # First creation
        res1 = await ac.post("/api/internal/call-sessions", json=payload, headers=headers)
        assert res1.status_code == 201
        data1 = res1.json()

        # Second creation with identical plivoCallUuid (duplicate webhook/retry)
        res2 = await ac.post("/api/internal/call-sessions", json=payload, headers=headers)
        assert res2.status_code == 201 or res2.status_code == 200
        data2 = res2.json()

        # Must return the SAME session ID and not create a duplicate row
        assert data2["id"] == data1["id"]
        assert data2["plivoCallUuid"] == plivo_uuid

@pytest.mark.asyncio
async def test_multiple_null_plivo_call_uuids_allowed():
    """Verify multiple historical/web-test CallSessions with NULL plivoCallUuid do not conflict."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {
        "Authorization": f"Bearer {settings.WORKER_API_SECRET}",
        "x-worker-secret": settings.WORKER_API_SECRET
    }

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    async with AsyncSessionLocal() as db_session:
        tmpl_id = await get_or_create_default_template(db_session)
        tenant = Tenant(id=tenant_id, name="Metro Clinic", slug=f"metro-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Metro Voice")
        db_session.add(tenant)
        db_session.add(agent)
        await db_session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Session 1 without plivoCallUuid
        p1 = {"tenantId": str(tenant_id), "agentId": str(agent_id), "roomName": "test-room-1", "direction": "WEB_TEST"}
        res1 = await ac.post("/api/internal/call-sessions", json=p1, headers=headers)
        assert res1.status_code == 201

        # Session 2 without plivoCallUuid
        p2 = {"tenantId": str(tenant_id), "agentId": str(agent_id), "roomName": "test-room-2", "direction": "WEB_TEST"}
        res2 = await ac.post("/api/internal/call-sessions", json=p2, headers=headers)
        assert res2.status_code == 201

        assert res1.json()["id"] != res2.json()["id"]
        assert res1.json()["plivoCallUuid"] is None
        assert res2.json()["plivoCallUuid"] is None

@pytest.mark.asyncio
async def test_same_phone_number_distinct_call_sessions():
    """Verify two consecutive calls from same phone number have distinct plivoCallUuids and separate CallSessions."""
    await init_db()
    transport = ASGITransport(app=app)
    headers = {
        "Authorization": f"Bearer {settings.WORKER_API_SECRET}",
        "x-worker-secret": settings.WORKER_API_SECRET
    }

    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    async with AsyncSessionLocal() as db_session:
        tmpl_id = await get_or_create_default_template(db_session)
        tenant = Tenant(id=tenant_id, name="Ortho Clinic", slug=f"ortho-{uuid.uuid4().hex[:6]}")
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=tmpl_id, name="Ortho Assistant")
        db_session.add(tenant)
        db_session.add(agent)
        await db_session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        phone = "+919657954641"
        uuid_a = f"plivo-call-A-{uuid.uuid4().hex[:8]}"
        uuid_b = f"plivo-call-B-{uuid.uuid4().hex[:8]}"

        res_a = await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": uuid_a,
            "roomName": "stream-A",
            "callerNumber": phone,
            "direction": "INBOUND"
        }, headers=headers)
        assert res_a.status_code == 201
        data_a = res_a.json()

        res_b = await ac.post("/api/internal/call-sessions", json={
            "tenantId": str(tenant_id),
            "agentId": str(agent_id),
            "plivoCallUuid": uuid_b,
            "roomName": "stream-B",
            "callerNumber": phone,
            "direction": "INBOUND"
        }, headers=headers)
        assert res_b.status_code == 201
        data_b = res_b.json()

        assert data_a["id"] != data_b["id"]
        assert data_a["plivoCallUuid"] == uuid_a
        assert data_b["plivoCallUuid"] == uuid_b
        assert data_a["callerNumber"] == data_b["callerNumber"]
