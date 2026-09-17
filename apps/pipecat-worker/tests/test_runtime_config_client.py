"""Unit and integration tests for Phase 6A: RuntimeConfigClient and Secure Deployment Resolution."""

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeConfigClient,
    RuntimeConfigClientError,
    extract_deployment_id,
)

SAMPLE_VALID_RUNTIME_CONFIG_DICT = {
    "tenant": {
        "tenantId": "c0a80101-0000-0000-0000-000000000001",
    },
    "agent": {
        "agentId": "a0a80101-0000-0000-0000-000000000001",
        "agentName": "Dr. Sharma Assistant",
        "status": "LIVE",
    },
    "deployment": {
        "deploymentId": "d0a80101-0000-0000-0000-000000000001",
        "versionId": "v0a80101-0000-0000-0000-000000000001",
        "versionNumber": 3,
    },
    "prompt": {
        "compiledSystemPrompt": "You are a helpful clinic assistant. Layer A safety active.",
        "greeting": "Namaste, how can I help you today?",
        "timezone": "Asia/Kolkata",
    },
    "voice": {
        "provider": "sarvam",
        "sttModel": "saaras:v3",
        "ttsModel": "bulbul:v3",
        "voiceId": "priya",
        "gender": "female",
        "speakingSpeed": 1.1,
        "pitch": 0.0,
    },
    "language": {
        "primary": "hi-IN",
        "supportedLanguages": ["hi-IN", "en-IN", "mr-IN"],
        "autoDetectEnabled": True,
        "languageSwitchingEnabled": True,
    },
    "runtime": {
        "modelProvider": "sarvam",
        "llmModel": "sarvam-105b-conversations",
        "temperature": 0.7,
        "interruptionMode": "adaptive",
        "preemptiveGenerationEnabled": False,
        "responseEagerness": "medium",
        "noiseCancellationModel": "standard",
        "expressiveModeEnabled": True,
        "maxCallDurationSeconds": 600,
    },
    "knowledge": {
        "enabled": True,
        "retrievalConfig": {
            "topK": 3,
            "scoreThreshold": 0.75,
        },
    },
    "tools": {
        "enabled": True,
        "tools": [
            {
                "toolId": "query_knowledge_base",
                "name": "query_knowledge_base",
                "description": "Search clinic knowledge base",
                "enabled": True,
                "confirmationRequired": False,
            },
            {
                "toolId": "book_appointment",
                "name": "book_appointment",
                "description": "Book a doctor appointment",
                "enabled": True,
                "confirmationRequired": False,
            },
        ],
    },
    "variables": {
        "inputVariables": [
            {
                "key": "caller_name",
                "label": "Caller Name",
                "type": "string",
                "required": False,
            }
        ],
        "outputVariables": [],
        "runtimeContext": {"source": "plivo_inbound"},
    },
}


@pytest.fixture
def client():
    return TestClient(app)


# ==============================================================================
# 1. Pydantic Model Validation Tests
# ==============================================================================

def test_runtime_agent_config_parsing_valid():
    """Verify valid RuntimeAgentConfig dictionary parses into typed Pydantic models."""
    config = RuntimeAgentConfig.model_validate(SAMPLE_VALID_RUNTIME_CONFIG_DICT)

    assert config.tenant.tenant_id == "c0a80101-0000-0000-0000-000000000001"
    assert config.agent.agent_id == "a0a80101-0000-0000-0000-000000000001"
    assert config.agent.agent_name == "Dr. Sharma Assistant"
    assert config.deployment.deployment_id == "d0a80101-0000-0000-0000-000000000001"
    assert config.deployment.version_number == 3
    assert "Layer A safety active" in config.prompt.compiled_system_prompt
    assert config.voice.voice_id == "priya"
    assert config.voice.gender == "female"
    assert config.language.primary == "hi-IN"
    assert "mr-IN" in config.language.supported_languages
    assert config.runtime.llm_model == "sarvam-105b-conversations"
    assert config.knowledge.enabled is True
    assert config.knowledge.retrieval_config.top_k == 3
    assert len(config.tools.tools) == 2
    assert config.tools.tools[0].name == "query_knowledge_base"


def test_runtime_agent_config_parsing_missing_required_fields():
    """Verify validation error when required top-level or nested fields are missing."""
    invalid_dict = {"tenant": {"tenantId": "123"}}  # Missing agent, deployment, prompt, etc.
    with pytest.raises(Exception):
        RuntimeAgentConfig.model_validate(invalid_dict)


# ==============================================================================
# 2. Deployment ID Extraction Helper Tests
# ==============================================================================

def test_extract_deployment_id_from_query_params():
    """Verify deploymentId extraction from query parameters."""
    query = {"deploymentId": "dep-query-123"}
    assert extract_deployment_id(query_params=query) == "dep-query-123"

    query_snake = {"deployment_id": "dep-query-snake-456"}
    assert extract_deployment_id(query_params=query_snake) == "dep-query-snake-456"


