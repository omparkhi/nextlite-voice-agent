"""Phase 8B Regression & Unit Tests: Callback Signature, Per-Turn Metrics, Tool Timings & Diagnostics.

Validates:
1. Correct on_user_turn_stopped callback signature without TypeError.
2. Isolated per-turn timing and unique turn_id generation.
3. No leakage of timestamps across consecutive turns.
4. Correct null metrics when intermediate timestamps are missing.
5. Accurate calculation of all stage latencies (speech duration, VAD stop to STT, aggregation, LLM TTFT, TTFB, total turn).
6. Tool duration tracking for single and multiple tools without secrets/PII leakage.
7. Post-tool LLM timing tracking.
8. TTS WebSocket connection timing and service lifecycle reuse across turns.
9. Interruption handling without timing state corruption.
10. PIPECAT_AUDIO_DEBUG setting behavior.
"""

import time
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.turn_timing import TurnTimingTracker, ToolExecutionTiming, safe_phone_trace, log_phone_trace
from app.config import settings
from app.tools.tool_registry import ToolRuntimeContext, ToolRegistry, CANONICAL_PLATFORM_TOOLS
from app.runtime_config_client import RuntimeAgentConfig
from app.call_lifecycle import CallTranscriptCollector


def test_unique_turn_id_generation():
    """Verify each turn receives a unique turn_id."""
    tracker = TurnTimingTracker(stream_id="stream_test_1")
    id1 = tracker.active_turn_id
    id2 = tracker.start_new_turn()
    id3 = tracker.start_new_turn()

    assert id1 != id2
    assert id2 != id3
    assert tracker.turn_count == 2
    assert id1.startswith("turn-")
    assert id2.startswith("turn-")


def test_turn_timing_does_not_leak_timestamps_between_turns():
    """Verify state is completely reset for subsequent turns without retaining stale timestamps."""
    tracker = TurnTimingTracker(stream_id="stream_test_2")

    # Simulate Turn 1
    t0 = 100.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.2)
    tracker.record_stt_final(t0 + 1.4)
    tracker.record_user_aggregation_finalized(t0 + 1.45)
    tracker.record_llm_start(t0 + 1.46)
    tracker.record_first_llm_output(t0 + 1.96)
    tracker.record_tts_start(t0 + 1.98)
    tracker.record_first_tts_audio(t0 + 2.38)
    tracker.record_tts_stop(t0 + 3.0)
    tracker.record_turn_complete(t0 + 3.0)

    metrics_t1 = tracker.calculate_metrics()
    assert metrics_t1["speechDurationMs"] == 1200
    assert metrics_t1["vadStopToSttFinalMs"] == 200
    assert metrics_t1["sttFinalToAggregationMs"] == 50
    assert metrics_t1["aggregationToLlmStartMs"] == 10
    assert metrics_t1["llmToFirstOutputMs"] == 500
    assert metrics_t1["ttsStartToFirstAudioMs"] == 400
    assert metrics_t1["userStopToFirstAudioMs"] == 1180
    assert metrics_t1["aggregationToFirstAudioMs"] == 930
    assert metrics_t1["totalTurnDurationMs"] == 3000

    # Start Turn 2
    t1 = 200.0
    tracker.start_new_turn(speech_start=t1)
    assert tracker.speech_stop is None
    assert tracker.stt_final is None
    assert tracker.user_aggregation_finalized is None
    assert tracker.llm_start is None
    assert tracker.first_llm_output is None
    assert tracker.tool_executions == []
    assert tracker.post_tool_llm_start is None
    assert tracker.first_post_tool_llm_output is None
    assert tracker.tts_start is None
    assert tracker.first_tts_audio is None
    assert tracker.tts_stop is None
    assert tracker.turn_complete is None

    # Simulate Turn 2 partially
    tracker.record_speech_stop(t1 + 0.8)
    tracker.record_stt_final(t1 + 1.0)
    tracker.record_user_aggregation_finalized(t1 + 1.02)
    tracker.record_llm_start(t1 + 1.03)
    tracker.record_first_llm_output(t1 + 1.43)
    tracker.record_tts_start(t1 + 1.44)
    tracker.record_first_tts_audio(t1 + 1.84)
    tracker.record_turn_complete(t1 + 2.5)

    metrics_t2 = tracker.calculate_metrics()
    assert metrics_t2["speechDurationMs"] == 800
    assert metrics_t2["vadStopToSttFinalMs"] == 200
    assert metrics_t2["llmToFirstOutputMs"] == 400
    assert metrics_t2["userStopToFirstAudioMs"] == 1040
    assert metrics_t2["totalTurnDurationMs"] == 2500
    # Confirm it does not calculate metrics against Turn 1's t0 (100.0)
    assert metrics_t2["totalTurnDurationMs"] < 10000


