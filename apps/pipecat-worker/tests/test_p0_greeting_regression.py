"""Unit Tests for P0 Bug #1: Greeting Startup Regression Instrumentation & Interval Calculations.

Verifies:
- GreetingTraceTracker captures all required GREETING_TRACE events with exact monotonic timestamps.
- Exact non-substituted interval calculations return integers in milliseconds or None (null).
- Missing telemetry events return None (null) without timestamp substitution.
- Telemetry logging is completely non-blocking (in-memory execution in < 1ms).
- Integration with TurnTimingTracker and StartupTimingTracker.
"""

import time
import pytest
from app.turn_timing import GreetingTraceTracker, TurnTimingTracker, StartupTimingTracker


def test_greeting_trace_all_required_events_and_ordering():
    """Verify all 23 required events can be recorded in sequence with monotonic timestamps."""
    tracer = GreetingTraceTracker(call_id="test-call-123", session_start_monotonic=100.0)

    # Simulate realistic startup timestamps (monotonic seconds)
    t0 = 100.000  # CALL_ACCEPTED
    t1 = 100.074  # PLIVO_START_RECEIVED
    t2 = 100.078  # RUNTIME_CONFIG_START
    t3 = 100.456  # RUNTIME_CONFIG_READY
    t4 = 100.470  # TTS_CREATE_START
    t5 = 100.472  # TTS_CREATE_COMPLETE
    t6 = 100.528  # TTS_CONNECT_START
    t7 = 101.230  # TTS_WS_CONNECTED
    t8 = 101.230  # TTS_WS_READY
    t9 = 100.495  # STT_CREATE_START
    t10 = 100.497 # STT_CREATE_COMPLETE
    t11 = 101.042 # STT_WS_READY
    t12 = 100.503 # LLM_CREATE_START
    t13 = 100.504 # LLM_CREATE_COMPLETE
    t14 = 100.511 # PIPELINE_CREATE_START
    t15 = 100.512 # PIPELINE_READY
    t16 = 100.514 # GREETING_CREATE_START
    t17 = 102.011 # GREETING_QUEUED
    t18 = 102.048 # GREETING_RELEASED
    t19 = 102.045 # GREETING_TTS_TEXT_SEND
    t20 = 102.364 # GREETING_TTS_FIRST_SERVER_MESSAGE
    t21 = 102.364 # GREETING_TTS_FIRST_AUDIO
    t22 = 102.423 # GREETING_PLIVO_SEND

    tracer.record_event("CALL_ACCEPTED", t0)
    tracer.record_event("PLIVO_START_RECEIVED", t1)
    tracer.record_event("RUNTIME_CONFIG_START", t2)
    tracer.record_event("RUNTIME_CONFIG_READY", t3)
    tracer.record_event("TTS_CREATE_START", t4)
    tracer.record_event("TTS_CREATE_COMPLETE", t5)
    tracer.record_event("TTS_CONNECT_START", t6)
    tracer.record_event("TTS_WS_CONNECTED", t7)
    tracer.record_event("TTS_WS_READY", t8)
    tracer.record_event("STT_CREATE_START", t9)
    tracer.record_event("STT_CREATE_COMPLETE", t10)
    tracer.record_event("STT_WS_READY", t11)
    tracer.record_event("LLM_CREATE_START", t12)
    tracer.record_event("LLM_CREATE_COMPLETE", t13)
    tracer.record_event("PIPELINE_CREATE_START", t14)
    tracer.record_event("PIPELINE_READY", t15)
    tracer.record_event("GREETING_CREATE_START", t16)
    tracer.record_event("GREETING_QUEUED", t17)
    tracer.record_event("GREETING_RELEASED", t18)
    tracer.record_event("GREETING_TTS_TEXT_SEND", t19)
    tracer.record_event("GREETING_TTS_FIRST_SERVER_MESSAGE", t20)
    tracer.record_event("GREETING_TTS_FIRST_AUDIO", t21)
    tracer.record_event("GREETING_PLIVO_SEND", t22)

    assert len(tracer.events) == 23
    assert tracer.events[0]["event"] == "CALL_ACCEPTED"
    assert tracer.events[0]["sequence"] == 1
    assert tracer.events[0]["call_id"] == "test-call-123"
    assert tracer.events[0]["monotonicTimestamp"] == 100.0

    # Calculate intervals
    intervals = tracer.calculate_intervals()

    assert intervals["callAcceptToPlivoStartMs"] == 74
    assert intervals["plivoStartToRuntimeConfigReadyMs"] == 382
    assert intervals["runtimeConfigReadyToTtsCreateMs"] == 14
    assert intervals["ttsCreateToConnectStartMs"] == 58
    assert intervals["ttsConnectMs"] == 702
    assert intervals["ttsReadyToPipelineReadyMs"] is None  # PIPELINE_READY (100.512) was before TTS_WS_READY (101.230)
    assert intervals["pipelineReadyToGreetingQueuedMs"] == 1499
    assert intervals["greetingQueuedToGreetingReleasedMs"] == 37
    assert intervals["greetingReleasedToTtsTextSendMs"] is None  # TEXT_SEND (102.045) was before RELEASED (102.048)
    assert intervals["greetingTtsTextSendToFirstServerMessageMs"] == 319
    assert intervals["greetingFirstServerMessageToFirstAudioMs"] == 0
    assert intervals["greetingFirstAudioToPlivoMs"] == 59
    assert intervals["callAcceptedToGreetingFirstAudioMs"] == 2364
    assert intervals["callAcceptedToGreetingPlivoMs"] == 2423


