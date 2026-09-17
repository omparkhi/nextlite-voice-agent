#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Production-Grade Multilingual Dynamic Phrase Audio Cache (Sub-700ms Optimization).
#

"""Dynamic multilingual audio caching module for sub-700ms voice agent delivery.

Provides multi-tenant isolated, in-memory and disk pre-rendered audio caching
for conversational starters, safe affirmative fillers, and dynamically synthesized
phrases across Marathi, Hindi, English, Gujarati, Tamil, Telugu, and other languages.
"""

import base64
import hashlib
import io
import os
import pickle
import re
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import httpx
from loguru import logger


@dataclass
class CachedPhraseAudio:
    """Pre-rendered phrase audio representation preserving native format."""
    audio_chunks: List[bytes]
    sample_rate: int = 8000
    num_channels: int = 1
    text: str = ""

    def __iter__(self):
        """Allows direct iteration over audio_chunks."""
        return iter(self.audio_chunks)

    def __len__(self):
        return len(self.audio_chunks)

    def __getitem__(self, index):
        return self.audio_chunks[index]

    def is_telephony_safe(self, required_sample_rate: int) -> bool:
        """Whether this entry can be sent directly to the telephony transport."""
        return bool(
            self.audio_chunks
            and self.sample_rate == required_sample_rate
            and self.num_channels == 1
            and all(chunk and len(chunk) % 2 == 0 for chunk in self.audio_chunks)
        )


# Standard conversational starters across supported languages
# Dynamically selected based on agent language configuration
MULTILINGUAL_STARTERS: Dict[str, List[str]] = {
    "mr-IN": ["एक मिनिट", "ठीक आहे", "समजलं", "हो नक्की", "हो", "बरं", "नक्कीच", "होय", "चालेल", "उद्या", "तुमची", "काही", "धन्यवाद"],
    "hi-IN": ["एक मिनट", "ठीक है", "समझ गया", "जी बिल्कुल", "हाँ", "अच्छा", "जी हाँ", "ज़रूर", "बिल्कुल", "कल", "आपकी", "धन्यवाद"],
    "en-IN": ["Just a minute", "Sure", "Alright", "Understood", "Got it", "Yes", "Certainly", "Okay", "No problem", "Tomorrow", "Your", "Thank you"],
    "en-US": ["Sure", "Got it", "Alright", "Understood", "Yes", "Certainly", "Okay", "No problem", "Tomorrow", "Your", "Thank you"],
    "gu-IN": ["બરાબર", "સમજાઈ ગયું", "હા ચોક્કસ", "હા", "કાલે", "તમારી"],
    "ta-IN": ["சரி", "புரிந்தது", "ஆம்", "நிச்சயமாக", "நாளை"],
    "te-IN": ["సరే", "అర్థమైంది", "అవును", "తప్పకుండా", "రేపు"],
    "kn-IN": ["ಸರಿ", "ತಿಳಿಯಿತು", "ಹೌದು", "ಖಂಡಿತ", "ನಾಳೆ"],
    "bn-IN": ["ঠিক আছে", "বুঝেছি", "হ্যাঁ", "নিশ্চয়ই", "কাল"],
}


def normalize_phrase_text(text: Optional[str]) -> str:
    """Normalizes text by removing punctuation, extra spaces, and trailing symbols."""
    if not text or not isinstance(text, str):
        return ""
    # Strip common sentence punctuation in Latin, Devanagari and Indic scripts
    cleaned = re.sub(r"[\.,!\?:;।॥\-_\(\)\[\]\{\}\"\'`~]+", " ", text)
    # Collapse multiple whitespaces
    cleaned = " ".join(cleaned.strip().split())
    return cleaned.lower()


