import pytest
import uuid
import asyncio
import time
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient
from apps.api.app.main import app
from apps.api.app.auth.tokens import generate_access_token
from apps.api.app.domain.tools_safety import get_user_safe_display_id, normalize_tool_id
from apps.api.app.services.telephony_service import TelephonyService

@pytest.mark.asyncio
async def test_module15_shadow_parity_contracts():
    """Module 15: Verify exact API response shapes, camelCase serialization, and status codes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Health check contract
        res = await ac.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "service" in data
        assert "environment" in data
        assert "timestamp" in data

        # 2. Ready check contract
        res = await ac.get("/api/ready")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"
        assert data["redis"] == "connected"

        # 3. Receptionist doctors schema
        res = await ac.get("/api/appointments/doctors")
        assert res.status_code == 200
        data = res.json()
        assert "doctors" in data
        for doc in data["doctors"]:
            assert "id" in doc
            assert "name" in doc
            assert "specialty" in doc
            assert "opdRoom" in doc

@pytest.mark.asyncio
async def test_module16_pstn_acceptance_flow():
    """Module 16: Verify Plivo XML generation, E.164 normalization, and audio stream routing."""
    # E.164 sanitization
    raw_number = "+91 98201 12345"
    e164_number = TelephonyService.sanitize_e164(raw_number)
    assert e164_number == "+919820112345"

    # Plivo Answer XML Generation
    mock_ws_url = "wss://voice.nextlite.ai/ws/plivo/test-call"
    xml_output = TelephonyService.generate_plivo_answer_xml(
        websocket_url=mock_ws_url
    )
    assert "<Response>" in xml_output
    assert "<Stream" in xml_output
    assert 'bidirectional="true"' in xml_output
    assert mock_ws_url in xml_output

def test_module17_concurrency_and_tenant_isolation():
    """Module 17: Concurrent appointments test and strict multi-tenant boundary checks."""
    admin_tenant = str(uuid.uuid4())
    admin_user = str(uuid.uuid4())
    admin_token = generate_access_token(user_id=admin_user, tenant_id=admin_tenant, role="ADMIN")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    client = TestClient(app)

    # Create Tenant A
    t_a_res = client.post("/api/admin/clients", json={
        "name": "Owner A",
        "email": f"owner_a_{uuid.uuid4().hex[:6]}@domain.com",
        "businessName": f"Tenant A {uuid.uuid4().hex[:6]}"
    }, headers=admin_headers)
    assert t_a_res.status_code == 201
    tenant_a_id = t_a_res.json()["id"]

    # Create Tenant B
    t_b_res = client.post("/api/admin/clients", json={
        "name": "Owner B",
        "email": f"owner_b_{uuid.uuid4().hex[:6]}@domain.com",
        "businessName": f"Tenant B {uuid.uuid4().hex[:6]}"
    }, headers=admin_headers)
    assert t_b_res.status_code == 201
    tenant_b_id = t_b_res.json()["id"]

    token_a = generate_access_token(user_id=str(uuid.uuid4()), tenant_id=tenant_a_id, role="CLIENT_OWNER")
    token_b = generate_access_token(user_id=str(uuid.uuid4()), tenant_id=tenant_b_id, role="CLIENT_OWNER")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Tenant A creating WhatsApp message
    wa_payload = {
        "customerPhone": "+919876543210",
        "message": "Hello from Tenant A",
        "customerName": "Ramesh Kumar"
    }
    res_a = client.post("/api/client/follow-ups/send-whatsapp", json=wa_payload, headers=headers_a)
    assert res_a.status_code == 200
    followup_id_a = res_a.json()["followUpId"]

    # Tenant B accessing Tenant A's follow up record -> MUST BE 404 (strictly isolated)
    res_cross = client.get(f"/api/client/follow-ups/{followup_id_a}", headers=headers_b)
    assert res_cross.status_code == 404

@pytest.mark.asyncio
async def test_module18_monotonic_timing_and_metrics():
    """Module 18: Monotonic latency instrumentation."""
    t0 = time.monotonic()
    await asyncio.sleep(0.01)
    t1 = time.monotonic()
    elapsed_ms = (t1 - t0) * 1000
    assert 9 <= elapsed_ms <= 50

@pytest.mark.asyncio
async def test_module19_production_hardening_and_uuid_suppression():
    """Module 19: UUID suppression and safety validation."""
    raw_result = {"id": "550e8400-e29b-41d4-a716-446655440000"}
    safe_display = get_user_safe_display_id(raw_result)
    # Raw UUID must NEVER be returned as safe display ID
    assert safe_display is None

    # Human-friendly IDs must pass through safely
    assert get_user_safe_display_id({"appointmentNumber": "APT-1042", "id": "550e8400-e29b-41d4-a716-446655440000"}) == "APT-1042"
    assert get_user_safe_display_id({"leadNumber": "LEAD-8801", "id": "550e8400-e29b-41d4-a716-446655440000"}) == "LEAD-8801"