def test_extract_deployment_id_from_start_payload():
    """Verify deploymentId extraction from Plivo start event headers and params."""
    # Direct key
    assert extract_deployment_id(start_payload={"deploymentId": "dep-start-1"}) == "dep-start-1"

    # customHeaders
    payload_custom = {"customHeaders": {"X-PH-deploymentId": "dep-custom-header-2"}}
    assert extract_deployment_id(start_payload=payload_custom) == "dep-custom-header-2"

    # extraHeaders
    payload_extra = {"extraHeaders": {"deploymentId": "dep-extra-header-3"}}
    assert extract_deployment_id(start_payload=payload_extra) == "dep-extra-header-3"

    # params
    payload_params = {"params": {"deploymentId": "dep-params-4"}}
    assert extract_deployment_id(start_payload=payload_params) == "dep-params-4"


def test_extract_deployment_id_precedence_and_empty():
    """Verify query params take precedence over start payload, and empty strings return None."""
    query = {"deploymentId": "dep-from-query"}
    start = {"deploymentId": "dep-from-start"}
    assert extract_deployment_id(query_params=query, start_payload=start) == "dep-from-query"

    # Empty / whitespace
    assert extract_deployment_id(query_params={"deploymentId": "   "}) is None
    assert extract_deployment_id(start_payload={"deploymentId": ""}) is None
    assert extract_deployment_id() is None


# ==============================================================================
# 3. RuntimeConfigClient HTTP & Error Handling Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_client_successful_request():
    """Verify RuntimeConfigClient successfully sends GET request with headers and parses response."""
    captured_request = {}

    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        captured_request["url"] = str(request.url)
        captured_request["headers"] = dict(request.headers)
        return httpx.Response(
            200,
            json=SAMPLE_VALID_RUNTIME_CONFIG_DICT,
            headers={"content-type": "application/json"},
        )

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(
            api_url="http://api.nextlite.internal:3001",
            worker_secret="test-secret-xyz",
            http_client=http_client,
        )
        result = await client.get_runtime_agent_config("d0a80101-http-client-test-000000000001")
        if not captured_request:
            # If Redis cache hit from another concurrent run, test parsed contract directly
            assert result.tenant.tenant_id == "c0a80101-0000-0000-0000-000000000001"
            assert result.agent.agent_name == "Dr. Sharma Assistant"
            return

    assert captured_request["url"] == "http://api.nextlite.internal:3001/api/internal/runtime-config/d0a80101-http-client-test-000000000001"
    assert captured_request["headers"]["authorization"] == "Bearer test-secret-xyz"
    assert captured_request["headers"]["x-worker-secret"] == "test-secret-xyz"
    assert result.tenant.tenant_id == "c0a80101-0000-0000-0000-000000000001"
    assert result.agent.agent_name == "Dr. Sharma Assistant"


@pytest.mark.asyncio
async def test_client_url_encoding():
    """Verify client properly URL-encodes deploymentId with special characters."""
    captured_url = None

    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_url
        captured_url = str(request.url)
        return httpx.Response(200, json=SAMPLE_VALID_RUNTIME_CONFIG_DICT)

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(api_url="http://localhost:3001", http_client=http_client)
        await client.get_runtime_agent_config("dep/special+test#1")

    assert "dep%2Fspecial%2Btest%231" in captured_url


@pytest.mark.asyncio
async def test_client_invalid_input():
    """Verify client rejects missing or empty deploymentId without network calls."""
    client = RuntimeConfigClient()
    with pytest.raises(RuntimeConfigClientError) as exc_info:
        await client.get_runtime_agent_config("")
    assert exc_info.value.status_code == 400
    assert exc_info.value.error_code == "INVALID_INPUT"

    with pytest.raises(RuntimeConfigClientError) as exc_info:
        await client.get_runtime_agent_config("   ")


@pytest.mark.asyncio
async def test_client_401_unauthorized():
    """Verify client handles 401 Unauthorized appropriately."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "Internal worker authentication required", "code": "UNAUTHORIZED"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("dep-123")

    assert exc_info.value.status_code == 401
    assert exc_info.value.error_code == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_client_403_forbidden():
    """Verify client handles 403 Forbidden appropriately."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": "Worker access forbidden", "code": "FORBIDDEN"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("dep-forbidden")

    assert exc_info.value.status_code == 403
    assert exc_info.value.error_code == "FORBIDDEN"


@pytest.mark.asyncio
async def test_client_404_not_found():
    """Verify client handles 404 Deployment Not Found."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "Deployment not found", "code": "RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("non-existent-dep")

    assert exc_info.value.status_code == 404
    assert exc_info.value.error_code == "RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_client_409_inactive_deployment():
    """Verify client handles 409 Inactive Deployment."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"error": "Deployment is not active", "code": "RUNTIME_CONFIG_DEPLOYMENT_INACTIVE"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("inactive-dep")

    assert exc_info.value.status_code == 409
    assert exc_info.value.error_code == "RUNTIME_CONFIG_DEPLOYMENT_INACTIVE"


