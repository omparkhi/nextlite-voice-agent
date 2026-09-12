import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from apps.api.app.main import app
from apps.api.app.auth.tokens import generate_access_token

@pytest.mark.asyncio
async def test_receptionist_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Doctors list
        res = await ac.get("/api/appointments/doctors")
        assert res.status_code == 200
        doctors = res.json()["doctors"]
        assert len(doctors) >= 4

        # 2. Schedule
        res = await ac.get("/api/appointments/schedule?doctorId=doc-sharma")
        assert res.status_code == 200
        data = res.json()
        assert data["doctor"]["id"] == "doc-sharma"
        assert "slots" in data

        # 3. Availability
        res = await ac.get("/api/appointments/availability?doctorId=doc-sharma")
        assert res.status_code == 200
        avail = res.json()
        assert avail["totalSlots"] > 0

        # 4. Book appointment
        book_payload = {
            "patientName": "Aarav Sharma",
            "patientPhone": "+91 9988776655",
            "doctorId": "doc-sharma",
            "date": "2026-10-15",
            "time": "04:00 PM",
            "reason": "Consultation"
        }
        res = await ac.post("/api/appointments/book", json=book_payload)
        assert res.status_code == 201
        res_data = res.json()
        assert res_data["success"] is True
        assert res_data["appointment"]["patientName"] == "Aarav Sharma"

@pytest.mark.asyncio
async def test_admin_tools_and_templates():
    admin_tenant_id = str(uuid.uuid4())
    admin_user_id = str(uuid.uuid4())
    token = generate_access_token(user_id=admin_user_id, tenant_id=admin_tenant_id, role="ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # List tools
        res = await ac.get("/api/admin/tools", headers=headers)
        assert res.status_code == 200
        tools = res.json()
        assert len(tools) == 3
        tool_ids = [t["id"] for t in tools]
        assert "query_knowledge_base" in tool_ids
        assert "book_appointment" in tool_ids
        assert "create_callback_lead" in tool_ids

@pytest.mark.asyncio
async def test_client_role_and_tenant_scoping():
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    user_a = str(uuid.uuid4())
    
    # Viewer token (read-only)
    viewer_token = generate_access_token(user_id=user_a, tenant_id=tenant_a, role="CLIENT_VIEWER")
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Viewer attempting mutation -> should be 403
        res = await ac.put("/api/client/profile", json={"businessName": "Hacked Corp"}, headers=viewer_headers)
        assert res.status_code == 403
        assert "Permission denied" in res.json()["detail"]

        # Missing token -> 401
        res = await ac.get("/api/client/calls")
        assert res.status_code == 401