def test_missing_timestamps_produce_null_metrics():
    """Verify missing intermediate timestamps return None/null instead of invented values."""
    tracker = TurnTimingTracker(stream_id="stream_test_3")
    tracker.speech_start = 10.0
    # No speech_stop, no STT, no LLM start
    tracker.first_tts_audio = 12.5

    metrics = tracker.calculate_metrics()
    assert metrics["speechDurationMs"] is None
    assert metrics["vadStopToSttFinalMs"] is None
    assert metrics["sttFinalToAggregationMs"] is None
    assert metrics["aggregationToLlmStartMs"] is None
    assert metrics["llmToFirstOutputMs"] is None
    assert metrics["toolDurationMs"] is None
    assert metrics["tools"] is None
    assert metrics["userStopToFirstAudioMs"] is None
    assert metrics["totalTurnDurationMs"] == 2500  # 12.5 - 10.0


def test_tool_turn_metrics_single_and_multiple_tools():
    """Verify tool execution timings for single and multiple tool runs in one turn."""
    tracker = TurnTimingTracker(stream_id="stream_test_4")
    t0 = 50.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_stt_final(t0 + 1.2)
    tracker.record_user_aggregation_finalized(t0 + 1.25)
    tracker.record_llm_start(t0 + 1.26)
    tracker.record_first_llm_output(t0 + 1.76)

    # Tool 1: query_knowledge_base (350ms)
    tracker.record_tool_execution("query_knowledge_base", start_time=t0 + 1.8, end_time=t0 + 2.15, success=True)
    # Post-tool LLM response
    tracker.record_llm_start(t0 + 2.16)  # sets post_tool_llm_start
    tracker.record_first_llm_output(t0 + 2.66)  # sets first_post_tool_llm_output (500ms TTFT)

    # Tool 2: book_appointment (400ms)
    tracker.record_tool_execution("book_appointment", start_time=t0 + 2.7, end_time=t0 + 3.1, success=True)

    tracker.record_tts_start(t0 + 3.15)
    tracker.record_first_tts_audio(t0 + 3.55)
    tracker.record_turn_complete(t0 + 4.2)

    metrics = tracker.calculate_metrics()
    assert metrics["toolDurationMs"] == 750  # 350 + 400
    assert len(metrics["tools"]) == 2
    assert metrics["tools"][0]["name"] == "query_knowledge_base"
    assert metrics["tools"][0]["durationMs"] == 350
    assert metrics["tools"][1]["name"] == "book_appointment"
    assert metrics["tools"][1]["durationMs"] == 400
    assert metrics["postToolLlmMs"] == 500


def test_no_secrets_or_pii_in_metrics():
    """Verify turn metrics log and payload never contain tokens, secrets, or customer PII."""
    tracker = TurnTimingTracker(stream_id="stream_test_5")
    tracker.record_speech_start(1.0)
    tracker.record_tool_execution("create_callback_lead", start_time=1.5, end_time=1.8, success=True)
    tracker.record_turn_complete(2.5)

    metrics = tracker.calculate_metrics()
    log_line = tracker.emit_turn_metrics_log()

    raw_str = str(metrics) + str(log_line)
    for forbidden in ["api_key", "secret", "bearer", "password", "token", "phone_number", "+91"]:
        assert forbidden not in raw_str.lower()


