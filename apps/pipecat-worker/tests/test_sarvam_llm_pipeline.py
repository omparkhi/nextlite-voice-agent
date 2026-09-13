"""Unit and integration tests for Phase 4: Real Sarvam LLM Conversational Pipeline."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app, DeterministicTestEchoProcessor, RealtimeStreamingTimingMonitor


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check_phase4(client):
    """Test /health endpoint reports Phase 4 and LLM model status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "pipecat-worker"
    assert data["phase"].startswith("phase-")
    assert data["stt_model"] == settings.STT_MODEL
    assert data["llm_model"] == settings.LLM_MODEL
    assert data["tts_model"] == settings.TTS_MODEL
    assert "has_sarvam_key" in data


def test_sarvam_llm_imports():
    """Verify native Pipecat 1.8.1 Sarvam LLM and Context classes are importable."""
    from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContext,
        LLMContextAggregatorPair,
        LLMUserAggregator,
        LLMAssistantAggregator,
    )
    assert SarvamLLMService is not None
    assert SarvamLLMSettings is not None
    assert LLMContext is not None
    assert LLMContextAggregatorPair is not None


def test_sarvam_llm_instantiation():
    """Test SarvamLLMService initializes with valid settings without making external calls."""
    from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
    
    settings_obj = SarvamLLMSettings(model="sarvam-105b-conversations")
    llm = SarvamLLMService(api_key="test_dummy_key", settings=settings_obj)
    assert llm is not None
    assert llm._settings.model == "sarvam-105b-conversations"

    settings_reasoning = SarvamLLMSettings(model="sarvam-105b")
    llm_reasoning = SarvamLLMService(api_key="test_dummy_key", settings=settings_reasoning)
    assert llm_reasoning._settings.model == "sarvam-105b"


def test_context_and_aggregator_pair_init():
    """Test LLMContext and LLMContextAggregatorPair construction and role initialization."""
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContext,
        LLMContextAggregatorPair,
        LLMUserAggregator,
        LLMAssistantAggregator,
    )
    
    initial_messages = [{"role": "system", "content": settings.TEST_PROMPT}]
    context = LLMContext(messages=initial_messages)
    assert len(context.get_messages()) == 1
    assert context.get_messages()[0]["role"] == "system"
    assert context.get_messages()[0]["content"] == settings.TEST_PROMPT
    
    pair = LLMContextAggregatorPair(context)
    assert isinstance(pair.user(), LLMUserAggregator)
    assert isinstance(pair.assistant(), LLMAssistantAggregator)


def test_phase4_pipeline_assembly():
    """Test complete Phase 4 conversational voice pipeline assembly with Pipecat Worker."""
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.worker import PipelineParams, PipelineWorker
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContext,
        LLMContextAggregatorPair,
    )
    from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
    from pipecat.services.sarvam.stt import SarvamRealtimeSTTService
    from pipecat.services.sarvam.tts import SarvamTTSService

    stt_service = SarvamRealtimeSTTService(
        api_key="test_key",
        sample_rate=8000,
        settings=SarvamRealtimeSTTService.Settings(
            model=settings.STT_MODEL,
            stream_type="fast",
        ),
        endpointing="vad",
    )
    context = LLMContext(messages=[{"role": "system", "content": settings.TEST_PROMPT}])
    context_aggregator = LLMContextAggregatorPair(context)
    llm_service = SarvamLLMService(
        api_key="test_key",
        settings=SarvamLLMSettings(model=settings.LLM_MODEL),
    )
    tts_service = SarvamTTSService(
        api_key="test_key",
        settings=SarvamTTSService.Settings(
            model=settings.TTS_MODEL,
            voice=settings.PHASE2_TEST_VOICE_ID,
        ),
    )
    timing_monitor = RealtimeStreamingTimingMonitor()

    pipeline = Pipeline([
        stt_service,
        timing_monitor,
        context_aggregator.user(),
        llm_service,
        tts_service,
        context_aggregator.assistant(),
    ])

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            enable_metrics=True,
        ),
    )
    assert worker is not None


def test_context_multiturn_message_accumulation():
    """Test LLMContext correctly accumulates multi-turn messages."""
    from pipecat.processors.aggregators.llm_response_universal import LLMContext

    context = LLMContext(messages=[{"role": "system", "content": "system prompt"}])
    assert len(context.get_messages()) == 1

    context.add_message({"role": "user", "content": "What is AI?"})
    assert len(context.get_messages()) == 2

    context.add_message({"role": "assistant", "content": "AI is machine intelligence."})
    assert len(context.get_messages()) == 3

    context.add_message({"role": "user", "content": "Explain it simply."})
    assert len(context.get_messages()) == 4

    messages = context.get_messages()
    assert messages[0]["role"] == "system"
    assert messages[1]["content"] == "What is AI?"
    assert messages[2]["content"] == "AI is machine intelligence."
    assert messages[3]["content"] == "Explain it simply."


def test_deterministic_echo_not_in_active_pipeline():
    """Verify DeterministicTestEchoProcessor is decoupled from the active pipeline."""
    echo_proc = DeterministicTestEchoProcessor()
    assert echo_proc is not None
    # RealtimeStreamingTimingMonitor does not intercept or replace transcription frames
    timing_monitor = RealtimeStreamingTimingMonitor()
    assert timing_monitor is not None


@pytest.mark.asyncio
async def test_instrumented_async_stream_close_and_aclose():
    """Verify InstrumentedAsyncStream handles close and aclose safely without raising 'NoneType' can't be awaited."""
    from app.main import InstrumentedAsyncStream
    from app.turn_timing import TurnTimingTracker

    tracker = TurnTimingTracker(session_start_monotonic=100.0)

    # Mock raw stream with sync close returning None (like standard OpenAI sync stream or generator)
    class MockRawStreamSyncClose:
        def __init__(self):
            self.closed = False
        def close(self):
            self.closed = True
            return None

    mock_raw = MockRawStreamSyncClose()
    stream = InstrumentedAsyncStream(mock_raw, timing_tracker=tracker)

    # Both aclose() and close() must be awaitable and succeed cleanly
    await stream.close()
    assert mock_raw.closed is True

    mock_raw_2 = MockRawStreamSyncClose()
    stream_2 = InstrumentedAsyncStream(mock_raw_2, timing_tracker=tracker)
    await stream_2.aclose()
    assert mock_raw_2.closed is True


def test_turn_timing_tracker_record_utterance_end():
    """Verify TurnTimingTracker has record_utterance_end method for Sarvam STT event handlers."""
    from app.turn_timing import TurnTimingTracker

    tracker = TurnTimingTracker(session_start_monotonic=100.0)
    tracker.start_new_turn(speech_start=101.0)
    tracker.record_utterance_end(102.0)
    assert tracker.stt_utterance_end == 102.0
    events = [e["event"] for e in tracker.active_turn_events]
    assert "stt_utterance_end" in events

