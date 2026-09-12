"""Phase 19B Regression Tests: Sarvam TTS Connection Race Fix & Greeting Telemetry Attribution.

Covers:
TEST 1: TTS prewarm code is absent in main.py.
TEST 2: Only Pipecat-native TTS lifecycle performs connection.
TEST 3: tts_ready records first timestamp.
TEST 4: Second on_connected event does NOT overwrite tts_ready.
TEST 5: Greeting first audio is recorded from greeting context.
TEST 6: Later conversational audio does NOT populate greeting_first_audio.
TEST 7: Greeting with zero audio does NOT fall through to later turn audio.
TEST 8: Exactly one SarvamTTSService instance per call.
TEST 9: No duplicate manual websocket connection.
"""

import ast
import inspect
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from pipecat.frames.frames import (
    Frame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    TTSSpeakFrame,
    LLMTextFrame,
)
from pipecat.processors.frame_processor import FrameDirection

from app.turn_timing import StartupTimingTracker, TurnTimingTracker
from app.main import RealtimeStreamingTimingMonitor
import app.main as main_module


# ============================================================================
# TEST 1: TTS prewarm code is absent
# ============================================================================
def test_tts_prewarm_code_is_absent():
    """Verify that manual tts_service._connect() and prewarm task are completely absent."""
    main_source = inspect.getsource(main_module)

    # Must NOT contain manual background _connect()
    assert "tts_service._connect()" not in main_source, (
        "Found manual 'tts_service._connect()' in main.py! Manual prewarm must be removed."
    )
    assert "asyncio.create_task(tts_service._connect())" not in main_source, (
        "Found 'asyncio.create_task(tts_service._connect())' in main.py! Manual prewarm must be removed."
    )
    assert "tts_connect_task" not in main_source, (
        "Found 'tts_connect_task' in main.py! Uncoordinated prewarm task must be removed."
    )


# ============================================================================
# TEST 2: Only Pipecat-native TTS lifecycle performs connection
# ============================================================================
def test_only_pipecat_native_lifecycle_performs_connection():
    """Verify that TTS connection is delegated exclusively to Pipecat pipeline runner setup."""
    tree = ast.parse(inspect.getsource(main_module))

    # Inspect all Call nodes in AST of main.py
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == "_connect":
                pytest.fail("Private '_connect' call found in main.py AST! Application code must not call private service lifecycle methods.")


# ============================================================================
# TEST 3: tts_ready records first timestamp
# ============================================================================
def test_tts_ready_records_first_timestamp():
    """Verify that tts_ready correctly records the initial connection timestamp."""
    tracker = StartupTimingTracker(stream_id="stream-test-19b-1")
    t0 = 1000.5

    tracker.record_stage("tts_ready", t0)
    assert tracker.tts_ready == pytest.approx(t0)
    assert tracker.tts_connected == pytest.approx(t0)

    # Test reverse order as well
    tracker2 = StartupTimingTracker(stream_id="stream-test-19b-2")
    tracker2.record_stage("tts_connected", t0)
    assert tracker2.tts_ready == pytest.approx(t0)
    assert tracker2.tts_connected == pytest.approx(t0)


# ============================================================================
# TEST 4: Second on_connected event does NOT overwrite tts_ready
# ============================================================================
def test_second_on_connected_does_not_overwrite_tts_ready():
    """Verify that subsequent reconnects (on_connected) latch and do not overwrite startup tts_ready."""
    tracker = StartupTimingTracker(stream_id="stream-test-19b-3")
    t_initial = 100.0
    t_reconnect = 125.0  # 25 seconds later

    # Initial connection
    tracker.record_stage("tts_ready", t_initial)
    tracker.record_stage("tts_connected", t_initial)
    assert tracker.tts_ready == pytest.approx(t_initial)
    assert tracker.tts_connected == pytest.approx(t_initial)

    # Reconnect event fires mid-call
    tracker.record_stage("tts_ready", t_reconnect)
    tracker.record_stage("tts_connected", t_reconnect)

    # Startup metric MUST remain latched to initial connection
    assert tracker.tts_ready == pytest.approx(t_initial), (
        f"tts_ready was overwritten by reconnect! Expected {t_initial}, got {tracker.tts_ready}"
    )
    assert tracker.tts_connected == pytest.approx(t_initial), (
        f"tts_connected was overwritten by reconnect! Expected {t_initial}, got {tracker.tts_connected}"
    )


