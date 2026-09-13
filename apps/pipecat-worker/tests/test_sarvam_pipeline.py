"""Automated tests for Phase 2: Pipecat + Sarvam STT/TTS Voice Pipeline."""

import asyncio
import os
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import DeterministicTestEchoProcessor, app
from pipecat.processors.frame_processor import FrameDirection
from pipecat.frames.frames import (
    TextFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.serializers.plivo import PlivoFrameSerializer
from pipecat.services.sarvam.stt import SarvamRealtimeSTTService, SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService


@pytest.fixture
def client():
    return TestClient(app)


def test_pipecat_sarvam_imports():
    """Verify all required Pipecat and Sarvam modules import successfully."""
    import pipecat
    import sarvamai
    assert pipecat.__version__ == "1.8.1"
    assert hasattr(SarvamRealtimeSTTService, "run_stt")
    assert hasattr(SarvamSTTService, "run_stt")
    assert hasattr(SarvamTTSService, "run_tts")


def test_sarvam_realtime_stt_instantiation():
    """Verify SarvamRealtimeSTTService instantiates cleanly with saaras:v3-realtime model and fast stream_type."""
    stt = SarvamRealtimeSTTService(
        api_key="test-api-key",
        sample_rate=8000,
        settings=SarvamRealtimeSTTService.Settings(
            model="saaras:v3-realtime",
            language_code="en-IN",
            stream_type="fast",
        ),
        endpointing="vad",
    )
    assert stt._settings.model == "saaras:v3-realtime"
    assert stt._settings.stream_type == "fast"
    assert stt._endpointing == "vad"
    assert stt._init_sample_rate == 8000


def test_sarvam_tts_instantiation():
    """Verify SarvamTTSService instantiates cleanly with bulbul:v3 model and test voice."""
    tts = SarvamTTSService(
        api_key="test-api-key",
        settings=SarvamTTSService.Settings(model="bulbul:v3", voice="shubh"),
    )
    assert tts._settings.model == "bulbul:v3"
    assert tts._settings.voice == "shubh"


@pytest.mark.asyncio
async def test_deterministic_echo_processor_transcription_transformation():
    """Verify DeterministicTestEchoProcessor converts TranscriptionFrame to TTSSpeakFrame."""
    pushed_frames = []
    
    processor = DeterministicTestEchoProcessor()
    
    # Simulate processing a transcription frame
    input_frame = TranscriptionFrame(
        text="Hello world",
        user_id="caller_123",
        timestamp="2026-09-09T18:00:00Z",
    )
    
    # Intercept push_frame
    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)
        
    processor.push_frame = mock_push_frame
    
    await processor.process_frame(input_frame, FrameDirection.DOWNSTREAM)
    
    assert len(pushed_frames) == 1
    speak_frame = pushed_frames[0]
    assert isinstance(speak_frame, TTSSpeakFrame)
    assert speak_frame.text == "आपने कहा: Hello world"


@pytest.mark.asyncio
async def test_deterministic_echo_processor_ignores_empty_text():
    """Verify DeterministicTestEchoProcessor ignores empty or whitespace transcription."""
    pushed_frames = []
    processor = DeterministicTestEchoProcessor()
    
    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)
        
    processor.push_frame = mock_push_frame
    
    # Process empty transcription
    input_frame = TranscriptionFrame(
        text="   ",
        user_id="caller_123",
        timestamp="2026-09-09T18:00:00Z",
    )
    await processor.process_frame(input_frame, FrameDirection.DOWNSTREAM)
    
    # No TTSSpeakFrame should be generated
    assert not any(isinstance(f, TTSSpeakFrame) for f in pushed_frames)


def test_pipeline_assembly():
    """Verify full Pipecat pipeline constructs and links processors without errors."""
    stt = SarvamRealtimeSTTService(
        api_key="test-api-key",
        sample_rate=8000,
        settings=SarvamRealtimeSTTService.Settings(
            model="saaras:v3-realtime",
            language_code="en-IN",
            stream_type="fast",
        ),
        endpointing="vad",
    )
    echo = DeterministicTestEchoProcessor()
    tts = SarvamTTSService(
        api_key="test-api-key",
        settings=SarvamTTSService.Settings(model="bulbul:v3", voice="shubh"),
    )
    
    pipeline = Pipeline([
        stt,
        echo,
        tts,
    ])
    
    worker = PipelineWorker(pipeline, params=PipelineParams(allow_interruptions=False))
    assert worker is not None
    # Pipeline contains: Source, STT, Echo, TTS, Sink
    assert len(pipeline.processors) >= 3


def test_health_check_phase2(client):
    """Test health endpoint reports Phase 2/3 models and status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["phase"].startswith("phase-")
    assert data["stt_model"] == "saaras:v3-realtime"
    assert data["tts_model"] == "bulbul:v3"
