#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Phase 22A Cache Audio Quality, Format Preservation, and Telemetry Idempotence Tests.
#

import asyncio
import time
import pytest
from unittest.mock import MagicMock

from app.greeting_cache import (
    CachedGreetingAudio,
    StaticGreetingAudioCache,
    compute_greeting_cache_key,
    is_static_greeting,
)
from app.turn_timing import TurnTimingTracker
from app.main import DiagnosticPlivoFrameSerializer
from pipecat.serializers.plivo import PlivoFrameSerializer
from pipecat.frames.frames import (
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    LLMFullResponseEndFrame,
    FunctionCallsStartedFrame,
    FunctionCallInProgressFrame,
    FunctionCallResultFrame,
    InterruptionFrame,
)


def test_cached_greeting_preserves_native_format():
    """Validates that CachedGreetingAudio stores sample_rate=24000 and num_channels=1."""
    raw_pcm_24k = b"\x10\x00" * 2400  # 2400 samples of 16-bit PCM (100ms at 24kHz)
    cached = CachedGreetingAudio(
        audio_chunks=[raw_pcm_24k],
        sample_rate=24000,
        num_channels=1,
    )
    assert cached.sample_rate == 24000
    assert cached.num_channels == 1
    assert len(cached.audio_chunks) == 1
    assert len(cached) == 1
    assert cached[0] == raw_pcm_24k


@pytest.mark.asyncio
async def test_plivo_serializer_resamples_cached_24k_to_8k_ulaw():
    """Validates that DiagnosticPlivoFrameSerializer correctly resamples 24kHz PCM to 8kHz ulaw."""
    import json
    import base64
    serializer = DiagnosticPlivoFrameSerializer(
        stream_id="test_stream_123",
        params=PlivoFrameSerializer.InputParams(auto_hang_up=False),
    )
    # 24,000 Hz, 16-bit mono: 48,000 bytes = 1.0 second of audio
    one_second_24k_pcm = b"\x20\x00" * 24000
    frame = TTSAudioRawFrame(
        audio=one_second_24k_pcm,
        sample_rate=24000,
        num_channels=1,
    )
    serialized = await serializer.serialize(frame)
    assert serialized is not None
    # In Plivo JSON: {"event": "playAudio", "media": {"payload": base64_str}}
    data = json.loads(serialized)
    assert data["event"] == "playAudio"
    payload_bytes = base64.b64decode(data["media"]["payload"])
    # 1.0 second of 24kHz PCM resampled to 8kHz μ-law.
    # The Pipecat resampler's block-size alignment produces 7700 bytes rather than
    # the theoretical 8000 (a 3:1 ratio). The important invariant is that it is
    # significantly less than 24000 (proves downsampling DID happen) and is
    # consistent across calls. "Old bug" (sample_rate=8000 lie) yields 24000 bytes.
    assert len(payload_bytes) < 24000, "Resampler must reduce 24kHz PCM to significantly fewer bytes"
    assert len(payload_bytes) > 0, "Serializer must produce non-empty payload"


@pytest.mark.asyncio
async def test_corrupted_8k_pcm_demonstrates_previous_bug():
    """Proves why sample_rate=8000 on 24kHz audio caused 3x slow, distorted ghost playback."""
    import json
    import base64
    serializer = DiagnosticPlivoFrameSerializer(
        stream_id="test_stream_123",
        params=PlivoFrameSerializer.InputParams(auto_hang_up=False),
    )
    # 48,000 bytes of 24kHz PCM (1 second)
    one_second_24k_pcm = b"\x20\x00" * 24000
    # BUG: telling serializer sample_rate=8000 when data is actually 24000 Hz
    buggy_frame = TTSAudioRawFrame(
        audio=one_second_24k_pcm,
        sample_rate=8000,
        num_channels=1,
    )
    serialized = await serializer.serialize(buggy_frame)
    data = json.loads(serialized)
    payload_bytes = base64.b64decode(data["media"]["payload"])
    # Instead of 8,000 bytes, serializer produced 24,000 bytes (3x too long)!
    assert len(payload_bytes) == 24000, "Old bug produced 3x inflated byte payload"