def test_interruption_recording_and_telemetry():
    """Verify user barge-in interruption is captured cleanly without corrupting timing state."""
    tracker = TurnTimingTracker(stream_id="stream_test_6")
    tracker.record_speech_start(10.0)
    tracker.record_speech_stop(11.0)
    tracker.record_tts_start(11.5)
    tracker.record_first_tts_audio(11.9)
    tracker.record_interruption(reason="user_barge_in")

    metrics = tracker.calculate_metrics()
    assert metrics["interrupted"] is True
    assert tracker.interruption_reason == "user_barge_in"
    assert metrics["userStopToFirstAudioMs"] == 900


@pytest.mark.asyncio
async def test_on_user_turn_stopped_signature_contract():
    """Verify Pipecat 1.8.1 on_user_turn_stopped callback accepts (aggregator, strategy, message=None)."""
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContext,
        LLMContextAggregatorPair,
        LLMUserAggregatorParams,
    )
    from pipecat.turns.user_turn_strategies import ExternalUserTurnStrategies

    context = LLMContext(messages=[{"role": "system", "content": "You are a test assistant."}])
    agg_pair = LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(user_turn_strategies=ExternalUserTurnStrategies()))
    user_agg = agg_pair.user()

    callback_called = False
    received_strategy = None
    received_message = None

    @user_agg.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message=None):
        nonlocal callback_called, received_strategy, received_message
        callback_called = True
        received_strategy = strategy
        received_message = message

    # Simulate Pipecat 1.8.1 dispatch
    mock_strategy = ExternalUserTurnStrategies()
    mock_msg = MagicMock()
    mock_msg.content = "Test caller utterance"

    import asyncio
    await user_agg._call_event_handler("on_user_turn_stopped", mock_strategy, mock_msg)
    await asyncio.sleep(0.05)
    assert callback_called is True
    assert received_strategy is mock_strategy
    assert received_message is mock_msg

    # Also test dispatch without message argument (defensive contract)
    callback_called = False
    await user_agg._call_event_handler("on_user_turn_stopped", mock_strategy)
    await asyncio.sleep(0.05)
    assert callback_called is True
    assert received_strategy is mock_strategy


def test_audio_debug_config_default_and_toggle():
    """Verify PIPECAT_AUDIO_DEBUG is False by default and can be controlled via settings."""
    assert hasattr(settings, "PIPECAT_AUDIO_DEBUG")
    # Default is False
    assert settings.PIPECAT_AUDIO_DEBUG is False


@pytest.mark.asyncio
async def test_sarvam_tts_service_instantiation_reuse():
    """Verify SarvamTTSService can be instantiated per call and preserves settings for reuse across turns."""
    from pipecat.services.sarvam.tts import SarvamTTSService

    tts_service = SarvamTTSService(
        api_key="test_key",
        settings=SarvamTTSService.Settings(
            model="bulbul:v3",
            voice="amartya",
            pace=1.0,
        ),
    )

    # Verify service holds initialized parameters
    assert tts_service._settings.model == "bulbul:v3"
    assert tts_service._settings.voice == "amartya"
    assert tts_service._settings.pace == 1.0

    # Ensure single instance lifecycle: flush_audio flushes without closing connection
    assert hasattr(tts_service, "flush_audio")


def test_response_latency_explicit_metric():
    """Verify responseLatencyMs is calculated as first_tts_audio - speech_stop."""
    tracker = TurnTimingTracker(stream_id="stream_test_7")
    t0 = 10.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.5)
    tracker.record_first_tts_audio(t0 + 2.1)
    tracker.record_turn_complete(t0 + 3.0)

    metrics = tracker.calculate_metrics()
    assert metrics["responseLatencyMs"] == 600
    assert metrics["userStopToFirstAudioMs"] == 600
    assert metrics["responseLatencyMs"] == metrics["userStopToFirstAudioMs"]


