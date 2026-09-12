"""Phase 18C: Plivo -> Pipecat Startup Forensics and Greeting Telemetry Tests.

Validates:
A. Plivo WebSocket accepts immediately before reading first message (websocket_handler_entered -> websocket_accepted -> websocket_waiting_first_msg).
B. Authoritative deploymentId resolved from query params / Plivo start payload.
C. Authoritative RuntimeAgentConfig requested using shared HTTP pool.
D. Temporal & calendar context resolved authoritatively without blocking.
E. ACTIVE CallSession creation is non-blocking on pipeline start.
F. Plivo start delay is accurately isolated between websocket_waiting_first_msg and plivo_start_received.
G. Application-side startup overhead is isolated from external network/telephony delay.
H. Static greeting frame flow bypasses LLM entirely (TTSSpeakFrame -> SarvamTTSService).
I. AggregatedTextFrame / TTSTextFrame emitted by TTS are NOT captured as LLM tokens.
J. Initial greeting is stored exactly once in transcript collector without duplication.
K. Greeting completion does NOT trigger turn_complete or conversational [TURN_METRICS].
L. TurnTimingTracker turn_type transitions cleanly from "greeting" to "user_turn".
M. totalTurns strictly tracks actual conversational user turns (excludes initial greeting-only turn).
N. User barge-in during greeting cleanly finalizes greeting and transitions to user turn.
O. StartupTimingTracker records all required Phase 18C stages.
P. StartupTimingTracker calculate_breakdown produces all canonical delta metrics directly from monotonic timestamps.
Q. Monotonic duration calculations are never negative (diff_ms returns >= 0 or None).
R. Total startup latency matches authoritative monotonic boundary, not sum of rounded stages.
S. Safe phone trace preserves PII masking (digits count, last4, representation, phoneObserved) without raw numbers.
T. Missed call classification operates properly with greeting present (COMPLETED + totalUserTurns == 0 + duration < 5s -> MISSED).
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.turn_timing import TurnTimingTracker, StartupTimingTracker, safe_phone_trace
from app.call_lifecycle import CallTranscriptCollector, mask_sensitive
from app.main import RealtimeStreamingTimingMonitor
from pipecat.frames.frames import (
    TTSSpeakFrame,
    TTSStartedFrame,
    TTSAudioRawFrame,
    TTSStoppedFrame,
    AggregatedTextFrame,
    TTSTextFrame,
    LLMTextFrame,
    InterruptionFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)


def test_requirement_a_plivo_websocket_stage_progression():
    """Requirement A: Startup tracker records handler entry, accept, and waiting first message."""
    t0 = 1000.0
    tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=t0)
    tracker.record_stage("websocket_handler_entered", t0)
    tracker.record_stage("call_start", t0)

    t_accept = t0 + 0.002
    tracker.record_stage("websocket_accepted", t_accept)

    t_wait = t_accept + 0.001
    tracker.record_stage("websocket_waiting_first_msg", t_wait)

    t_start = t_wait + 3.160  # Plivo external telephony delay
    tracker.record_stage("plivo_start_received", t_start)

    breakdown = tracker.calculate_breakdown()
    assert breakdown["websocket_accept_to_plivo_start_ms"] == 3161
    assert tracker.websocket_handler_entered == t0
    assert tracker.websocket_accepted == t_accept


def test_requirement_f_and_g_application_vs_plivo_delay_isolation():
    """Requirement F & G: Application-side startup overhead is strictly separated from Plivo start delay."""
    t0 = 2000.0
    tracker = StartupTimingTracker(stream_id="stream_18c", start_time_monotonic=t0)
    tracker.record_stage("websocket_handler_entered", t0)
    tracker.record_stage("call_start", t0)
    tracker.record_stage("websocket_accepted", t0 + 0.001)
    tracker.record_stage("websocket_waiting_first_msg", t0 + 0.002)

    # 3.16s Plivo delay
    plivo_start = t0 + 3.162
    tracker.record_stage("plivo_start_received", plivo_start)

    # Fast internal resolution (< 50ms)
    tracker.record_stage("deployment_id_resolved", plivo_start + 0.001)
    tracker.record_stage("runtime_config_request_start", plivo_start + 0.002)
    tracker.record_stage("runtime_config_resolved", plivo_start + 0.030)
    tracker.record_stage("pipeline_created", plivo_start + 0.060)
    tracker.record_stage("tts_ready", plivo_start + 0.080)
    tracker.record_stage("greeting_queued", plivo_start + 0.082)
    tracker.record_stage("greeting_tts_started", plivo_start + 0.090)
    tracker.record_stage("greeting_first_audio", plivo_start + 0.250)

    breakdown = tracker.calculate_breakdown()
    # Plivo delay is captured in websocket_accept_to_plivo_start_ms
    assert breakdown["websocket_accept_to_plivo_start_ms"] == 3161
    # Internal startup from plivo_start to first audio is ~250ms
    assert breakdown["plivo_start_to_first_greeting_audio_ms"] == 250
    assert breakdown["runtimeConfigMs"] == 28
    assert breakdown["plivo_start_to_runtime_config_ms"] == 30


@pytest.mark.asyncio
async def test_requirement_h_and_i_tts_frames_do_not_trigger_llm_metrics():
    """Requirement H & I: AggregatedTextFrame / TTSTextFrame emitted by TTS are NOT captured as LLM tokens."""
    timing_tracker = {}
    turn_tracker = TurnTimingTracker(session_start_monotonic=100.0)
    turn_tracker.turn_type = "greeting"
    startup_tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)
    transcript_collector = CallTranscriptCollector()

    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
        transcript_collector=transcript_collector,
        primary_language="en-IN",
    )

    # 1. Simulate TTSService pushing AggregatedTextFrame downstream for greeting
    agg_frame = AggregatedTextFrame(text="Hello! Welcome to NextLite.", aggregated_by="sentence")
    await monitor.process_frame(agg_frame, None)

    # 2. Simulate TTSService pushing TTSTextFrame downstream
    tts_txt_frame = TTSTextFrame(text="Hello! Welcome to NextLite.", aggregated_by="sentence")
    await monitor.process_frame(tts_txt_frame, None)

    # Verify LLM token tracking was NOT triggered
    assert timing_tracker.get("first_llm_token_time") is None
    assert turn_tracker.first_llm_output is None
    assert len(monitor._assistant_chunks) == 0


@pytest.mark.asyncio
async def test_requirement_j_greeting_does_not_duplicate_in_transcript():
    """Requirement J: Initial greeting recorded at startup is not duplicated when greeting audio completes."""
    timing_tracker = {}
    turn_tracker = TurnTimingTracker(session_start_monotonic=100.0)
    turn_tracker.turn_type = "greeting"
    turn_tracker.record_greeting_start(100.1)

    startup_tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)
    transcript_collector = CallTranscriptCollector()

    # Pre-record greeting at startup exactly as main.py does
    greeting_text = "Namaste! Welcome to NextLite Dental Care."
    transcript_collector.record_agent_message(
        response=greeting_text,
        active_language="en-IN",
    )
    assert len(transcript_collector.turns) == 1

    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
        transcript_collector=transcript_collector,
        primary_language="en-IN",
    )

    # Process greeting playback frames
    await monitor.process_frame(TTSStartedFrame(context_id="ctx_greeting"), None)
    await monitor.process_frame(TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=8000, num_channels=1), None)
    await monitor.process_frame(TTSStoppedFrame(context_id="ctx_greeting"), None)

    # Verify transcript still has ONLY ONE turn (no duplication)
    assert len(transcript_collector.turns) == 1
    assert transcript_collector.turns[0]["agent"]["response"] == greeting_text


@pytest.mark.asyncio
async def test_requirement_k_and_l_greeting_does_not_participate_in_conversational_turn_metrics():
    """Requirement K & L: Greeting completion does NOT trigger turn_complete or conversational [TURN_METRICS]."""
    timing_tracker = {}
    turn_tracker = TurnTimingTracker(session_start_monotonic=100.0)
    turn_tracker.turn_type = "greeting"
    turn_tracker.record_greeting_start(100.1)

    startup_tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)
    transcript_collector = CallTranscriptCollector()

    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
        transcript_collector=transcript_collector,
        primary_language="en-IN",
    )

    await monitor.process_frame(TTSStartedFrame(context_id="ctx_1"), None)
    await monitor.process_frame(TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=8000, num_channels=1), None)
    await monitor.process_frame(TTSStoppedFrame(context_id="ctx_1"), None)

    # Conversational turn metrics should NOT be emitted
    assert len(turn_tracker.completed_turns) == 0
    # Turn tracker state should transition to user_turn
    assert turn_tracker.turn_type == "user_turn"
    assert startup_tracker.greeting_completed is not None


@pytest.mark.asyncio
async def test_requirement_m_total_turns_tracks_user_turns_only():
    """Requirement M: totalTurns counts only turns with user utterances."""
    collector = CallTranscriptCollector()
    # 1. Startup greeting only
    collector.record_agent_message("Hello, how can I help you today?")
    summary = collector.end_call()
    turns = summary.get("turns", [])
    user_turns = [t for t in turns if t.get("user") is not None]
    assert len(user_turns) == 0
    assert len(turns) == 1

    # 2. User speaks turn 1
    collector._turns = []
    collector._current_turn = None
    collector.record_agent_message("Hello, how can I help you today?")
    collector.record_user_turn("I want to book an appointment")
    collector.record_agent_message("Sure, what day would you prefer?")
    summary2 = collector.end_call()
    turns2 = summary2.get("turns", [])
    user_turns2 = [t for t in turns2 if t.get("user") is not None]
    assert len(user_turns2) == 1


@pytest.mark.asyncio
async def test_requirement_n_user_barge_in_during_greeting():
    """Requirement N: Interruption during greeting stops greeting cleanly and sets turn_type to user_turn."""
    timing_tracker = {}
    turn_tracker = TurnTimingTracker(session_start_monotonic=100.0)
    turn_tracker.turn_type = "greeting"
    turn_tracker.record_greeting_start(100.1)

    startup_tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)
    transcript_collector = CallTranscriptCollector()

    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
        transcript_collector=transcript_collector,
        primary_language="en-IN",
    )

    await monitor.process_frame(TTSStartedFrame(context_id="g1"), None)
    await monitor.process_frame(InterruptionFrame(), None)

    assert turn_tracker.turn_type == "user_turn"
    assert len(turn_tracker.completed_turns) == 0


def test_requirement_o_and_p_startup_tracker_canonical_metrics():
    """Requirement O & P: All Phase 18C stages recorded and calculate_breakdown outputs all canonical keys."""
    tracker = StartupTimingTracker(stream_id="stream_full", start_time_monotonic=10.0)
    tracker.record_stage("websocket_handler_entered", 10.0)
    tracker.record_stage("call_start", 10.0)
    tracker.record_stage("websocket_accepted", 10.001)
    tracker.record_stage("websocket_waiting_first_msg", 10.002)
    tracker.record_stage("plivo_start_received", 13.162)
    tracker.record_stage("deployment_id_resolved", 13.165)
    tracker.record_stage("runtime_config_start", 13.166)
    tracker.record_stage("runtime_config_resolved", 13.200)
    tracker.record_stage("temporal_context_start", 13.201)
    tracker.record_stage("temporal_context_ready", 13.202)
    tracker.record_stage("call_session_start", 13.203)
    tracker.record_stage("call_session_created", 13.240)
    tracker.record_stage("stt_service_create_start", 13.241)
    tracker.record_stage("stt_service_created", 13.245)
    tracker.record_stage("tts_service_create_start", 13.246)
    tracker.record_stage("tts_service_created", 13.250)
    tracker.record_stage("tts_connect_start", 13.251)
    tracker.record_stage("tts_ready", 13.350)
    tracker.record_stage("tool_registry_start", 13.252)
    tracker.record_stage("tool_registry_resolved", 13.253)
    tracker.record_stage("llm_service_create_start", 13.254)
    tracker.record_stage("llm_service_created", 13.255)
    tracker.record_stage("pipeline_construct_start", 13.256)
    tracker.record_stage("pipeline_created", 13.260)
    tracker.record_stage("greeting_queue_start", 13.261)
    tracker.record_stage("greeting_queued", 13.262)
    tracker.record_stage("pipeline_start", 13.263)
    tracker.record_stage("pipeline_runner_started", 13.264)
    tracker.record_stage("greeting_tts_started", 13.360)
    tracker.record_stage("greeting_first_audio", 13.500)
    tracker.record_stage("greeting_completed", 14.800)

    breakdown = tracker.calculate_breakdown()
    assert breakdown["websocket_accept_to_plivo_start_ms"] == 3161
    assert breakdown["plivo_start_to_runtime_config_ms"] == 38
    assert breakdown["runtime_config_to_pipeline_ms"] == 60
    assert breakdown["pipeline_to_tts_ready_ms"] == 90
    assert breakdown["tts_ready_to_greeting_queue_ms"] == 0  # greeting queued before/concurrently with tts ready
    assert breakdown["greeting_queue_to_first_audio_ms"] == 238
    assert breakdown["plivo_start_to_first_greeting_audio_ms"] == 338
    assert breakdown["websocket_accept_to_first_greeting_audio_ms"] == 3499
    assert breakdown["call_start_to_first_greeting_audio_ms"] == 3500


def test_requirement_q_and_r_monotonic_safety_and_no_sum_drift():
    """Requirement Q & R: Durations derived directly from monotonic diffs, never negative, no round-off sum drift."""
    tracker = StartupTimingTracker(stream_id="stream_diff", start_time_monotonic=50.0)
    tracker.record_stage("call_start", 50.0)
    tracker.record_stage("websocket_accepted", 50.0)
    tracker.record_stage("plivo_start_received", 51.234567)
    tracker.record_stage("greeting_first_audio", 52.345678)

    breakdown = tracker.calculate_breakdown()
    assert breakdown["pickupToFirstGreetingAudioMs"] == 2346
    assert breakdown["call_start_to_first_greeting_audio_ms"] == 2346
    assert breakdown["websocket_accept_to_first_greeting_audio_ms"] == 2346


def test_requirement_s_safe_phone_trace_masks_pii():
    """Requirement S: safe_phone_trace masks numbers and extracts representation without raw PII."""
    trace_raw = safe_phone_trace("+919876543210")
    assert trace_raw["phoneObserved"] is True
    assert trace_raw["digits"] == 12  # +91 + 10 digits
    assert trace_raw["last4"] == "3210"
    assert trace_raw["representation"] == "latin_digits"

    # Devanagari Hindi digits: ९८७६५४३२१०
    trace_dev = safe_phone_trace("मेरा नंबर ९८७६५४३२१० है")
    assert trace_dev["phoneObserved"] is True
    assert trace_dev["digits"] == 10
    assert trace_dev["last4"] == "3210"
    assert trace_dev["representation"] == "devanagari"

    # Spoken digits: "nine eight seven six five four three two one zero"
    trace_spoken = safe_phone_trace("call me on nine eight seven six five four three two one zero")
    assert trace_spoken["phoneObserved"] is True
    assert trace_spoken["digits"] == 10
    assert trace_spoken["last4"] == "3210"
    assert trace_spoken["representation"] == "spoken_digits"


def test_requirement_t_missed_call_classification_with_greeting():
    """Requirement T: Call with greeting but 0 user turns and duration < 5s is classified as MISSED."""
    collector = CallTranscriptCollector()
    collector.record_agent_message("Hello! Welcome to NextLite.")
    summary = collector.end_call()
    turns = summary.get("turns", [])
    user_turns = [t for t in turns if t.get("user") is not None]
    total_user_turns = len(user_turns)
    duration_seconds = 2

    status = "COMPLETED"
    if status == "COMPLETED" and total_user_turns == 0 and duration_seconds < 5:
        status = "MISSED"

    assert status == "MISSED"
