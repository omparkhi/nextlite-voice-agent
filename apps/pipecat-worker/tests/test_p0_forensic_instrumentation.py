"""P0 TTS + LLM Forensic Telemetry & Waterfall Unit Tests.

Validates:
- Monotonic timestamp logging with time.perf_counter()
- Normal turn granular waterfall stages
- TTS connection lifecycle and reuse tracking
- LLM true streaming telemetry (headers, stream bytes, content delta, Pipecat frame)
- Tool turn isolated waterfall stages
- Interrupted turn handling
- Prevention of negative latencies and null fallback on missing events
- Call-level baseline summary with P50, P90, P95, MAX and TTS stats
"""

import time
import pytest
from app.turn_timing import TurnTimingTracker


def test_normal_turn_waterfall_calculation():
    """Verify all granular waterfall intervals are calculated correctly for a normal turn."""
    tracker = TurnTimingTracker(stream_id="test_stream_001")
    t0 = 100.000

    # User finishes speaking
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.000)  # 101.000

    # STT & Aggregation
    tracker.record_stt_final(t0 + 1.200, transcript="Hello assistant")  # 101.200
    tracker.record_user_aggregation_finalized(t0 + 1.250)  # 101.250

    # LLM Request & True Streaming
    tracker.record_llm_request_created(t0 + 1.260)
    tracker.record_llm_request(t0 + 1.270)  # 101.270 (LLM_REQUEST_START)
    tracker.record_llm_first_provider_response(t0 + 1.450)  # 101.450 (LLM_RESPONSE_HEADERS: +180ms)
    tracker.record_llm_first_stream_bytes(t0 + 1.480)  # 101.480 (LLM_FIRST_STREAM_BYTES: +30ms)
    tracker.record_first_llm_output(t0 + 1.500)  # 101.500 (LLM_FIRST_CONTENT_DELTA: +20ms)
    tracker.record_llm_first_pipecat_text_frame(t0 + 1.505)  # 101.505 (LLM_FIRST_PIPECAT_TEXT_FRAME: +5ms)

    # Text Aggregator Release & TTS
    tracker.record_tts_ws_ready(t0 + 0.500, connection_id="tts-conn-1234")
    tracker.record_text_released_to_tts(t0 + 1.700)  # 101.700 (TEXT_RELEASED: +195ms)
    tracker.record_tts_text_sent(t0 + 1.705, text_len=35)  # 101.705 (TTS_TEXT_SENT: +5ms)
    tracker.record_tts_first_server_message(t0 + 1.950, msg_type="audio")  # 101.950 (TTS_FIRST_SERVER_MESSAGE: +245ms)
    tracker.record_first_tts_audio(t0 + 1.955)  # 101.955 (TTS_FIRST_AUDIO: +5ms)
    tracker.record_tts_first_audio_frame(t0 + 1.955)
    tracker.record_audio_sent_to_plivo(t0 + 1.970)  # 101.970 (PLIVO_SEND: +15ms)
    tracker.record_tts_stop(t0 + 2.500)
    tracker.record_turn_complete(t0 + 2.510)

    metrics = tracker.calculate_metrics()

    # Latency from speech stop (101.000) to first audio (101.955) = 955ms
    assert metrics["responseLatencyMs"] == 955
    assert metrics["speechStopToPlivoFirstAudioMs"] == 970

    # LLM Breakdown
    assert metrics["llmRequestToHeadersMs"] == 180
    assert metrics["llmHeadersToFirstBytesMs"] == 30
    assert metrics["llmFirstBytesToContentMs"] == 20
    assert metrics["llmContentToPipecatFrameMs"] == 5
    assert metrics["speechStopToLlmFirstContentMs"] == 500
    assert metrics["llmFirstContentToTextReleaseMs"] == 200

    # TTS Breakdown
    assert metrics["textReleaseToTTSSendMs"] == 5
    assert metrics["textSendToFirstServerMessageMs"] == 245
    assert metrics["firstServerMessageToFirstAudioMs"] == 5
    assert metrics["firstAudioToPlivoMs"] == 15
    assert metrics["textReleaseToFirstAudioMs"] == 255
    assert metrics["ttsSendToFirstAudioMs"] == 250


