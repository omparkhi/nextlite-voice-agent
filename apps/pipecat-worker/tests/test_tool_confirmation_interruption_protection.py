import pytest
import time
from unittest.mock import MagicMock
from pipecat.frames.frames import InterruptionFrame
from app.main import InstrumentedAsyncStream, DiagnosticPlivoFrameSerializer
from app.turn_timing import TurnTimingTracker


def test_has_pending_tool_activity_during_post_tool_tts():
    tracker = TurnTimingTracker("call_test_001")
    assert not tracker.has_pending_tool_activity()

    # Simulate tool call delta
    tracker.record_tool_call_delta()
    assert tracker.has_pending_tool_activity()

    # Simulate tool execution complete
    tracker.record_tool_execution("book_appointment", 0.0, 0.5, True)
    assert tracker.has_pending_tool_activity()

    # Simulate post-tool LLM output starting
    tracker.first_post_tool_llm_output = time.perf_counter()
    assert tracker.has_pending_tool_activity()

    # TTS is playing post-tool confirmation audio (tts_stop is still None)
    assert tracker.has_pending_tool_activity()

    # When TTS completes
    tracker.record_tts_stop()
    tracker.tool_call_delta = None
    tracker.tool_executions = []
    tracker.post_tool_llm_start = None
    assert not tracker.has_pending_tool_activity()


@pytest.mark.asyncio
async def test_instrumented_async_stream_clears_pre_tool_tokens():
    class MockDelta:
        def __init__(self, content=None, tool_calls=None):
            self.content = content
            self.tool_calls = tool_calls

    class MockChoice:
        def __init__(self, delta):
            self.delta = delta

    class MockChunk:
        def __init__(self, choices):
            self.choices = choices

    async def mock_stream():
        # First chunk outputs text "तुमची "
        yield MockChunk([MockChoice(MockDelta(content="तुमची "))])
        # Second chunk outputs tool call
        yield MockChunk([MockChoice(MockDelta(tool_calls=[{"function": {"name": "book_appointment"}}]))])

    tracker = TurnTimingTracker("call_test_002")
    stream = InstrumentedAsyncStream(mock_stream(), timing_tracker=tracker)

    async for chunk in stream:
        pass

    # Tokens collected before tool call must be cleared so premature text is not emitted
    assert stream._collected_tokens == []


@pytest.mark.asyncio
async def test_plivo_serializer_suppresses_interruption_during_tool_activity():
    from pipecat.serializers.plivo import PlivoFrameSerializer
    tracker = TurnTimingTracker("call_test_003")
    serializer = DiagnosticPlivoFrameSerializer(
        "stream_test_123",
        params=PlivoFrameSerializer.InputParams(auto_hang_up=False),
        turn_tracker=tracker,
    )

    # When no tool activity is pending, InterruptionFrame serializes normally
    serialized_normal = await serializer.serialize(InterruptionFrame())
    assert serialized_normal is not None

    # Enable tool activity (e.g. post-tool confirmation TTS)
    tracker.record_tool_call_delta()
    serialized_suppressed = await serializer.serialize(InterruptionFrame())
    assert serialized_suppressed is None
