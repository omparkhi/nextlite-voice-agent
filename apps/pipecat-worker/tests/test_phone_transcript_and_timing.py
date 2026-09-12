"""NextLite Pipecat Phase 16D Unit Tests: Real-time Call Transcript & Timing Analysis.

Verifies:
1. Startup event recording, ordering, ISO wall-clock & monotonic timestamps, and breakdown calculations.
2. Resilience against missing/out-of-order startup stages.
3. Multi-turn timing correlation and stage calculations.
4. Tool turn stage breakdown calculations (tool start, execution, result, post-tool LLM, TTS).
5. Unified call timeline generation merging startup and turn events sorted monotonically.
6. Safe non-PII phone trace characteristics across scripts (Latin, Devanagari, Spoken Hindi/English).
7. Negative duration protection and single-shot finalization guards.
"""

import time
import pytest
from app.turn_timing import (
    StartupTimingTracker,
    TurnTimingTracker,
    build_unified_call_timeline,
    safe_phone_trace,
)


def test_startup_timing_tracker_ordered_breakdown():
    """Verifies startup events produce ordered timeline and accurate stage breakdown."""
    base_mono = 100.0
    tracker = StartupTimingTracker(stream_id="stream-123", start_time_monotonic=base_mono)

    tracker.record_stage("websocket_accept", ts=base_mono + 0.050)
    tracker.record_stage("plivo_start_received", ts=base_mono + 0.120)
    tracker.record_stage("deployment_id_resolved", ts=base_mono + 0.125)
    tracker.record_stage("runtime_config_request_start", ts=base_mono + 0.130)
    tracker.record_stage("runtime_config_resolved", ts=base_mono + 0.160)
    tracker.record_stage("call_session_request_start", ts=base_mono + 0.165)
    tracker.record_stage("call_session_created", ts=base_mono + 0.190)
    tracker.record_stage("stt_service_created", ts=base_mono + 0.200)
    tracker.record_stage("tts_service_created", ts=base_mono + 0.210)
    tracker.record_stage("llm_service_created", ts=base_mono + 0.220)
    tracker.record_stage("pipeline_created", ts=base_mono + 0.320)
    tracker.record_stage("pipeline_runner_started", ts=base_mono + 0.330)
    tracker.record_stage("tts_connected", ts=base_mono + 0.550)
    tracker.record_stage("stt_connected", ts=base_mono + 0.560)
    tracker.record_stage("greeting_queued", ts=base_mono + 0.580)
    tracker.record_stage("first_greeting_audio", ts=base_mono + 0.850)

    breakdown = tracker.calculate_breakdown()
    metrics = tracker.calculate_metrics()

    assert breakdown["pickupToWebsocketMs"] == 50
    assert breakdown["websocketToStartFrameMs"] == 70
    assert breakdown["startFrameToRuntimeConfigMs"] == 40
    assert breakdown["runtimeConfigToCallSessionMs"] == 30
    assert breakdown["callSessionToServicesMs"] == 10  # 0.200 - 0.190
    assert breakdown["servicesToPipelineMs"] == 120    # 0.320 - 0.200
    assert breakdown["callSessionToPipelineMs"] == 130  # 0.320 - 0.190
    assert breakdown["pipelineToTTSReadyMs"] == 230    # 0.550 - 0.320
    assert breakdown["ttsReadyToGreetingQueuedMs"] == 30 # 0.580 - 0.550
    assert breakdown["greetingQueuedToFirstAudioMs"] == 270 # 0.850 - 0.580
    assert breakdown["pickupToFirstGreetingAudioMs"] == 800 # 0.850 - 0.050 (from websocket_accept)

    # Check events list in metrics
    assert len(metrics["events"]) == 16
    for evt in metrics["events"]:
        assert "event" in evt
        assert "timestamp" in evt
        assert "monotonicTimestamp" in evt
        assert "elapsedFromCallStartMs" in evt
        assert evt["elapsedFromCallStartMs"] >= 0


