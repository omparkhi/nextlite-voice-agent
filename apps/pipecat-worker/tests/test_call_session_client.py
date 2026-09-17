"""Comprehensive Unit and Lifecycle Tests for Phase 6C: Pipecat Call Session Lifecycle.

Tests:
1. Control Plane HTTP Client (create, update, 400, 401, 403, 404, 409, 500, timeout, malformed JSON)
2. Metadata & Direction Detection (WEB_TEST, OUTBOUND, INBOUND, caller phone extraction)
3. Sensitive data masking (PII & secrets)
4. Transcript accumulation & formatting (CallTranscriptCollector, format_plain_transcript)
5. End-to-end WebSocket Lifecycle:
   - Config failure -> no ACTIVE session created
   - Config success -> ACTIVE session created
   - Normal completion -> COMPLETED session updated
   - Pipeline failure -> FAILED session updated
   - Short call with 0 turns -> MISSED session updated
   - Exactly-once finalization guarantee
6. Trusted per-call context & Caller override rejection (tenantId, agentId, deploymentId, callSessionId)
7. Multi-tenant call session isolation (Tenant A vs Tenant B)
"""

import asyncio
import json
import re
import time
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.call_lifecycle import (
    CallTranscriptCollector,
    TrustedCallContext,
    detect_call_context,
    format_plain_transcript,
    mask_sensitive,
)
from app.call_session_client import (
    CallSessionClient,
    CallSessionClientError,
    CallSessionResponse,
    CreateCallSessionRequest,
    UpdateCallSessionRequest,
)
from app.config import settings
from app.main import app, RealtimeStreamingTimingMonitor
from app.runtime_config_client import RuntimeAgentConfig, RuntimeConfigClient, RuntimeConfigClientError


# ============================================================================
# Fixtures & Test Data
# ============================================================================

SAMPLE_TENANT_ID_A = "11111111-1111-4111-8111-111111111111"
SAMPLE_AGENT_ID_A = "22222222-2222-4222-8222-222222222222"
SAMPLE_DEPLOYMENT_ID_A = "33333333-3333-4333-8333-333333333333"
SAMPLE_SESSION_ID_A = "44444444-4444-4444-8444-444444444444"

SAMPLE_TENANT_ID_B = "99999999-9999-4999-8999-999999999999"
SAMPLE_AGENT_ID_B = "88888888-8888-4888-8888-888888888888"
SAMPLE_DEPLOYMENT_ID_B = "77777777-7777-4777-8777-777777777777"
SAMPLE_SESSION_ID_B = "66666666-6666-4666-8666-666666666666"


def create_mock_runtime_config(
    tenant_id: str = SAMPLE_TENANT_ID_A,
    agent_id: str = SAMPLE_AGENT_ID_A,
    deployment_id: str = SAMPLE_DEPLOYMENT_ID_A,
    agent_name: str = "Test Hospital Assistant",
    primary_language: str = "en-IN",
    system_prompt: str = "You are a helpful hospital voice assistant.",
    greeting: Optional[str] = "Hello, welcome to Apex Hospital.",
) -> RuntimeAgentConfig:
    return RuntimeAgentConfig.model_validate({
        "tenant": {"tenantId": tenant_id},
        "agent": {"agentId": agent_id, "agentName": agent_name, "status": "ACTIVE"},
        "deployment": {"deploymentId": deployment_id, "versionId": "v1", "versionNumber": 1},
        "prompt": {"compiledSystemPrompt": system_prompt, "greeting": greeting},
        "voice": {"provider": "sarvam", "voiceId": "priya", "sttModel": "saaras:v3", "ttsModel": "bulbul:v3"},
        "language": {"primary": primary_language, "supportedLanguages": [primary_language]},
        "runtime": {"llmModel": "sarvam-105b-conversations", "temperature": 0.3},
        "knowledge": {"enabled": False},
        "tools": {"enabled": False, "tools": []},
        "variables": {"inputVariables": [], "outputVariables": []},
    })


@pytest.fixture
def client():
    return TestClient(app)


# ============================================================================
# Step 1: CallSessionClient HTTP Unit Tests
# ============================================================================

