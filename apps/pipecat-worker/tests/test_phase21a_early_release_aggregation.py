#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Phase 21A: Sentence Aggregation / Early TTS Release Test Suite.
#

import asyncio
import pytest
from pipecat.utils.text.base_text_aggregator import AggregationType
from app.aggregators.early_release_aggregator import EarlyReleaseTextAggregator


@pytest.mark.asyncio
async def test_no_one_word_fragment_on_comma():
    """Verify that isolated 1-word tokens like 'Hello,' or 'Sure,' are NOT released early."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    # Send "Hello," -> 1 word, 6 chars (below 3 words / 20 chars)
    results = []
    async for agg in aggregator.aggregate("Hello, "):
        results.append(agg.text)
        
    assert len(results) == 0, f"Expected no early release for 1-word fragment, got {results}"
    assert "Hello," in aggregator._buffer


@pytest.mark.asyncio
async def test_early_clause_release_on_meaningful_phrase():
    """Verify that a meaningful clause (>= 3 words and >= 20 chars) is released early at a comma."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    # "Hello, thank you for calling," -> 5 words, 29 chars
    results = []
    text_stream = ["Hello, ", "thank ", "you ", "for ", "calling, ", "my ", "name ", "is ", "Priya."]
    
    for chunk in text_stream:
        async for agg in aggregator.aggregate(chunk):
            results.append(agg.text)
            
    # The first chunk should have been released early at the second comma!
    assert len(results) >= 1
    assert results[0] == "Hello, thank you for calling,"
    
    # Flush remaining text
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert any("Priya" in r for r in results)


@pytest.mark.asyncio
async def test_number_protection_comma_and_decimal():
    """Verify that commas and periods in numbers (10,000, 3.14) are NOT treated as boundaries."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    results = []
    # Send text with 10,000 and 3.14
    async for agg in aggregator.aggregate("The cost is 10,000 rupees and rate is 3.14 percent."):
        results.append(agg.text)
        
    # Flush
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    combined = " ".join(results)
    assert "10,000" in combined, f"Expected 10,000 intact, got {combined}"
    assert "3.14" in combined, f"Expected 3.14 intact, got {combined}"


@pytest.mark.asyncio
async def test_abbreviation_protection_honorifics():
    """Verify that periods after Dr. or Mr. do not prematurely terminate the sentence."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    results = []
    text = "Please consult with Dr. Sharma for your appointment."
    async for agg in aggregator.aggregate(text):
        results.append(agg.text)
        
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    # "Dr." must not be split from "Sharma"
    combined = " ".join(results)
    assert "Dr. Sharma" in combined, f"Expected 'Dr. Sharma' intact, got {results}"


@pytest.mark.asyncio
async def test_multilingual_hindi_clause_release():
    """Verify Hindi clause release with comma and Devanagari danda."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    results = []
    # "नमस्ते, नेक्स्टलाइट क्लिनिक में आपका स्वागत है, मैं आपकी क्या मदद कर सकती हूँ?"
    chunks = [
        "नमस्ते, ",
        "नेक्स्टलाइट ",
        "क्लिनिक ",
        "में ",
        "आपका ",
        "स्वागत ",
        "है, ",
        "मैं आपकी क्या मदद कर सकती हूँ?",
    ]
    
    for chunk in chunks:
        async for agg in aggregator.aggregate(chunk):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    # First clause should contain the welcome phrase
    assert "स्वागत है" in results[0]
    # Remaining sentence should contain the question
    assert "मदद कर सकती हूँ" in " ".join(results[1:])


@pytest.mark.asyncio
async def test_multilingual_marathi_clause_release():
    """Verify Marathi clause release."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    results = []
    chunks = [
        "नमस्कार, ",
        "नेक्स्टलाइट ",
        "मध्ये ",
        "आपले ",
        "स्वागत ",
        "आहे, ",
        "मी तुम्हाला मदत करू शकतो.",
    ]
    
    for chunk in chunks:
        async for agg in aggregator.aggregate(chunk):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert "स्वागत आहे" in results[0]


@pytest.mark.asyncio
async def test_interruption_resets_state_cleanly():
    """Verify that handle_interruption resets all internal buffers and state."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    # Partial text arrives
    async for _ in aggregator.aggregate("Hello, thank you for "):
        pass
        
    assert len(aggregator._buffer) > 0
    
    # Interruption occurs
    await aggregator.handle_interruption()
    
    assert aggregator._buffer == ""
    assert aggregator._first_chunk_released is False
    assert aggregator._needs_lookahead is False
    
    # Flush after interruption yields nothing
    rem = await aggregator.flush()
    assert rem is None


@pytest.mark.asyncio
async def test_flush_emits_short_sentence():
    """Verify that flush correctly emits short sentences like 'I understand.'."""
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    
    results = []
    async for agg in aggregator.aggregate("I understand."):
        results.append(agg.text)
        
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) == 1
    assert results[0] == "I understand."


@pytest.mark.asyncio
async def test_integration_with_sarvam_tts_service():
    """Verify EarlyReleaseTextAggregator attaches cleanly to SarvamTTSService."""
    from pipecat.services.sarvam.tts import SarvamTTSService
    
    tts_service = SarvamTTSService(
        api_key="test_key",
        settings=SarvamTTSService.Settings(
            model="bulbul:v3",
            voice="shubh",
            min_buffer_size=25,
            max_chunk_length=150,
        ),
    )
    
    # Attach early release aggregator
    aggregator = EarlyReleaseTextAggregator(min_first_chunk_words=3, min_first_chunk_chars=20)
    tts_service._text_aggregator = aggregator
    
    assert tts_service._text_aggregator is aggregator
    assert tts_service._settings.min_buffer_size == 25
