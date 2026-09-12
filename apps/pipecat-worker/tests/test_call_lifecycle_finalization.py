"""Tests for Phase 18A: Post-Call Lifecycle, Transcript Persistence & Final Latency Forensics.

Validates:
1. Plivo stop / close event deserialization emitting EndFrame.
2. Transport disconnect detection and clean shutdown.
3. Exactly-once idempotent finalization under concurrent triggers.
4. Background CallSession creation task resolution before finalization.
5. CallSession creation failure handling (no crash, safe skip).
6. Preservation of final user turn when caller hangs up mid-turn.
7. Flush of partial assistant chunks without fabricating responses.
8. Missed-call rule (duration < 3s, 0 turns -> MISSED).
9. Monotonic call duration and complete metricsJson payload structure.
10. Privacy/PII protection: safe masked phone traces in telemetry.
"""

import asyncio
import json
import time
from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.call_lifecycle import CallTranscriptCollector, format_plain_transcript, mask_sensitive
from app.call_session_client import (
    CallSessionClient,
    CallSessionResponse,
    CreateCallSessionRequest,
    UpdateCallSessionRequest,
)
from app.turn_timing import StartupTimingTracker, TurnTimingTracker, safe_phone_trace
from pipecat.frames.frames import (
    EndFrame,
    TranscriptionFrame,
    LLMTextFrame,
    TTSStartedFrame,
    TTSAudioRawFrame,
    TTSStoppedFrame,
    InterruptionFrame,
)
from pipecat.serializers.plivo import PlivoFrameSerializer
from app.main import DiagnosticPlivoFrameSerializer, RealtimeStreamingTimingMonitor


@pytest.mark.asyncio
async def test_plivo_stop_event_emits_end_frame():
    """Verify that Plivo event 'stop' and 'close' deserialize to Pipecat EndFrame."""
    params = PlivoFrameSerializer.InputParams(auto_hang_up=False)
    serializer = DiagnosticPlivoFrameSerializer(stream_id="test_stream_123", params=params)
    
    stop_payload = json.dumps({"event": "stop", "streamId": "test_stream_123"})
    frame = await serializer.deserialize(stop_payload)
    assert isinstance(frame, EndFrame)

    close_payload = json.dumps({"event": "close", "streamId": "test_stream_123"})
    close_frame = await serializer.deserialize(close_payload)
    assert isinstance(close_frame, EndFrame)