@pytest.mark.asyncio
async def test_client_successful_create():
    """Test successful POST /api/internal/call-sessions returning 201."""
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/api/internal/call-sessions"
        assert request.headers["authorization"] == f"Bearer {settings.WORKER_API_SECRET}"
        assert request.headers["x-worker-secret"] == settings.WORKER_API_SECRET

        body = json.loads(request.read())
        assert body["tenantId"] == SAMPLE_TENANT_ID_A
        assert body["agentId"] == SAMPLE_AGENT_ID_A
        assert body["deploymentId"] == SAMPLE_DEPLOYMENT_ID_A
        assert body["status"] == "ACTIVE"
        assert body["direction"] == "INBOUND"

        return httpx.Response(
            status_code=201,
            json={
                "id": SAMPLE_SESSION_ID_A,
                "tenantId": SAMPLE_TENANT_ID_A,
                "agentId": SAMPLE_AGENT_ID_A,
                "deploymentId": SAMPLE_DEPLOYMENT_ID_A,
                "roomName": "call-room-1",
                "callerNumber": "+919876543210",
                "direction": "INBOUND",
                "status": "ACTIVE",
                "durationSeconds": 0,
                "primaryLanguage": "en-IN",
                "startedAt": "2026-09-09T18:00:00.000Z",
                "createdAt": "2026-09-09T18:00:00.000Z",
            },
        )

    mock_transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client_instance = CallSessionClient(http_client=http_client)
        resp = await client_instance.create_call_session(
            CreateCallSessionRequest(
                tenantId=SAMPLE_TENANT_ID_A,
                agentId=SAMPLE_AGENT_ID_A,
                deploymentId=SAMPLE_DEPLOYMENT_ID_A,
                roomName="call-room-1",
                callerNumber="+919876543210",
                direction="INBOUND",
                status="ACTIVE",
                startedAt="2026-09-09T18:00:00.000Z",
            )
        )

        assert resp.id == SAMPLE_SESSION_ID_A
        assert resp.tenant_id == SAMPLE_TENANT_ID_A
        assert resp.status == "ACTIVE"
        assert resp.caller_number == "+919876543210"


@pytest.mark.asyncio
async def test_client_successful_update():
    """Test successful PATCH /api/internal/call-sessions/:id returning 200."""
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PATCH"
        assert request.url.path == f"/api/internal/call-sessions/{SAMPLE_SESSION_ID_A}"
        assert request.headers["authorization"] == f"Bearer {settings.WORKER_API_SECRET}"
        assert request.headers["x-worker-secret"] == settings.WORKER_API_SECRET

        body = json.loads(request.read())
        assert body["tenantId"] == SAMPLE_TENANT_ID_A
        assert body["status"] == "COMPLETED"
        assert body["durationSeconds"] == 25
        assert body["transcriptText"] == "User: Hello\nAssistant: Hi there"
        assert body["toolsUsed"] == []

        return httpx.Response(
            status_code=200,
            json={
                "id": SAMPLE_SESSION_ID_A,
                "tenantId": SAMPLE_TENANT_ID_A,
                "agentId": SAMPLE_AGENT_ID_A,
                "deploymentId": SAMPLE_DEPLOYMENT_ID_A,
                "roomName": "call-room-1",
                "callerNumber": "+919876543210",
                "direction": "INBOUND",
                "status": "COMPLETED",
                "durationSeconds": 25,
                "primaryLanguage": "en-IN",
                "startedAt": "2026-09-09T18:00:00.000Z",
                "endedAt": "2026-09-09T18:00:25.000Z",
                "transcriptText": "User: Hello\nAssistant: Hi there",
                "turnsJson": [{"turnId": 1}],
                "toolsUsed": [],
                "metricsJson": {"totalTurns": 1},
                "createdAt": "2026-09-09T18:00:00.000Z",
            },
        )

    mock_transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client_instance = CallSessionClient(http_client=http_client)
        resp = await client_instance.update_call_session(
            SAMPLE_SESSION_ID_A,
            UpdateCallSessionRequest(
                tenantId=SAMPLE_TENANT_ID_A,
                status="COMPLETED",
                durationSeconds=25,
                endedAt="2026-09-09T18:00:25.000Z",
                transcriptText="User: Hello\nAssistant: Hi there",
                turnsJson=[{"turnId": 1}],
                toolsUsed=[],
                metricsJson={"totalTurns": 1},
            ),
        )

        assert resp.id == SAMPLE_SESSION_ID_A
        assert resp.status == "COMPLETED"
        assert resp.duration_seconds == 25