def test_startup_timing_missing_events_graceful():
    """Verifies that missing or incomplete startup stages do not crash and return None for unobserved deltas."""
    base_mono = 100.0
    tracker = StartupTimingTracker(stream_id="stream-test", start_time_monotonic=base_mono)

    tracker.record_stage("websocket_accept", ts=base_mono + 0.050)
    # plivo_start_received omitted
    tracker.record_stage("runtime_config_resolved", ts=base_mono + 0.150)
    tracker.record_stage("first_greeting_audio", ts=base_mono + 0.750)

    breakdown = tracker.calculate_breakdown()
    assert breakdown["websocketToStartFrameMs"] is None
    assert breakdown["startFrameToRuntimeConfigMs"] is None
    assert breakdown["pickupToFirstGreetingAudioMs"] == 700


def test_turn_timing_tracker_stage_latencies():
    """Verifies per-turn stage breakdown calculations and aliases."""
    base_mono = 200.0
    turn_tracker = TurnTimingTracker(stream_id="stream-turn", session_start_monotonic=base_mono)

    turn_id = turn_tracker.start_new_turn(speech_start=base_mono + 1.0)
    assert turn_id.startswith("turn-")

    # Speech stop: 1.8s
    turn_tracker.record_speech_stop(ts=base_mono + 1.8)
    # Utterance end: 1.95s
    turn_tracker.record_stt_utterance_end(ts=base_mono + 1.95)
    # STT final: 2.0s
    turn_tracker.record_stt_final(ts=base_mono + 2.0, transcript="hello assistant")
    # User aggregation: 2.04s
    turn_tracker.record_user_aggregation_finalized(ts=base_mono + 2.04)
    # LLM request: 2.05s
    turn_tracker.record_llm_request(ts=base_mono + 2.05)
    turn_tracker.record_llm_start(ts=base_mono + 2.05)
    # LLM first output: 2.35s
    turn_tracker.record_first_llm_output(ts=base_mono + 2.35)
    # TTS start: 2.36s
    turn_tracker.record_tts_start(ts=base_mono + 2.36)
    # TTS first audio: 2.51s
    turn_tracker.record_first_tts_audio(ts=base_mono + 2.51)
    # TTS stop: 3.20s
    turn_tracker.record_tts_stop(ts=base_mono + 3.20)
    turn_tracker.record_turn_complete(ts=base_mono + 3.20)

    metrics = turn_tracker.calculate_metrics()

    # Verify all Part 2 requested stage latencies
    assert metrics["speechDurationMs"] == 800           # 1.8 - 1.0
    assert metrics["vadStopToUtteranceEndMs"] == 150     # 1.95 - 1.8
    assert metrics["utteranceEndToSttFinalMs"] == 50     # 2.0 - 1.95
    assert metrics["speechStopToFinalTranscriptMs"] == 200 # 2.0 - 1.8
    assert metrics["finalTranscriptToAggregationMs"] == 40 # 2.04 - 2.0
    assert metrics["aggregationToLLMStartMs"] == 10      # 2.05 - 2.04
    assert metrics["llmStartToFirstOutputMs"] == 300     # 2.35 - 2.05
    assert metrics["llmToTTSStartMs"] == 10              # 2.36 - 2.35
    assert metrics["ttsStartToFirstAudioMs"] == 150      # 2.51 - 2.36
    assert metrics["speechStopToFirstAudioMs"] == 710    # 2.51 - 1.8
    assert metrics["totalTurnMs"] == 2200                # 3.20 - 1.0