def compute_phrase_cache_key(
    tenant_id: str,
    language: str,
    voice_id: str,
    model: str,
    sample_rate: int,
    phrase_text: str,
) -> str:
    """Computes a cryptographically secure, tenant-isolated cache key for a phrase."""
    normalized = normalize_phrase_text(phrase_text)
    raw = f"{tenant_id}:{language.lower().strip()}:{voice_id.lower().strip()}:{model.lower().strip()}:{sample_rate}:{normalized}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def synthesize_phrase_pcm(
    text: str,
    language: str,
    voice_id: str,
    model: str,
    sample_rate: int,
    api_key: str,
) -> Optional[List[bytes]]:
    """Synthesizes text via Sarvam REST TTS into 8kHz mono 16-bit PCM chunks."""
    if not api_key or not text:
        return None
    try:
        url = "https://api.sarvam.ai/text-to-speech"
        headers = {
            "api-subscription-key": api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": [text.strip()],
            "target_language_code": language,
            "speaker": voice_id,
            "speech_sample_rate": sample_rate,
            "enable_preprocessing": True,
            "model": model,
        }
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.debug(f"[PhraseAudioCache] REST TTS prewarm returned status {resp.status_code}")
                return None
            data = resp.json()
            audios = data.get("audios")
            if not audios or not isinstance(audios, list):
                return None
            raw_b64 = audios[0]
            audio_bytes = base64.b64decode(raw_b64)

            # Parse WAV to extract clean PCM
            try:
                with io.BytesIO(audio_bytes) as bio:
                    with wave.open(bio, "rb") as wf:
                        pcm_data = wf.readframes(wf.getnframes())
            except Exception:
                pcm_data = audio_bytes

            chunk_size = 320
            chunks = [
                pcm_data[i:i + chunk_size]
                for i in range(0, len(pcm_data), chunk_size)
                if len(pcm_data[i:i + chunk_size]) % 2 == 0
            ]
            return chunks if chunks else None
    except Exception as e:
        logger.debug(f"[PhraseAudioCache] REST TTS prewarm failed for '{text}': {e}")
        return None


