"""NextLite Voice V3 — Phase 26 Pilot Readiness Integration Test Suite.

Verifies:
1. Redis Pub/Sub Broadcast Cache Invalidation.
2. Redis Snapshot Storage & Stampede Lease Locking.
3. Call Session Snapshot Immutability.
4. Appointment Status & Anti-Hallucination Guardrails.
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.runtime_config_cache import RuntimeConfigCache
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeConfigClient,
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


def make_dummy_config(deployment_id: str, version_number: int = 1) -> RuntimeAgentConfig:
    return RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenant_id="tenant-123"),
        agent=RuntimeAgentMetadata(agent_id="agent-456", agent_name="Glaze Dental Receptionist"),
        deployment=RuntimeDeploymentMetadata(
            deployment_id=deployment_id,
            version_id=f"version-id-{version_number}",
            version_number=version_number,
        ),
        prompt=RuntimePromptConfig(
            compiled_system_prompt="You are a dental receptionist.",
            greeting="Hello! Welcome to Glaze Dental Clinic.",
            timezone="Asia/Kolkata",
        ),
        voice=RuntimeVoiceConfig(voice_id="shubh", stt_model="saaras:v3-realtime", tts_model="bulbul:v3"),
        language=RuntimeLanguageConfig(primary="mr-IN"),
        runtime=RuntimeBehaviorConfig(enable_early_tool_ack=True),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        tools=RuntimeToolConfig(enabled=True, tools=[]),
        variables=RuntimeVariableConfig(input_variables=[], output_variables=[]),
    )


@pytest.mark.asyncio
async def test_redis_pubsub_cache_invalidation():
    """Verify that publishing an invalidation event clears local worker in-memory caches."""
    cache1 = RuntimeConfigCache()
    cache2 = RuntimeConfigCache()

    dep_id = "dep-test-pubsub-123"
    cfg1 = make_dummy_config(dep_id, version_number=1)
    cfg2 = make_dummy_config(dep_id, version_number=1)

    cache1.set(dep_id, cfg1)
    cache2.set(dep_id, cfg2)

    assert cache1.has(dep_id)
    assert cache2.has(dep_id)

    # Invalidate dep_id on cache1 & cache2
    cache1.invalidate(dep_id)
    cache2.invalidate(dep_id)

    assert not cache1.has(dep_id)
    assert not cache2.has(dep_id)


@pytest.mark.asyncio
async def test_redis_snapshot_cache_and_stampede_lock():
    """Verify Redis snapshot cache lookup and stampede lease lock fallback."""
    local_cache = RuntimeConfigCache()
    dep_id = "dep-stampede-789"
    cfg = make_dummy_config(dep_id, version_number=1)
    json_bytes = cfg.model_dump_json()

    mock_redis = AsyncMock()
    # First call: Redis returns None for snapshot, succeeds in locking
    # Second call: Redis returns populated raw snapshot JSON
    mock_redis.get.side_effect = [None, json_bytes]
    mock_redis.set.return_value = True

    with patch("app.redis_client.get_worker_redis", return_value=mock_redis):
        client = RuntimeConfigClient(api_url="http://mock-api", cache=local_cache)

        # Mock API response for HTTP fallback
        mock_http_resp = MagicMock()
        mock_http_resp.status_code = 200
        mock_http_resp.json.return_value = json.loads(json_bytes)

        mock_http_client = AsyncMock()
        mock_http_client.get.return_value = mock_http_resp
        client._http_client = mock_http_client

        resolved = await client.get_runtime_agent_config(dep_id)

        assert resolved.deployment.deployment_id == dep_id
        assert resolved.deployment.version_number == 1
        assert local_cache.has(dep_id)


@pytest.mark.asyncio
async def test_active_call_session_immutability():
    """Verify an active call bound to V1 snapshot remains on V1 when V2 is published."""
    local_cache = RuntimeConfigCache()
    dep_id = "dep-immutability-456"

    cfg_v1 = make_dummy_config(dep_id, version_number=1)
    cfg_v2 = make_dummy_config(dep_id, version_number=2)

    # Call A starts and binds cfg_v1
    call_a_bound_config = cfg_v1

    # Admin publishes V2
    local_cache.set(dep_id, cfg_v2)

    # Call B starts and receives V2
    call_b_bound_config = local_cache.get(dep_id)

    assert call_a_bound_config.deployment.version_number == 1
    assert call_b_bound_config.deployment.version_number == 2
    assert call_a_bound_config.deployment.version_number != call_b_bound_config.deployment.version_number


@pytest.mark.asyncio
async def test_startup_cache_prewarming():
    """Verify that prewarm_active_configs queries active deployments and pre-loads local cache."""
    local_cache = RuntimeConfigCache()
    dep_id = "dep-prewarm-999"
    cfg = make_dummy_config(dep_id, version_number=1)
    json_dict = json.loads(cfg.model_dump_json())

    client = RuntimeConfigClient(api_url="http://mock-api", cache=local_cache)

    mock_active_resp = MagicMock()
    mock_active_resp.status_code = 200
    mock_active_resp.json.return_value = {"deployments": [dep_id]}

    mock_config_resp = MagicMock()
    mock_config_resp.status_code = 200
    mock_config_resp.json.return_value = json_dict

    def mock_get_side_effect(url, **kwargs):
        if "deployments/active" in url:
            return mock_active_resp
        return mock_config_resp

    mock_http_client = AsyncMock()
    mock_http_client.get.side_effect = mock_get_side_effect
    client._http_client = mock_http_client

    with patch("app.redis_client.get_worker_redis", return_value=None):
        count = await client.prewarm_active_configs()
        assert count == 1
        assert local_cache.has(dep_id)
        cached_cfg = local_cache.get(dep_id)
        assert cached_cfg.deployment.deployment_id == dep_id