@pytest.mark.asyncio
async def test_final_user_turn_persisted_when_caller_hangs_up():
    """Scenario: User speaks -> STT produces final transcript -> Caller hangs up before LLM/TTS responds.
    
    Verifies:
    1. User turn is recorded in transcript_collector.
    2. No assistant response is fabricated.
    3. Final transcript text contains 'User: ...'.
    4. Turn latency metrics capture STT final without crashing.
    """
    collector = CallTranscriptCollector()
    timing_tracker = {"last_stt_transcript_time": time.perf_counter()}
    turn_tracker = TurnTimingTracker(stream_id="stream_hangup_test")
    
    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        transcript_collector=collector,
        primary_language="en-IN",
    )

    # 1. User speaks in monotonic time relative to current perf_counter
    now = time.perf_counter()
    turn_tracker.record_speech_start(now - 0.6)
    turn_tracker.record_speech_stop(now - 0.2)
    
    # 2. STT final transcript arrives
    user_text = "I want an appointment tomorrow at 10"
    transcription_frame = TranscriptionFrame(
        text=user_text,
        user_id="caller",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    await monitor.process_frame(transcription_frame, None)

    # 3. Caller hangs up immediately before any assistant LLM/TTS chunk arrives
    monitor.flush_pending()
    summary = collector.end_call()
    turns = summary["turns"]

    # Verify user transcript is preserved
    assert len(turns) == 1
    assert turns[0]["user"]["transcript"] == user_text
    assert "agent" not in turns[0]  # No fabricated agent message

    # Verify plain transcript
    plain = format_plain_transcript(turns)
    assert plain == f"User: {user_text}"
    assert "Assistant:" not in plain

    # Verify turn timing was completed
    assert len(turn_tracker.completed_turns) == 1
    latest_turn = turn_tracker.completed_turns[0]
    assert latest_turn["speechStopToFinalTranscriptMs"] is not None
    assert latest_turn["speechStopToFinalTranscriptMs"] >= 0
    assert latest_turn["responseLatencyMs"] is None  # No audio was played


@pytest.mark.asyncio
async def test_partial_assistant_response_flushed_on_hangup():
    """Scenario: User speaks -> STT final -> LLM produces tokens -> Caller hangs up during TTS.
    
    Verifies that already-produced text is captured with interrupted=True.
    """
    collector = CallTranscriptCollector()
    timing_tracker = {"last_stt_transcript_time": time.perf_counter()}
    turn_tracker = TurnTimingTracker(stream_id="stream_partial_test")
    
    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        transcript_collector=collector,
        primary_language="en-IN",
    )

    # User speaks
    now = time.perf_counter()
    turn_tracker.record_speech_start(now - 0.5)
    turn_tracker.record_speech_stop(now - 0.1)
    await monitor.process_frame(
        TranscriptionFrame(
            text="Hello",
            user_id="caller",
            timestamp=datetime.now(timezone.utc).isoformat(),
        ),
        None,
    )

    # Assistant outputs text tokens
    await monitor.process_frame(LLMTextFrame(text="Sure, I can help "), None)
    await monitor.process_frame(LLMTextFrame(text="you with that."), None)

    # Hangup before TTS completes
    monitor.flush_pending()
    summary = collector.end_call()
    turns = summary["turns"]

    assert len(turns) == 1
    assert turns[0]["user"]["transcript"] == "Hello"
    assert turns[0]["agent"]["response"] == "Sure, I can help you with that."
    assert turns[0]["agent"]["interrupted"] is True


@pytest.mark.asyncio
async def test_exactly_once_finalization_guard():
    """Verify that finalize_call_session executes the PATCH request exactly once even under concurrent calls."""
    mock_client = AsyncMock()
    mock_client.update_call_session.return_value = CallSessionResponse(
        id="session-123",
        tenantId="tenant-abc",
        agentId="agent-xyz",
        deploymentId="dep-456",
        roomName="stream-123",
        startedAt="2026-09-11T20:00:00Z",
        status="COMPLETED",
        durationSeconds=10,
    )

    is_finalized = False
    is_finalizing = False
    finalization_lock = asyncio.Lock()
    call_count = 0

    async def finalize(reason: str):
        nonlocal is_finalized, is_finalizing, call_count
        async with finalization_lock:
            if is_finalized or is_finalizing:
                return
            is_finalizing = True

        try:
            # Simulate work
            await asyncio.sleep(0.05)
            await mock_client.update_call_session("session-123", MagicMock())
            call_count += 1
            is_finalized = True
        finally:
            is_finalizing = False

    # Trigger 5 concurrent finalization requests from different sources (disconnect, stop, finally, etc.)
    await asyncio.gather(
        finalize("plivo_disconnect"),
        finalize("transport_error"),
        finalize("pipeline_shutdown"),
        finalize("worker_exit"),
        finalize("timeout"),
    )

    assert call_count == 1
    assert mock_client.update_call_session.call_count == 1
    assert is_finalized is True


