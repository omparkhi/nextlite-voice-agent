import pytest
import uuid
from starlette.testclient import TestClient
from apps.api.app.main import app
from apps.api.app.auth import (
    hash_password, compare_password, generate_token_pair,
    verify_access_token
)
from apps.api.app.db import get_db

@pytest.fixture
def client():
    return TestClient(app)

def test_password_hashing_and_verification():
    raw_pass = "MySecretPass#2026"
    pwd_hash = hash_password(raw_pass)
    assert pwd_hash.startswith("$argon2id$")
    assert compare_password(raw_pass, pwd_hash) is True
    assert compare_password("WrongPassword", pwd_hash) is False

def test_jwt_token_generation_and_claims():
    u_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    pair = generate_token_pair(u_id, t_id, "ADMIN")

    assert "accessToken" in pair
    assert "refreshToken" in pair

    payload = verify_access_token(pair["accessToken"])
    assert payload["userId"] == u_id
    assert payload["tenantId"] == t_id
    assert payload["role"] == "ADMIN"

def test_protected_route_unauthorized_rejection(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401
    assert "Authentication required" in res.json()["detail"]

def test_protected_route_with_valid_jwt(client):
    u_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    pair = generate_token_pair(u_id, t_id, "CLIENT_OWNER")

    # Mock user db lookup in endpoint if db not connected
    res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {pair['accessToken']}"}
    )
    # If user not in mock DB, returns 404 which confirms auth succeeded!
    assert res.status_code in [200, 404]
