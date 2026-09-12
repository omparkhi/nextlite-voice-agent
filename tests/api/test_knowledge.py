import pytest
from starlette.testclient import TestClient
from apps.api.app.main import app
from apps.api.app.services.knowledge_service import chunk_text, normalize_text, estimate_token_count

@pytest.fixture
def client():
    return TestClient(app)

def test_chunking_and_normalization():
    raw_text = "This is a clinic document.\r\n\n\n\nWe provide dental implants and tooth extraction. " * 30
    normalized = normalize_text(raw_text)
    assert "\r\n" not in normalized
    assert "\n\n\n" not in normalized

    chunks = chunk_text(normalized, chunk_size=20, overlap=5)
    assert len(chunks) > 1
    assert chunks[0]["chunkIndex"] == 0
    assert "tokenCount" in chunks[0]

def test_knowledge_sources_unauthorized(client):
    res = client.get("/api/admin/knowledge/sources")
    assert res.status_code == 401

def test_internal_knowledge_retrieve_unauthorized(client):
    res = client.post("/api/internal/knowledge/retrieve", json={"query": "opening hours"})
    assert res.status_code == 401
