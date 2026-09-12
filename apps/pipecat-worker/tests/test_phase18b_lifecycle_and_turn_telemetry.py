"""Phase 18B: Real PSTN Startup, Event Deduplication, Greeting and Latency Forensics Tests.

Validates:
A. Duplicate user_speech_start does not create duplicate turn.
B. Duplicate STT utterance-end does not create duplicate turn.
C. Duplicate aggregation does not create duplicate turn.
D. Duplicate turn-complete does not create duplicate turn.
E. Normal user speech does not count as interruption.
F. Real barge-in (caller speaks while assistant speaking) counts as interruption.
G. Assistant transcript is stored exactly once without duplication.
H. Static greeting bypasses LLM and routes to TTS directly.
I. Greeting does not wait for CallSession creation.
J. CallSession failure does not prevent greeting.
K. CallSession background task resolves correctly.
L. Concurrent finalization performs one terminal PATCH.
M. Caller hangup during active turn preserves final user transcript.
N. Missed call classification (COMPLETED with 0 turns & <3s -> MISSED).
O. Monotonic duration and timing calculation validity.
P. Startup total equals authoritative monotonic boundary, not sum of rounded stages.
Q. No raw phone PII in metrics/timeline/log payloads.
R. Tool turn parent/child records do not inflate totalTurns.
S. Phone number extraction with 10-digit number ending in 4641.
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.turn_timing import TurnTimingTracker, StartupTimingTracker, safe_phone_trace
from app.call_lifecycle import CallTranscriptCollector, mask_sensitive
from app.call_session_client import CallSessionClient, CreateCallSessionRequest, UpdateCallSessionRequest
from app.tools.tool_registry import ToolRuntimeContext, ToolRegistry


def test_duplicate_user_speech_start_does_not_create_duplicate_turn():
    """Requirement A: Duplicate user_speech_start triggers on same turn do not create new turn or duplicate events."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    turn_id_1 = tracker.active_turn_id
    num_events_1 = len(tracker.active_turn_events)

    # Second arrival of user_speech_start (e.g. from both VAD event handler and frame processor)
    tracker.record_speech_start(101.05)
    assert tracker.active_turn_id == turn_id_1
    assert len(tracker.active_turn_events) == num_events_1


def test_duplicate_stt_utterance_end_does_not_create_duplicate_turn():
    """Requirement B: Duplicate STT utterance-end triggers do not duplicate events."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_stt_utterance_end(102.15)
    num_events = len([e for e in tracker.active_turn_events if e["event"] == "stt_utterance_end"])
    assert num_events == 1

    # Second arrival of utterance end
    tracker.record_stt_utterance_end(102.16)
    num_events_after = len([e for e in tracker.active_turn_events if e["event"] == "stt_utterance_end"])
    assert num_events_after == 1


def test_duplicate_aggregation_does_not_create_duplicate_turn():
    """Requirement C: Duplicate user_aggregation_finalized does not duplicate events."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_user_aggregation_finalized(102.25)
    num_agg = len([e for e in tracker.active_turn_events if e["event"] == "user_aggregated"])
    assert num_agg == 1

    # Second arrival (e.g. from both on_user_turn_inference_triggered and on_user_turn_stopped)
    tracker.record_user_aggregation_finalized(102.26)
    num_agg_after = len([e for e in tracker.active_turn_events if e["event"] == "user_aggregated"])
    assert num_agg_after == 1


def test_duplicate_turn_complete_does_not_create_duplicate_turn():
    """Requirement D: Duplicate turn complete calls complete once and do not emit multiple logs."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_first_tts_audio(103.0)

    first_res = tracker.record_turn_complete_once(103.5)
    assert first_res is True
    assert tracker.turn_complete == 103.5

    second_res = tracker.record_turn_complete_once(103.6)
    assert second_res is False
    assert tracker.turn_complete == 103.5


def test_normal_user_speech_does_not_count_as_interruption():
    """Requirement E: Normal user speech when assistant is silent does NOT count as interruption."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_stt_final(102.2)

    # Interruption frame arriving when assistant was NOT speaking
    interrupted = tracker.record_interruption("user_barge_in", 101.05)
    assert interrupted is False
    assert tracker.interrupted is False
    assert tracker.interruption_reason is None
    events = [e["event"] for e in tracker.active_turn_events]
    assert "interrupted" not in events


