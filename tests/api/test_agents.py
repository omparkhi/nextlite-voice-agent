import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from apps.api.app.main import app
from apps.api.app.auth import generate_token_pair

@pytest.mark.asyncio
async def test_admin_agents_unauthorized_rejection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/admin/agents")
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_admin_agents_forbidden_for_non_admin():
    u_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    pair = generate_token_pair(u_id, t_id, "CLIENT_OWNER")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(
            "/api/admin/agents",
            headers={"Authorization": f"Bearer {pair['accessToken']}"}
        )
        assert res.status_code == 403
        assert "Admin privileges required" in res.json()["detail"]

@pytest.mark.asyncio
async def test_admin_agents_authorized_access():
    u_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    pair = generate_token_pair(u_id, t_id, "ADMIN")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(
            "/api/admin/agents",
            headers={"Authorization": f"Bearer {pair['accessToken']}"}
        )
        assert res.status_code == 200
        assert isinstance(res.json(), list)
