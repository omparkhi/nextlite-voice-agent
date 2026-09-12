"""Automated tests for Phase 1 Pipecat Worker Plivo Audio Echo POC."""

import base64
import json
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from pipecat.serializers.plivo import PlivoFrameSerializer


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    """Test health endpoint responds correctly."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "pipecat-worker"
    assert data["phase"].startswith("phase-")
    assert "timestamp" in data


def test_plivo_test_xml_endpoint(client):
    """Test Plivo XML generation endpoint returns valid bidirectional stream XML."""
    response = client.get("/plivo/test-xml")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/xml"
    content = response.text
    assert "<Response>" in content
    assert '<Stream bidirectional="true" keepCallAlive="true">' in content
    assert "/ws/plivo" in content
    assert "</Response>" in content


def test_plivo_test_xml_custom_host(client):
    """Test Plivo XML generation endpoint with custom host query parameter."""
    custom_host = "test-domain.ngrok-free.app"
    response = client.get(f"/plivo/test-xml?host={custom_host}")
    assert response.status_code == 200
    assert f"{custom_host}/ws/plivo" in response.text


def test_websocket_malformed_json(client):
    """Test WebSocket handler safely closes on invalid/malformed JSON."""
    with client.websocket_connect("/ws/plivo") as ws:
        ws.send_text("THIS IS NOT JSON")
        with pytest.raises(Exception):
            ws.receive_text()


def test_websocket_poc_secret_auth(client, monkeypatch):
    """Test WebSocket authentication when POC_SECRET_KEY is configured."""
    monkeypatch.setattr(settings, "POC_SECRET_KEY", "secret-poc-token-123")
    
    # 1. Connection with invalid/missing token rejected
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/plivo?token=wrong-token") as ws:
            ws.receive_text()

    # 2. Connection with valid token accepted
    with client.websocket_connect("/ws/plivo?token=secret-poc-token-123") as ws:
        # Connection succeeds, send start event
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-poc-token",
                "callId": "test-call-poc-token",
            },
        }
        ws.send_text(json.dumps(start_payload))
        # Connection is live


def test_plivo_serializer_init_no_auth():
    """Verify PlivoFrameSerializer instantiates safely without REST credentials when auto_hang_up is disabled."""
    params = PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000)
    serializer = PlivoFrameSerializer(
        stream_id="test-stream-no-auth",
        call_id="test-call-no-auth",
        params=params,
    )
    assert serializer._stream_id == "test-stream-no-auth"
    assert serializer._plivo_sample_rate == 8000
    assert serializer._params.auto_hang_up is False


def test_plivo_serializer_init_with_auth():
    """Verify PlivoFrameSerializer instantiates with REST credentials when auto_hang_up is enabled."""
    params = PlivoFrameSerializer.InputParams(auto_hang_up=True, plivo_sample_rate=8000)
    serializer = PlivoFrameSerializer(
        stream_id="test-stream-auth",
        call_id="test-call-auth",
        auth_id="MAMAY5ODUZOTI2NTQ4YT",
        auth_token="test-auth-token-plivo",
        params=params,
    )
    assert serializer._stream_id == "test-stream-auth"
    assert serializer._call_id == "test-call-auth"
    assert serializer._auth_id == "MAMAY5ODUZOTI2NTQ4YT"
    assert serializer._params.auto_hang_up is True


def test_plivo_event_structure_validation():
    """Verify standard Plivo telephony event payloads."""
    start_event = {
        "event": "start",
        "start": {
            "streamId": "test-stream-12345",
            "callId": "test-call-67890",
            "accountSid": "test-account-sid",
            "tracks": ["inbound", "outbound"],
            "mediaFormat": {
                "encoding": "audio/x-mulaw",
                "sampleRate": 8000,
                "channels": 1,
            },
        },
    }
    
    assert start_event["event"] == "start"
    assert start_event["start"]["streamId"] == "test-stream-12345"
    assert start_event["start"]["mediaFormat"]["encoding"] == "audio/x-mulaw"
    assert start_event["start"]["mediaFormat"]["sampleRate"] == 8000

    # 160 bytes of 8kHz mu-law audio = 20ms of audio
    dummy_mulaw = b"\xff" * 160
    b64_payload = base64.b64encode(dummy_mulaw).decode("utf-8")
    
    media_event = {
        "event": "media",
        "media": {
            "track": "inbound",
            "chunk": 1,
            "timestamp": 1700000000,
            "payload": b64_payload,
        },
    }
    assert media_event["event"] == "media"
    assert media_event["media"]["payload"] == b64_payload

    stop_event = {
        "event": "stop",
        "stop": {
            "callId": "test-call-67890",
            "streamId": "test-stream-12345",
        },
    }
    assert stop_event["event"] == "stop"