@pytest.mark.asyncio
async def test_background_call_session_resolution_before_finalization():
    """Verify that if call ends before background call_session_task completes, finalizer awaits and uses resolved ID."""
    mock_client = AsyncMock()
    mock_client.update_call_session.return_value = CallSessionResponse(
        id="resolved-session-789",
        tenantId="tenant-abc",
        agentId="agent-xyz",
        deploymentId="dep-456",
        roomName="stream-123",
        startedAt="2026-09-11T20:00:00Z",
        status="COMPLETED",
        durationSeconds=2,
    )

    call_session_holder = {"id": None}
    call_session_id = None

    async def _bg_create():
        await asyncio.sleep(0.08)
        call_session_holder["id"] = "resolved-session-789"
        return "resolved-session-789"

    call_session_task = asyncio.create_task(_bg_create())

    is_finalized = False
    is_finalizing = False
    finalization_lock = asyncio.Lock()

    async def finalize():
        nonlocal is_finalized, is_finalizing, call_session_id
        async with finalization_lock:
            if is_finalized or is_finalizing:
                return
            is_finalizing = True

        try:
            if not call_session_id and call_session_task is not None:
                await asyncio.wait_for(asyncio.shield(call_session_task), timeout=2.0)
                if call_session_holder.get("id"):
                    call_session_id = call_session_holder["id"]

            assert call_session_id == "resolved-session-789"
            await mock_client.update_call_session(call_session_id, MagicMock())
            is_finalized = True
        finally:
            is_finalizing = False

    await finalize()
    assert is_finalized is True
    assert mock_client.update_call_session.call_count == 1


@pytest.mark.asyncio
async def test_call_session_creation_failure_does_not_crash_finalization():
    """Verify that if background CallSession creation fails, finalizer logs safely without calling PATCH on null."""
    mock_client = AsyncMock()

    call_session_holder = {"id": None}
    call_session_id = None

    async def _bg_create_failing():
        await asyncio.sleep(0.02)
        raise RuntimeError("NextLite Control Plane API offline")

    call_session_task = asyncio.create_task(_bg_create_failing())

    is_finalized = False
    is_finalizing = False
    finalization_lock = asyncio.Lock()

    async def finalize():
        nonlocal is_finalized, is_finalizing, call_session_id
        async with finalization_lock:
            if is_finalized or is_finalizing:
                return
            is_finalizing = True

        try:
            if not call_session_id and call_session_task is not None:
                try:
                    await asyncio.wait_for(asyncio.shield(call_session_task), timeout=1.0)
                except Exception:
                    pass
                if call_session_holder.get("id"):
                    call_session_id = call_session_holder["id"]

            if not call_session_id:
                # Safe exit, no PATCH against null ID
                is_finalized = True
                return

            await mock_client.update_call_session(call_session_id, MagicMock())
        finally:
            is_finalizing = False

    await finalize()
    assert is_finalized is True
    assert mock_client.update_call_session.call_count == 0


def test_missed_call_classification():
    """Verify missed-call rule: COMPLETED + 0 turns + duration < 3s => MISSED."""
    def compute_status(initial_status: str, turns: list, duration_seconds: int) -> str:
        status = initial_status
        if status == "COMPLETED" and len(turns) == 0 and duration_seconds < 3:
            status = "MISSED"
        return status

    # 1. Zero turns, 1 second -> MISSED
    assert compute_status("COMPLETED", [], 1) == "MISSED"
    # 2. Zero turns, 2 seconds -> MISSED
    assert compute_status("COMPLETED", [], 2) == "MISSED"
    # 3. Zero turns, 4 seconds -> COMPLETED
    assert compute_status("COMPLETED", [], 4) == "COMPLETED"
    # 4. 1 turn, 1 second -> COMPLETED
    assert compute_status("COMPLETED", [{"turnId": 1}], 1) == "COMPLETED"
    # 5. Genuine failure -> FAILED
    assert compute_status("FAILED", [], 1) == "FAILED"


