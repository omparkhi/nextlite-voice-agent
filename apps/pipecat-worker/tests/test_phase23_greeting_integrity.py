#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Pipecat 1.8.1 Native Greeting Integrity & Startup Gate Test Suite (Phase 23).
#

import asyncio
import time
import pytest

from app.main import StartupGateProcessor, StartupState, RealtimeStreamingTimingMonitor
from app.turn_timing import TurnTimingTracker, StartupTimingTracker
from pipecat.processors.frame_processor import FrameDirection
from pipecat.frames.frames import (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    TTSSpeakFrame,
    InterruptionFrame,
    TranscriptionFrame,
    ProposedUserStartedSpeakingFrame,
    UserStartedSpeakingFrame,
)


@pytest.mark.asyncio
async def test_startup_gate_initial_state_with_greeting():
    """Verify StartupGateProcessor initializes in STARTING when greeting is configured."""
    gate = StartupGateProcessor(has_greeting=True, allow_interruptions=True)
    assert gate.state == StartupState.STARTING
    assert gate._suppressed_frame_count == 0


@pytest.mark.asyncio
async def test_startup_gate_initial_state_without_greeting():
    """Verify StartupGateProcessor initializes directly in READY_FOR_USER when no greeting is present."""
    gate = StartupGateProcessor(has_greeting=False, allow_interruptions=True)
    assert gate.state == StartupState.READY_FOR_USER


@pytest.mark.asyncio
async def test_startup_gate_suppresses_early_line_noise():
    """Verify early RTP audio frames arriving during STARTING and GREETING are suppressed."""
    gate = StartupGateProcessor(has_greeting=True, allow_interruptions=True)
    
    pushed_frames = []
    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)
    gate.push_frame = mock_push_frame

    # 1. During STARTING: early ambient noise is suppressed
    early_noise = InputAudioRawFrame(audio=b"\x00\x05" * 80, sample_rate=8000, num_channels=1)
    await gate.process_frame(early_noise, FrameDirection.DOWNSTREAM)
    assert len(pushed_frames) == 0
    assert gate._suppressed_frame_count == 1

    # 2. Transition to GREETING: pre-audio noise is still suppressed
    gate.set_greeting_active()
    assert gate.state == StartupState.GREETING
    await gate.process_frame(early_noise, FrameDirection.DOWNSTREAM)
    assert len(pushed_frames) == 0
    assert gate._suppressed_frame_count == 2

    # 3. First audio produced
    gate.set_greeting_first_audio()
    assert gate._greeting_first_audio_seen is True

    # 4. Greeting complete: transition to READY_FOR_USER
    gate.set_ready_for_user()
    assert gate.state == StartupState.READY_FOR_USER

    # 5. In READY_FOR_USER: caller audio passes freely
    caller_speech = InputAudioRawFrame(audio=b"\x10\x20" * 80, sample_rate=8000, num_channels=1)
    await gate.process_frame(caller_speech, FrameDirection.DOWNSTREAM)
    assert len(pushed_frames) == 1
    assert pushed_frames[0] == caller_speech


@pytest.mark.asyncio
async def test_startup_gate_suppresses_premature_interruption_frames():
    """Verify spurious InterruptionFrames from startup noise are suppressed before greeting audio."""
    gate = StartupGateProcessor(has_greeting=True, allow_interruptions=True)
    
    pushed_frames = []
    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)
    gate.push_frame = mock_push_frame

    # False VAD frames during STARTING
    await gate.process_frame(ProposedUserStartedSpeakingFrame(), FrameDirection.DOWNSTREAM)
    await gate.process_frame(UserStartedSpeakingFrame(), FrameDirection.DOWNSTREAM)
    await gate.process_frame(InterruptionFrame(), FrameDirection.DOWNSTREAM)
    assert len(pushed_frames) == 0

    # In READY_FOR_USER, InterruptionFrame passes through
    gate.set_ready_for_user()
    valid_interruption = InterruptionFrame()
    try:
        await gate.process_frame(valid_interruption, FrameDirection.DOWNSTREAM)
    except Exception:
        pass
    assert len(pushed_frames) >= 1
    assert any(isinstance(f, InterruptionFrame) for f in pushed_frames)


@pytest.mark.asyncio
async def test_timing_monitor_transitions_gate_on_greeting_audio_and_stop():
    """Verify RealtimeStreamingTimingMonitor transitions gate state on first audio and stop."""
    gate = StartupGateProcessor(has_greeting=True, allow_interruptions=True)
    gate.set_greeting_active()

    startup_tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=100.0)
    startup_tracker.record_stage("greeting_queued", ts=100.5)
    turn_tracker = TurnTimingTracker(stream_id="test_stream", session_start_monotonic=100.0)
    turn_tracker.record_greeting_start(ts=100.5)

    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
        startup_gate=gate,
    )
    pushed = []
    async def mock_push(frame, direction):
        pushed.append(frame)
    monitor.push_frame = mock_push

    # 1. First greeting audio chunk
    audio_frame = TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=24000, num_channels=1)
    await monitor.process_frame(audio_frame, FrameDirection.DOWNSTREAM)
    assert gate._greeting_first_audio_seen is True
    assert startup_tracker.first_greeting_audio is not None
    assert turn_tracker.greeting_first_audio is not None

    # 2. Greeting stopped frame
    stopped_frame = TTSStoppedFrame(context_id="greeting")
    await monitor.process_frame(stopped_frame, FrameDirection.DOWNSTREAM)
    assert gate.state == StartupState.READY_FOR_USER
    assert startup_tracker.greeting_completed is not None
    assert turn_tracker.greeting_completed is not None
    assert turn_tracker.turn_type == "user_turn"


def test_turn_timing_prevents_negative_tts_connection_duration():
    """Verify ttsConnectionMs never produces negative duration across multiple turns."""
    tracker = TurnTimingTracker(stream_id="test_stream", session_start_monotonic=100.0)
    tracker.record_speech_start(100.0)
    tracker.record_tts_connected(100.2)
    tracker.record_speech_stop(101.0)
    tracker.record_tts_start(101.5)
    tracker.record_first_tts_audio(101.9)
    tracker.record_turn_complete(102.5)

    m1 = tracker.calculate_metrics()
    assert m1["ttsConnectionMs"] == 200

    # Turn 2: Started at t=200.0 without a reconnect
    tracker.start_new_turn(speech_start=200.0)
    tracker.record_speech_stop(201.0)
    tracker.record_tts_start(201.5)
    tracker.record_first_tts_audio(201.9)
    tracker.record_turn_complete(202.5)

    m2 = tracker.calculate_metrics()
    assert m2["ttsConnectionMs"] is None  # Clean None, no negative warning!


def test_greeting_first_audio_idempotent_latch():
    """Verify greeting_first_audio is latched exactly once in StartupTimingTracker."""
    tracker = StartupTimingTracker(stream_id="test_stream", start_time_monotonic=10.0)
    t1 = 11.234
    t2 = 11.567
    tracker.record_stage("greeting_first_audio", ts=t1)
    assert tracker.greeting_first_audio == t1

    # Second arrival does not overwrite
    tracker.record_stage("greeting_first_audio", ts=t2)
    assert tracker.greeting_first_audio == t1
