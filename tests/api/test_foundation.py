import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.app.main import app
from apps.api.app.config import settings

@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
        assert data["service"] == "nextlite-control-plane-python"
        assert "x-correlation-id" in response.headers
        assert response.headers["ngrok-skip-browser-warning"] == "true"

@pytest.mark.asyncio
async def test_readiness_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"
        assert data["redis"] == "connected"

@pytest.mark.asyncio
async def test_custom_correlation_id_propagates():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        custom_cid = "test-custom-cid-12345"
        response = await ac.get("/api/health", headers={"x-correlation-id": custom_cid})
        assert response.status_code == 200
        assert response.headers["x-correlation-id"] == custom_cid

def test_settings_load_defaults():
    assert settings.PORT > 0
    assert settings.DATABASE_URL is not None
    assert settings.JWT_SECRET is not None
    assert settings.WORKER_API_SECRET is not None