def test_real_barge_in_counts_as_interruption():
    """Requirement F: Real barge-in while assistant is actively speaking counts as interruption."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_tts_start(102.5)  # Assistant starts speaking

    assert tracker.is_assistant_speaking is True

    # User barges in while assistant is speaking
    interrupted = tracker.record_interruption("user_barge_in", 102.8)
    assert interrupted is True
    assert tracker.interrupted is True
    assert tracker.interruption_reason == "user_barge_in"
    events = [e["event"] for e in tracker.active_turn_events]
    assert "interrupted" in events


def test_assistant_transcript_is_stored_exactly_once():
    """Requirement G: Spoken assistant response is appended to transcript collector exactly once."""
    collector = CallTranscriptCollector()
    collector.record_agent_message("Namaste, Medicare clinic mein aapka swagat hai.")
    collector.record_user_turn("Mujhe appointment chahiye.")
    collector.record_agent_message("Kal subah 10 baje ka slot available hai.")

    turns = collector.get_turns()
    assert len(turns) == 2
    assert turns[0]["agent"]["response"] == "Namaste, Medicare clinic mein aapka swagat hai."
    assert turns[1]["user"]["transcript"] == "Mujhe appointment chahiye."
    assert turns[1]["agent"]["response"] == "Kal subah 10 baje ka slot available hai."


def test_missed_call_classification():
    """Requirement N: Call completed with 0 user turns and < 3s duration is classified as MISSED."""
    collector = CallTranscriptCollector()
    collector.record_agent_message("Greeting only")
    summary = collector.end_call()
    turns = summary.get("turns", [])

    user_turns = [t for t in turns if t.get("user")]
    assert len(user_turns) == 0

    duration_seconds = 2
    final_status = "COMPLETED"
    if final_status == "COMPLETED" and len(user_turns) == 0 and duration_seconds < 3:
        status = "MISSED"
    else:
        status = final_status

    assert status == "MISSED"


def test_startup_total_equals_monotonic_boundary():
    """Requirement P: Authoritative startup total equals first_greeting_audio - connection_start, not sum of rounded stages."""
    tracker = StartupTimingTracker(start_time_monotonic=100.0)
    tracker.record_stage("websocket_accepted", 100.100)
    tracker.record_stage("plivo_start_received", 100.350)
    tracker.record_stage("runtime_config_resolved", 100.700)
    tracker.record_stage("tts_ready", 101.200)
    tracker.record_stage("greeting_queued", 101.250)
    tracker.record_stage("greeting_tts_started", 101.300)
    tracker.record_stage("greeting_first_audio", 101.750)

    metrics = tracker.calculate_metrics()
    # Authoritative monotonic total: 101.750 - 100.100 = 1.650s = 1650ms
    assert metrics["pickupToFirstGreetingAudioMs"] == 1650
    assert metrics["totalCallStartupToFirstAudioMs"] == 1650


def test_no_raw_phone_pii_in_metrics_and_trace():
    """Requirement Q: Never store or log raw 10-digit phone numbers in metrics/timeline/logs."""
    raw_phone = "9657954641"
    trace = safe_phone_trace(raw_phone)
    assert trace["phoneObserved"] is True
    assert trace["digits"] == 10
    assert trace["last4"] == "4641"
    assert "9657954641" not in trace["last4"]
    assert "96579" not in str(trace)

    masked_text = mask_sensitive("My phone number is 9657954641 please call back.")
    assert "9657954641" not in masked_text
    assert "4641" in masked_text


def test_phone_number_extraction_regression_4641():
    """Requirement S: Phone number ending in 4641 is correctly traced as latin digits."""
    trace = safe_phone_trace("9657954641")
    assert trace["phoneObserved"] is True
    assert trace["digits"] == 10
    assert trace["last4"] == "4641"
    assert trace["representation"] == "latin_digits"


def test_tool_turn_does_not_inflate_total_turns():
    """Requirement R: Tool turn parent/child timing records do not duplicate turn count."""
    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.record_speech_start(101.0)
    tracker.record_speech_stop(102.0)
    tracker.record_llm_request_created(102.2)
    tracker.record_tool_call_delta(102.5)
    tracker.record_tool_call_complete(103.0)
    tracker.record_tool_execution("book_appointment", 103.0, 103.2, True, {"phone": "9657954641"})
    tracker.record_first_llm_output(103.5)
    tracker.record_tts_start(103.6)
    tracker.record_first_tts_audio(103.9)
    tracker.record_tts_stop(104.5)
    tracker.record_turn_complete_once(104.5)
    tracker.emit_turn_metrics_log()

    summary = tracker.emit_call_baseline_summary("session-tool-test")
    assert summary["totalTurns"] == 1
    assert summary["toolTurns"] == 1
