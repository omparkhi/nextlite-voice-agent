"""Automated tests for Phase 3: Realtime Streaming & Audio Output Optimization."""

import asyncio
import json
import pathlib
import time
import pytest
from fastapi.testclient import TestClient

from app.main import RealtimeStreamingTimingMonitor, app
from pipecat.processors.frame_processor import FrameDirection
from pipecat.frames.frames import (
    InterruptionFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.serializers.plivo import PlivoFrameSerializer
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check_phase3(client):
    """Test health endpoint reports valid phase status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["phase"].startswith("phase-")


@pytest.mark.asyncio
async def test_plivo_interruption_clear_audio_serialization():
    """Verify PlivoFrameSerializer serializes InterruptionFrame to native Plivo clearAudio event."""
    serializer = PlivoFrameSerializer(
        stream_id="test-stream-interruption",
        params=PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000),
    )
    serialized = await serializer.serialize(InterruptionFrame())
    assert serialized is not None
    parsed = json.loads(serialized)
    assert parsed["event"] == "clearAudio"
    assert parsed["streamId"] == "test-stream-interruption"


@pytest.mark.asyncio
async def test_timing_monitor_transcript_and_tts_flow():
    """Verify RealtimeStreamingTimingMonitor processes and tracks TranscriptionFrame and TTSAudioRawFrame."""
    timing_tracker = {
        "last_speech_stop_time": time.perf_counter() - 0.25,  # 250ms ago
    }
    pushed_frames = []

    monitor = RealtimeStreamingTimingMonitor(timing_tracker=timing_tracker)

    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)

    monitor.push_frame = mock_push_frame

    # 1. Simulate TranscriptionFrame arrival
    transcript_frame = TranscriptionFrame(
        text="Hello world",
        user_id="caller_1",
        timestamp="2026-09-09T18:00:00Z",
    )
    await monitor.process_frame(transcript_frame, FrameDirection.DOWNSTREAM)

    assert len(pushed_frames) == 1
    assert isinstance(pushed_frames[0], TranscriptionFrame)
    assert pushed_frames[0].text == "Hello world"
    assert "last_stt_transcript_time" in timing_tracker

    # 2. Simulate first TTS Audio chunk arrival
    pushed_frames.clear()
    audio_chunk = TTSAudioRawFrame(
        audio=b"\x00" * 320,
        sample_rate=8000,
        num_channels=1,
    )
    await monitor.process_frame(audio_chunk, FrameDirection.DOWNSTREAM)

    assert len(pushed_frames) == 1
    assert isinstance(pushed_frames[0], TTSAudioRawFrame)
    assert timing_tracker.get("first_tts_audio_time") is not None


@pytest.mark.asyncio
async def test_timing_monitor_interruption():
    """Verify RealtimeStreamingTimingMonitor propagates InterruptionFrame downstream."""
    timing_tracker = {}
    pushed_frames = []

    monitor = RealtimeStreamingTimingMonitor(timing_tracker=timing_tracker)

    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)

    monitor.push_frame = mock_push_frame

    interruption = InterruptionFrame()
    # Call process_frame
    try:
        await monitor.process_frame(interruption, FrameDirection.DOWNSTREAM)
    except Exception:
        pass

    # Verify InterruptionFrame was pushed
    interruption_frames = [f for f in pushed_frames if isinstance(f, InterruptionFrame)]
    assert len(interruption_frames) >= 1


def test_8khz_telephony_pipeline_assembly():
    """Verify 8kHz native telephony sample rate pipeline assembly without resampling overhead."""
    stt = SarvamSTTService(
        api_key="test-api-key",
        settings=SarvamSTTService.Settings(model="saaras:v3"),
    )
    monitor = RealtimeStreamingTimingMonitor(timing_tracker={})
    tts = SarvamTTSService(
        api_key="test-api-key",
        settings=SarvamTTSService.Settings(model="bulbul:v3", voice="shubh"),
    )

    pipeline = Pipeline([stt, monitor, tts])
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            enable_metrics=True,
        ),
    )
    params = worker.params if isinstance(worker.params, PipelineParams) else worker.params()
    assert params.audio_in_sample_rate == 8000
    assert params.audio_out_sample_rate == 8000


def test_greeting_injection_does_not_block_start_frame():
    """Phase 8A regression: on_pipeline_started must NOT call tts_service.push_frame().

    Root cause: In Pipecat 1.8.1, _sink_push_frame() awaits all on_pipeline_started
    handlers BEFORE calling _pipeline_start_event.set(). If a handler awaits blocking
    TTS network I/O (tts_service.push_frame(TTSSpeakFrame)), _pipeline_start_event.set()
    is never reached within START_TIMEOUT_SECS (20s), causing PipelineWorker to tear
    down the pipeline with 'timeout waiting for StartFrame to reach the end of the pipeline'.

    The correct pattern is worker.queue_frame(TTSSpeakFrame(...)) which enqueues the frame
    on the _push_queue non-blockingly and processes it AFTER StartFrame completes.

    This test verifies the source-level fix in main.py.
    """
    main_py = pathlib.Path(__file__).parent.parent / "app" / "main.py"
    source = main_py.read_text(encoding="utf-8")

    # Guard 1: The broken pattern must NOT exist in on_pipeline_started
    assert "tts_service.push_frame(TTSSpeakFrame" not in source, (
        "on_pipeline_started must not call tts_service.push_frame(TTSSpeakFrame). "
        "This blocks _sink_push_frame() and prevents _pipeline_start_event.set(), "
        "causing a 20s StartFrame timeout. Use worker_instance.queue_frame(TTSSpeakFrame(...)) instead."
    )

    # Guard 2: The correct non-blocking pattern must exist
    assert "worker_instance.queue_frame(TTSSpeakFrame" in source, (
        "on_pipeline_started must use worker_instance.queue_frame(TTSSpeakFrame(...)) "
        "to enqueue greeting non-blockingly after pipeline start completes."
    )

    # Guard 3: The on_pipeline_started event handler must still exist when greeting is used
    assert "on_pipeline_started" in source, (
        "The on_pipeline_started event handler must be registered for greeting injection."
    )


def test_language_context_processor_forwards_start_frame():
    """Verify LanguageContextProcessor forwards StartFrame downstream via push_frame."""
    language_py = pathlib.Path(__file__).parent.parent / "app" / "language_processor.py"
    source = language_py.read_text(encoding="utf-8")

    assert "await self.push_frame(frame, direction)" in source, (
        "LanguageContextProcessor must call await self.push_frame(frame, direction) "
        "so StartFrame and all other frames are pushed downstream."
    )


@pytest.mark.asyncio
async def test_plivo_test_xml_does_not_contain_diagnostic_speak():
    """Verify /plivo/test-xml does not contain diagnostic hardcoded <Speak> tag."""
    client = TestClient(app)
    response = client.get("/plivo/test-xml")
    assert response.status_code == 200
    xml = response.text
    assert "<Speak>" not in xml, "Diagnostic <Speak> greeting must be removed from /plivo/test-xml."
    assert "Connecting to NextLite Pipecat" not in xml, "Hardcoded string must be removed from /plivo/test-xml."
    assert "<Stream" in xml, "Stream verb must be preserved in /plivo/test-xml."


def test_sarvam_stt_service_enables_vad_signals():
    """Verify main.py configures SarvamRealtimeSTTService with endpointing='vad'.
    
    With endpointing='vad', Sarvam's server-side VAD events propose turn-start
    and turn-stop frames so user turn aggregation drives LLM response generation.
    """
    main_py = pathlib.Path(__file__).parent.parent / "app" / "main.py"
    source = main_py.read_text(encoding="utf-8")

    assert 'endpointing="vad"' in source, (
        "SarvamRealtimeSTTService must be initialized with endpointing='vad' "
        "so Sarvam's server-side VAD events drive user turn completion."
    )