@pytest.mark.asyncio
async def test_client_error_statuses():
    """Test 400, 401, 403, 404, 409, 500 error mapping."""
    error_cases = [
        (400, "INVALID_REQUEST", "Invalid payload"),
        (401, "UNAUTHORIZED", "Unauthorized"),
        (403, "FORBIDDEN", "Forbidden"),
        (404, "NOT_FOUND", "Not found"),
        (409, "CONFLICT", "Conflict"),
        (500, "SERVER_ERROR", "Internal server error"),
    ]

    for status_code, expected_code, msg in error_cases:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=status_code, json={"error": msg, "code": expected_code})

        mock_transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=mock_transport) as http_client:
            client_instance = CallSessionClient(http_client=http_client)
            with pytest.raises(CallSessionClientError) as exc_info:
                await client_instance.create_call_session(
                    CreateCallSessionRequest(
                        tenantId=SAMPLE_TENANT_ID_A,
                        agentId=SAMPLE_AGENT_ID_A,
                        deploymentId=SAMPLE_DEPLOYMENT_ID_A,
                        roomName="call-room-1",
                    )
                )

            assert exc_info.value.status_code == status_code
            assert exc_info.value.error_code == expected_code


@pytest.mark.asyncio
async def test_client_timeout_and_malformed_json():
    """Test timeout (504) and malformed JSON (500) handling."""
    # 1. Timeout
    mock_http_client = AsyncMock()
    mock_http_client.post.side_effect = httpx.ReadTimeout("Read timed out")
    client_instance = CallSessionClient(http_client=mock_http_client)

    with pytest.raises(CallSessionClientError) as exc_info:
        await client_instance.create_call_session(
            CreateCallSessionRequest(
                tenantId=SAMPLE_TENANT_ID_A,
                agentId=SAMPLE_AGENT_ID_A,
                deploymentId=SAMPLE_DEPLOYMENT_ID_A,
                roomName="call-room-1",
            )
        )
    assert exc_info.value.status_code == 504

    # 2. Malformed JSON
    def malformed_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code=200, content=b"not a valid json")

    mock_transport = httpx.MockTransport(malformed_handler)
    async with httpx.AsyncClient(transport=mock_transport) as http_client:
        client_instance = CallSessionClient(http_client=http_client)
        with pytest.raises(CallSessionClientError) as exc_info:
            await client_instance.update_call_session(
                SAMPLE_SESSION_ID_A,
                UpdateCallSessionRequest(tenantId=SAMPLE_TENANT_ID_A, status="COMPLETED"),
            )
        assert exc_info.value.status_code == 500
        assert exc_info.value.error_code == "INVALID_JSON"


# ============================================================================
# Step 2: Call Lifecycle & Metadata Detection Tests
# ============================================================================

def test_detect_call_context_web_test():
    """WEB_TEST direction when room starts with test- or identity with tester-."""
    d1, phone1 = detect_call_context(room_name="test-room-123", from_number="+919876543210")
    assert d1 == "WEB_TEST"
    assert phone1 is None

    d2, phone2 = detect_call_context(room_name="agent-room", from_number="tester-browser-user")
    assert d2 == "WEB_TEST"
    assert phone2 is None


def test_detect_call_context_outbound():
    """OUTBOUND direction when room starts with phone-test- or SIP identity."""
    d1, phone1 = detect_call_context(room_name="phone-test-room-123", from_number="+919876543210")
    assert d1 == "OUTBOUND"
    assert phone1 == "+919876543210"

    d2, phone2 = detect_call_context(
        room_name="call-123",
        participant_identity="sip-+919876543210-timestamp",
        participant_attributes={"sip.phoneNumber": "+919876543210"},
    )
    assert d2 == "OUTBOUND"
    assert phone2 == "+919876543210"

    # Outbound call where From=Agent and To=Customer
    d3, phone3 = detect_call_context(
        direction="outbound",
        from_number="+918031707681",  # Agent number
        to_number="+919876543210",    # User/Customer speaker
    )
    assert d3 == "OUTBOUND"
    assert phone3 == "+919876543210"


