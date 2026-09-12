import pytest
import uuid
from starlette.testclient import TestClient
from apps.api.app.main import app
from apps.api.app.auth import generate_token_pair

@pytest.fixture
def client():
    return TestClient(app)

def test_admin_agents_unauthorized_rejection(client):
    res = client.get("/api/admin/agents")
    assert res.status_code == 401

def test_admin_agents_forbidden_for_non_admin(client):
    u_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    # User with CLIENT_OWNER role
    pair = generate_token_pair(u_id, t_id, "CLIENT_OWNER")

    res = client.get(
        "/api/admin/agents",
        headers={"Authorization": f"Bearer {pair['accessToken']}"}
    )
    assert res.status_code == 403
    assert "Admin privileges required" in res.json()["detail"]

def test_admin_agents_authorized_access(client):
    u_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    # User with ADMIN role
    pair = generate_token_pair(u_id, t_id, "ADMIN")

    res = client.get(
        "/api/admin/agents",
        headers={"Authorization": f"Bearer {pair['accessToken']}"}
    )
    # Returns 200 list when authorized
    assert res.status_code == 200
    assert isinstance(res.json(), list)