class DynamicPhraseAudioCache:
    """Thread-safe, multi-tenant in-memory and disk cache for conversational phrase audio."""

    def __init__(self, max_entries: int = 500, disk_cache_dir: Optional[str] = None):
        self._cache: Dict[str, CachedPhraseAudio] = {}
        self._max_entries = max_entries
        if disk_cache_dir:
            self._disk_cache_dir = Path(disk_cache_dir)
        else:
            self._disk_cache_dir = Path(os.getcwd()) / ".cache" / "phrase_audio"
        try:
            self._disk_cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"[PhraseAudioCache] Could not create disk cache directory {self._disk_cache_dir}: {e}")

    def get(self, cache_key: str) -> Optional[CachedPhraseAudio]:
        """Retrieves cached audio for key (memory first, disk fallback)."""
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Check disk cache
        try:
            file_path = self._disk_cache_dir / f"{cache_key}.bin"
            if file_path.exists():
                with open(file_path, "rb") as f:
                    entry = pickle.load(f)
                if isinstance(entry, CachedPhraseAudio):
                    self._cache[cache_key] = entry
                    logger.debug(f"[PhraseAudioCache] Loaded cached phrase from disk ({len(entry.audio_chunks)} chunks, key={cache_key[:12]}...)")
                    return entry
        except Exception as e:
            logger.warning(f"[PhraseAudioCache] Failed loading disk cache for {cache_key[:12]}: {e}")
        return None

    def put(
        self,
        cache_key: str,
        audio_chunks: List[bytes],
        sample_rate: int = 8000,
        num_channels: int = 1,
        text: str = "",
    ) -> None:
        """Stores synthesized audio chunks for a phrase."""
        if not audio_chunks:
            return
        if len(self._cache) >= self._max_entries:
            # Evict oldest entry (FIFO)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
            if self._disk_cache_dir:
                try:
                    (self._disk_cache_dir / f"{oldest_key}.bin").unlink(missing_ok=True)
                except Exception:
                    pass

        entry = CachedPhraseAudio(
            audio_chunks=[bytes(chunk) for chunk in audio_chunks],
            sample_rate=sample_rate,
            num_channels=num_channels,
            text=text,
        )
        self._cache[cache_key] = entry
        logger.debug(
            f"[PhraseAudioCache] Stored {len(audio_chunks)} audio chunks in cache "
            f"(text='{text[:20]}...', sample_rate={sample_rate}, key={cache_key[:12]}...)"
        )
        # Persist to disk
        try:
            if self._disk_cache_dir:
                file_path = self._disk_cache_dir / f"{cache_key}.bin"
                with open(file_path, "wb") as f:
                    pickle.dump(entry, f)
        except Exception as e:
            logger.warning(f"[PhraseAudioCache] Failed persisting disk cache for {cache_key[:12]}: {e}")

    def get_full_phrase(
        self,
        tenant_id: str,
        language: str,
        voice_id: str,
        model: str,
        sample_rate: int = 8000,
        phrase_text: str = "",
    ) -> Optional[CachedPhraseAudio]:
        """Retrieves a full pre-rendered phrase from cache, checking tenant and global fallback."""
        if not phrase_text:
            return None
        # Try tenant-specific key
        key = compute_phrase_cache_key(
            tenant_id=tenant_id,
            language=language,
            voice_id=voice_id,
            model=model,
            sample_rate=sample_rate,
            phrase_text=phrase_text,
        )
        cached = self.get(key)
        if cached and cached.is_telephony_safe(sample_rate):
            return cached

        # Fallback to global key
        if tenant_id != "global":
            global_key = compute_phrase_cache_key(
                tenant_id="global",
                language=language,
                voice_id=voice_id,
                model=model,
                sample_rate=sample_rate,
                phrase_text=phrase_text,
            )
            cached = self.get(global_key)
            if cached and cached.is_telephony_safe(sample_rate):
                return cached
        return None

    def match_starter(
        self,
        text_chunk: str,
        tenant_id: str,
        language: str,
        voice_id: str,
        model: str,
        sample_rate: int = 8000,
    ) -> Optional[Tuple[CachedPhraseAudio, str]]:
        """Checks if text_chunk starts with a known cached conversational starter.

        Returns:
            Tuple of (CachedPhraseAudio, remaining_text) if matched, else None.
        """
        if not text_chunk or not isinstance(text_chunk, str):
            return None

        clean_text = text_chunk.strip()
        starters = MULTILINGUAL_STARTERS.get(language, MULTILINGUAL_STARTERS.get("en-IN", []))
        # Sort by length descending so longer starters (e.g. "हो नक्की") match before shorter ("हो")
        sorted_starters = sorted(starters, key=len, reverse=True)

        for starter in sorted_starters:
            norm_starter = normalize_phrase_text(starter)
            norm_prefix = normalize_phrase_text(clean_text[: len(starter) + 5])

            if norm_prefix.startswith(norm_starter):
                cached = self.get_full_phrase(
                    tenant_id=tenant_id,
                    language=language,
                    voice_id=voice_id,
                    model=model,
                    sample_rate=sample_rate,
                    phrase_text=starter,
                )
                if cached and cached.is_telephony_safe(sample_rate):
                    remainder = clean_text[len(starter):].lstrip(" ,.!?:;।॥-")
                    logger.info(
                        f"[PhraseAudioCache] Fast path matched starter='{starter}' "
                        f"(audio_chunks={len(cached.audio_chunks)}, remainder='{remainder[:25]}...')"
                    )
                    return cached, remainder

        return None

    async def prewarm_starters(
        self,
        tenant_id: str,
        language: str,
        voice_id: str,
        model: str,
        sample_rate: int,
        api_key: str,
        additional_phrases: Optional[List[str]] = None,
    ) -> int:
        """Pre-warms starter phrases and any additional key phrases for an active deployment language and voice."""
        starters = list(MULTILINGUAL_STARTERS.get(language, MULTILINGUAL_STARTERS.get("en-IN", [])))
        if additional_phrases:
            for p in additional_phrases:
                if p and p not in starters:
                    starters.append(p)

        prewarmed_count = 0
        for starter in starters:
            key = compute_phrase_cache_key(
                tenant_id=tenant_id,
                language=language,
                voice_id=voice_id,
                model=model,
                sample_rate=sample_rate,
                phrase_text=starter,
            )
            # Check if already in memory or disk cache
            cached = self.get(key)
            if cached and cached.is_telephony_safe(sample_rate):
                prewarmed_count += 1
                continue

            chunks = await synthesize_phrase_pcm(
                text=starter,
                language=language,
                voice_id=voice_id,
                model=model,
                sample_rate=sample_rate,
                api_key=api_key,
            )
            if chunks:
                self.put(
                    cache_key=key,
                    audio_chunks=chunks,
                    sample_rate=sample_rate,
                    num_channels=1,
                    text=starter,
                )
                prewarmed_count += 1
                logger.info(
                    f"[PhraseAudioCache] Pre-warmed starter '{starter}' "
                    f"({len(chunks)} chunks, lang={language}, voice={voice_id})"
                )
        return prewarmed_count

    def clear(self) -> None:
        """Clears all cached phrase audio from memory and disk."""
        self._cache.clear()
        try:
            if self._disk_cache_dir.exists():
                for p in self._disk_cache_dir.glob("*.bin"):
                    p.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"[PhraseAudioCache] Error clearing disk cache: {e}")


# Global singleton instance for the worker process lifetime
global_phrase_audio_cache = DynamicPhraseAudioCache()