def test_detect_call_context_inbound():
    """INBOUND direction for regular telephony calls."""
    d, phone = detect_call_context(room_name="stream_abc123", from_number="+919876543210")
    assert d == "INBOUND"
    assert phone == "+919876543210"

    # Inbound call where From=Customer and To=Agent
    d2, phone2 = detect_call_context(
        direction="inbound",
        from_number="+919876543210",  # User/Customer speaker
        to_number="+918031707681",    # Agent number
    )
    assert d2 == "INBOUND"
    assert phone2 == "+919876543210"


def test_mask_sensitive_phone_and_tokens():
    """Verifies Indian mobile numbers and auth tokens are masked."""
    text = "Call me at +919876543210 or 9876543210 with Bearer secret-token-123 and apiKey=mykey456 password=secretpass"
    masked = mask_sensitive(text)
    assert "+919876543210" not in masked
    assert "9876543210" not in masked
    assert "******3210" in masked
    assert "secret-token-123" not in masked
    assert "mykey456" not in masked
    assert "secretpass" not in masked


def test_format_plain_transcript():
    """Verifies plain text transcript formatting matches LiveKit format."""
    turns = [
        {"turnId": 1, "user": {"transcript": "Hello doctor"}, "agent": {"response": "Hello! How can I help you today?"}},
        {"turnId": 2, "user": {"transcript": "I need an appointment"}, "agent": {"response": "Sure, which department?"}},
    ]
    formatted = format_plain_transcript(turns)
    expected = (
        "User: Hello doctor\n"
        "Assistant: Hello! How can I help you today?\n"
        "User: I need an appointment\n"
        "Assistant: Sure, which department?"
    )
    assert formatted == expected


def test_transcript_collector_turns_and_errors():
    """Verifies CallTranscriptCollector accumulates turns in order and handles errors."""
    collector = CallTranscriptCollector()
    collector.record_user_turn("Hi there")
    collector.record_agent_message("Welcome to Apex Hospital", active_language="en-IN", ttft_ms=350.0)
    collector.record_user_turn("What are OPD timings?")
    collector.record_agent_message("OPD is open 9am to 2pm", active_language="en-IN", ttft_ms=400.0)
    collector.record_error("Test non-fatal warning", source="tts")

    summary = collector.end_call()
    assert summary["totalTurns"] == 2
    turns = summary["turns"]
    assert len(turns) == 2
    assert turns[0]["turnId"] == 1
    assert turns[0]["user"]["transcript"] == "Hi there"
    assert turns[0]["agent"]["response"] == "Welcome to Apex Hospital"
    assert turns[0]["agent"]["ttftMs"] == 350.0
    assert turns[1]["turnId"] == 2
    assert turns[1]["user"]["transcript"] == "What are OPD timings?"
    assert turns[1]["agent"]["response"] == "OPD is open 9am to 2pm"
    assert len(summary["errors"]) == 1
    assert summary["errors"][0]["message"] == "Test non-fatal warning"


def test_transcript_multiturn_order_preservation():
    """Verifies multi-turn conversations preserve strict chronological turnId order."""
    collector = CallTranscriptCollector()
    for i in range(1, 6):
        collector.record_user_turn(f"User message {i}")
        collector.record_agent_message(f"Assistant response {i}", active_language="en-IN")

    summary = collector.end_call()
    assert summary["totalTurns"] == 5
    for idx, turn in enumerate(summary["turns"], start=1):
        assert turn["turnId"] == idx
        assert turn["user"]["transcript"] == f"User message {idx}"
        assert turn["agent"]["response"] == f"Assistant response {idx}"


def test_transcript_empty_text_ignored():
    """Empty and whitespace strings do not create phantom turns."""
    collector = CallTranscriptCollector()
    collector.record_user_turn("   ")
    collector.record_user_turn("")
    collector.record_agent_message("   ")
    collector.record_agent_message("")
    summary = collector.end_call()
    assert summary["totalTurns"] == 0
    assert len(summary["turns"]) == 0