# ============================================================================
# TEST 5: Greeting first audio is recorded from greeting context
# ============================================================================
@pytest.mark.asyncio
async def test_greeting_first_audio_recorded_from_greeting_context():
    """Verify greeting first audio correctly populates startup telemetry during active greeting."""
    startup_tracker = StartupTimingTracker(stream_id="stream-test-19b-5")
    turn_tracker = TurnTimingTracker(stream_id="stream-test-19b-5")
    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
    )
    monitor.push_frame = AsyncMock()

    t_queue = 10.0
    t_start = 10.5
    t_audio = 10.9
    t_stop = 12.0

    # Start greeting context
    turn_tracker.record_greeting_start(t_queue)
    startup_tracker.record_stage("greeting_queued", t_queue)

    # 1. TTSStartedFrame
    with patch("time.perf_counter", return_value=t_start):
        await monitor.process_frame(TTSStartedFrame(), FrameDirection.DOWNSTREAM)
    assert startup_tracker.greeting_tts_started == pytest.approx(t_start)
    assert turn_tracker.greeting_tts_started == pytest.approx(t_start)

    # 2. TTSAudioRawFrame
    with patch("time.perf_counter", return_value=t_audio):
        await monitor.process_frame(
            TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=16000, num_channels=1),
            FrameDirection.DOWNSTREAM,
        )
    assert startup_tracker.first_greeting_audio == pytest.approx(t_audio)
    assert startup_tracker.greeting_first_audio == pytest.approx(t_audio)
    assert turn_tracker.greeting_first_audio == pytest.approx(t_audio)

    # 3. TTSStoppedFrame
    with patch("time.perf_counter", return_value=t_stop):
        await monitor.process_frame(TTSStoppedFrame(), FrameDirection.DOWNSTREAM)
    assert startup_tracker.greeting_completed == pytest.approx(t_stop)
    assert turn_tracker.greeting_completed == pytest.approx(t_stop)
    assert turn_tracker.turn_type == "user_turn"


# ============================================================================
# TEST 6: Later conversational audio does NOT populate greeting_first_audio
# ============================================================================
@pytest.mark.asyncio
async def test_later_conversational_audio_does_not_populate_greeting_first_audio():
    """Verify that Turn 1 conversational audio cannot overwrite or populate greeting audio metrics."""
    startup_tracker = StartupTimingTracker(stream_id="stream-test-19b-6")
    turn_tracker = TurnTimingTracker(stream_id="stream-test-19b-6")
    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
    )
    monitor.push_frame = AsyncMock()

    t_greet_queue = 10.0
    t_greet_audio = 11.0
    t_greet_stop = 12.0

    # Execute successful greeting
    turn_tracker.record_greeting_start(t_greet_queue)
    startup_tracker.record_stage("greeting_queued", t_greet_queue)
    with patch("time.perf_counter", return_value=t_greet_audio):
        await monitor.process_frame(
            TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=16000, num_channels=1),
            FrameDirection.DOWNSTREAM,
        )
    with patch("time.perf_counter", return_value=t_greet_stop):
        await monitor.process_frame(TTSStoppedFrame(), FrameDirection.DOWNSTREAM)

    # Now simulate Turn 1 (conversational turn) 10 seconds later
    t_turn1_audio = 22.0
    t_turn1_stop = 24.0

    turn_tracker.start_new_turn(speech_start=15.0, turn_type="user_turn")
    assert turn_tracker.turn_type == "user_turn"

    # Turn 1 TTS audio arrives
    with patch("time.perf_counter", return_value=t_turn1_audio):
        await monitor.process_frame(
            TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=16000, num_channels=1),
            FrameDirection.DOWNSTREAM,
        )

    # Verification: greeting timestamps must NOT have been changed by Turn 1
    assert startup_tracker.first_greeting_audio == pytest.approx(t_greet_audio), (
        f"Greeting first audio was overwritten by Turn 1 audio! Got {startup_tracker.first_greeting_audio}"
    )
    assert turn_tracker.first_tts_audio == pytest.approx(t_turn1_audio)


