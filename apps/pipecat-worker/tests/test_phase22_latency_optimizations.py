#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Unit Tests for Phase 22 Telemetry Integrity & Latency Optimizations.
#

import time
import pytest
from app.turn_timing import TurnTimingTracker
from app.aggregators.early_release_aggregator import EarlyReleaseTextAggregator


def test_greeting_first_audio_latch():
    tracker = TurnTimingTracker(stream_id="test-stream-1")
    t1 = time.perf_counter()
    tracker.record_greeting_first_audio(t1)
    assert tracker.greeting_first_audio == t1

    # Simulate subsequent 20ms audio frame chunks from Sarvam
    t2 = t1 + 0.020
    tracker.record_greeting_first_audio(t2)
    # Stored timestamp must remain strictly latched to first chunk
    assert tracker.greeting_first_audio == t1

    # Events list must contain exactly ONE greeting_first_audio event
    greeting_events = [e for e in tracker.active_turn_events if e["event"] == "greeting_first_audio"]
    assert len(greeting_events) == 1
    assert greeting_events[0]["monotonicTimestamp"] == round(t1, 6)


def test_early_release_aggregator_buffer_alignment():
    # Verify default min_first_chunk_chars is 12 and min_first_chunk_words is 2
    agg = EarlyReleaseTextAggregator()
    assert agg._min_first_chunk_chars == 12
    assert agg._min_first_chunk_words == 2


def test_turn_timing_tool_lifecycle():
    tracker = TurnTimingTracker(stream_id="test-stream-2")
    tracker.turn_type = "user_turn"
    tracker.record_speech_stop()
    tracker.record_llm_request_created()
    tracker.record_tool_call_delta()
    tracker.record_tool_execution("book_appointment", 0.025, True)

    # When tool activity is present, tool_call_delta is not None and tool_executions has items
    assert tracker.tool_call_delta is not None
    assert len(tracker.tool_executions) == 1


@pytest.mark.asyncio
async def test_plivo_serializer_audio_raw_frame():
    from app.main import DiagnosticPlivoFrameSerializer
    from pipecat.serializers.plivo import PlivoFrameSerializer
    from pipecat.frames.frames import AudioRawFrame, TTSAudioRawFrame, OutputAudioRawFrame

    params = PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000)
    serializer = DiagnosticPlivoFrameSerializer(stream_id="test-stream-serializer", params=params)
    
    # 1. TTSAudioRawFrame
    tts_frame = TTSAudioRawFrame(audio=b"\x00" * 320, sample_rate=8000, num_channels=1)
    payload = await serializer.serialize(tts_frame)
    assert payload is not None

    # 2. OutputAudioRawFrame
    out_frame = OutputAudioRawFrame(audio=b"\x00" * 320, sample_rate=8000, num_channels=1)
    payload_out = await serializer.serialize(out_frame)
    assert payload_out is not None
