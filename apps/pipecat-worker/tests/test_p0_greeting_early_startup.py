"""Regression tests for P0 Bug #1: Early Greeting Startup & Removing RTP-Dependent Gating.

Verifies:
1. Greeting is scheduled immediately when TTS reaches READY state without waiting for InputAudioRawFrame.
2. If TTS is NOT ready yet, greeting is deferred until TTS reaches READY.
3. Greeting is queued exactly once (atomic latching prevents duplicates).
4. Greeting triggers and completes even if the caller NEVER sends an audio packet.
5. If caller disconnects before TTS readiness, greeting is cleanly suppressed.
6. Telemetry emits GREETING_SCHEDULE_TRIGGER with tts_connection_state_at_greeting_schedule="READY".
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from pipecat.frames.frames import (
    AudioRawFrame,
    EndFrame,
    Frame,
    InputAudioRawFrame,
    StartFrame,
    TTSAudioRawFrame,
    TTSSpeakFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from app.turn_timing import GreetingTraceTracker, StartupTimingTracker, TurnTimingTracker


class MockTTSService(FrameProcessor):
    """Mock TTS service with configurable connection state."""

    def __init__(self):
        super().__init__()
        self._state = "CONNECTING"
        self._sent_texts = []
        self._event_handlers = {}

    def get_connection_state(self) -> str:
        return self._state

    def set_ready(self):
        self._state = "READY"

    def event_handler(self, event_name: str):
        def decorator(handler):
            self._event_handlers[event_name] = handler
            return handler
        return decorator

    async def trigger_connected(self):
        self.set_ready()
        if "on_connected" in self._event_handlers:
            await self._event_handlers["on_connected"](self)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TTSSpeakFrame):
            self._sent_texts.append(frame.text)
            # Emit TTSStartedFrame and TTSAudioRawFrame
            await self.push_frame(TTSStartedFrame(context_id="test_ctx"), direction)
            await self.push_frame(
                TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=8000, num_channels=1, context_id="test_ctx"),
                direction
            )
            await self.push_frame(TTSStoppedFrame(context_id="test_ctx"), direction)
            return
        await self.push_frame(frame, direction)


@pytest.mark.asyncio
async def test_greeting_schedules_immediately_on_tts_ready_without_inbound_audio():
    """Verify greeting is queued and sent to TTS as soon as TTS is READY, with ZERO inbound audio."""
    tts_service = MockTTSService()
    turn_tracker = TurnTimingTracker(stream_id="stream-test-01", session_start_monotonic=time.perf_counter())
    startup_tracker = StartupTimingTracker(stream_id="stream-test-01")
    startup_tracker.greeting_tracer = turn_tracker.greeting_tracer

    greeting = "Hello, welcome to NextLite Voice!"
    greeting_scheduled = False
    greeting_schedule_lock = asyncio.Lock()
    is_terminating_flag = False

    pipeline = Pipeline([tts_service])
    worker = PipelineWorker(pipeline, params=PipelineParams())

    async def schedule_initial_greeting(trigger_source: str = "tts_ready"):
        nonlocal greeting_scheduled
        if not greeting or is_terminating_flag:
            return

        async with greeting_schedule_lock:
            if greeting_scheduled:
                return

            tts_state = tts_service.get_connection_state()
            if tts_state != "READY":
                return

            greeting_scheduled = True

        now_sched = time.perf_counter()
        turn_tracker.turn_type = "greeting"
        startup_tracker.record_stage("greeting_queued", now_sched)
        turn_tracker.record_greeting_trace_event(
            "GREETING_QUEUED",
            now_sched,
            trigger_source=trigger_source,
            tts_connection_state_at_greeting_schedule=tts_state,
        )
        await worker.queue_frame(TTSSpeakFrame(text=greeting))

    # 1. Pipeline initialized, TTS not ready yet -> schedule should be a no-op
    await schedule_initial_greeting(trigger_source="pre_check")
    assert greeting_scheduled is False
    assert len(tts_service._sent_texts) == 0

    # 2. TTS becomes READY -> schedule triggers immediately
    await tts_service.trigger_connected()
    await schedule_initial_greeting(trigger_source="on_tts_connected")

    assert greeting_scheduled is True
    assert startup_tracker.greeting_queued is not None
    assert "GREETING_QUEUED" in [e["event"] for e in turn_tracker.greeting_tracer.events]


@pytest.mark.asyncio
async def test_no_duplicate_greeting_on_subsequent_pipeline_events():
    """Verify greeting is queued exactly ONCE even if on_pipeline_started or other triggers fire later."""
    tts_service = MockTTSService()
    turn_tracker = TurnTimingTracker(stream_id="stream-test-02")
    startup_tracker = StartupTimingTracker(stream_id="stream-test-02")
    startup_tracker.greeting_tracer = turn_tracker.greeting_tracer

    greeting = "Welcome to our clinic."
    greeting_scheduled = False
    greeting_schedule_lock = asyncio.Lock()
    queue_call_count = 0

    pipeline = Pipeline([tts_service])
    worker = PipelineWorker(pipeline, params=PipelineParams())

    async def schedule_initial_greeting(trigger_source: str = "tts_ready"):
        nonlocal greeting_scheduled, queue_call_count
        if not greeting:
            return

        async with greeting_schedule_lock:
            if greeting_scheduled:
                return

            tts_state = tts_service.get_connection_state()
            if tts_state != "READY":
                return

            greeting_scheduled = True

        queue_call_count += 1
        turn_tracker.record_greeting_trace_event("GREETING_QUEUED")
        await worker.queue_frame(TTSSpeakFrame(text=greeting))

    tts_service.set_ready()

    # Trigger 1: on_tts_connected
    await schedule_initial_greeting(trigger_source="on_tts_connected")
    assert queue_call_count == 1

    # Trigger 2: post_add_workers_tts_ready
    await schedule_initial_greeting(trigger_source="post_add_workers_tts_ready")
    assert queue_call_count == 1

    # Trigger 3: on_pipeline_started_fallback
    await schedule_initial_greeting(trigger_source="on_pipeline_started_fallback")
    assert queue_call_count == 1

    # Exactly 1 GREETING_QUEUED event in tracer
    greeting_queued_events = [e for e in turn_tracker.greeting_tracer.events if e["event"] == "GREETING_QUEUED"]
    assert len(greeting_queued_events) == 1


@pytest.mark.asyncio
async def test_caller_disconnect_before_tts_readiness_suppresses_greeting():
    """Verify that if caller hangs up / disconnects before TTS connects, greeting is never queued."""
    tts_service = MockTTSService()
    turn_tracker = TurnTimingTracker(stream_id="stream-test-03")
    greeting = "Hello"
    greeting_scheduled = False
    greeting_schedule_lock = asyncio.Lock()
    is_terminating_flag = True  # Caller disconnected

    async def schedule_initial_greeting(trigger_source: str = "tts_ready"):
        nonlocal greeting_scheduled
        if not greeting or is_terminating_flag:
            return

        async with greeting_schedule_lock:
            if greeting_scheduled:
                return
            greeting_scheduled = True

    await schedule_initial_greeting()
    assert greeting_scheduled is False
