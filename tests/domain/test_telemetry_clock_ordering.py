import sys
from pathlib import Path
import pytest
import time

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "apps" / "pipecat-worker"))

from app.turn_timing import TurnTimingTracker


def test_turn_timing_tracker_negative_duration_suppression():
    """
    SECTION 14 TELEMETRY VERIFICATION:
    Verifies that TurnTimingTracker.calculate_metrics() enforces monotonic clock ordering,
    suppressing any negative durations and returning None on chronologically invalid timestamps.
    """
    tracker = TurnTimingTracker(stream_id="stream-clock-test-01")

    base = 1000.0
    tracker.speech_start = base
    tracker.speech_stop = base + 0.500
    tracker.stt_final = base + 0.650
    # Inject chronologically reversed / corrupted timestamp
    tracker.first_llm_output = base + 0.400  # reversed: earlier than stt_final!

    metrics = tracker.calculate_metrics()
    
    # Positive metrics must calculate properly
    assert metrics.get("speechDurationMs") == 500
    assert metrics.get("vadStopToSttFinalMs") == 150

    # Reversed metric must be suppressed (None), NEVER negative!
    assert metrics.get("sttFinalToLlmFirstTokenMs") is None


def test_turn_timing_tracker_lifecycle_metrics():
    """
    Tests TurnTimingTracker records stages in chronological monotonic order
    and calculates accurate latency metrics without negative numbers.
    """
    tracker = TurnTimingTracker(stream_id="stream-lifecycle-test-02")

    base = time.perf_counter()
    tracker.record_speech_start(ts=base)
    tracker.record_speech_stop(ts=base + 0.500)
    tracker.record_stt_final(ts=base + 0.650, transcript="Hello there")
    tracker.record_first_llm_output(ts=base + 0.850)
    tracker.record_text_released_to_tts(ts=base + 0.950)
    tracker.record_tts_start(ts=base + 1.000)
    tracker.record_first_tts_audio(ts=base + 1.150)
    tracker.record_audio_sent_to_plivo(ts=base + 1.180)

    tracker.record_turn_complete_once(ts=base + 1.300)

    metrics = tracker.calculate_metrics()
    
    assert metrics.get("speechDurationMs") == 500
    assert metrics.get("vadStopToSttFinalMs") == 150
    assert metrics.get("llmFirstOutputToTtsStartMs") == 150  # 1.000 - 0.850
    assert metrics.get("ttsStartToFirstAudioMs") == 150  # 1.150 - 1.000
    assert metrics.get("responseLatencyMs") == 650  # 1.150 - 0.500
    assert metrics.get("totalTurnDurationMs") == 1300  # 1.300 - base
