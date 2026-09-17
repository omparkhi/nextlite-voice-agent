import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.runtime_config_cache import runtime_config_cache, RuntimeConfigCache
from app.tools.knowledge_tool import global_knowledge_cache, KnowledgeQueryCache
from app.greeting_cache import global_greeting_cache, CachedGreetingAudio


def test_runtime_config_cache_12hr_ttl():
    cache = RuntimeConfigCache(default_ttl_seconds=43200.0)
    mock_config = {"agentName": "Glaze Receptionist"}
    cache.set("dep-123", mock_config)
    assert cache.has("dep-123") is True
    assert cache.get("dep-123") == mock_config

    stats = cache.get_stats()
    assert stats["cached_entries"] == 1
    assert stats["hits"] >= 1


def test_knowledge_query_cache():
    cache = KnowledgeQueryCache(default_ttl_seconds=43200.0)
    result = {"status": "success", "information": ["Open 9 AM - 9 PM"]}
    cache.set("dep-1", "what are opening hours", result)

    # Cache hit
    hit = cache.get("dep-1", "what are opening hours")
    assert hit == result

    # Case insensitive hit
    hit_case = cache.get("dep-1", "WHAT ARE OPENING HOURS")
    assert hit_case == result

    # Cache miss on different query
    miss = cache.get("dep-1", "who is the doctor")
    assert miss is None


def test_cache_stats_endpoint():
    client = TestClient(app)
    response = client.get("/internal/cache/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "runtime_config_cache" in data
    assert "greeting_cache_entries" in data
    assert "phrase_audio_cache_entries" in data


def test_cache_invalidation_endpoint():
    client = TestClient(app)

    # Seed cache
    runtime_config_cache.set("dep-test", {"test": True})
    assert runtime_config_cache.has("dep-test") is True

    # Invalidate specific deployment
    response = client.post("/internal/cache/invalidate?deploymentId=dep-test&reWarm=false")
    assert response.status_code == 200
    assert runtime_config_cache.has("dep-test") is False

    # Invalidate all
    runtime_config_cache.set("dep-all-1", {"test": 1})
    response = client.post("/internal/cache/invalidate?all=true")
    assert response.status_code == 200
    assert runtime_config_cache.has("dep-all-1") is False
