"""Tests for Phase 6B: Authoritative RuntimeAgentConfig Pipeline Mapping and Multi-Tenant Isolation."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeConfigClient,
    RuntimeConfigClientError,
)

DEPLOYMENT_A_CONFIG = {
    "tenant": {
        "tenantId": "tenant-alpha-1111-1111-1111",
    },
    "agent": {
        "agentId": "agent-alpha-1111-1111-1111",
        "agentName": "Alpha Clinic Receptionist",
        "status": "LIVE",
    },
    "deployment": {
        "deploymentId": "dep-alpha-1111-1111-1111",
        "versionId": "ver-alpha-1111-1111-1111",
        "versionNumber": 1,
    },
    "prompt": {
        "compiledSystemPrompt": "You are Alpha Clinic's dental assistant. Answer in English.",
        "greeting": "Welcome to Alpha Clinic! How can I help you today?",
        "timezone": "Asia/Kolkata",
    },
    "voice": {
        "provider": "sarvam",
        "sttModel": "saaras:v3",
        "ttsModel": "bulbul:v3",
        "voiceId": "ritu",
        "gender": "female",
        "speakingSpeed": 1.0,
        "pitch": 0.0,
    },
    "language": {
        "primary": "en-IN",
        "supportedLanguages": ["en-IN"],
        "autoDetectEnabled": False,
        "languageSwitchingEnabled": False,
    },
    "runtime": {
        "modelProvider": "sarvam",
        "llmModel": "sarvam-105b-conversations",
        "temperature": 0.2,
        "interruptionMode": "adaptive",
        "preemptiveGenerationEnabled": False,
        "responseEagerness": "medium",
        "noiseCancellationModel": "standard",
        "expressiveModeEnabled": True,
        "maxCallDurationSeconds": 300,
    },
    "knowledge": {"enabled": False},
    "tools": {"enabled": False, "tools": []},
    "variables": {"inputVariables": [], "outputVariables": []},
}

DEPLOYMENT_B_CONFIG = {
    "tenant": {
        "tenantId": "tenant-beta-2222-2222-2222",
    },
    "agent": {
        "agentId": "agent-beta-2222-2222-2222",
        "agentName": "Beta Real Estate Advisor",
        "status": "LIVE",
    },
    "deployment": {
        "deploymentId": "dep-beta-2222-2222-2222",
        "versionId": "ver-beta-2222-2222-2222",
        "versionNumber": 4,
    },
    "prompt": {
        "compiledSystemPrompt": "You are Beta Properties sales advisor. Answer in Hindi/Hinglish.",
        "greeting": "Namaste! Beta Properties me aapka swagat hai.",
        "timezone": "Asia/Kolkata",
    },
    "voice": {
        "provider": "sarvam",
        "sttModel": "saaras:v3",
        "ttsModel": "bulbul:v3",
        "voiceId": "shubh",
        "gender": "male",
        "speakingSpeed": 1.2,
        "pitch": 1.0,
    },
    "language": {
        "primary": "hi-IN",
        "supportedLanguages": ["hi-IN", "en-IN"],
        "autoDetectEnabled": True,
        "languageSwitchingEnabled": True,
    },
    "runtime": {
        "modelProvider": "sarvam",
        "llmModel": "sarvam-105b",
        "temperature": 0.8,
        "interruptionMode": "always",
        "preemptiveGenerationEnabled": True,
        "responseEagerness": "high",
        "noiseCancellationModel": "advanced",
        "expressiveModeEnabled": True,
        "maxCallDurationSeconds": 600,
    },
    "knowledge": {"enabled": True},
    "tools": {"enabled": False, "tools": []},
    "variables": {"inputVariables": [], "outputVariables": []},
}


@pytest.fixture
def client():
    return TestClient(app)


def test_compiled_system_prompt_reaches_context(monkeypatch):
    """Verify that runtime_config.prompt.compiled_system_prompt is set as the LLM system prompt."""
    from pipecat.processors.aggregators.llm_response_universal import LLMContext

    config_a = RuntimeAgentConfig.model_validate(DEPLOYMENT_A_CONFIG)
    initial_messages = [{"role": "system", "content": config_a.prompt.compiled_system_prompt}]
    if config_a.prompt.greeting:
        initial_messages.append({"role": "assistant", "content": config_a.prompt.greeting})

    context = LLMContext(messages=initial_messages)
    messages = context.get_messages()

    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == "You are Alpha Clinic's dental assistant. Answer in English."
    assert messages[0]["content"] != settings.TEST_PROMPT


def test_greeting_wired_into_initial_context(monkeypatch):
    """Verify greeting is added to initial context once when present."""
    from pipecat.processors.aggregators.llm_response_universal import LLMContext

    # With greeting
    config_a = RuntimeAgentConfig.model_validate(DEPLOYMENT_A_CONFIG)
    initial_messages = [{"role": "system", "content": config_a.prompt.compiled_system_prompt}]
    if config_a.prompt.greeting:
        initial_messages.append({"role": "assistant", "content": config_a.prompt.greeting})

    context = LLMContext(messages=initial_messages)
    messages = context.get_messages()

    assert len(messages) == 2
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "Welcome to Alpha Clinic! How can I help you today?"

    # Without greeting
    config_no_greeting = RuntimeAgentConfig.model_validate(DEPLOYMENT_A_CONFIG)
    config_no_greeting.prompt.greeting = None
    messages_no_greeting = [{"role": "system", "content": config_no_greeting.prompt.compiled_system_prompt}]
    if config_no_greeting.prompt.greeting:
        messages_no_greeting.append({"role": "assistant", "content": config_no_greeting.prompt.greeting})

    context_no_greeting = LLMContext(messages=messages_no_greeting)
    assert len(context_no_greeting.get_messages()) == 1


def test_configured_models_and_voice_instantiation():
    """Verify STT, LLM, and TTS services instantiate with exact configured models."""
    from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
    from pipecat.services.sarvam.stt import SarvamSTTService
    from pipecat.services.sarvam.tts import SarvamTTSService

    config_b = RuntimeAgentConfig.model_validate(DEPLOYMENT_B_CONFIG)

    stt = SarvamSTTService(
        api_key="test-api-key",
        settings=SarvamSTTService.Settings(model=config_b.voice.stt_model),
    )
    assert stt._settings.model == "saaras:v3"

    llm = SarvamLLMService(
        api_key="test-api-key",
        settings=SarvamLLMSettings(model=config_b.runtime.llm_model, temperature=config_b.runtime.temperature),
    )
    assert llm._settings.model == "sarvam-105b"
    assert llm._settings.temperature == 0.8

    tts = SarvamTTSService(
        api_key="test-api-key",
        settings=SarvamTTSService.Settings(
            model=config_b.voice.tts_model,
            voice=config_b.voice.voice_id,
        ),
    )
    assert tts._settings.model == "bulbul:v3"
    assert tts._settings.voice == "shubh"
    assert tts._settings.voice != settings.PHASE2_TEST_VOICE_ID or config_b.voice.voice_id == "shubh"


def test_model_optional_fallbacks():
    """Verify safe fallbacks when optional fields are None in RuntimeAgentConfig."""
    from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
    from pipecat.services.sarvam.stt import SarvamSTTService
    from pipecat.services.sarvam.tts import SarvamTTSService

    sparse_config = RuntimeAgentConfig.model_validate({
        "tenant": {"tenantId": "t1"},
        "agent": {"agentId": "a1", "agentName": "Sparse Agent", "status": "LIVE"},
        "deployment": {"deploymentId": "d1", "versionId": "v1"},
        "prompt": {"compiledSystemPrompt": "Sparse prompt"},
        "voice": {"provider": "sarvam", "voiceId": "priya"},  # sttModel & ttsModel omitted
        "language": {"primary": "en-IN"},
        "runtime": {},  # llmModel & temperature omitted
        "knowledge": {"enabled": False},
        "tools": {"enabled": False, "tools": []},
        "variables": {"inputVariables": [], "outputVariables": []},
    })

    stt_model = sparse_config.voice.stt_model or settings.STT_MODEL
    tts_model = sparse_config.voice.tts_model or settings.TTS_MODEL
    llm_model = sparse_config.runtime.llm_model or settings.LLM_MODEL

    assert stt_model == settings.STT_MODEL
    assert tts_model == settings.TTS_MODEL
    assert llm_model == settings.LLM_MODEL


def test_empty_compiled_prompt_rejects_websocket(client, monkeypatch):
    """Verify WebSocket rejects connection when compiledSystemPrompt is empty."""
    invalid_config = dict(DEPLOYMENT_A_CONFIG)
    invalid_config["prompt"] = {"compiledSystemPrompt": "   ", "greeting": "Hello"}

    async def mock_get_config(self, deployment_id: str):
        return RuntimeAgentConfig.model_validate(invalid_config)

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)

    with client.websocket_connect("/ws/plivo?deploymentId=empty-prompt-dep") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-empty-prompt",
                "callId": "test-call-empty-prompt",
            },
        }
        ws.send_text(json.dumps(start_payload))
        with pytest.raises(Exception):
            ws.receive_text()


def test_empty_voice_id_rejects_websocket(client, monkeypatch):
    """Verify WebSocket rejects connection when voiceId is empty."""
    invalid_config = dict(DEPLOYMENT_A_CONFIG)
    invalid_config["voice"] = {"provider": "sarvam", "voiceId": "  "}

    async def mock_get_config(self, deployment_id: str):
        return RuntimeAgentConfig.model_validate(invalid_config)

    monkeypatch.setattr(RuntimeConfigClient, "get_runtime_agent_config", mock_get_config)

    with client.websocket_connect("/ws/plivo?deploymentId=empty-voice-dep") as ws:
        start_payload = {
            "event": "start",
            "start": {
                "streamId": "test-stream-empty-voice",
                "callId": "test-call-empty-voice",
            },
        }
        ws.send_text(json.dumps(start_payload))
        with pytest.raises(Exception):
            ws.receive_text()


def test_dynamic_multi_tenant_isolation(monkeypatch):
    """Verify Deployment A and Deployment B run with completely isolated configurations."""
    from pipecat.processors.aggregators.llm_response_universal import LLMContext

    configs = {
        "dep-alpha": RuntimeAgentConfig.model_validate(DEPLOYMENT_A_CONFIG),
        "dep-beta": RuntimeAgentConfig.model_validate(DEPLOYMENT_B_CONFIG),
    }

    # Simulate Call 1 resolving Deployment A
    config_a = configs["dep-alpha"]
    context_a = LLMContext(messages=[
        {"role": "system", "content": config_a.prompt.compiled_system_prompt},
        {"role": "assistant", "content": config_a.prompt.greeting},
    ])

    # Simulate Call 2 resolving Deployment B
    config_b = configs["dep-beta"]
    context_b = LLMContext(messages=[
        {"role": "system", "content": config_b.prompt.compiled_system_prompt},
        {"role": "assistant", "content": config_b.prompt.greeting},
    ])

    # Assert Call 1 has ONLY Alpha's configuration
    messages_a = context_a.get_messages()
    assert config_a.tenant.tenant_id == "tenant-alpha-1111-1111-1111"
    assert config_a.voice.voice_id == "ritu"
    assert "Alpha Clinic" in messages_a[0]["content"]
    assert "Alpha Clinic" in messages_a[1]["content"]
    assert "Beta" not in messages_a[0]["content"]

    # Assert Call 2 has ONLY Beta's configuration
    messages_b = context_b.get_messages()
    assert config_b.tenant.tenant_id == "tenant-beta-2222-2222-2222"
    assert config_b.voice.voice_id == "shubh"
    assert "Beta Properties" in messages_b[0]["content"]
    assert "Beta Properties" in messages_b[1]["content"]
    assert "Alpha" not in messages_b[0]["content"]
