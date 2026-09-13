"""Comprehensive unit and integration tests for SarvamRealtimeSTTService migration."""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.config import settings
from app.turn_timing import TurnTimingTracker
from app.main import RealtimeStreamingTimingMonitor
from pipecat.frames.frames import (
    Frame,
    InterimTranscriptionFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    ProposedUserStartedSpeakingFrame,
    ProposedUserStoppedSpeakingFrame,
    LLMContextFrame,
    LLMTextFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.workers.runner import WorkerRunner
from pipecat.processors.frame_processor import FrameDirection
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContext,
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.sarvam.stt import SarvamRealtimeSTTService, SarvamRealtimeSTTSettings
from pipecat.transcriptions.language import Language
from pipecat.turns.user_start import ExternalUserTurnStartStrategy
from pipecat.turns.user_stop import ExternalUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import ExternalUserTurnStrategies, UserTurnStrategies


def test_sarvam_realtime_stt_instantiation_and_settings():
    """Verify SarvamRealtimeSTTService instantiates with installed Pipecat 1.8.1 API and target settings."""
    service = SarvamRealtimeSTTService(
        api_key="mock-api-key",
        sample_rate=8000,
        settings=SarvamRealtimeSTTSettings(
            model="saaras:v3-realtime",
            language_code="hi-IN",
            stream_type="fast",
        ),
        endpointing="vad",
        ttfs_p99_latency=0.15,
    )
    assert service._settings.model == "saaras:v3-realtime"
    assert service._settings.stream_type == "fast"
    assert service._settings.language_code == "hi-IN"
    assert service._endpointing == "vad"
    assert service._init_sample_rate == 8000
    assert service._ttfs_p99_latency == 0.15


def test_sarvam_realtime_stt_service_metadata_frame():
    """Verify service_metadata_frame announces external user turn strategies under vad endpointing."""
    service = SarvamRealtimeSTTService(
        api_key="mock-api-key",
        sample_rate=8000,
        settings=SarvamRealtimeSTTSettings(
            model="saaras:v3-realtime",
            language_code="en-IN",
            stream_type="fast",
        ),
        endpointing="vad",
    )
    meta = service.service_metadata_frame()
    assert meta.user_turn_strategies is not None
    assert meta.user_turn_strategies.enable_interruptions is True


@pytest.mark.asyncio
async def test_timing_monitor_interim_transcription_frame_does_not_trigger_user_turn():
    """Verify InterimTranscriptionFrame is recorded as partial without finalizing user turn."""
    turn_tracker = TurnTimingTracker(stream_id="test_stream")
    timing_tracker = {}
    
    monitor = RealtimeStreamingTimingMonitor(
        timing_tracker=timing_tracker,
        turn_tracker=turn_tracker,
        primary_language="hi-IN",
    )
    
    # 1. User starts speaking
    await monitor.process_frame(ProposedUserStartedSpeakingFrame(), FrameDirection.DOWNSTREAM)
    assert turn_tracker.speech_start is not None
    assert turn_tracker.stt_first_partial is None
    assert turn_tracker.stt_final is None
    
    # 2. Interim partial transcript arrives
    partial_frame = InterimTranscriptionFrame(
        text="मुझे डॉक्टर",
        user_id="user",
        timestamp="2026-09-12T12:00:00Z",
        language=Language.HI_IN,
    )
    await monitor.process_frame(partial_frame, FrameDirection.DOWNSTREAM)
    
    assert turn_tracker.stt_first_partial is not None
    assert timing_tracker.get("last_stt_partial_time") is not None
    assert turn_tracker.stt_final is None
    assert turn_tracker.turn_complete is None
    
    # 3. Subsequent partial arrives (first partial timestamp preserved)
    first_partial_ts = turn_tracker.stt_first_partial
    partial_frame_2 = InterimTranscriptionFrame(
        text="मुझे डॉक्टर से बात करनी है",
        user_id="user",
        timestamp="2026-09-12T12:00:01Z",
        language=Language.HI_IN,
    )
    await monitor.process_frame(partial_frame_2, FrameDirection.DOWNSTREAM)
    assert turn_tracker.stt_first_partial == first_partial_ts


@pytest.mark.asyncio
async def test_partial_transcripts_do_not_trigger_llm_generation():
    """Verify ContextAggregator ignores InterimTranscriptionFrame and triggers LLM only on final turn."""
    user_params = LLMUserAggregatorParams(
        user_turn_strategies=ExternalUserTurnStrategies()
    )
    ctx = LLMContext(messages=[{"role": "system", "content": "You are a test assistant."}])
    pair = LLMContextAggregatorPair(ctx, user_params=user_params)
    user_aggregator = pair.user()
    assistant_aggregator = pair.assistant()

    pipeline = Pipeline([user_aggregator, assistant_aggregator])
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(audio_in_sample_rate=8000, audio_out_sample_rate=8000),
    )
    runner = WorkerRunner(handle_sigint=False, handle_sigterm=False)
    await runner.add_workers(worker)

    runner_task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.1)

    # 1. Proposed start speech arrives
    await worker.queue_frame(ProposedUserStartedSpeakingFrame())
    await asyncio.sleep(0.1)

    # 2. Interim partial transcripts arrive
    await worker.queue_frame(InterimTranscriptionFrame(text="Hello", user_id="user", timestamp="t1"))
    await asyncio.sleep(0.05)
    await worker.queue_frame(InterimTranscriptionFrame(text="Hello world", user_id="user", timestamp="t2"))
    await asyncio.sleep(0.1)

    # Verify no user message was committed to LLM context from partials
    messages = ctx.get_messages()
    assert len(messages) == 1, "Partial transcripts must NEVER commit user turns to LLMContext"
    assert messages[0]["role"] == "system"

    # 3. Proposed stop speech arrives (VAD speech stop)
    await worker.queue_frame(ProposedUserStoppedSpeakingFrame())
    await asyncio.sleep(0.1)

    # 4. Final TranscriptionFrame arrives
    await worker.queue_frame(TranscriptionFrame(text="Hello world I need help", user_id="user", timestamp="t3"))

    # Wait for turn aggregation
    for _ in range(35):
        await asyncio.sleep(0.1)
        messages = ctx.get_messages()
        if any(m.get("role") == "user" and m.get("content") == "Hello world I need help" for m in messages):
            break

    messages = ctx.get_messages()
    user_messages = [m for m in messages if m.get("role") == "user"]
    assert len(user_messages) == 1, "Exactly ONE user turn must be committed to LLMContext"
    assert user_messages[0]["content"] == "Hello world I need help"

    await runner.cancel()
    try:
        await asyncio.wait_for(runner_task, timeout=2.0)
    except Exception:
        pass


@pytest.mark.asyncio
async def test_dynamic_multilingual_language_configuration():
    """Verify dynamic language codes (hi-IN, mr-IN, en-IN) are accepted cleanly by SarvamRealtimeSTTService."""
    for lang in ["en-IN", "hi-IN", "mr-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN", "auto"]:
        service = SarvamRealtimeSTTService(
            api_key="mock-key",
            sample_rate=8000,
            settings=SarvamRealtimeSTTSettings(
                model="saaras:v3-realtime",
                language_code=lang,
                stream_type="fast",
            ),
            endpointing="vad",
        )
        assert service._settings.language_code == lang
        assert service._settings.model == "saaras:v3-realtime"