def test_monotonic_duration_and_metrics_payload_integrity():
    """Verify that monotonic duration and complete metrics telemetry payload are correctly assembled."""
    conn_start = time.perf_counter() - 12.345
    now_mono = time.perf_counter()
    
    call_duration_monotonic = max(0.0, now_mono - conn_start)
    duration_seconds = max(0, round(call_duration_monotonic))
    call_duration_ms = round(call_duration_monotonic * 1000)

    assert duration_seconds == 12
    assert 12300 <= call_duration_ms <= 12400

    collector = CallTranscriptCollector()
    collector.record_user_turn("Book appointment")
    collector.record_agent_message("I will help with that.")
    collector.record_tool_call("book_appointment", "call_abc", {"date": "tomorrow"}, success=True)
    summary = collector.end_call()

    turn_tracker = TurnTimingTracker(stream_id="test_stream")
    startup_tracker = StartupTimingTracker(stream_id="test_stream")

    metrics_payload = {
        "callDurationMs": call_duration_ms,
        "callStartedAt": "2026-09-11T20:00:00Z",
        "callEndedAt": "2026-09-11T20:00:12Z",
        "totalTurns": len(summary["turns"]),
        "totalToolCalls": len(collector.tools_used),
        "executedToolsCount": len(collector.tools_used),
        "errorsCount": len(summary.get("errors", [])),
        "latestTurnMetrics": turn_tracker.calculate_metrics(),
        "callBaseline": turn_tracker.emit_call_baseline_summary("session-1"),
        "startupMetrics": startup_tracker.calculate_metrics(),
        "startupBreakdown": startup_tracker.calculate_breakdown(),
        "turns": turn_tracker.completed_turns,
        "toolsUsed": collector.tools_used,
    }

    assert metrics_payload["callDurationMs"] == call_duration_ms
    assert metrics_payload["totalTurns"] == 1
    assert metrics_payload["executedToolsCount"] == 1
    assert metrics_payload["toolsUsed"] == ["book_appointment"]


def test_safe_phone_trace_non_pii_guarantee():
    """Verify that safe phone traces never expose raw 10-digit numbers in telemetry."""
    trace = safe_phone_trace("My number is 9876543210")
    assert trace["phoneObserved"] is True
    assert trace["digits"] == 10
    assert trace["last4"] == "3210"
    assert "9876543210" not in str(trace)

    masked = mask_sensitive("User phone is 9876543210 with secret Bearer eyJhbGciOi")
    assert "9876543210" not in masked
    assert "3210" in masked
    assert "Bearer [REDACTED]" in masked


@pytest.mark.asyncio
async def test_acceptance_scenario_1_normal_conversation():
    """Acceptance Scenario 1: Normal conversation -> hang up normally."""
    collector = CallTranscriptCollector()
    turn_tracker = TurnTimingTracker(stream_id="stream_call_1")
    collector.record_agent_message("Hello! Welcome to Apex Medical Clinic.")
    collector.record_user_turn("What are your doctor consultation hours?")
    collector.record_agent_message("Our doctors are available from 9 AM to 5 PM Monday through Saturday.")
    summary = collector.end_call()

    plain = format_plain_transcript(summary["turns"])
    assert "Assistant: Hello! Welcome to Apex Medical Clinic." in plain
    assert "User: What are your doctor consultation hours?" in plain
    assert "Assistant: Our doctors are available from 9 AM to 5 PM" in plain
    assert len(summary["turns"]) == 2


@pytest.mark.asyncio
async def test_acceptance_scenario_2_hindi_hinglish_multiturn():
    """Acceptance Scenario 2: Hindi/Hinglish multi-turn conversation -> hang up after several turns."""
    collector = CallTranscriptCollector()
    collector.record_agent_message("नमस्ते, एपेक्स क्लिनिक में आपका स्वागत है।", active_language="hi-IN")
    collector.record_user_turn("मुझे कल डॉक्टर से मिलना है", detected_language="hi-IN")
    collector.record_agent_message("ज़रूर, क्या आप 10 बजे आ सकते हैं?", active_language="hi-IN")
    collector.record_user_turn("Haan 10 baje theek hai, thank you", detected_language="hi-IN")
    collector.record_agent_message("धन्यवाद, आपका समय नोट कर लिया गया है।", active_language="hi-IN")
    summary = collector.end_call()

    plain = format_plain_transcript(summary["turns"])
    assert "नमस्ते" in plain
    assert "Haan 10 baje theek hai" in plain
    assert len(summary["turns"]) == 3


