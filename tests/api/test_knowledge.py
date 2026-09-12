import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.app.main import app
from apps.api.app.services.knowledge_service import chunk_text, normalize_text, estimate_token_count

def test_chunking_and_normalization():
    raw_text = "This is a clinic document.\r\n\n\n\nWe provide dental implants and tooth extraction. " * 30
    normalized = normalize_text(raw_text)
    assert "\r\n" not in normalized
    assert "\n\n\n" not in normalized

    chunks = chunk_text(normalized, chunk_size=20, overlap=5)
    assert len(chunks) > 1
    assert chunks[0]["chunkIndex"] == 0
    assert "tokenCount" in chunks[0]

@pytest.mark.asyncio
async def test_knowledge_sources_unauthorized():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/admin/knowledge/sources")
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_internal_knowledge_retrieve_unauthorized():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/internal/knowledge/retrieve", json={"query": "opening hours"})
        assert res.status_code == 401
