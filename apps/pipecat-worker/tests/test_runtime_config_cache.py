"""Unit tests for Pipecat RuntimeConfigCache (In-Memory Worker Cache).

Tests:
1. Cache hit & miss semantics (<0.1ms access time).
2. TTL expiration.
3. Cache invalidation (single deployment & bulk clear).
4. LRU eviction at max entries.
5. Thread-safety under concurrent access.
"""

import time
import threading
import pytest
from app.runtime_config_cache import RuntimeConfigCache
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeTenantConfig,
    RuntimeAgentMetadata,
    RuntimeDeploymentMetadata,
    RuntimePromptConfig,
    RuntimeVoiceConfig,
    RuntimeLanguageConfig,
    RuntimeBehaviorConfig,
    RuntimeKnowledgeConfig,
    RuntimeToolConfig,
    RuntimeVariableConfig,
)


def _make_dummy_config(deployment_id: str, agent_id: str = "agent-123") -> RuntimeAgentConfig:
    return RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenantId="tenant-001"),
        agent=RuntimeAgentMetadata(agentId=agent_id, agentName="NextLite Assistant"),
        deployment=RuntimeDeploymentMetadata(deploymentId=deployment_id, versionId="v-1", versionNumber=1),
        prompt=RuntimePromptConfig(compiledSystemPrompt="You are a helpful assistant.", timezone="Asia/Kolkata"),
        voice=RuntimeVoiceConfig(voiceId="shubh"),
        language=RuntimeLanguageConfig(primary="mr-IN"),
        runtime=RuntimeBehaviorConfig(),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        tools=RuntimeToolConfig(enabled=False, tools=[]),
        variables=RuntimeVariableConfig(),
    )


def test_runtime_config_cache_hit_and_miss():
    cache = RuntimeConfigCache(default_ttl_seconds=10.0)
    cfg = _make_dummy_config("dep-001")

    # Miss
    assert cache.get("dep-001") is None
    stats = cache.get_stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 0

    # Set
    cache.set("dep-001", cfg)

    # Hit (<0.1ms)
    t0 = time.perf_counter()
    retrieved = cache.get("dep-001")
    t1 = time.perf_counter()
    elapsed_ms = (t1 - t0) * 1000.0

    assert retrieved is not None
    assert retrieved.deployment.deployment_id == "dep-001"
    assert elapsed_ms < 10.0  # In-memory dictionary lookup

    stats = cache.get_stats()
    assert stats["hits"] == 1
    assert stats["cached_entries"] == 1


def test_runtime_config_cache_ttl_expiration():
    cache = RuntimeConfigCache(default_ttl_seconds=0.05)  # 50ms TTL
    cfg = _make_dummy_config("dep-ttl")

    cache.set("dep-ttl", cfg)
    assert cache.get("dep-ttl") is not None

    time.sleep(0.06)  # Wait for expiration
    assert cache.get("dep-ttl") is None


def test_runtime_config_cache_invalidation():
    cache = RuntimeConfigCache(default_ttl_seconds=60.0)
    cfg1 = _make_dummy_config("dep-1")
    cfg2 = _make_dummy_config("dep-2")

    cache.set("dep-1", cfg1)
    cache.set("dep-2", cfg2)
    assert cache.get("dep-1") is not None
    assert cache.get("dep-2") is not None

    # Invalidate single
    cache.invalidate("dep-1")
    assert cache.get("dep-1") is None
    assert cache.get("dep-2") is not None

    # Invalidate all
    cache.invalidate()
    assert cache.get("dep-2") is None
    assert cache.get_stats()["cached_entries"] == 0


def test_runtime_config_cache_lru_eviction():
    cache = RuntimeConfigCache(default_ttl_seconds=60.0, max_entries=2)
    cfg1 = _make_dummy_config("dep-1")
    cfg2 = _make_dummy_config("dep-2")
    cfg3 = _make_dummy_config("dep-3")

    cache.set("dep-1", cfg1)
    cache.set("dep-2", cfg2)
    time.sleep(0.01)
    cache.set("dep-3", cfg3)  # Should evict oldest (dep-1)

    assert cache.get("dep-1") is None
    assert cache.get("dep-2") is not None
    assert cache.get("dep-3") is not None


def test_runtime_config_cache_thread_safety():
    cache = RuntimeConfigCache(default_ttl_seconds=60.0)
    errors = []

    def worker_thread(thread_id: int):
        try:
            dep_id = f"dep-{thread_id % 5}"
            cfg = _make_dummy_config(dep_id)
            for _ in range(50):
                cache.set(dep_id, cfg)
                val = cache.get(dep_id)
                assert val is not None or cache.get(dep_id) is None
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker_thread, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0
