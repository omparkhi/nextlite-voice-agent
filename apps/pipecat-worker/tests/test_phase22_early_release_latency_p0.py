#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Phase 22: Hardcore P0 Latency Fix — Aggregator & Boundary Test Suite.
#

import pytest
from app.aggregators.early_release_aggregator import EarlyReleaseTextAggregator
from pipecat.utils.text.base_text_aggregator import AggregationType


@pytest.mark.asyncio
async def test_first_chunk_early_release_hindi():
    """Verify Hindi early clause release with >= 2 words: 'हाँ बिल्कुल,'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    
    stream = ["हाँ ", "बिल्कुल, ", "मैं ", "अभी ", "देखता ", "हूँ।"]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert results[0] == "हाँ बिल्कुल,"
    assert "देखता हूँ" in results[1]


@pytest.mark.asyncio
async def test_first_chunk_early_release_marathi():
    """Verify Marathi early clause release with >= 2 words: 'हो नक्की,'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    
    stream = ["हो ", "नक्की, ", "मी ", "तपासतो."]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert results[0] == "हो नक्की,"
    assert "तपासतो" in results[1]


@pytest.mark.asyncio
async def test_first_chunk_early_release_english():
    """Verify English early clause release: 'Sure, absolutely,'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    
    stream = ["Sure, ", "absolutely, ", "let ", "me ", "check."]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    # 'Sure,' is 1 word -> blocked by 2-word floor.
    # 'Sure, absolutely,' is 2 words -> released!
    assert len(results) >= 2
    assert results[0] == "Sure, absolutely,"
    assert "let me check" in results[1]


@pytest.mark.asyncio
async def test_first_chunk_early_release_thik_hai():
    """Verify short 2-word Hindi clause release: 'ठीक है,'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    
    stream = ["ठीक ", "है, ", "मैं ", "अभी ", "देखता ", "हूँ."]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert results[0] == "ठीक है,"


@pytest.mark.asyncio
async def test_isolated_one_word_fragments_not_released():
    """Verify 1-word fragments like 'हाँ,', 'हो,', 'Sure,', 'Okay,' are NOT released as isolated chunks."""
    one_word_examples = ["हाँ, ", "हो, ", "Sure, ", "Okay, "]
    
    for example in one_word_examples:
        aggregator = EarlyReleaseTextAggregator(
            min_first_chunk_words=2,
            min_first_chunk_chars=12,
        )
        results = []
        async for agg in aggregator.aggregate(example):
            results.append(agg.text)
            
        assert len(results) == 0, f"Expected no early release for 1-word '{example}', got {results}"


@pytest.mark.asyncio
async def test_protection_currency_number():
    """Verify 10,000 is not split at the comma in '10,000 रुपये, मैं देखता हूँ'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    stream = ["10,000 ", "रुपये, ", "मैं ", "देखता ", "हूँ।"]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert results[0] == "10,000 रुपये,"
    assert "10,000" in results[0]


@pytest.mark.asyncio
async def test_protection_time_and_abbrev():
    """Verify 12:30 is not split at colon in '12:30 PM, ठीक है'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    stream = ["12:30 ", "PM, ", "ठीक ", "है।"]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert results[0] == "12:30 PM,"


@pytest.mark.asyncio
async def test_protection_honorific_dr_sharma():
    """Verify Dr. is not split at period in 'Dr. Sharma, मैं देखता हूँ'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    stream = ["Dr. ", "Sharma, ", "मैं ", "देखता ", "हूँ।"]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    assert len(results) >= 2
    assert results[0] == "Dr. Sharma,"


@pytest.mark.asyncio
async def test_protection_url_domain():
    """Verify domain is not split internally at the period in 'example.com, मैं देखता हूँ'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    stream = ["example.com, ", "मैं ", "देखता ", "हूँ।"]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    combined = " ".join(results)
    assert "example.com" in combined
    # Verify it was never split at 'example.' as a sentence terminator
    assert not any(r.strip() == "example." for r in results)


@pytest.mark.asyncio
async def test_protection_appointment_id():
    """Verify ID is preserved and not split in 'APT-1234, आपका अपॉइंटमेंट कंफर्म है'."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    stream = ["APT-1234, ", "आपका ", "अपॉइंटमेंट ", "कंफर्म ", "है।"]
    results = []
    for token in stream:
        async for agg in aggregator.aggregate(token):
            results.append(agg.text)
            
    rem = await aggregator.flush()
    if rem:
        results.append(rem.text)
        
    combined = " ".join(results)
    assert "APT-1234" in combined
    assert not any(r.strip() == "APT-" for r in results)


@pytest.mark.asyncio
async def test_terminal_punctuation_immediate_release():
    """Verify immediate sentence release on terminal punctuation 'हाँ।', 'हो!', 'ठीक है?'."""
    # Devanagari danda
    agg1 = EarlyReleaseTextAggregator(min_first_chunk_words=2, min_first_chunk_chars=12)
    res1 = []
    async for agg in agg1.aggregate("हाँ।"):
        res1.append(agg.text)
    assert res1 == ["हाँ।"]
    
    # Exclamation
    agg2 = EarlyReleaseTextAggregator(min_first_chunk_words=2, min_first_chunk_chars=12)
    res2 = []
    async for agg in agg2.aggregate("हो!"):
        res2.append(agg.text)
    assert res2 == ["हो!"]
    
    # Question
    agg3 = EarlyReleaseTextAggregator(min_first_chunk_words=2, min_first_chunk_chars=12)
    res3 = []
    async for agg in agg3.aggregate("ठीक है?"):
        res3.append(agg.text)
    assert res3 == ["ठीक है?"]


@pytest.mark.asyncio
async def test_flush_emits_partial_response_without_punctuation():
    """Verify flush returns remaining text when no punctuation was streamed."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    results = []
    async for agg in aggregator.aggregate("Please wait a moment"):
        results.append(agg.text)
        
    assert len(results) == 0
    rem = await aggregator.flush()
    assert rem is not None
    assert rem.text == "Please wait a moment"


@pytest.mark.asyncio
async def test_interruption_clears_buffer():
    """Verify interruption clears buffer and prevents delayed emissions."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    async for _ in aggregator.aggregate("Partial unpunctuated text"):
        pass
        
    assert len(aggregator._buffer) > 0
    await aggregator.handle_interruption()
    assert aggregator._buffer == ""
    
    rem = await aggregator.flush()
    assert rem is None


@pytest.mark.asyncio
async def test_reset_starts_fresh_next_turn():
    """Verify reset starts a completely clean state for the next turn."""
    aggregator = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
    )
    
    # Turn 1
    t1_results = []
    async for agg in aggregator.aggregate("हाँ बिल्कुल, मैं देखता हूँ।"):
        t1_results.append(agg.text)
    rem = await aggregator.flush()
    if rem:
        t1_results.append(rem.text)
        
    assert len(t1_results) >= 2
    assert aggregator._buffer == ""
    assert aggregator._first_chunk_released is False
    
    # Turn 2: Starts fresh with first chunk policy (>= 2 words / 12 chars)
    t2_results = []
    async for agg in aggregator.aggregate("ठीक है, अगला टर्न।"):
        t2_results.append(agg.text)
    rem = await aggregator.flush()
    if rem:
        t2_results.append(rem.text)
        
    assert t2_results[0] == "ठीक है,"