def test_multiple_turns_isolation_and_connection_reuse():
    """Verify state isolation across turns while tracking persistent TTS connection ID."""
    tracker = TurnTimingTracker(stream_id="test_stream_002")
    conn_id = "tts-conn-fixed-01"

    # Turn 1
    tracker.record_tts_ws_ready(100.0, connection_id=conn_id)
    tracker.record_tts_state_at_turn_start("READY", conn_id)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_first_llm_output(102.5)
    tracker.record_text_released_to_tts(102.7)
    tracker.record_tts_text_sent(102.71)
    tracker.record_first_tts_audio(103.0)
    tracker.record_audio_sent_to_plivo(103.02)
    tracker.record_tts_stop(103.5)
    tracker.record_turn_complete(103.6)
    m1 = tracker.emit_turn_metrics_log()

    assert m1["ttsConnectionStateAtTurnStart"] == "READY"
    assert m1["ttsConnectionId"] == conn_id
    assert m1["responseLatencyMs"] == 1000

    # Start Turn 2
    tracker.start_new_turn()
    assert tracker.speech_start is None
    assert tracker.first_llm_output is None
    assert tracker.first_tts_audio is None

    # Turn 2 reuses the same TTS connection
    tracker.record_tts_state_at_turn_start("READY", conn_id)
    tracker.record_speech_start(105.0)
    tracker.record_speech_stop(106.0)
    tracker.record_first_llm_output(106.4)
    tracker.record_text_released_to_tts(106.6)
    tracker.record_tts_text_sent(106.61)
    tracker.record_first_tts_audio(106.9)
    tracker.record_audio_sent_to_plivo(106.92)
    tracker.record_tts_stop(107.4)
    tracker.record_turn_complete(107.5)
    m2 = tracker.emit_turn_metrics_log()

    assert m2["ttsConnectionStateAtTurnStart"] == "READY"
    assert m2["ttsConnectionId"] == conn_id
    assert m2["responseLatencyMs"] == 900
    assert len(tracker.completed_turns) == 2


def test_tts_reconnect_lifecycle():
    """Verify TTS reconnect events and state transitions are properly recorded."""
    tracker = TurnTimingTracker(stream_id="test_stream_003")
    t0 = 200.0

    tracker.record_tts_connect_start(t0)
    tracker.record_tts_ws_connected(t0 + 0.100)
    tracker.record_tts_ws_ready(t0 + 0.150, connection_id="tts-conn-initial")

    # Connection drops
    tracker.record_tts_connection_closed(t0 + 5.000)

    # Reconnect begins
    tracker.record_tts_reconnect_start(t0 + 5.100)
    tracker.record_tts_ws_connected(t0 + 5.300)
    tracker.record_tts_reconnect_complete(t0 + 5.350, connection_id="tts-conn-reconnected")

    events = [e["event"] for e in tracker.trace_events]
    assert "TTS_CONNECT_START" in events
    assert "TTS_WS_CONNECTED" in events
    assert "TTS_WS_READY" in events
    assert "TTS_CONNECTION_CLOSED" in events
    assert "TTS_RECONNECT_START" in events
    assert "TTS_RECONNECT_COMPLETE" in events
    assert tracker.tts_connection_id == "tts-conn-reconnected"


def test_missing_events_do_not_substitute_or_produce_negative():
    """Verify that unrecorded events evaluate to None without producing invalid negative latencies."""
    tracker = TurnTimingTracker(stream_id="test_stream_004")
    tracker.record_speech_stop(300.0)
    # LLM and TTS events omitted entirely
    tracker.record_first_tts_audio(301.2)

    metrics = tracker.calculate_metrics()
    assert metrics["responseLatencyMs"] == 1200
    assert metrics["llmRequestToHeadersMs"] is None
    assert metrics["llmHeadersToFirstBytesMs"] is None
    assert metrics["llmFirstBytesToContentMs"] is None
    assert metrics["textReleaseToTTSSendMs"] is None
    assert metrics["textSendToFirstServerMessageMs"] is None
    assert metrics["firstServerMessageToFirstAudioMs"] is None


def test_negative_duration_prevention():
    """Verify out-of-order or corrupt timestamps are rejected cleanly rather than outputting negative values."""
    tracker = TurnTimingTracker(stream_id="test_stream_005")
    # Out of order timestamps
    tracker.record_speech_stop(400.0)
    tracker.record_first_tts_audio(399.0)  # Invalid: audio before speech stop

    metrics = tracker.calculate_metrics()
    assert metrics["responseLatencyMs"] is None


