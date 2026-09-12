#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Pipecat 1.8.1 Native Static Greeting Fast Path Cache (Phase 22A).
#

"""Static greeting audio caching module for sub-second greeting delivery.

Provides multi-tenant isolated, in-memory pre-rendered audio caching for static
greetings, eliminating the 855ms Sarvam TTS WebSocket connection overhead and
560ms neural synthesis delay on conversational call startup.
"""

import hashlib
import re
from dataclasses import dataclass
from typing import Dict, List, Optional
from loguru import logger


@dataclass
class CachedGreetingAudio:
    """Pre-rendered static greeting audio representation preserving native format."""
    audio_chunks: List[bytes]
    sample_rate: int = 24000
    num_channels: int = 1

    def __iter__(self):
        """Allows direct iteration over audio_chunks for backward compatibility."""
        return iter(self.audio_chunks)

    def __len__(self):
        return len(self.audio_chunks)

    def __getitem__(self, index):
        return self.audio_chunks[index]

    def __eq__(self, other):
        if isinstance(other, CachedGreetingAudio):
            return (
                self.audio_chunks == other.audio_chunks
                and self.sample_rate == other.sample_rate
                and self.num_channels == other.num_channels
            )
        elif isinstance(other, list):
            return self.audio_chunks == other
        return False


def is_static_greeting(text: Optional[str]) -> bool:
    """Returns True if the greeting text contains no dynamic template variables."""
    if not text or not isinstance(text, str):
        return False
    clean = text.strip()
    if not clean:
        return False
    # Check for template variables, handlebars, or dynamic indicators
    if any(char in clean for char in ("{", "}", "<", ">", "$", "%")):
        return False
    if re.search(r"\{\{.*?\}\}", clean) or re.search(r"\{[a-zA-Z0-9_]+\}", clean):
        return False
    return True


def compute_greeting_cache_key(
    tenant_id: str,
    deployment_id: str,
    model: str,
    voice: str,
    language: str,
    greeting_text: str,
) -> str:
    """Computes a cryptographically secure, tenant-isolated cache key."""
    raw = f"{tenant_id}:{deployment_id}:{model}:{voice}:{language}:{greeting_text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class StaticGreetingAudioCache:
    """Thread-safe, tenant-isolated in-memory cache for static greeting audio chunks."""

    def __init__(self, max_entries: int = 100):
        self._cache: Dict[str, CachedGreetingAudio] = {}
        self._max_entries = max_entries

    def get(self, cache_key: str) -> Optional[CachedGreetingAudio]:
        """Retrieves cached audio object for the given cache key."""
        return self._cache.get(cache_key)

    def put(
        self,
        cache_key: str,
        audio_chunks: List[bytes],
        sample_rate: int = 24000,
        num_channels: int = 1,
    ) -> None:
        """Stores synthesized audio chunks for a static greeting preserving exact format."""
        if not audio_chunks:
            return
        if len(self._cache) >= self._max_entries:
            # Evict oldest entry (simple FIFO)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
        self._cache[cache_key] = CachedGreetingAudio(
            audio_chunks=[bytes(chunk) for chunk in audio_chunks],
            sample_rate=sample_rate,
            num_channels=num_channels,
        )
        logger.info(
            f"[GreetingCache] Stored {len(audio_chunks)} audio chunks in cache "
            f"(sample_rate={sample_rate}, channels={num_channels}, key={cache_key[:12]}...)"
        )

    def clear(self) -> None:
        """Clears all cached greeting audio."""
        self._cache.clear()


# Global singleton instance for the worker process lifetime
global_greeting_cache = StaticGreetingAudioCache()
