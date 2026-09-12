#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Pipecat 1.8.1 Native Text Aggregation Optimization (Phase 21A).
#

"""Early-release phrase and clause aggregator for low-latency TTS streaming.

Reduces LLM first text -> TTS started delay (~400ms P50) toward ~150-200ms
by identifying safe, natural clause and phrase boundaries before the full
sentence is complete, while strictly protecting:
- Complete sentences and phrases (no 1-word fragments or isolated fillers)
- Numbers with commas or decimal points (e.g. 10,000, 3.14)
- Honorifics and abbreviations (e.g. Dr., Mr., a.m., p.m.)
- Phone numbers, appointment IDs, URLs, and alphanumeric codes
- Multilingual scripts (English, Hindi, Marathi, Hinglish, Minglish, Devanagari danda)
- Clean interruption and flush lifecycles
"""

import re
from collections.abc import AsyncIterator
from typing import Optional, Set

from loguru import logger
from pipecat.utils.string import (
    SENTENCE_ENDING_PUNCTUATION,
    UNAMBIGUOUS_SENTENCE_ENDING_PUNCTUATION,
    match_endofsentence,
)
from pipecat.utils.text.base_text_aggregator import (
    Aggregation,
    AggregationType,
    BaseTextAggregator,
)

# Punctuation that marks natural clause/phrase boundaries within a sentence
CLAUSE_PUNCTUATION: frozenset[str] = frozenset({",", ";", ":", "—", "–", "\n"})

# All boundary punctuation (clause + terminal)
ALL_BOUNDARY_PUNCTUATION: frozenset[str] = CLAUSE_PUNCTUATION | SENTENCE_ENDING_PUNCTUATION

# Common abbreviations and honorifics that end with a period and must not be split
PROTECTED_ABBREVIATIONS: frozenset[str] = frozenset({
    # Latin honorifics and abbreviations
    "dr", "mr", "mrs", "ms", "prof", "sr", "jr",
    "vs", "am", "pm", "apt", "no", "eg", "ie", "etc",
    "st", "ave", "blvd", "rd", "dept", "inc", "ltd", "corp",
    # Indic / Devanagari honorifics ending with a period
    "डॉ", "श्री", "श्रीमती", "प्रा", "पं",
})

# Regex to detect punctuation inside a number (e.g., 10,000 or 3.14 or 12:30)
RE_NUMBER_PUNCT = re.compile(r"\d[,\.:]\d")

# Regex to detect domain names or URLs (e.g., example.com, test.in)
RE_URL_DOMAIN = re.compile(r"(?:https?://\S+|www\.\S+|\b[a-zA-Z0-9-]+\.(?:com|in|org|net|edu|gov|io|ai|co)\b)", re.IGNORECASE)

# Regex to detect appointment IDs or hyphenated codes (e.g., APT-1234, REF-5678)
RE_CODE_OR_ID = re.compile(r"\b[A-Z]{2,}-\d+\b")