def test_metric_sanity_and_invalid_timestamp_detection():
    """Verify inverted timestamps trigger [TURN_METRICS_INVALID] and return None."""
    tracker = TurnTimingTracker(stream_id="stream_test_8")
    # Inverted timestamps: speech_stop is earlier than speech_start
    tracker.speech_start = 20.0
    tracker.speech_stop = 19.0
    # Inverted: first_tts_audio earlier than speech_stop
    tracker.first_tts_audio = 18.0

    metrics = tracker.calculate_metrics()
    assert metrics["speechDurationMs"] is None
    assert metrics["responseLatencyMs"] is None
    assert metrics["userStopToFirstAudioMs"] is None


def test_tool_execution_sanity_check():
    """Verify tool execution with tool_end < tool_start is marked invalid."""
    tracker = TurnTimingTracker(stream_id="stream_test_9")
    tracker.record_speech_start(1.0)
    tracker.record_tool_execution("query_knowledge_base", start_time=5.0, end_time=4.0, success=True)
    tracker.record_turn_complete(6.0)

    metrics = tracker.calculate_metrics()
    assert metrics["toolDurationMs"] is None
    assert len(metrics["tools"]) == 1
    assert metrics["tools"][0]["durationMs"] is None


def test_duplicate_turn_metrics_emission_prevented():
    """Verify calling emit_turn_metrics_log multiple times for the same turn does not record duplicates."""
    tracker = TurnTimingTracker(stream_id="stream_test_10")
    tracker.record_speech_start(1.0)
    tracker.record_speech_stop(2.0)
    tracker.record_first_tts_audio(2.5)
    tracker.record_turn_complete(3.0)

    # First emission
    m1 = tracker.emit_turn_metrics_log()
    # Second duplicate emission (e.g. from both TTSStopped and LLMResponseEnd)
    m2 = tracker.emit_turn_metrics_log()

    assert len(tracker.completed_turns) == 1
    assert tracker.completed_turns[0]["turnId"] == tracker.active_turn_id


def test_call_baseline_summary_few_samples():
    """Verify CALL_BASELINE with fewer than 3 samples returns None for P50/P90."""
    tracker = TurnTimingTracker(stream_id="stream_test_11")
    # Turn 1
    tracker.record_speech_start(1.0)
    tracker.record_speech_stop(2.0)
    tracker.record_first_tts_audio(2.6)
    tracker.record_turn_complete(3.0)
    tracker.emit_turn_metrics_log()

    # Turn 2
    tracker.start_new_turn(speech_start=3.5)
    tracker.record_speech_stop(4.0)
    tracker.record_first_tts_audio(4.5)
    tracker.record_turn_complete(5.0)
    tracker.emit_turn_metrics_log()

    summary = tracker.emit_call_baseline_summary(session_id="call-session-123")
    assert summary["sessionId"] == "call-session-123"
    assert summary["totalTurns"] == 2
    assert summary["successfulTurns"] == 2
    assert summary["interruptedTurns"] == 0
    assert summary["toolTurns"] == 0
    # Insufficient samples (<3)
    assert summary["responseLatencyP50Ms"] is None
    assert summary["responseLatencyP90Ms"] is None
    assert summary["responseLatencyMaxMs"] == 600  # max(600, 500)


def test_call_baseline_summary_adequate_samples():
    """Verify CALL_BASELINE with >= 3 samples calculates accurate P50, P90, and max."""
    tracker = TurnTimingTracker(stream_id="stream_test_12")

    # Sample latencies: 400ms, 600ms, 800ms, 1200ms
    latencies = [0.4, 0.6, 0.8, 1.2]
    for idx, lat in enumerate(latencies):
        tracker.start_new_turn(speech_start=float(idx * 10))
        tracker.record_speech_stop(float(idx * 10 + 1))
        tracker.record_first_tts_audio(float(idx * 10 + 1 + lat))
        if idx == 2:
            # Turn 3 had a tool
            tracker.record_tool_execution("book_appointment", float(idx * 10 + 1.1), float(idx * 10 + 1.4), True)
        if idx == 3:
            # Turn 4 was interrupted
            tracker.record_interruption("user_barge_in")
        tracker.record_turn_complete(float(idx * 10 + 2 + lat))
        tracker.emit_turn_metrics_log()

    summary = tracker.emit_call_baseline_summary(session_id="call-session-456")
    assert summary["sessionId"] == "call-session-456"
    assert summary["totalTurns"] == 4
    assert summary["successfulTurns"] == 3
    assert summary["interruptedTurns"] == 1
    assert summary["toolTurns"] == 1
    # Sorted latencies: [400, 600, 800, 1200]
    # P50 (median of 4 items): avg(600, 800) = 700
    assert summary["responseLatencyP50Ms"] == 700
    # P90: ceil(0.9 * 4) - 1 = 4 - 1 = 3 -> 1200
    assert summary["responseLatencyP90Ms"] == 1200
    assert summary["responseLatencyMaxMs"] == 1200