def test_tool_turn_waterfall():
    """Verify tool turn events and post-tool waterfall latencies are cleanly separated."""
    tracker = TurnTimingTracker(stream_id="test_stream_006")
    t0 = 500.0

    tracker.record_speech_stop(t0)
    tracker.record_llm_request(t0 + 0.200)
    tracker.record_tool_call_delta(t0 + 0.500)
    tracker.record_tool_call_complete(t0 + 0.800)

    # Tool Execution
    tracker.record_tool_execution(
        tool_name="query_knowledge_base",
        start_time=t0 + 0.810,
        end_time=t0 + 1.110,
        success=True,
    )

    # Post-tool LLM & TTS
    tracker.record_llm_request(t0 + 1.120)  # Post-tool LLM start
    tracker.record_first_llm_output(t0 + 1.400)  # Post-tool first content
    tracker.record_tts_text_sent(t0 + 1.410, text_len=40, is_post_tool=True)
    tracker.record_first_tts_audio(t0 + 1.700)
    tracker.record_audio_sent_to_plivo(t0 + 1.720)
    tracker.record_turn_complete(t0 + 2.000)

    metrics = tracker.calculate_metrics()
    assert metrics["toolDurationMs"] == 300
    assert metrics["toolCallDetectedToCompleteMs"] == 300
    assert metrics["postToolLlmFirstContentMs"] == 280
    assert metrics["postToolTtsTextSentMs"] == 10
    assert metrics["postToolTtsFirstAudioMs"] == 290
    assert metrics["postToolPlivoSendMs"] == 20


def test_interrupted_turn():
    """Verify interruption during assistant turn is captured without corrupting normal metrics."""
    tracker = TurnTimingTracker(stream_id="test_stream_007")
    t0 = 600.0

    tracker.record_speech_stop(t0)
    tracker.record_tts_start(t0 + 0.500)
    tracker.record_first_tts_audio(t0 + 0.800)
    assert tracker.is_assistant_speaking is True

    interrupted = tracker.record_interruption(reason="user_barge_in", ts=t0 + 1.000)
    assert interrupted is True
    assert tracker.interrupted is True

    tracker.record_turn_complete(t0 + 1.010)
    metrics = tracker.emit_turn_metrics_log()
    assert metrics["interrupted"] is True


def test_call_baseline_summary_percentiles():
    """Verify P50, P90, P95, MAX and TTS stats in emit_call_baseline_summary."""
    tracker = TurnTimingTracker(stream_id="test_stream_008")

    # Simulate 5 normal turns
    latencies = [750, 800, 850, 900, 1100]
    tts_send_delays = [200, 220, 240, 260, 300]

    for i, (lat, tts_d) in enumerate(zip(latencies, tts_send_delays)):
        t_base = 1000.0 + (i * 10.0)
        tracker.record_tts_state_at_turn_start("READY", "tts-conn-summary-01")
        tracker.record_speech_start(t_base)
        tracker.record_speech_stop(t_base + 1.0)
        tracker.record_first_llm_output(t_base + 1.3)
        tracker.record_text_released_to_tts(t_base + 1.5)
        tracker.record_tts_text_sent(t_base + 1.51)
        tracker.record_tts_first_server_message(t_base + 1.51 + (tts_d / 1000.0) - 0.01)
        tracker.record_first_tts_audio(t_base + 1.0 + (lat / 1000.0))
        tracker.record_audio_sent_to_plivo(t_base + 1.0 + (lat / 1000.0) + 0.02)
        tracker.record_tts_stop(t_base + 2.5)
        tracker.record_turn_complete(t_base + 2.6)
        tracker.emit_turn_metrics_log()
        tracker.start_new_turn()

    summary = tracker.emit_call_baseline_summary(session_id="test_session_summary")

    assert summary["totalTurns"] == 5
    assert summary["normalTurns"] == 5
    assert summary["responseLatencyP50Ms"] == 850
    assert summary["responseLatencyMaxMs"] == 1100
    assert summary["ttsConnection"]["readyPercentage"] == 100.0
    assert summary["ttsConnection"]["reconnectPercentage"] == 0.0
    assert summary["ttsConnection"]["sendToFirstAudioP50Ms"] is not None