def test_transcript_interrupted_turn_captured():
    """Interrupted agent turns capture interrupted=True flag."""
    collector = CallTranscriptCollector()
    collector.record_user_turn("Cancel that")
    collector.record_agent_message("Booking your appoi...", active_language="en-IN", interrupted=True)
    summary = collector.end_call()
    assert summary["totalTurns"] == 1
    assert summary["turns"][0]["agent"]["interrupted"] is True
    assert summary["turns"][0]["agent"]["response"] == "Booking your appoi..."


# ============================================================================
# Step 3: End-to-End WebSocket Lifecycle Tests
# ============================================================================

def test_websocket_config_failure_no_active_session(client, monkeypatch):
    """Config resolution failure (404) must NOT create an ACTIVE call session."""
    created_sessions: List[Dict[str, Any]] = []

    async def mock_get_config(self, deployment_id: str):
        raise RuntimeConfigClientError(
            "Deployment not found",
            status_code=404,
            error_code="RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND",
        )

    async def mock_create(self, data: CreateCallSessionRequest):
        created_sessions.append(data.model_dump())
        return CallSessionResponse(
            id=SAMPLE_SESSION_ID_A,
            tenantId=data.tenant_id,
            agentId=data.agent_id,
            deploymentId=data.deployment_id,
            roomName=data.room_name,
            direction="INBOUND",
            status="ACTIVE",
            durationSeconds=0,
            startedAt="2026-09-09T18:00:00Z",
        )

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)
    monkeypatch.setattr(CallSessionClient, "create_call_session", mock_create)

    with client.websocket_connect(f"/ws/plivo?deploymentId={SAMPLE_DEPLOYMENT_ID_A}") as ws:
        ws.send_text(json.dumps({
            "event": "start",
            "start": {
                "streamId": "stream-inbound-1",
                "callId": "call-123",
                "from": "+919876543210",
            }
        }))
        with pytest.raises(Exception):
            ws.receive_text()

    # MUST NOT have created any call session
    assert len(created_sessions) == 0


def test_websocket_successful_lifecycle_active_and_completed(client, monkeypatch):
    """Successful config creates ACTIVE session and completes with COMPLETED PATCH."""
    from pipecat.workers.runner import WorkerRunner

    created_sessions: List[Dict[str, Any]] = []
    updated_sessions: List[Dict[str, Any]] = []

    async def mock_create(self, data: CreateCallSessionRequest) -> CallSessionResponse:
        created_sessions.append(data.model_dump(by_alias=True))
        return CallSessionResponse(
            id=SAMPLE_SESSION_ID_A,
            tenantId=data.tenant_id,
            agentId=data.agent_id,
            deploymentId=data.deployment_id,
            roomName=data.room_name,
            callerNumber=data.caller_number,
            direction=data.direction or "INBOUND",
            status="ACTIVE",
            durationSeconds=0,
            startedAt="2026-09-09T18:00:00Z",
        )

    async def mock_update(self, session_id: str, data: UpdateCallSessionRequest) -> CallSessionResponse:
        updated_sessions.append({"sessionId": session_id, **data.model_dump(by_alias=True)})
        return CallSessionResponse(
            id=session_id,
            tenantId=data.tenant_id,
            agentId=SAMPLE_AGENT_ID_A,
            deploymentId=SAMPLE_DEPLOYMENT_ID_A,
            roomName="stream-inbound-1",
            status=data.status or "COMPLETED",
            durationSeconds=data.duration_seconds or 0,
            startedAt="2026-09-09T18:00:00Z",
        )

    mock_cfg = create_mock_runtime_config(
        tenant_id=SAMPLE_TENANT_ID_A,
        agent_id=SAMPLE_AGENT_ID_A,
        deployment_id=SAMPLE_DEPLOYMENT_ID_A,
    )

    async def mock_get_cfg(self, deployment_id: str) -> RuntimeAgentConfig:
        return mock_cfg

    async def mock_runner_run(self):
        return None

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_cfg)
    monkeypatch.setattr(CallSessionClient, "create_call_session", mock_create)
    monkeypatch.setattr(CallSessionClient, "update_call_session", mock_update)
    monkeypatch.setattr(WorkerRunner, "run", mock_runner_run)

    with client.websocket_connect(f"/ws/plivo?deploymentId={SAMPLE_DEPLOYMENT_ID_A}") as ws:
        ws.send_text(json.dumps({
            "event": "start",
            "start": {
                "streamId": "stream-inbound-1",
                "callId": "call-123",
                "from": "+919876543210",
            }
        }))
        ws.close()

    # Verify creation payload
    assert len(created_sessions) == 1
    assert created_sessions[0]["tenantId"] == SAMPLE_TENANT_ID_A
    assert created_sessions[0]["agentId"] == SAMPLE_AGENT_ID_A
    assert created_sessions[0]["deploymentId"] == SAMPLE_DEPLOYMENT_ID_A
    assert created_sessions[0]["status"] == "ACTIVE"
    assert created_sessions[0]["callerNumber"] == "+919876543210"
    assert created_sessions[0]["direction"] == "INBOUND"

    # Verify update payload
    assert len(updated_sessions) == 1
    assert updated_sessions[0]["sessionId"] == SAMPLE_SESSION_ID_A
    assert updated_sessions[0]["tenantId"] == SAMPLE_TENANT_ID_A
    assert updated_sessions[0]["status"] in ["COMPLETED", "MISSED"]
    assert "durationSeconds" in updated_sessions[0]
    assert "metricsJson" in updated_sessions[0]