class EarlyReleaseTextAggregator(BaseTextAggregator):
    """Clause-aware early release text aggregator for low-latency voice streaming.

    Accumulates incoming LLM tokens and detects safe phrase/clause boundaries
    to release the first meaningful phrase to TTS earlier (~150-200ms) than
    waiting for a full sentence plus non-whitespace lookahead.
    """

    def __init__(
        self,
        *,
        min_first_chunk_words: int = 3,
        min_first_chunk_chars: int = 30,
        min_clause_words: int = 4,
        min_clause_chars: int = 30,
        aggregation_type: AggregationType = AggregationType.SENTENCE,
    ):
        """Initialize the early release text aggregator.

        Args:
            min_first_chunk_words: Minimum words required for the first early-released phrase (default: 3).
            min_first_chunk_chars: Minimum characters required for the first early-released phrase (default: 20).
            min_clause_words: Minimum words required for subsequent clause splits within a sentence (default: 4).
            min_clause_chars: Minimum characters required for subsequent clause splits (default: 25).
            aggregation_type: Base aggregation type (default: SENTENCE).
        """
        super().__init__(aggregation_type=aggregation_type)
        self._min_first_chunk_words = min_first_chunk_words
        self._min_first_chunk_chars = min_first_chunk_chars
        self._min_clause_words = min_clause_words
        self._min_clause_chars = min_clause_chars

        self._buffer: str = ""
        self._needs_lookahead: bool = False
        self._first_chunk_released: bool = False

    @property
    def text(self) -> Aggregation:
        """Get the currently aggregated text."""
        return Aggregation(text=self._buffer.strip(" "), type=AggregationType.SENTENCE)

    def _is_protected_period(self, text: str, dot_pos: int) -> bool:
        """Check if a period at dot_pos is part of an abbreviation, number, URL, or code."""
        # 1. Number check (e.g. 3.14)
        if dot_pos > 0 and dot_pos < len(text) - 1:
            if text[dot_pos - 1].isdigit() and text[dot_pos + 1].isdigit():
                return True

        # 2. Abbreviation check (e.g. Dr., Mr., p.m., डॉ.)
        preceding = text[:dot_pos].strip()
        if preceding:
            tokens = preceding.split()
            if tokens:
                last_word = tokens[-1].strip(",;: \t\r\n").lower()
                if last_word in PROTECTED_ABBREVIATIONS:
                    return True

        # 3. Single-letter acronyms (e.g. U.S.A.)
        if dot_pos >= 1 and text[dot_pos - 1].isupper():
            if dot_pos >= 3 and text[dot_pos - 2] == "." and text[dot_pos - 3].isupper():
                return True

        # 4. URL/domain check
        for match in RE_URL_DOMAIN.finditer(text):
            if match.start() <= dot_pos < match.end():
                return True

        return False

    def _is_protected_comma_or_colon(self, text: str, punct_pos: int) -> bool:
        """Check if a comma or colon is inside a number or time (e.g. 10,000 or 4:00 PM)."""
        char = text[punct_pos]
        if char in (",", ":"):
            # If flanked by digits, it is part of a number or time
            if punct_pos > 0 and punct_pos < len(text) - 1:
                if text[punct_pos - 1].isdigit() and text[punct_pos + 1].isdigit():
                    return True
        return False

    def _count_words(self, text: str) -> int:
        """Counts words across Latin and Indic scripts."""
        # Split on whitespace; tokens with non-whitespace characters count as words
        tokens = [t for t in text.strip().split() if any(c.isalnum() for c in t)]
        return len(tokens)

    def _find_early_clause_boundary(self, text: str) -> Optional[int]:
        """Finds a safe clause boundary (comma, semicolon, colon, dash, newline) for early release.

        Returns index after the punctuation if a valid boundary is found, else None.
        """
        required_words = self._min_first_chunk_words if not self._first_chunk_released else self._min_clause_words
        required_chars = self._min_first_chunk_chars if not self._first_chunk_released else self._min_clause_chars

        for i, ch in enumerate(text):
            if ch in CLAUSE_PUNCTUATION:
                # Check protection
                if self._is_protected_comma_or_colon(text, i):
                    continue

                candidate = text[: i + 1]
                stripped = candidate.strip()
                word_count = self._count_words(stripped)
                char_count = len(stripped)

                # Must satisfy minimum meaningful phrase threshold to prevent 1-word fragments
                if word_count >= required_words and char_count >= required_chars:
                    # Require lookahead whitespace or character following the clause boundary
                    # so we don't split mid-token
                    if i + 1 < len(text):
                        return i + 1

        return None

    def _find_sentence_boundary(self, text: str) -> Optional[int]:
        """Finds a terminal sentence boundary using NLTK and unambiguous Indic punctuation."""
        # 1. Unambiguous non-Latin punctuation (Devanagari danda ।, ॥, etc.)
        for i, ch in enumerate(text):
            if ch in UNAMBIGUOUS_SENTENCE_ENDING_PUNCTUATION:
                candidate = text[: i + 1].strip()
                if self._count_words(candidate) >= 1:
                    return i + 1

        # 2. Standard NLTK sentence matching
        eos = match_endofsentence(text)
        if eos > 0:
            # Verify the boundary is not an abbreviation period (e.g. Dr.)
            dot_pos = eos - 1
            while dot_pos >= 0 and text[dot_pos] in " \t\r\n":
                dot_pos -= 1
            if dot_pos >= 0 and text[dot_pos] == ".":
                if self._is_protected_period(text, dot_pos):
                    return None
            return eos

        return None

    async def aggregate(self, text: str) -> AsyncIterator[Aggregation]:
        """Aggregate text character-by-character and yield completed phrase/sentence aggregations."""
        if self._aggregation_type == AggregationType.TOKEN:
            if text:
                yield Aggregation(text=text, type=AggregationType.TOKEN)
            return

        for char in text:
            self._buffer += char

            # If we were waiting for lookahead after sentence-ending punctuation
            if self._needs_lookahead:
                if char.strip():
                    self._needs_lookahead = False
                    boundary = self._find_sentence_boundary(self._buffer)
                    if boundary:
                        result = self._buffer[:boundary].strip(" ")
                        self._buffer = self._buffer[boundary:]
                        self._first_chunk_released = True
                        yield Aggregation(text=result, type=AggregationType.SENTENCE)
                        continue
                else:
                    # Still whitespace, keep accumulating
                    continue

            # Check 1: Terminal sentence boundary with lookahead
            if self._buffer and self._buffer[-1] in SENTENCE_ENDING_PUNCTUATION:
                # For unambiguous Devanagari danda, no lookahead required
                if self._buffer[-1] in UNAMBIGUOUS_SENTENCE_ENDING_PUNCTUATION:
                    result = self._buffer.strip(" ")
                    self._buffer = ""
                    self._first_chunk_released = True
                    yield Aggregation(text=result, type=AggregationType.SENTENCE)
                    continue
                else:
                    # Latin punctuation: mark need lookahead to disambiguate
                    self._needs_lookahead = True
                    continue

            # Check 2: Clause boundary for early release (especially on the first chunk)
            clause_idx = self._find_early_clause_boundary(self._buffer)
            if clause_idx:
                result = self._buffer[:clause_idx].strip(" ")
                self._buffer = self._buffer[clause_idx:]
                self._first_chunk_released = True
                yield Aggregation(text=result, type=AggregationType.SENTENCE)

    async def flush(self) -> Aggregation | None:
        """Flush any remaining text in the buffer at the end of an LLM turn."""
        if self._aggregation_type == AggregationType.TOKEN:
            return None

        if self._buffer.strip():
            result = self._buffer.strip(" ")
            await self.reset()
            return Aggregation(text=result, type=AggregationType.SENTENCE)

        await self.reset()
        return None

    async def handle_interruption(self):
        """Handle caller interruptions (barge-in) by clearing all buffers and resetting state."""
        await self.reset()

    async def reset(self):
        """Reset internal accumulator and state tracking."""
        self._buffer = ""
        self._needs_lookahead = False
        self._first_chunk_released = False
