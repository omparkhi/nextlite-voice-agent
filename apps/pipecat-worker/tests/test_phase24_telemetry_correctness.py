"""Phase 24: Telemetry Correctness Tests for Pipecat 1.8.1 Migration.

Verifies:
1. UserBotLatencyObserver callback signatures match Pipecat 1.8.1 BaseObserver contract.
2. first_audio_sent_to_plivo is latched once per call startup / once per turn, never duplicated across 20ms frames.
3. Negative metric prevention: llmContextToRequestMs and tool turn timestamps never yield negative latency.
4. Turn counting and baseline consistency.
5. Telemetry cleanup and disconnect safety.
"""

import asyncio
import time
import pytest

from pipecat.observers.user_bot_latency_observer import (
    UserBotLatencyObserver,
    LatencyBreakdown,
    TTFBBreakdownMetrics,
    TextAggregationBreakdownMetrics,
)
from pipecat.frames.frames import (
    AudioRawFrame,
)

from app.turn_timing import StartupTimingTracker, TurnTimingTracker
from app.main import DiagnosticPlivoFrameSerializer


# ============================================================================
# 1. UserBotLatencyObserver Callback Signatures
# ============================================================================

@pytest.mark.asyncio
async def test_user_bot_latency_observer_callbacks():
    """Verify observer callbacks accept (observer, *args) according to Pipecat 1.8.1 BaseObserver API."""
    observer = UserBotLatencyObserver()

    latency_measured_calls = []
    latency_breakdown_calls = []
    first_bot_speech_calls = []

    @observer.event_handler("on_latency_measured")
    async def on_pipecat_latency_measured(obs, latency: float):
        latency_measured_calls.append((obs, latency))

    @observer.event_handler("on_latency_breakdown")
    async def on_pipecat_latency_breakdown(obs, breakdown):
        latency_breakdown_calls.append((obs, breakdown))

    @observer.event_handler("on_first_bot_speech_latency")
    async def on_pipecat_first_bot_speech_latency(obs, latency: float):
        first_bot_speech_calls.append((obs, latency))

    # Trigger events through Pipecat's internal handler dispatcher
    await observer._call_event_handler("on_latency_measured", 0.456)
    await asyncio.sleep(0.01)
    assert len(latency_measured_calls) == 1
    assert latency_measured_calls[0][0] is observer
    assert latency_measured_calls[0][1] == 0.456

    breakdown_obj = LatencyBreakdown(
        ttfb=[TTFBBreakdownMetrics(processor="LLM", model="sarvam", start_time=1.0, duration_secs=0.25)],
        text_aggregation=TextAggregationBreakdownMetrics(processor="agg", start_time=1.25, duration_secs=0.05),
        user_turn_start_time=1.0,
        user_turn_secs=0.3,
        function_calls=[],
    )
    await observer._call_event_handler("on_latency_breakdown", breakdown_obj)
    await asyncio.sleep(0.01)
    assert len(latency_breakdown_calls) == 1
    assert latency_breakdown_calls[0][0] is observer
    assert latency_breakdown_calls[0][1] == breakdown_obj

    await observer._call_event_handler("on_first_bot_speech_latency", 1.234)
    await asyncio.sleep(0.01)
    assert len(first_bot_speech_calls) == 1
    assert first_bot_speech_calls[0][0] is observer
    assert first_bot_speech_calls[0][1] == 1.234


# ============================================================================
# 2. first_audio_sent_to_plivo Duplication Protection
# ============================================================================

def test_startup_timing_tracker_first_audio_latching():
    """Verify StartupTimingTracker records first_audio_sent_to_plivo exactly once."""
    tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)

    # 100 consecutive 20ms audio frames
    for i in range(100):
        tracker.record_stage("first_audio_sent_to_plivo", ts=101.0 + (i * 0.02))

    assert tracker.first_audio_sent_to_plivo == 101.0
    # Exactly one first_audio_sent_to_plivo event should exist in tracker.events
    first_audio_events = [e for e in tracker.events if e["event"] == "first_audio_sent_to_plivo"]
    assert len(first_audio_events) == 1


@pytest.mark.asyncio
async def test_diagnostic_plivo_serializer_first_audio_latch():
    """Verify DiagnosticPlivoFrameSerializer records first audio once to startup tracker."""
    startup_tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)
    turn_tracker = TurnTimingTracker(stream_id="test_stream", session_start_monotonic=100.0)
    serializer = DiagnosticPlivoFrameSerializer(
        stream_id="test_stream",
        params=DiagnosticPlivoFrameSerializer.InputParams(auto_hang_up=False),
        startup_tracker=startup_tracker,
        turn_tracker=turn_tracker,
    )

    audio_frame = AudioRawFrame(audio=b"\x00" * 320, sample_rate=8000, num_channels=1)

    for _ in range(50):
        await serializer.serialize(audio_frame)

    assert startup_tracker.first_audio_sent_to_plivo is not None
    audio_events = [e for e in startup_tracker.events if e["event"] == "first_audio_sent_to_plivo"]
    assert len(audio_events) == 1