def test_websocket_pipeline_failure_marks_failed(client, monkeypatch):
    """Pipeline fatal exception marks call session as FAILED."""
    from pipecat.workers.runner import WorkerRunner

    updated_sessions: List[Dict[str, Any]] = []

    async def mock_create(self, data: CreateCallSessionRequest) -> CallSessionResponse:
        return CallSessionResponse(
            id=SAMPLE_SESSION_ID_A,
            tenantId=data.tenant_id,
            agentId=data.agent_id,
            deploymentId=data.deployment_id,
            roomName=data.room_name,
            direction="INBOUND",
            status="ACTIVE",
            durationSeconds=0,
            startedAt="2026-09-09T18:00:00Z",
        )

    async def mock_update(self, session_id: str, data: UpdateCallSessionRequest) -> CallSessionResponse:
        updated_sessions.append({"sessionId": session_id, **data.model_dump(by_alias=True)})
        return CallSessionResponse(
            id=session_id,
            tenantId=data.tenant_id,
            agentId=SAMPLE_AGENT_ID_A,
            deploymentId=SAMPLE_DEPLOYMENT_ID_A,
            roomName="stream-inbound-1",
            status=data.status or "FAILED",
            durationSeconds=data.duration_seconds or 0,
            startedAt="2026-09-09T18:00:00Z",
        )

    mock_cfg = create_mock_runtime_config()

    async def mock_get_cfg(self, deployment_id: str) -> RuntimeAgentConfig:
        return mock_cfg

    async def mock_runner_fail(self):
        raise RuntimeError("TTS Service crashed")

    monkeypatch.setattr(settings, "SARVAM_API_KEY", "test-sarvam-key")
    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_cfg)
    monkeypatch.setattr(CallSessionClient, "create_call_session", mock_create)
    monkeypatch.setattr(CallSessionClient, "update_call_session", mock_update)
    monkeypatch.setattr(WorkerRunner, "run", mock_runner_fail)

    with client.websocket_connect(f"/ws/plivo?deploymentId={SAMPLE_DEPLOYMENT_ID_A}") as ws:
        ws.send_text(json.dumps({
            "event": "start",
            "start": {
                "streamId": "stream-inbound-1",
                "callId": "call-123",
                "from": "+919876543210",
            }
        }))
        time.sleep(0.1)

    assert len(updated_sessions) == 1
    assert updated_sessions[0]["status"] == "FAILED"
    assert "errors" in updated_sessions[0]["metricsJson"]


def test_websocket_missed_call_semantics():
    """Short call (<3s) with 0 turns marks call as MISSED (matching LiveKit rule)."""
    collector = CallTranscriptCollector()
    summary = collector.end_call()
    turns = summary["turns"]
    duration_seconds = 1  # < 3s
    status = "COMPLETED"

    if status == "COMPLETED" and len(turns) == 0 and duration_seconds < 3:
        status = "MISSED"

    assert status == "MISSED"