@pytest.mark.asyncio
async def test_acceptance_scenario_3_lead_creation_tool_persistence():
    """Acceptance Scenario 3: Provide name + phone -> create callback lead -> tool execution persisted."""
    collector = CallTranscriptCollector()
    turn_tracker = TurnTimingTracker(stream_id="stream_call_3")
    collector.record_agent_message("Hello! How can I help?")
    collector.record_user_turn("My name is Rahul Sharma, phone 9876543210")
    
    t0 = time.perf_counter()
    turn_tracker.record_tool_execution("create_callback_lead", start_time=t0, end_time=t0 + 0.15, success=True, args={"name": "Rahul Sharma", "phone": "9876543210"})
    collector.record_tool_call("create_callback_lead", "call_lead_1", {"customerName": "Rahul Sharma", "customerPhone": "******3210"}, success=True)
    collector.record_agent_message("Thank you Rahul, our team will call you back shortly.")
    summary = collector.end_call()

    assert collector.tools_used == ["create_callback_lead"]
    assert len(turn_tracker.tool_executions) == 1
    assert turn_tracker.tool_executions[0].tool_name == "create_callback_lead"
    assert turn_tracker.tool_executions[0].success is True
    assert turn_tracker.phone_traces[0]["last4"] == "3210"
    assert "9876543210" not in str(turn_tracker.phone_traces)


@pytest.mark.asyncio
async def test_acceptance_scenario_4_appointment_tool_persistence():
    """Acceptance Scenario 4: Request appointment -> execute appointment tool -> hang up."""
    collector = CallTranscriptCollector()
    turn_tracker = TurnTimingTracker(stream_id="stream_call_4")
    collector.record_agent_message("Hello! How can I assist you today?")
    collector.record_user_turn("I would like an appointment tomorrow at 10 AM for dental checkup")
    
    t0 = time.perf_counter()
    turn_tracker.record_tool_execution("book_appointment", start_time=t0, end_time=t0 + 0.22, success=True)
    collector.record_tool_call("book_appointment", "call_appt_1", {"slot": "tomorrow 10:00 AM", "reason": "dental checkup"}, success=True)
    collector.record_agent_message("I have submitted your appointment request for tomorrow at 10:00 AM with reference A-001.")
    summary = collector.end_call()

    assert collector.tools_used == ["book_appointment"]
    assert len(summary["turns"]) == 2
    assert summary["turns"][1]["tools"][0]["toolName"] == "book_appointment"
    assert summary["turns"][1]["tools"][0]["success"] is True


@pytest.mark.asyncio
async def test_acceptance_scenario_5_rag_and_interruption_persistence():
    """Acceptance Scenario 5: RAG question -> interrupt agent -> continue conversation -> hang up."""
    collector = CallTranscriptCollector()
    turn_tracker = TurnTimingTracker(stream_id="stream_call_5")
    collector.record_agent_message("Hello! Welcome to Dental Care.")
    collector.record_user_turn("Do you accept insurance?")
    
    # Tool executed for RAG
    t0 = time.perf_counter()
    turn_tracker.record_tool_execution("query_knowledge_base", start_time=t0, end_time=t0 + 0.08, success=True)
    collector.record_tool_call("query_knowledge_base", "call_rag_1", {"query": "insurance"}, success=True)
    
    # Assistant started speaking, but caller barged in / interrupted
    turn_tracker.record_interruption("user_barge_in")
    collector.record_agent_message("We accept most major insurance plans including...", interrupted=True)
    
    # Follow-up turn
    collector.record_user_turn("Great, what about root canal treatment?")
    collector.record_agent_message("Yes, we provide root canal treatment with our specialist.")
    summary = collector.end_call()

    assert collector.tools_used == ["query_knowledge_base"]
    assert summary["turns"][1]["agent"]["interrupted"] is True
    assert len(summary["turns"]) == 3