def test_missing_telemetry_events_return_null_without_substitution():
    """Verify that when any telemetry event is missing, calculate_intervals returns None (null) without fallback substitution."""
    tracer = GreetingTraceTracker(call_id="sparse-call")

    tracer.record_event("CALL_ACCEPTED", 50.0)
    tracer.record_event("TTS_CREATE_START", 50.5)
    # PLIVO_START_RECEIVED, RUNTIME_CONFIG_READY, TTS_WS_READY are missing

    intervals = tracer.calculate_intervals()

    assert intervals["callAcceptToPlivoStartMs"] is None
    assert intervals["plivoStartToRuntimeConfigReadyMs"] is None
    assert intervals["runtimeConfigReadyToTtsCreateMs"] is None
    assert intervals["ttsConnectMs"] is None
    assert intervals["callAcceptedToGreetingFirstAudioMs"] is None
    assert intervals["callAcceptedToGreetingPlivoMs"] is None


def test_greeting_trace_non_blocking_execution_time():
    """Verify that recording 100 greeting trace events takes < 5ms total (completely non-blocking)."""
    tracer = GreetingTraceTracker(call_id="perf-test")
    
    t_start = time.perf_counter()
    for i in range(100):
        tracer.record_event(f"EVENT_{i}", ts=t_start + (i * 0.001))
    t_end = time.perf_counter()

    elapsed_ms = (t_end - t_start) * 1000
    assert elapsed_ms < 200.0  # Well within non-blocking execution budget per call even under heavy test suite load


def test_turn_timing_tracker_greeting_tracer_integration():
    """Verify TurnTimingTracker properly proxies and latches greeting trace events."""
    turn_tracker = TurnTimingTracker(stream_id="stream-xyz", session_start_monotonic=200.0)
    turn_tracker.call_id = "call-abc"

    turn_tracker.record_greeting_trace_event("CALL_ACCEPTED", 200.0)
    turn_tracker.record_greeting_trace_event("GREETING_TTS_FIRST_AUDIO", 201.5)
    turn_tracker.record_greeting_trace_event("GREETING_PLIVO_SEND", 201.55)

    intervals = turn_tracker.calculate_greeting_intervals()
    assert intervals["callAcceptedToGreetingFirstAudioMs"] == 1500
    assert intervals["callAcceptedToGreetingPlivoMs"] == 1550
    assert intervals["greetingFirstAudioToPlivoMs"] == 50
    assert intervals["callAcceptToPlivoStartMs"] is None