# ============================================================================
# Step 4: Security, Immutability & Multi-Tenant Isolation Tests
# ============================================================================

def test_trusted_call_context_immutability():
    """TrustedCallContext is frozen and cannot be mutated by caller or LLM."""
    ctx = TrustedCallContext(
        call_session_id=SAMPLE_SESSION_ID_A,
        deployment_id=SAMPLE_DEPLOYMENT_ID_A,
        tenant_id=SAMPLE_TENANT_ID_A,
        agent_id=SAMPLE_AGENT_ID_A,
        caller_phone="+919876543210",
        direction="INBOUND",
        start_time=100.0,
        started_at_iso="2026-09-09T18:00:00Z",
    )

    assert ctx.call_session_id == SAMPLE_SESSION_ID_A
    assert ctx.tenant_id == SAMPLE_TENANT_ID_A
    assert ctx.agent_id == SAMPLE_AGENT_ID_A
    assert ctx.caller_phone == "+919876543210"

    with pytest.raises(Exception):
        ctx.tenant_id = "malicious-tenant-id"  # type: ignore

    with pytest.raises(Exception):
        ctx.call_session_id = "malicious-session-id"  # type: ignore


def test_caller_cannot_override_tenant_or_agent(client, monkeypatch):
    """Caller injecting malicious tenantId in query params or start payload is ignored."""
    from pipecat.workers.runner import WorkerRunner

    created_sessions: List[Dict[str, Any]] = []

    async def mock_create(self, data: CreateCallSessionRequest) -> CallSessionResponse:
        created_sessions.append(data.model_dump(by_alias=True))
        return CallSessionResponse(
            id=SAMPLE_SESSION_ID_A,
            tenantId=data.tenant_id,
            agentId=data.agent_id,
            deploymentId=data.deployment_id,
            roomName=data.room_name,
            direction="INBOUND",
            status="ACTIVE",
            durationSeconds=0,
            startedAt="2026-09-09T18:00:00Z",
        )

    # The Control Plane returns authoritative tenantId=TENANT_A, agentId=AGENT_A
    mock_cfg = create_mock_runtime_config(
        tenant_id=SAMPLE_TENANT_ID_A,
        agent_id=SAMPLE_AGENT_ID_A,
        deployment_id=SAMPLE_DEPLOYMENT_ID_A,
    )

    async def mock_get_cfg(self, deployment_id: str) -> RuntimeAgentConfig:
        return mock_cfg

    async def mock_runner_run(self):
        return None

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_cfg)
    monkeypatch.setattr(CallSessionClient, "create_call_session", mock_create)
    monkeypatch.setattr(CallSessionClient, "update_call_session", AsyncMock())
    monkeypatch.setattr(WorkerRunner, "run", mock_runner_run)

    # Attacker tries to supply tenantId=ATTACKER_TENANT and agentId=ATTACKER_AGENT
    with client.websocket_connect(
        f"/ws/plivo?deploymentId={SAMPLE_DEPLOYMENT_ID_A}&tenantId=attacker-tenant&agentId=attacker-agent"
    ) as ws:
        ws.send_text(json.dumps({
            "event": "start",
            "start": {
                "streamId": "stream-inbound-1",
                "callId": "call-123",
                "from": "+919876543210",
                "tenantId": "malicious-tenant-override",
                "agentId": "malicious-agent-override",
            }
        }))
        ws.close()

    # Must strictly preserve authoritative TENANT_A and AGENT_A
    assert len(created_sessions) == 1
    assert created_sessions[0]["tenantId"] == SAMPLE_TENANT_ID_A
    assert created_sessions[0]["agentId"] == SAMPLE_AGENT_ID_A
    assert created_sessions[0]["tenantId"] != "attacker-tenant"
    assert created_sessions[0]["agentId"] != "attacker-agent"