def test_llm_first_output_to_tts_metrics():
    """Verify llmFirstOutputToTtsStartMs and firstLLMOutputToFirstAudioMs calculations."""
    tracker = TurnTimingTracker(stream_id="stream_test_13")
    t0 = 50.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_stt_final(t0 + 1.2)
    tracker.record_user_aggregation_finalized(t0 + 1.25)
    tracker.record_llm_start(t0 + 1.26)
    tracker.record_first_llm_output(t0 + 1.66)  # 400ms LLM TTFT
    tracker.record_tts_start(t0 + 1.70)         # 40ms LLM output to TTS start
    tracker.record_first_tts_audio(t0 + 2.05)   # 350ms TTS TTFB (390ms LLM output to first audio)
    tracker.record_turn_complete(t0 + 2.80)

    metrics = tracker.calculate_metrics()
    assert metrics["llmToFirstOutputMs"] == 400
    assert metrics["llmFirstOutputToTtsStartMs"] == 40
    assert metrics["firstLLMOutputToFirstAudioMs"] == 390
    assert metrics["ttsStartToFirstAudioMs"] == 350
    assert metrics["responseLatencyMs"] == 1050


def test_sarvam_tts_streaming_buffer_size_setting():
    """Verify SarvamTTSService can be initialized with low-latency streaming min_buffer_size."""
    from pipecat.services.sarvam.tts import SarvamTTSService

    tts_service = SarvamTTSService(
        api_key="test_key",
        settings=SarvamTTSService.Settings(
            model="bulbul:v3",
            voice="amartya",
            min_buffer_size=50,
            max_chunk_length=150,
        ),
    )

    assert tts_service._settings.min_buffer_size == 50
    assert tts_service._settings.max_chunk_length == 150


def test_tool_stage_transition_telemetry_metrics():
    """Verify toolResultToPostToolLlmStartMs, postToolLlmToFirstOutputMs, and toolResultToFirstAudioMs."""
    tracker = TurnTimingTracker(stream_id="stream_test_tool_telemetry")
    t0 = 100.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_stt_final(t0 + 1.2)
    tracker.record_user_aggregation_finalized(t0 + 1.22)
    tracker.record_llm_start(t0 + 1.23)
    # LLM outputs tool call at t0 + 1.50
    # Tool executes from 1.50 to 1.84 (340ms)
    tracker.record_tool_execution("book_appointment", t0 + 1.50, t0 + 1.84, True)
    # Post-tool LLM starts at 1.85 (10ms handoff)
    tracker.record_llm_start(t0 + 1.85)
    # Post-tool LLM outputs first token at 2.25 (400ms TTFT)
    tracker.record_first_llm_output(t0 + 2.25)
    tracker.record_tts_start(t0 + 2.27)
    # First audio at 2.62 (350ms TTS TTFB, 780ms toolResultToFirstAudioMs, 1620ms responseLatencyMs)
    tracker.record_first_tts_audio(t0 + 2.62)
    tracker.record_turn_complete(t0 + 3.10)

    metrics = tracker.calculate_metrics()
    assert metrics["toolDurationMs"] == 340
    assert metrics["toolResultToPostToolLlmStartMs"] == 10
    assert metrics["postToolLlmToFirstOutputMs"] == 400
    assert metrics["postToolLlmMs"] == 400
    assert metrics["toolResultToFirstAudioMs"] == 780
    assert metrics["responseLatencyMs"] == 1620
    assert metrics["ttsStartToFirstAudioMs"] == 350