def test_tool_turn_timing_stage_breakdown():
    """Verifies tool turn stage latencies (LLM -> Tool start -> execution -> post-tool LLM -> TTS)."""
    base_mono = 300.0
    turn_tracker = TurnTimingTracker(stream_id="stream-tool", session_start_monotonic=base_mono)

    turn_tracker.start_new_turn(speech_start=base_mono + 1.0)
    turn_tracker.record_speech_stop(ts=base_mono + 1.5)
    turn_tracker.record_stt_final(ts=base_mono + 1.7, transcript="book an appointment")
    turn_tracker.record_user_aggregation_finalized(ts=base_mono + 1.72)
    turn_tracker.record_llm_start(ts=base_mono + 1.73)
    turn_tracker.record_first_llm_output(ts=base_mono + 1.95)

    # Tool execution
    tool_t0 = base_mono + 2.00
    tool_t1 = base_mono + 2.12
    turn_tracker.record_tool_execution(
        tool_name="book_appointment",
        start_time=tool_t0,
        end_time=tool_t1,
        success=True,
        args={"customerName": "Rohan", "customerPhone": "9876543210"},
    )

    # Post-tool LLM
    turn_tracker.record_llm_start(ts=base_mono + 2.15)
    turn_tracker.record_first_llm_output(ts=base_mono + 2.40)

    # TTS
    turn_tracker.record_tts_start(ts=base_mono + 2.42)
    turn_tracker.record_first_tts_audio(ts=base_mono + 2.60)
    turn_tracker.record_turn_complete(ts=base_mono + 3.10)

    metrics = turn_tracker.calculate_metrics()

    assert metrics["toolDurationMs"] == 120
    assert metrics["toolExecutionMs"] == 120
    assert metrics["firstOutputToToolStartMs"] == 50     # 2.00 - 1.95
    assert metrics["toolResultToPostToolLLMMs"] == 30    # 2.15 - 2.12
    assert metrics["postToolLlmToFirstOutputMs"] == 250  # 2.40 - 2.15
    assert metrics["postToolLLMToTTSMs"] == 20           # 2.42 - 2.40
    assert metrics["toolResultToFirstAudioMs"] == 480    # 2.60 - 2.12
    assert metrics["speechStopToFirstAudioMs"] == 1100   # 2.60 - 1.50
    assert metrics["tools"][0]["name"] == "book_appointment"
    assert metrics["tools"][0]["durationMs"] == 120


def test_unified_call_timeline_merging():
    """Verifies build_unified_call_timeline merges startup and turn events in monotonic order."""
    base_mono = 400.0
    startup_tracker = StartupTimingTracker(stream_id="stream-timeline", start_time_monotonic=base_mono)
    turn_tracker = TurnTimingTracker(stream_id="stream-timeline", session_start_monotonic=base_mono)

    startup_tracker.record_stage("websocket_accept", ts=base_mono + 0.05)
    startup_tracker.record_stage("plivo_start_received", ts=base_mono + 0.10)
    startup_tracker.record_stage("first_greeting_audio", ts=base_mono + 0.70)

    turn_tracker.start_new_turn(speech_start=base_mono + 1.2)
    turn_tracker.record_speech_stop(ts=base_mono + 1.8)
    turn_tracker.record_stt_final(ts=base_mono + 2.0, transcript="namaste")
    turn_tracker.record_first_tts_audio(ts=base_mono + 2.5)
    turn_tracker.record_turn_complete(ts=base_mono + 3.0)

    timeline = build_unified_call_timeline(startup_tracker=startup_tracker, turn_tracker=turn_tracker)

    assert len(timeline) >= 6
    # Verify monotonic ordering
    for i in range(len(timeline) - 1):
        assert timeline[i]["monotonicTimestamp"] <= timeline[i + 1]["monotonicTimestamp"]

    # Verify types
    assert timeline[0]["type"] == "STARTUP"
    assert timeline[0]["event"] == "websocket_accept"


def test_safe_phone_trace_representation_types():
    """Verifies phone trace correctly extracts digit count, masked last4, and representation without PII."""
    # Latin digits
    latin_trace = safe_phone_trace("mera naam Om hai aur number 9657954641 hai")
    assert latin_trace["phoneObserved"] is True
    assert latin_trace["digits"] == 10
    assert latin_trace["last4"] == "4641"
    assert latin_trace["representation"] == "latin_digits"

    # Devanagari digits
    devanagari_trace = safe_phone_trace("माझा नंबर ९६५७९५४६४१ आहे")
    assert devanagari_trace["phoneObserved"] is True
    assert devanagari_trace["digits"] == 10
    assert devanagari_trace["last4"] == "4641"
    assert devanagari_trace["representation"] == "devanagari"

    # Spoken digits
    spoken_trace = safe_phone_trace("mera number nine six five seven nine five four six four one hai")
    assert spoken_trace["phoneObserved"] is True
    assert spoken_trace["digits"] == 10
    assert spoken_trace["last4"] == "4641"
    assert spoken_trace["representation"] == "spoken_digits"

    # No phone number
    no_phone_trace = safe_phone_trace("I want to know doctor timing")
    assert no_phone_trace["phoneObserved"] is False
    assert no_phone_trace["digits"] == 0
    assert no_phone_trace["last4"] is None
    assert no_phone_trace["representation"] == "none"