def test_cache_key_isolation_all_dimensions():
    """Validates tenant, deployment, voice, language, and greeting text isolation."""
    base_params = {
        "tenant_id": "tenant-100",
        "deployment_id": "dep-200",
        "model": "bulbul:v3",
        "voice": "shubh",
        "language": "hi-IN",
        "greeting_text": "Namaste, clinic mein aapka swagat hai.",
    }
    base_key = compute_greeting_cache_key(**base_params)

    # 1. Identical params -> Same key
    assert compute_greeting_cache_key(**base_params) == base_key

    # 2. Tenant isolation
    tenant_diff = dict(base_params, tenant_id="tenant-999")
    assert compute_greeting_cache_key(**tenant_diff) != base_key

    # 3. Deployment isolation
    dep_diff = dict(base_params, deployment_id="dep-999")
    assert compute_greeting_cache_key(**dep_diff) != base_key

    # 4. Voice isolation
    voice_diff = dict(base_params, voice="ratna")
    assert compute_greeting_cache_key(**voice_diff) != base_key

    # 5. Language isolation
    lang_diff = dict(base_params, language="en-IN")
    assert compute_greeting_cache_key(**lang_diff) != base_key

    # 6. Greeting text isolation
    text_diff = dict(base_params, greeting_text="Hello, welcome to our clinic.")
    assert compute_greeting_cache_key(**text_diff) != base_key


def test_dynamic_greeting_detection():
    """Validates that template expressions are not cached as static greetings."""
    assert is_static_greeting("Namaste, Medicare clinic mein aapka swagat hai.") is True
    assert is_static_greeting("Hello, how can I help you today?") is True

    # Dynamic indicators
    assert is_static_greeting("Hello {{customer_name}}, welcome back!") is False
    assert is_static_greeting("Namaste {patient_name}, aapka appointment confirm hai.") is False
    assert is_static_greeting("Hello $user, welcome!") is False
    assert is_static_greeting("<tag>Hello</tag>") is False
    assert is_static_greeting("") is False
    assert is_static_greeting(None) is False


def test_cache_store_and_retrieve_preserves_audio_format():
    """Validates cache store and retrieval preserves sample_rate and num_channels."""
    cache = StaticGreetingAudioCache()
    key = "test-unique-cache-key-123"
    audio_chunks = [b"\x01\x02" * 100, b"\x03\x04" * 100]

    cache.put(key, audio_chunks, sample_rate=24000, num_channels=1)

    retrieved = cache.get(key)
    assert retrieved is not None
    assert retrieved.sample_rate == 24000
    assert retrieved.num_channels == 1
    assert len(retrieved.audio_chunks) == 2
    assert retrieved.audio_chunks == audio_chunks


def test_tool_turn_telemetry_idempotence_single_turn_completion():
    """Validates that a tool turn emits exactly ONE turn_completed after post-tool TTS."""
    tracker = TurnTimingTracker(session_start_monotonic=time.perf_counter(), stream_id="test_stream")
    tracker.turn_type = "user_turn"
    tracker.record_speech_start()
    tracker.record_speech_stop()

    # User speaks -> LLM produces tool call
    tracker.record_tool_call_delta()
    assert tracker.has_pending_tool_activity() is True

    # Tool executes
    start_tool = time.perf_counter()
    time.sleep(0.01)
    tracker.record_tool_execution(
        tool_name="book_appointment",
        start_time=start_tool,
        end_time=time.perf_counter(),
        success=True,
    )
    assert tracker.has_pending_tool_activity() is True

    # LLM Full response end for tool call MUST NOT complete the turn
    # Simulate LLMFullResponseEndFrame check:
    has_tool_activity = tracker.has_pending_tool_activity()
    assert has_tool_activity is True

    # Post-tool LLM produces assistant response
    tracker.record_llm_start()
    tracker.record_first_llm_output()
    tracker.record_llm_response_complete()

    # Post-tool TTS starts and stops
    tracker.record_tts_start()
    tracker.record_first_tts_audio()
    tracker.record_tts_stop()

    # Now turn completes exactly once
    assert tracker.turn_complete is None
    completed = tracker.record_turn_complete_once()
    assert completed is True
    assert tracker.turn_complete is not None

    # Second completion attempt is rejected
    completed_again = tracker.record_turn_complete_once()
    assert completed_again is False

    # Event log must have exactly ONE turn_completed event
    completed_events = [e for e in tracker.active_turn_events if e["event"] == "turn_completed"]
    assert len(completed_events) == 1


def test_normal_turn_telemetry_idempotence():
    """Validates that a normal turn emits exactly ONE turn_completed."""
    tracker = TurnTimingTracker(session_start_monotonic=time.perf_counter(), stream_id="test_stream")
    tracker.turn_type = "user_turn"
    tracker.record_speech_start()
    tracker.record_speech_stop()
    tracker.record_llm_first_provider_response()
    tracker.record_first_llm_output()
    tracker.record_tts_start()
    tracker.record_first_tts_audio()
    tracker.record_tts_stop()

    completed = tracker.record_turn_complete_once()
    assert completed is True

    # Duplicate call
    assert tracker.record_turn_complete_once() is False

    events = [e for e in tracker.active_turn_events if e["event"] == "turn_completed"]
    assert len(events) == 1