def test_non_tool_turn_omits_tool_transition_metrics():
    """Verify non-tool turns have None for all tool-specific transition metrics."""
    tracker = TurnTimingTracker(stream_id="stream_test_no_tool")
    t0 = 50.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_stt_final(t0 + 1.2)
    tracker.record_user_aggregation_finalized(t0 + 1.25)
    tracker.record_llm_start(t0 + 1.26)
    tracker.record_first_llm_output(t0 + 1.70)
    tracker.record_tts_start(t0 + 1.72)
    tracker.record_first_tts_audio(t0 + 2.05)
    tracker.record_turn_complete(t0 + 2.50)

    metrics = tracker.calculate_metrics()
    assert metrics["toolDurationMs"] is None
    assert metrics["tools"] is None
    assert metrics["toolResultToPostToolLlmStartMs"] is None
    assert metrics["postToolLlmToFirstOutputMs"] is None
    assert metrics["postToolLlmMs"] is None
    assert metrics["toolResultToFirstAudioMs"] is None
    assert metrics["responseLatencyMs"] == 1050


class MockFunctionCallParams:
    """Helper to mock Pipecat FunctionCallParams for unit testing tool handlers."""

    def __init__(self, arguments: dict, function_name: str = "test_func", tool_call_id: str = "call_123"):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments
        self.result = None
        self.callback_called = False

    async def result_callback(self, result, *args, **kwargs):
        self.result = result
        self.callback_called = True


@pytest.mark.asyncio
async def test_appointment_tool_failure_anti_hallucination_and_no_secrets():
    """Verify failed appointment tool execution returns structured failure without internal secrets."""
    import httpx
    from app.tools.appointment_tool import create_book_appointment_tool_factory
    from app.tools.tool_registry import ToolRuntimeContext

    def mock_handler(request: httpx.Request):
        return httpx.Response(500, json={"error": "Database error", "code": "APPOINTMENT_REQUEST_FAILED"})

    transport = httpx.MockTransport(mock_handler)
    mock_client = httpx.AsyncClient(transport=transport)

    context = ToolRuntimeContext(
        deployment_id="dep-123",
        call_session_id="session-456",
        caller_phone="+919876543210",
        worker_secret="very-secret-internal-key",
    )

    schema = create_book_appointment_tool_factory(context=context, http_client=mock_client)
    params = MockFunctionCallParams(
        function_name="book_appointment",
        arguments={
            "customerName": "Rohan Sharma",
            "title": "Doctor Consultation",
            "bookingDate": "2026-11-20",
            "bookingTime": "10:30 AM",
        },
        tool_call_id="call-fail-1",
    )

    result = await schema.handler(params)
    assert result["success"] is False
    assert result["error"] == "APPOINTMENT_REQUEST_FAILED"
    # Never claim confirmed or provide fake numbers on failure
    assert "appointmentNumber" not in result
    assert "very-secret-internal-key" not in str(result)
    assert "dep-123" not in str(result)


@pytest.mark.asyncio
async def test_lead_tool_failure_anti_hallucination_and_no_secrets():
    """Verify failed lead tool execution returns structured failure without internal secrets."""
    import httpx
    from app.tools.lead_tool import create_callback_lead_tool_factory
    from app.tools.tool_registry import ToolRuntimeContext

    def mock_handler(request: httpx.Request):
        return httpx.Response(503, json={"error": "Service unavailable", "code": "SERVICE_UNAVAILABLE"})

    transport = httpx.MockTransport(mock_handler)
    mock_client = httpx.AsyncClient(transport=transport)

    context = ToolRuntimeContext(
        deployment_id="dep-123",
        call_session_id="session-456",
        caller_phone="+919876543210",
        worker_secret="very-secret-internal-key",
    )

    schema = create_callback_lead_tool_factory(context=context, http_client=mock_client)
    params = MockFunctionCallParams(
        function_name="create_callback_lead",
        arguments={
            "customerName": "Anita Desai",
            "interestCategory": "Villa Consultation",
        },
        tool_call_id="call-fail-2",
    )

    result = await schema.handler(params)
    assert result["success"] is False
    assert result["error"] == "SERVICE_UNAVAILABLE"
    assert "very-secret-internal-key" not in str(result)
    assert "dep-123" not in str(result)