def test_turn_timing_tracker_per_turn_first_audio_latch():
    """Verify TurnTimingTracker records first_audio_sent_to_plivo once per turn and resets for new turn."""
    tracker = TurnTimingTracker(stream_id="test_stream", session_start_monotonic=100.0)
    tracker.start_new_turn(speech_start=101.0)

    for i in range(20):
        tracker.record_audio_sent_to_plivo(102.0 + (i * 0.02))

    assert tracker.first_audio_sent_to_plivo == 102.0
    events_turn1 = [e for e in tracker.active_turn_events if e["event"] == "first_audio_sent_to_plivo"]
    assert len(events_turn1) == 1

    # Start new turn
    tracker.record_turn_complete(103.0)
    tracker.emit_turn_metrics_log()
    tracker.start_new_turn(speech_start=104.0)

    for i in range(20):
        tracker.record_audio_sent_to_plivo(105.0 + (i * 0.02))

    assert tracker.first_audio_sent_to_plivo == 105.0
    events_turn2 = [e for e in tracker.active_turn_events if e["event"] == "first_audio_sent_to_plivo"]
    assert len(events_turn2) == 1


# ============================================================================
# 3. Negative Metric Protection Across Tool Turns
# ============================================================================

def test_tool_turn_timing_no_negative_llm_context_duration():
    """Verify tool turn does not corrupt pre-tool llm_context_frame or cause negative llmContextToRequestMs."""
    tracker = TurnTimingTracker(stream_id="test_stream", session_start_monotonic=100.0)
    tracker.start_new_turn(speech_start=100.0)
    tracker.record_speech_stop(101.0)
    tracker.record_stt_utterance_end(101.2)
    tracker.record_stt_final(101.4, transcript="Book appointment for tomorrow")
    tracker.record_user_aggregation_finalized(101.5)

    # Initial pre-tool LLM context & request
    tracker.record_llm_context_frame(101.55)
    tracker.record_llm_request(101.57)
    tracker.record_llm_first_provider_response(102.2)
    tracker.record_first_llm_output(102.4)
    tracker.record_tool_call_delta(102.45)
    tracker.record_tool_call_complete(102.8)

    # Tool execution
    tracker.record_tool_execution(
        tool_name="book_appointment",
        start_time=102.9,
        end_time=104.5,
        success=True,
    )

    # Post-tool LLM context & request
    tracker.record_llm_context_frame(104.6)
    tracker.record_llm_request(104.65)
    tracker.record_llm_first_provider_response(105.1)
    tracker.record_first_llm_output(105.3)

    # TTS
    tracker.record_tts_start(105.35)
    tracker.record_first_tts_audio(105.7)
    tracker.record_audio_sent_to_plivo(105.72)
    tracker.record_tts_stop(107.0)
    tracker.record_turn_complete(107.05)

    metrics = tracker.calculate_metrics()

    # Pre-tool context to request must be valid and non-negative
    assert metrics["llmContextToRequestMs"] is not None
    assert metrics["llmContextToRequestMs"] >= 0
    assert metrics["llmContextToRequestMs"] == 20  # 101.57 - 101.55 = 0.02s

    # Tool duration & post-tool latencies
    assert metrics["toolDurationMs"] == 1600
    assert metrics["toolResultToPostToolLlmStartMs"] == 150  # 104.65 - 104.5 = 0.15s
    assert metrics["postToolLlmToFirstOutputMs"] == 650  # 105.3 - 104.65 = 0.65s
    assert metrics["responseLatencyMs"] == 4700  # 105.7 - 101.0 = 4.7s

    # No metric in calculated metrics should be negative
    for k, v in metrics.items():
        if isinstance(v, (int, float)):
            assert v >= 0, f"Metric {k} has negative value {v}"


# ============================================================================
# 4. Turn Counting and Baseline Consistency
# ============================================================================

def test_turn_accounting_consistency():
    """Verify call baseline turn counts accurately match completed turns without phantoms."""
    tracker = TurnTimingTracker(stream_id="test_stream", session_start_monotonic=100.0)

    # Simulate 3 turns (2 normal, 1 tool turn)
    for i in range(3):
        t_base = 100.0 + (i * 10.0)
        tracker.start_new_turn(speech_start=t_base)
        tracker.record_speech_stop(t_base + 1.0)
        tracker.record_stt_final(t_base + 1.4, transcript=f"User turn {i}")
        tracker.record_user_aggregation_finalized(t_base + 1.5)
        tracker.record_llm_context_frame(t_base + 1.55)
        tracker.record_llm_request(t_base + 1.6)
        tracker.record_first_llm_output(t_base + 2.0)

        if i == 1:
            # Add tool execution to turn 1
            tracker.record_tool_call_complete(t_base + 2.5)
            tracker.record_tool_execution(
                tool_name="test_tool",
                start_time=t_base + 2.6,
                end_time=t_base + 3.2,
                success=True,
            )
            tracker.record_llm_context_frame(t_base + 3.3)
            tracker.record_llm_request(t_base + 3.35)
            tracker.record_first_llm_output(t_base + 3.8)

        tracker.record_tts_start(t_base + 4.0)
        tracker.record_first_tts_audio(t_base + 4.3)
        tracker.record_tts_stop(t_base + 6.0)
        tracker.record_turn_complete_once(t_base + 6.0)
        tracker.emit_turn_metrics_log()

    baseline = tracker.emit_call_baseline_summary("session-test")

    assert baseline["totalTurns"] == 3
    assert baseline["successfulTurns"] == 3
    assert baseline["interruptedTurns"] == 0
    assert baseline["toolTurns"] == 1
    assert len(tracker.completed_turns) == 3
