#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Tests for Dynamic Multilingual Phrase Audio Cache.
#

import pytest
from app.phrase_audio_cache import (
    CachedPhraseAudio,
    DynamicPhraseAudioCache,
    compute_phrase_cache_key,
    normalize_phrase_text,
    MULTILINGUAL_STARTERS,
)


def test_normalize_phrase_text():
    assert normalize_phrase_text("  ठीक आहे,  ") == "ठीक आहे"
    assert normalize_phrase_text("Sure, let's do it!") == "sure let s do it"
    assert normalize_phrase_text("हो नक्कीच।") == "हो नक्कीच"
    assert normalize_phrase_text(None) == ""
    assert normalize_phrase_text("") == ""


def test_compute_phrase_cache_key_isolation():
    key1 = compute_phrase_cache_key(
        tenant_id="tenant-1",
        language="mr-IN",
        voice_id="shubh",
        model="bulbul:v3",
        sample_rate=8000,
        phrase_text="ठीक आहे",
    )
    key2 = compute_phrase_cache_key(
        tenant_id="tenant-2",
        language="mr-IN",
        voice_id="shubh",
        model="bulbul:v3",
        sample_rate=8000,
        phrase_text="ठीक आहे",
    )
    key3 = compute_phrase_cache_key(
        tenant_id="tenant-1",
        language="hi-IN",
        voice_id="shubh",
        model="bulbul:v3",
        sample_rate=8000,
        phrase_text="ठीक आहे",
    )
    # Ensure keys are distinct across tenants and languages
    assert key1 != key2
    assert key1 != key3
    assert len(key1) == 64


def test_phrase_audio_cache_put_get(tmp_path):
    cache = DynamicPhraseAudioCache(max_entries=10, disk_cache_dir=str(tmp_path))
    key = compute_phrase_cache_key(
        tenant_id="t1",
        language="en-IN",
        voice_id="aravind",
        model="bulbul:v3",
        sample_rate=8000,
        phrase_text="Sure",
    )
    
    # Cache miss
    assert cache.get(key) is None
    
    # Store audio chunks
    dummy_chunks = [b"\x00\x00" * 160, b"\x01\x00" * 160]
    cache.put(key, dummy_chunks, sample_rate=8000, num_channels=1, text="Sure")
    
    # Cache hit in memory
    retrieved = cache.get(key)
    assert retrieved is not None
    assert len(retrieved) == 2
    assert retrieved.is_telephony_safe(8000) is True
    assert retrieved.is_telephony_safe(24000) is False


def test_match_starter_multilingual(tmp_path):
    cache = DynamicPhraseAudioCache(max_entries=50, disk_cache_dir=str(tmp_path))
    
    # Pre-populate Marathi starter "ठीक आहे"
    mr_key = compute_phrase_cache_key(
        tenant_id="t1",
        language="mr-IN",
        voice_id="shubh",
        model="bulbul:v3",
        sample_rate=8000,
        phrase_text="ठीक आहे",
    )
    dummy_chunks = [b"\x00\x00" * 320]
    cache.put(mr_key, dummy_chunks, sample_rate=8000, num_channels=1, text="ठीक आहे")
    
    # Match Marathi
    matched, remainder = cache.match_starter(
        text_chunk="ठीक आहे, मी तुमची मदत करतो.",
        tenant_id="t1",
        language="mr-IN",
        voice_id="shubh",
        model="bulbul:v3",
        sample_rate=8000,
    )
    assert matched is not None
    assert remainder == "मी तुमची मदत करतो."

    # Non-matching language check
    no_match = cache.match_starter(
        text_chunk="Hello, how can I help you?",
        tenant_id="t1",
        language="mr-IN",
        voice_id="shubh",
        model="bulbul:v3",
        sample_rate=8000,
    )
    assert no_match is None


def test_cache_clear(tmp_path):
    cache = DynamicPhraseAudioCache(max_entries=5, disk_cache_dir=str(tmp_path))
    key = compute_phrase_cache_key("t1", "hi-IN", "shubh", "bulbul:v3", 8000, "नमस्ते")
    cache.put(key, [b"\x00\x00" * 160], sample_rate=8000, text="नमस्ते")
    assert cache.get(key) is not None
    cache.clear()
    assert cache.get(key) is None