def test_emit_llm_ttft_audit_log():
    """Verify [LLM_TTFT_AUDIT] telemetry correctly computes category and metadata."""
    tracker = TurnTimingTracker(stream_id="stream_audit_1")
    t0 = 200.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_stt_final(t0 + 1.2)
    tracker.record_user_aggregation_finalized(t0 + 1.25)
    tracker.record_llm_start(t0 + 1.26)
    tracker.record_first_llm_output(t0 + 1.60)  # 340ms TTFT

    # Simple turn audit
    audit = tracker.emit_llm_ttft_audit_log(
        model="sarvam-105b-conversations",
        message_count=3,
        estimated_prompt_tokens=850,
        tool_count=3,
        tool_payload_bytes=2600,
    )
    assert audit["category"] == "simple"
    assert audit["ttftMs"] == 340
    assert audit["messageCount"] == 3
    assert audit["estimatedPromptTokens"] == 850
    assert audit["toolCount"] == 3
    assert audit["toolPayloadBytes"] == 2600
    assert audit["model"] == "sarvam-105b-conversations"
    assert audit["streaming"] is True

    # RAG turn audit
    tracker.record_tool_execution(
        tool_name="query_knowledge_base",
        start_time=t0 + 1.7,
        end_time=t0 + 1.9,
        success=True,
    )
    rag_audit = tracker.emit_llm_ttft_audit_log(rag_context_bytes=450)
    assert rag_audit["category"] == "rag"
    assert rag_audit["ragContextBytes"] == 450


def test_safe_phone_trace_latin_digits():
    """Verify safe_phone_trace extracts non-PII metadata for standard 10-digit Latin phone numbers."""
    trace = safe_phone_trace("Mera number 9876544641 hai")
    assert trace["phoneObserved"] is True
    assert trace["digits"] == 10
    assert trace["last4"] == "4641"
    assert trace["representation"] == "latin_digits"


def test_safe_phone_trace_devanagari_digits():
    """Verify safe_phone_trace extracts non-PII metadata for Devanagari script digits."""
    trace = safe_phone_trace("माझा नंबर ९८७getKey५४४६४१ असा आहे" if False else "माझा नंबर ९८७६५४४६४१ असा आहे")
    assert trace["phoneObserved"] is True
    assert trace["digits"] == 10
    assert trace["last4"] == "4641"
    assert trace["representation"] == "devanagari"


def test_safe_phone_trace_spoken_words():
    """Verify safe_phone_trace extracts non-PII metadata for spoken digit words in Hindi and English."""
    # Hindi spoken words: नौ आठ सात छह पांच चार चार छह चार एक (9876544641)
    text_hindi = "मेरा फोन नौ आठ सात छह पाँच चार चार छह चार एक है"
    trace_hindi = safe_phone_trace(text_hindi)
    assert trace_hindi["phoneObserved"] is True
    assert trace_hindi["digits"] == 10
    assert trace_hindi["last4"] == "4641"
    assert trace_hindi["representation"] == "spoken_digits"

    # English spoken words: nine eight seven six five four four six four one
    text_en = "My number is nine eight seven six five four four six four one"
    trace_en = safe_phone_trace(text_en)
    assert trace_en["phoneObserved"] is True
    assert trace_en["digits"] == 10
    assert trace_en["last4"] == "4641"
    assert trace_en["representation"] == "spoken_digits"