# ============================================================================
# TEST 7: Greeting with zero audio does NOT fall through to later turn audio
# ============================================================================
@pytest.mark.asyncio
async def test_greeting_with_zero_audio_does_not_fall_through():
    """Verify that if greeting fails/drops with zero audio frames, later turn audio does NOT substitute it."""
    startup_tracker = StartupTimingTracker(stream_id="stream-test-19b-7")
    turn_tracker = TurnTimingTracker(stream_id="stream-test-19b-7")
    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        startup_tracker=startup_tracker,
    )
    monitor.push_frame = AsyncMock()

    t_greet_queue = 10.0
    t_greet_start = 10.5
    t_greet_stop = 13.5  # Stopped without ANY TTSAudioRawFrame

    turn_tracker.record_greeting_start(t_greet_queue)
    startup_tracker.record_stage("greeting_queued", t_greet_queue)

    # TTS starts for greeting
    with patch("time.perf_counter", return_value=t_greet_start):
        await monitor.process_frame(TTSStartedFrame(), FrameDirection.DOWNSTREAM)

    # ZERO audio frames produced; TTS stops (timeout / failure)
    with patch("time.perf_counter", return_value=t_greet_stop):
        await monitor.process_frame(TTSStoppedFrame(), FrameDirection.DOWNSTREAM)

    # Verify greeting first audio is None (not invented)
    assert startup_tracker.first_greeting_audio is None
    assert startup_tracker.greeting_first_audio is None
    assert startup_tracker.greeting_completed == pytest.approx(t_greet_stop)
    assert startup_tracker.caller_ready == pytest.approx(t_greet_stop)

    # Now Turn 1 executes 20 seconds later
    t_turn1_audio = 32.0
    with patch("time.perf_counter", return_value=t_turn1_audio):
        await monitor.process_frame(
            TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=16000, num_channels=1),
            FrameDirection.DOWNSTREAM,
        )

    # CRITICAL: Turn 1 audio MUST NOT have populated first_greeting_audio!
    assert startup_tracker.first_greeting_audio is None, (
        f"Turn 1 audio fell through to populate first_greeting_audio! Got {startup_tracker.first_greeting_audio}"
    )
    assert startup_tracker.greeting_first_audio is None

    # Verify breakdown reports greeting latency as None (unavailable/failed), NOT 32 seconds!
    breakdown = startup_tracker.calculate_breakdown()
    assert breakdown["pickupToFirstGreetingAudioMs"] is None
    assert breakdown["greetingQueuedToFirstAudioMs"] is None


# ============================================================================
# TEST 8: Exactly one SarvamTTSService instance per call
# ============================================================================
def test_one_sarvam_tts_service_instance_per_call():
    """Verify that exactly one SarvamTTSService is instantiated per call session."""
    main_source = inspect.getsource(main_module)

    # Count occurrences of SarvamTTSService constructor call in main.py
    constructor_count = main_source.count("SarvamTTSService(")
    assert constructor_count == 1, (
        f"Expected exactly 1 SarvamTTSService instantiation in main.py, found {constructor_count}"
    )


# ============================================================================
# TEST 9: No duplicate manual websocket connection
# ============================================================================
def test_no_duplicate_manual_websocket_connection():
    """Verify that SarvamTTSService connects only when setup() is called by Pipecat."""
    main_source = inspect.getsource(main_module)

    # Verify no websockets.connect or private _connect calls exist in main.py
    assert "websockets.connect" not in main_source
    assert "._connect()" not in main_source