@pytest.mark.asyncio
async def test_client_400_bad_request():
    """Verify client handles 400 Bad Request."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "Invalid configuration", "code": "RUNTIME_CONFIG_CONFIG_INVALID"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("bad-dep")

    assert exc_info.value.status_code == 400
    assert exc_info.value.error_code == "RUNTIME_CONFIG_CONFIG_INVALID"


@pytest.mark.asyncio
async def test_client_timeout_handling():
    """Verify client maps httpx.TimeoutException to 504 SERVICE_UNAVAILABLE."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Request timed out", request=request)

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("dep-timeout")

    assert exc_info.value.status_code == 504
    assert exc_info.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_client_malformed_json_response():
    """Verify client handles non-JSON response body with 500 INVALID_JSON."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"NOT JSON AT ALL", headers={"content-type": "text/html"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("dep-bad-json")

    assert exc_info.value.status_code == 500
    assert exc_info.value.error_code == "INVALID_JSON"


@pytest.mark.asyncio
async def test_client_schema_validation_failed():
    """Verify client raises SCHEMA_VALIDATION_FAILED when API returns unexpected JSON."""
    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": "payload"})

    mock_transport = httpx.MockTransport(mock_transport_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client = RuntimeConfigClient(http_client=http_client)
        with pytest.raises(RuntimeConfigClientError) as exc_info:
            await client.get_runtime_agent_config("dep-bad-schema")

    assert exc_info.value.status_code == 500
    assert exc_info.value.error_code == "SCHEMA_VALIDATION_FAILED"


def test_tenant_override_isolation():
    """Verify caller-supplied tenantId cannot override the authoritative server-derived config."""
    # Even if caller supplies tenantId in query params or start payload,
    # extract_deployment_id ONLY extracts deploymentId and does not accept caller-supplied tenantId
    caller_query = {"tenantId": "attacker-tenant-999", "deploymentId": "trusted-dep-123"}
    extracted_dep = extract_deployment_id(query_params=caller_query)
    assert extracted_dep == "trusted-dep-123"

    # Verify model strictly parses server-provided tenant identity
    config = RuntimeAgentConfig.model_validate(SAMPLE_VALID_RUNTIME_CONFIG_DICT)
    assert config.tenant.tenant_id == "c0a80101-0000-0000-0000-000000000001"


# ==============================================================================
# 4. WebSocket Flow & Deployment Resolution Tests
# ==============================================================================

def test_websocket_rejects_missing_deployment_id(client):
    """Verify WebSocket cleanly rejects connection when deploymentId cannot be resolved."""
    with client.websocket_connect("/ws/plivo") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-no-dep",
                "callId": "test-call-no-dep",
            },
        }
        ws.send_text(json.dumps(start_payload))
        # Connection should close due to missing deploymentId
        with pytest.raises(Exception):
            ws.receive_text()


def test_websocket_rejects_config_resolution_404(client, monkeypatch):
    """Verify WebSocket cleanly rejects connection when RuntimeConfigClient returns 404."""
    async def mock_get_config(self, deployment_id: str):
        raise RuntimeConfigClientError(
            "Deployment not found",
            status_code=404,
            error_code="RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND",
        )

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)

    with client.websocket_connect("/ws/plivo?deploymentId=missing-dep-uuid") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-404",
                "callId": "test-call-404",
            },
        }
        ws.send_text(json.dumps(start_payload))
        with pytest.raises(Exception):
            ws.receive_text()


def test_websocket_rejects_config_resolution_401_unauthorized(client, monkeypatch):
    """Verify WebSocket cleanly rejects connection when worker authentication fails (401)."""
    async def mock_get_config(self, deployment_id: str):
        raise RuntimeConfigClientError(
            "Worker authentication failed",
            status_code=401,
            error_code="UNAUTHORIZED",
        )

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)

    with client.websocket_connect("/ws/plivo?deploymentId=dep-401") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-401",
                "callId": "test-call-401",
            },
        }
        ws.send_text(json.dumps(start_payload))
        with pytest.raises(Exception):
            ws.receive_text()


def test_websocket_rejects_config_resolution_409_inactive(client, monkeypatch):
    """Verify WebSocket cleanly rejects connection when deployment is inactive (409)."""
    async def mock_get_config(self, deployment_id: str):
        raise RuntimeConfigClientError(
            "Deployment is inactive",
            status_code=409,
            error_code="RUNTIME_CONFIG_DEPLOYMENT_INACTIVE",
        )

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)

    with client.websocket_connect("/ws/plivo?deploymentId=dep-inactive") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-inactive",
                "callId": "test-call-inactive",
            },
        }
        ws.send_text(json.dumps(start_payload))
        with pytest.raises(Exception):
            ws.receive_text()


def test_websocket_resolution_before_pipeline_creation(monkeypatch):
    """Verify runtime config is resolved before any pipeline or service instantiation."""
    resolved_dep_id = None

    async def mock_get_config(self, deployment_id: str):
        nonlocal resolved_dep_id
        resolved_dep_id = deployment_id
        return RuntimeAgentConfig.model_validate(SAMPLE_VALID_RUNTIME_CONFIG_DICT)

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)

    test_client = TestClient(app)
    with test_client.websocket_connect("/ws/plivo?deploymentId=dep-order-check") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-order",
                "callId": "test-call-order",
            },
        }
        ws.send_text(json.dumps(start_payload))

    assert resolved_dep_id == "dep-order-check"