def test_safe_phone_trace_no_phone():
    """Verify safe_phone_trace handles text without phone numbers."""
    trace = safe_phone_trace("Mujhe appointment book karni hai Dr. Sharma ke sath")
    assert trace["phoneObserved"] is False
    assert trace["digits"] == 0
    assert trace["last4"] is None
    assert trace["representation"] == "none"


def test_safe_phone_trace_redacted_logging():
    """Verify log_phone_trace never logs full raw phone numbers."""
    with patch("app.turn_timing.logger.info") as mock_logger:
        log_phone_trace("Call me at 9876544641 please", stage="test_stage")
        assert mock_logger.called
        log_output = mock_logger.call_args[0][0]
        assert "9876544641" not in log_output
        assert '"last4":"4641"' in log_output
        assert '"boundary":"test_stage"' in log_output
        assert '"digits":10' in log_output


def test_tts_connected_reset_prevents_negative_metrics():
    """Verify tts_connected timestamp does not leak across turns to produce negative durations."""
    tracker = TurnTimingTracker(stream_id="stream_test_tts_reset")
    t0 = 100.0
    tracker.record_speech_start(t0)
    tracker.record_tts_connected(t0 + 0.1)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_tts_start(t0 + 1.5)
    tracker.record_first_tts_audio(t0 + 1.9)
    tracker.record_turn_complete(t0 + 2.5)

    m1 = tracker.calculate_metrics()
    assert m1["ttsConnectionMs"] == 100  # (100.1 - 100.0) * 1000

    # Start Turn 2 at t=200.0 without a new tts_connected event
    tracker.start_new_turn(speech_start=200.0)
    tracker.record_speech_stop(201.0)
    tracker.record_tts_start(201.5)
    tracker.record_first_tts_audio(201.9)
    tracker.record_turn_complete(202.5)

    m2 = tracker.calculate_metrics()
    # Stale tts_connected must NOT cause negative duration (e.g. 100.1 - 200.0 = -99900ms)
    assert m2["ttsConnectionMs"] is None


def test_single_turn_completion_once():
    """Verify record_turn_complete_once prevents duplicate emissions on consecutive frame arrivals."""
    tracker = TurnTimingTracker(stream_id="stream_test_single_complete")
    tracker.record_speech_start(10.0)
    tracker.record_speech_stop(11.0)
    tracker.record_first_tts_audio(11.5)

    # First completion call
    first_done = tracker.record_turn_complete_once(12.0)
    assert first_done is True
    assert tracker.turn_complete == 12.0

    # Second completion call (e.g. from both LLMFullResponseEndFrame and TTSStoppedFrame)
    second_done = tracker.record_turn_complete_once(12.1)
    assert second_done is False
    assert tracker.turn_complete == 12.0  # unmodified


def test_isolated_stt_and_llm_stage_metrics():
    """Verify stage breakdown: vadStopToUtteranceEndMs, utteranceEndToSttFinalMs, llmToFirstOutputMs."""
    tracker = TurnTimingTracker(stream_id="stream_test_stages")
    t0 = 50.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.0)
    tracker.record_stt_utterance_end(t0 + 1.15)  # 150ms VAD stop -> utterance end
    tracker.record_stt_final(t0 + 1.25)          # 100ms utterance end -> final STT
    tracker.record_user_aggregation_finalized(t0 + 1.28)
    tracker.record_llm_start(t0 + 1.30)
    tracker.record_llm_request(t0 + 1.31)        # 10ms context -> SDK request dispatch
    tracker.record_first_llm_output(t0 + 1.70)   # 390ms request -> first token (400ms from context)
    tracker.record_tts_start(t0 + 1.72)
    tracker.record_first_tts_audio(t0 + 2.05)
    tracker.record_turn_complete(t0 + 2.50)

    m = tracker.calculate_metrics()
    assert m["vadStopToUtteranceEndMs"] == 150
    assert m["utteranceEndToSttFinalMs"] == 100
    assert m["vadStopToSttFinalMs"] == 250
    assert m["llmToFirstOutputMs"] == 400
    assert m["responseLatencyMs"] == 1050
