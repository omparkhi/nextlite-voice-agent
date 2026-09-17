#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Unit Tests for Phase 22A Static Greeting Fast Path Cache.
#

import pytest
from app.greeting_cache import (
    is_static_greeting,
    compute_greeting_cache_key,
    StaticGreetingAudioCache,
)


def test_is_static_greeting():
    # Valid static greetings
    assert is_static_greeting("Namaste, Medicare Clinic mein aapka swagat hai.") is True
    assert is_static_greeting("Hello, how can I help you today?") is True
    assert is_static_greeting("Good morning! This is Dr. Sharma's assistant.") is True

    # Dynamic template greetings containing variables
    assert is_static_greeting("Hello {name}, welcome back!") is False
    assert is_static_greeting("Hello {{customerName}}, how can I help?") is False
    assert is_static_greeting("Your appointment is on <date>.") is False
    assert is_static_greeting("The cost is $50.") is False

    # Empty / None
    assert is_static_greeting("") is False
    assert is_static_greeting(None) is False
    assert is_static_greeting("   ") is False


def test_greeting_cache_tenant_isolation():
    cache = StaticGreetingAudioCache()
    key_tenant_a = compute_greeting_cache_key(
        tenant_id="tenant-alpha",
        deployment_id="dep-1",
        model="bulbul:v3",
        voice="shubh",
        language="hi-IN",
        greeting_text="Namaste",
    )
    key_tenant_b = compute_greeting_cache_key(
        tenant_id="tenant-beta",
        deployment_id="dep-1",
        model="bulbul:v3",
        voice="shubh",
        language="hi-IN",
        greeting_text="Namaste",
    )

    # Different tenant_ids must yield completely different keys
    assert key_tenant_a != key_tenant_b

    # Store audio for tenant A
    dummy_chunks_a = [b"\x00\x01\x02", b"\x03\x04\x05"]
    cache.put(key_tenant_a, dummy_chunks_a)

    # Tenant A can read it
    cached_a = cache.get(key_tenant_a)
    assert cached_a == dummy_chunks_a

    # Tenant B cannot read it (strict isolation)
    assert cache.get(key_tenant_b) is None


def test_greeting_cache_eviction():
    cache = StaticGreetingAudioCache(max_entries=2)
    cache.put("k1", [b"chunk1"])
    cache.put("k2", [b"chunk2"])
    assert cache.get("k1") is not None
    assert cache.get("k2") is not None

    # Adding 3rd entry evicts oldest (k1)
    cache.put("k3", [b"chunk3"])
    assert cache.get("k1") is None
    assert cache.get("k2") is not None
    assert cache.get("k3") is not None


def test_direct_phone_playback_requires_matching_pcm_format():
    """A fast-path entry must never guess how to send audio to Plivo."""
    cache = StaticGreetingAudioCache()
    cache.put("phone-safe", [b"\x00\x01" * 160], sample_rate=8000, num_channels=1)
    cache.put("wrong-rate", [b"\x00\x01" * 160], sample_rate=24000, num_channels=1)
    cache.put("wrong-channels", [b"\x00\x01" * 160], sample_rate=8000, num_channels=2)
    cache.put("odd-pcm", [b"\x00" * 319], sample_rate=8000, num_channels=1)

    assert cache.get("phone-safe").is_telephony_safe(8000) is True
    assert cache.get("wrong-rate").is_telephony_safe(8000) is False
    assert cache.get("wrong-channels").is_telephony_safe(8000) is False
    assert cache.get("odd-pcm").is_telephony_safe(8000) is False
