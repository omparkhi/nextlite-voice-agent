#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Unit Tests for Sarvam LLM Reasoning Configuration & Latency Path.
#

import pytest
from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.adapters.schemas.function_schema import FunctionSchema
from app.turn_timing import TurnTimingTracker


def test_sarvam_llm_settings_reasoning_effort_none():
    """Verify SarvamLLMSettings instantiates cleanly with reasoning_effort=None for sarvam-105b-conversations."""
    settings = SarvamLLMSettings(
        model="sarvam-105b-conversations",
        reasoning_effort=None,
    )
    assert settings.model == "sarvam-105b-conversations"
    assert settings.reasoning_effort is None

    svc = SarvamLLMService(api_key="test-api-key", settings=settings)
    assert svc._settings.model == "sarvam-105b-conversations"
    assert svc._settings.reasoning_effort is None


def test_sarvam_llm_build_params_omits_reasoning_effort_for_conversations_model():
    """Verify that build_chat_completion_params produces valid OpenAI-compatible parameters with streaming enabled and reasoning_effort omitted."""
    settings = SarvamLLMSettings(
        model="sarvam-105b-conversations",
        reasoning_effort=None,
    )
    svc = SarvamLLMService(api_key="test-api-key", settings=settings)
    context = LLMContext(messages=[{"role": "user", "content": "Hello"}])

    invocation_params = svc._invocation_params(context)
    params = svc.build_chat_completion_params(invocation_params)

    assert params["model"] == "sarvam-105b-conversations"
    assert params["stream"] is True
    assert "reasoning_effort" not in params
    assert "messages" in params
    assert params["messages"] == [{"role": "user", "content": "Hello"}]


def test_sarvam_llm_preserves_tools_with_reasoning_effort_none():
    """Verify that tools/function schemas are preserved in chat completion params."""
    func = FunctionSchema(
        name="check_availability",
        description="Check doctor appointment slots",
        properties={"date": {"type": "string"}},
        required=["date"],
    )
    settings = SarvamLLMSettings(
        model="sarvam-105b-conversations",
        reasoning_effort=None,
    )
    svc = SarvamLLMService(api_key="test-api-key", settings=settings)
    context = LLMContext(
        messages=[{"role": "user", "content": "Can I see the doctor tomorrow?"}],
        tools=[func],
    )

    invocation_params = svc._invocation_params(context)
    params = svc.build_chat_completion_params(invocation_params)

    assert params["model"] == "sarvam-105b-conversations"
    assert params["stream"] is True
    assert "tools" in params
    assert len(params["tools"]) == 1
    assert params["tools"][0]["function"]["name"] == "check_availability"
    assert "reasoning_effort" not in params


def test_sarvam_llm_latency_metric_calculations():
    """Verify high-resolution monotonic latency metrics for LLM request lifecycle."""
    tracker = TurnTimingTracker(stream_id="test-llm-perf-stream")
    tracker.turn_type = "user_turn"

    t0 = 100.0
    tracker.record_speech_stop(t0)
    t_stt = t0 + 0.360
    tracker.record_stt_final(t_stt, "hello")
    t_agg = t_stt + 0.003
    tracker.record_user_aggregation_finalized(t_agg)

    t_llm_req = t_agg + 0.002
    tracker.record_llm_request(t_llm_req)                      # 100.365

    t_provider = t_llm_req + 0.450
    tracker.record_llm_first_provider_response(t_provider)     # 100.815 (+450ms)

    t_first_text = t_provider + 0.060
    tracker.record_first_llm_output(t_first_text)              # 100.875 (+60ms)

    t_release = t_first_text + 0.120
    tracker.record_text_released_to_tts(t_release)             # 100.995 (+120ms)

    t_tts_start = t_release + 0.005
    tracker.record_tts_start(t_tts_start)                      # 101.000 (+5ms)

    t_tts_audio = t_tts_start + 0.390
    tracker.record_first_tts_audio(t_tts_audio)                # 101.390 (+390ms)

    metrics = tracker.calculate_metrics()

    assert metrics["llmHttpRequestMs"] == 450
    assert metrics["providerToFirstOutputMs"] == 60
    assert metrics["llmProviderToFirstOutputMs"] == 60
    assert metrics["llmToFirstOutputMs"] == 510
    assert metrics["llmFirstTextToReleaseMs"] == 120
    assert metrics["llmFirstOutputToTtsStartMs"] == 125
    assert metrics["ttsStartToFirstAudioMs"] == 390
    assert metrics["userStopToFirstAudioMs"] == 1390