def test_phase16e_llm_dispatch_and_tool_delta_metrics():
    """Verifies Phase 16E granular LLM HTTP dispatch, tool JSON generation deltas, and monotonic stages."""
    base_mono = 500.0
    turn_tracker = TurnTimingTracker(stream_id="stream-16e", session_start_monotonic=base_mono)

    turn_tracker.start_new_turn(speech_start=base_mono + 1.0)
    turn_tracker.record_speech_stop(ts=base_mono + 1.6)
    turn_tracker.record_stt_final(ts=base_mono + 1.8, transcript="mera number 9657954641 hai")
    turn_tracker.record_user_aggregation_finalized(ts=base_mono + 1.83)
    turn_tracker.record_llm_context_frame(ts=base_mono + 1.84)
    turn_tracker.record_llm_request_created(ts=base_mono + 1.85)
    turn_tracker.record_llm_request(ts=base_mono + 1.86) # HTTP dispatch
    turn_tracker.record_llm_first_provider_response(ts=base_mono + 2.06) # Provider headers
    turn_tracker.record_tool_call_delta(ts=base_mono + 2.16) # First function call chunk
    turn_tracker.record_tool_call_complete(ts=base_mono + 2.66) # Function JSON arguments complete

    # Tool execution handler
    turn_tracker.record_tool_execution(
        tool_name="create_callback_lead",
        start_time=base_mono + 2.70,
        end_time=base_mono + 2.82,
        success=True,
        args={"customerName": "Om Parkhi", "customerPhone": "9657954641"},
    )

    # Post-tool LLM dispatch
    turn_tracker.record_llm_request_created(ts=base_mono + 2.85)
    turn_tracker.record_llm_request(ts=base_mono + 2.86)
    turn_tracker.record_llm_first_provider_response(ts=base_mono + 3.00)
    turn_tracker.record_first_llm_output(ts=base_mono + 3.12)
    turn_tracker.record_tts_start(ts=base_mono + 3.14)
    turn_tracker.record_first_tts_audio(ts=base_mono + 3.34)
    turn_tracker.record_tts_stop(ts=base_mono + 4.00)
    turn_tracker.record_turn_complete(ts=base_mono + 4.00)

    metrics = turn_tracker.calculate_metrics()

    # Verify Granular Phase 16E boundaries
    assert metrics["speechStopToFinalTranscriptMs"] == 200     # 1.80 - 1.60
    assert metrics["finalTranscriptToAggregationMs"] == 30     # 1.83 - 1.80
    assert metrics["aggregationToLLMRequestMs"] == 30          # 1.86 - 1.83
    assert metrics["llmContextToRequestMs"] == 20              # 1.86 - 1.84
    assert metrics["llmHttpRequestMs"] == 200                  # 2.06 - 1.86 (Provider HTTP headers latency)
    assert metrics["llmToFirstToolDeltaMs"] == 300             # 2.16 - 1.86
    assert metrics["firstToolDeltaToToolCompleteMs"] == 500    # 2.66 - 2.16 (JSON generation latency!)
    assert metrics["toolExecutionMs"] == 120                   # 2.82 - 2.70
    assert metrics["toolResultToPostToolLlmStartMs"] == 40     # 2.86 - 2.82
    assert metrics["postToolLlmToFirstOutputMs"] == 260        # 3.12 - 2.86
    assert metrics["postToolOutputToTTSMs"] == 20              # 3.14 - 3.12
    assert metrics["postToolTTSToFirstAudioMs"] == 200         # 3.34 - 3.14
    assert metrics["speechStopToFirstAudioMs"] == 1740         # 3.34 - 1.60

    # Verify safe phone trace in turn
    assert metrics["phoneTrace"]["phoneObserved"] is True
    assert metrics["phoneTrace"]["last4"] == "4641"


def test_negative_duration_and_invalid_metrics_rejection():
    """Verifies that reversed timestamps log warnings and return None rather than corrupting telemetry."""
    base_mono = 600.0
    turn_tracker = TurnTimingTracker(stream_id="stream-invalid", session_start_monotonic=base_mono)

    turn_tracker.start_new_turn(speech_start=base_mono + 2.0)
    turn_tracker.record_speech_stop(ts=base_mono + 1.0) # Invalid: speech stop before start
    
    metrics = turn_tracker.calculate_metrics()
    assert metrics["speechDurationMs"] is None
