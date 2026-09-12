#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Unit Tests for LLM to TTS Latency Optimization (Phase 25).
#

import time
import pytest
from app.aggregators.early_release_aggregator import EarlyReleaseTextAggregator
from app.turn_timing import TurnTimingTracker


@pytest.mark.asyncio
async def test_early_clause_release_immediate_on_punctuation():
    """Verify that a clause meeting thresholds is released immediately upon punctuation without requiring a following token."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=30)

    # "Sure thing, I can help with that," -> 7 words, 33 chars
    tokens = ["Sure ", "thing, ", "I ", "can ", "help ", "with ", "that,"]
    results = []

    for token in tokens:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)

    # Must have yielded on "that," without waiting for next token!
    assert len(results) == 1
    assert results[0] == "Sure thing, I can help with that,"
    assert aggregator._buffer == ""


@pytest.mark.asyncio
async def test_exclamation_and_question_immediate_release():
    """Verify that '!' and '?' are treated as unambiguous sentence boundaries with 0 lookahead delay."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=30)

    # 1. Exclamation
    results_excl = []
    async for agg in aggregator.aggregate("Good morning!"):
        results_excl.append(agg.text)

    assert len(results_excl) == 1
    assert results_excl[0] == "Good morning!"
    assert aggregator._buffer == ""

    # 2. Question mark
    results_q = []
    async for agg in aggregator.aggregate("How may I help you?"):
        results_q.append(agg.text)

    assert len(results_q) == 1
    assert results_q[0] == "How may I help you?"
    assert aggregator._buffer == ""


@pytest.mark.asyncio
async def test_hindi_danda_and_comma_immediate_release():
    """Verify that Devanagari danda (।) and Hindi clause boundaries release immediately."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=30)

    # Hindi clause >= 30 chars: "जी बिल्कुल, मैं आपकी पूरी सहायता करूँगा,"
    results = []
    async for agg in aggregator.aggregate("जी बिल्कुल, मैं आपकी पूरी सहायता करूँगा,"):
        results.append(agg.text)

    assert len(results) == 1
    assert results[0] == "जी बिल्कुल, मैं आपकी पूरी सहायता करूँगा,"

    # Hindi full sentence with danda: "धन्यवाद।"
    results_danda = []
    async for agg in aggregator.aggregate(" आपका दिन शुभ हो।"):
        results_danda.append(agg.text)

    assert len(results_danda) == 1
    assert results_danda[0] == "आपका दिन शुभ हो।"


@pytest.mark.asyncio
async def test_no_token_flooding_on_sub_threshold_fragments():
    """Verify that short tokens are aggregated rather than flooded to TTS 1-by-1."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=30)

    results = []
    # Feed short individual tokens without terminal punctuation
    tokens = ["Hello", " world", " this", " is", " a"]
    for t in tokens:
        async for agg in aggregator.aggregate(t):
            results.append(agg.text)

    # No tokens should have been emitted
    assert len(results) == 0
    assert aggregator._buffer == "Hello world this is a"

    # End of turn flush
    rem = await aggregator.flush()
    assert rem is not None
    assert rem.text == "Hello world this is a"


@pytest.mark.asyncio
async def test_interruption_cleans_aggregator_buffer():
    """Verify that caller interruption resets internal buffer cleanly."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=30)

    async for _ in aggregator.aggregate("Incomplete sentence that gets cut off"):
        pass

    assert len(aggregator._buffer) > 0
    await aggregator.handle_interruption()
    assert aggregator._buffer == ""
    assert not aggregator._first_chunk_released
    assert not aggregator._needs_lookahead


def test_turn_timing_tracker_llm_to_tts_metrics():
    """Verify precise monotonic timestamp recording and metric calculations for LLM to TTS path."""
    tracker = TurnTimingTracker(stream_id="test-perf-stream")
    tracker.turn_type = "user_turn"

    t0 = 100.000
    tracker.record_speech_stop(t0)                      # user speech stop: 100.000s
    t_stt = t0 + 0.350
    tracker.record_stt_final(t_stt, "book appointment") # stt final: 100.350s (+350ms)
    t_agg = t_stt + 0.005
    tracker.record_user_aggregation_finalized(t_agg)    # user agg: 100.355s (+5ms)
    t_llm_req = t_agg + 0.002
    tracker.record_llm_request(t_llm_req)               # llm request: 100.357s (+2ms)
    t_llm_resp = t_llm_req + 0.500
    tracker.record_llm_first_provider_response(t_llm_resp) # llm provider: 100.857s (+500ms)
    t_llm_text = t_llm_resp + 0.050
    tracker.record_first_llm_output(t_llm_text)         # llm first text: 100.907s (+50ms)

    t_release = t_llm_text + 0.120
    tracker.record_text_released_to_tts(t_release)      # text released to tts: 101.027s (+120ms)

    t_tts_start = t_release + 0.005
    tracker.record_tts_start(t_tts_start)               # tts started: 101.032s (+5ms)

    t_tts_audio = t_tts_start + 0.380
    tracker.record_first_tts_audio(t_tts_audio)         # tts first audio: 101.412s (+380ms)

    t_plivo = t_tts_audio + 0.010
    tracker.record_audio_sent_to_plivo(t_plivo)         # plivo dispatch: 101.422s (+10ms)

    metrics = tracker.calculate_metrics()

    # Latencies
    assert metrics["llmFirstTextToReleaseMs"] == 120
    assert metrics["llmFirstTextToTtsStartMs"] == 125
    assert metrics["ttsStartToFirstAudioMs"] == 380
    assert metrics["llmFirstTextToFirstAudioMs"] == 505
    assert metrics["userStopToFirstAudioMs"] == 1412
    assert metrics["responseLatencyMs"] == 1412


def test_tool_turn_not_broken_by_metrics():
    """Verify tool call lifecycle is unaffected by LLM-to-TTS latency additions."""
    tracker = TurnTimingTracker(stream_id="test-tool-stream")
    tracker.turn_type = "user_turn"

    t0 = 200.0
    tracker.record_speech_stop(t0)
    tracker.record_llm_request(t0 + 0.1)
    tracker.record_tool_call_delta(t0 + 0.3)
    tracker.record_tool_call_complete(t0 + 0.4)
    tracker.record_tool_execution("check_availability", t0 + 0.4, t0 + 0.6, success=True)
    tracker.record_first_llm_output(t0 + 0.8)
    tracker.record_text_released_to_tts(t0 + 0.9)
    tracker.record_tts_start(t0 + 0.91)
    tracker.record_first_tts_audio(t0 + 1.25)

    metrics = tracker.calculate_metrics()
    assert metrics["toolDurationMs"] == 200
    assert metrics["tools"][0]["name"] == "check_availability"
    assert metrics["llmFirstTextToReleaseMs"] == 100
    assert metrics["ttsStartToFirstAudioMs"] == 340