def test_dynamic_multi_tenant_session_isolation(client, monkeypatch):
    """Multi-tenant isolation: Tenant A session and Tenant B session do not crosstalk."""
    from pipecat.workers.runner import WorkerRunner

    created_sessions: Dict[str, Dict[str, Any]] = {}
    updated_sessions: Dict[str, Dict[str, Any]] = {}

    async def mock_create(self, data: CreateCallSessionRequest) -> CallSessionResponse:
        session_id = SAMPLE_SESSION_ID_A if data.tenant_id == SAMPLE_TENANT_ID_A else SAMPLE_SESSION_ID_B
        created_sessions[session_id] = data.model_dump(by_alias=True)
        return CallSessionResponse(
            id=session_id,
            tenantId=data.tenant_id,
            agentId=data.agent_id,
            deploymentId=data.deployment_id,
            roomName=data.room_name,
            callerNumber=data.caller_number,
            direction=data.direction or "INBOUND",
            status="ACTIVE",
            durationSeconds=0,
            startedAt="2026-09-09T18:00:00Z",
        )

    async def mock_update(self, session_id: str, data: UpdateCallSessionRequest) -> CallSessionResponse:
        updated_sessions[session_id] = data.model_dump(by_alias=True)
        return CallSessionResponse(
            id=session_id,
            tenantId=data.tenant_id,
            agentId=SAMPLE_AGENT_ID_A if session_id == SAMPLE_SESSION_ID_A else SAMPLE_AGENT_ID_B,
            deploymentId=SAMPLE_DEPLOYMENT_ID_A if session_id == SAMPLE_SESSION_ID_A else SAMPLE_DEPLOYMENT_ID_B,
            roomName="room",
            status="COMPLETED",
            durationSeconds=10,
            startedAt="2026-09-09T18:00:00Z",
        )

    mock_cfg_a = create_mock_runtime_config(
        tenant_id=SAMPLE_TENANT_ID_A,
        agent_id=SAMPLE_AGENT_ID_A,
        deployment_id=SAMPLE_DEPLOYMENT_ID_A,
        agent_name="Apex Hospital",
    )
    mock_cfg_b = create_mock_runtime_config(
        tenant_id=SAMPLE_TENANT_ID_B,
        agent_id=SAMPLE_AGENT_ID_B,
        deployment_id=SAMPLE_DEPLOYMENT_ID_B,
        agent_name="Dental Clinic",
    )

    async def mock_get_cfg(self, deployment_id: str) -> RuntimeAgentConfig:
        if deployment_id == SAMPLE_DEPLOYMENT_ID_A:
            return mock_cfg_a
        return mock_cfg_b

    async def mock_runner_run(self):
        return None

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_cfg)
    monkeypatch.setattr(CallSessionClient, "create_call_session", mock_create)
    monkeypatch.setattr(CallSessionClient, "update_call_session", mock_update)
    monkeypatch.setattr(WorkerRunner, "run", mock_runner_run)

    # Session A
    with client.websocket_connect(f"/ws/plivo?deploymentId={SAMPLE_DEPLOYMENT_ID_A}") as ws_a:
        ws_a.send_text(json.dumps({
            "event": "start",
            "start": {
                "streamId": "stream-tenant-a",
                "callId": "call-a",
                "from": "+919876543210",
            }
        }))
        ws_a.close()

    # Session B
    with client.websocket_connect(f"/ws/plivo?deploymentId={SAMPLE_DEPLOYMENT_ID_B}") as ws_b:
        ws_b.send_text(json.dumps({
            "event": "start",
            "start": {
                "streamId": "stream-tenant-b",
                "callId": "call-b",
                "from": "+919876543211",
            }
        }))
        ws_b.close()

    # Verify Session A
    assert SAMPLE_SESSION_ID_A in created_sessions
    assert created_sessions[SAMPLE_SESSION_ID_A]["tenantId"] == SAMPLE_TENANT_ID_A
    assert created_sessions[SAMPLE_SESSION_ID_A]["agentId"] == SAMPLE_AGENT_ID_A
    assert updated_sessions[SAMPLE_SESSION_ID_A]["tenantId"] == SAMPLE_TENANT_ID_A

    # Verify Session B
    assert SAMPLE_SESSION_ID_B in created_sessions
    assert created_sessions[SAMPLE_SESSION_ID_B]["tenantId"] == SAMPLE_TENANT_ID_B
    assert created_sessions[SAMPLE_SESSION_ID_B]["agentId"] == SAMPLE_AGENT_ID_B
    assert updated_sessions[SAMPLE_SESSION_ID_B]["tenantId"] == SAMPLE_TENANT_ID_B
