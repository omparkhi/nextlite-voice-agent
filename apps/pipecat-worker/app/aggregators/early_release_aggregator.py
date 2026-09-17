#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Pipecat 1.8.1 Native Text Aggregation Optimization (Phase 21A).
#

"""Early-release phrase and clause aggregator for low-latency TTS streaming.

The aggregator releases safe clause/phrase boundaries while an LLM response is
still streaming so TTS can begin before the complete sentence is available.

Design goals:
- Low first-text -> TTS latency.
- Safe clause boundaries.
- Multilingual support, including Latin and Indic scripts.
- Protection for numbers, times, URLs, IDs, and abbreviations.
- No arbitrary mid-word or mid-phrase releases.
- Clean interruption and flush lifecycle.
- Compatible with Pipecat 1.8.1 BaseTextAggregator.
"""

import re
from collections.abc import AsyncIterator
from typing import Optional

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


# ---------------------------------------------------------------------------
# Punctuation
# ---------------------------------------------------------------------------

# Natural intra-sentence phrase/clause boundaries.
CLAUSE_PUNCTUATION: frozenset[str] = frozenset(
    {",", ";", ":", "—", "–", "\n"}
)

# ---------------------------------------------------------------------------
# Protected lexical patterns
# ---------------------------------------------------------------------------

PROTECTED_ABBREVIATIONS: frozenset[str] = frozenset(
    {
        # Latin
        "dr",
        "mr",
        "mrs",
        "ms",
        "prof",
        "sr",
        "jr",
        "vs",
        "am",
        "pm",
        "apt",
        "no",
        "eg",
        "ie",
        "etc",
        "st",
        "ave",
        "blvd",
        "rd",
        "dept",
        "inc",
        "ltd",
        "corp",
        # Indic / Devanagari
        "डॉ",
        "श्री",
        "श्रीमती",
        "प्रा",
        "पं",
    }
)

# Number punctuation:
#   10,000
#   3.14
#   12:30
RE_NUMBER_PUNCT = re.compile(r"\d[,\.:]\d")

# URLs/domains:
#   https://example.com
#   www.example.com
#   example.com
RE_URL_DOMAIN = re.compile(
    r"(?:https?://\S+|www\.\S+|"
    r"\b[a-zA-Z0-9-]+\.(?:com|in|org|net|edu|gov|io|ai|co)\b)",
    re.IGNORECASE,
)

# IDs such as:
#   APT-1234
#   REF-5678
RE_CODE_OR_ID = re.compile(r"\b[A-Z]{2,}-\d+\b")

# Leading conversational affirmation particles that should be deduplicated
# if an early fast-path acknowledgment filler was already dispatched for the turn.
RE_LEADING_AFFIRMATION = re.compile(
    r"^\s*(?:होय|नक्कीच|हो|हाँ\s*जी|हाँ|बिल्कुल|जी|ज़रूर|Sure|Yes|Certainly|Understood|ಖಂಡಿತ|ಹೌದು|சரி|ஆம்|సరే|హా|ಹಾ|হ্যাঁ)[,\s]+",
    re.IGNORECASE | re.UNICODE,
)


class EarlyReleaseTextAggregator(BaseTextAggregator):
    """Low-latency clause-aware text aggregator.

    The first meaningful clause is released when it reaches a safe boundary
    AND satisfies the minimum meaningful-phrase guard:

        word threshold OR character threshold

    with an absolute minimum of two words.

    Example:

        "हाँ बिल्कुल, मैं अभी देखता हूँ..."

    can release:

        "हाँ बिल्कुल,"

    without waiting for the 30-character threshold.

    Subsequent clauses use their own configured thresholds.
    """

    def __init__(
        self,
        *,
        min_first_chunk_words: int = 2,
        min_first_chunk_chars: int = 12,
        min_clause_words: int = 3,
        min_clause_chars: int = 15,
        max_first_chunk_chars: Optional[int] = None,
        aggregation_type: AggregationType = AggregationType.SENTENCE,
    ):
        """Initialize the early-release text aggregator.

        Args:
            min_first_chunk_words:
                Preferred minimum number of words for the first early chunk.

            min_first_chunk_chars:
                Preferred minimum character count for the first early chunk.

            min_clause_words:
                Preferred minimum number of words for subsequent clauses.

            min_clause_chars:
                Preferred minimum character count for subsequent clauses.

            aggregation_type:
                Base aggregation type. SENTENCE is used for normal voice
                streaming.
        """
        super().__init__(aggregation_type=aggregation_type)

        if min_first_chunk_words < 1:
            raise ValueError("min_first_chunk_words must be >= 1")

        if min_first_chunk_chars < 1:
            raise ValueError("min_first_chunk_chars must be >= 1")

        if min_clause_words < 2:
            raise ValueError("min_clause_words must be >= 2")

        if min_clause_chars < 1:
            raise ValueError("min_clause_chars must be >= 1")

        if max_first_chunk_chars is not None and max_first_chunk_chars < min_first_chunk_chars:
            raise ValueError("max_first_chunk_chars must be >= min_first_chunk_chars")

        self._min_first_chunk_words = min_first_chunk_words
        self._min_first_chunk_chars = min_first_chunk_chars
        self._min_clause_words = min_clause_words
        self._min_clause_chars = min_clause_chars
        self._max_first_chunk_chars = max_first_chunk_chars

        self._buffer: str = ""
        self._needs_lookahead: bool = False
        self._first_chunk_released: bool = False
        self._deduplicate_leading_affirmation: bool = False
        self._leading_affirmation_stripped: bool = False

    def enable_leading_affirmation_deduplication(self, enable: bool = True):
        """Enable deduplicating leading affirmative particles from LLM stream for this turn."""
        self._deduplicate_leading_affirmation = enable

    # -----------------------------------------------------------------------
    # Public state
    # -----------------------------------------------------------------------

    @property
    def text(self) -> Aggregation:
        """Return the currently buffered text."""
        return Aggregation(
            text=self._buffer.strip(),
            type=AggregationType.SENTENCE,
        )

    # -----------------------------------------------------------------------
    # Lexical protection
    # -----------------------------------------------------------------------

    def _is_protected_period(self, text: str, dot_pos: int) -> bool:
        """Return True when a period should NOT terminate a sentence."""

        if dot_pos < 0 or dot_pos >= len(text):
            return True

        # ---------------------------------------------------------------
        # Decimal numbers (e.g. 3.14 or 3. while streaming)
        # ---------------------------------------------------------------
        if dot_pos > 0 and text[dot_pos - 1].isdigit():
            if dot_pos < len(text) - 1:
                if text[dot_pos + 1].isdigit():
                    return True
            else:
                return True

        # ---------------------------------------------------------------
        # URL / domain
        # ---------------------------------------------------------------
        for match in RE_URL_DOMAIN.finditer(text):
            if match.start() <= dot_pos < match.end():
                return True

        # ---------------------------------------------------------------
        # Codes / IDs
        # ---------------------------------------------------------------
        for match in RE_CODE_OR_ID.finditer(text):
            if match.start() <= dot_pos < match.end():
                return True

        # ---------------------------------------------------------------
        # Abbreviations / honorifics
        # ---------------------------------------------------------------
        preceding = text[:dot_pos].strip()

        if preceding:
            tokens = preceding.split()

            if tokens:
                last_word = tokens[-1].strip(
                    ",;:!? \t\r\n"
                ).lower()

                if last_word in PROTECTED_ABBREVIATIONS:
                    return True

                # Initials such as:
                #   U.S.
                #   A.B.
                #
                # Only protect when the preceding token clearly resembles
                # an abbreviation chain.
                if len(last_word) == 1 and last_word.isalpha():
                    return True

        # ---------------------------------------------------------------
        # Single-letter acronym pattern
        # ---------------------------------------------------------------
        if dot_pos >= 3:
            left = text[:dot_pos]

            if re.search(r"(?:\b[A-Za-z]\.){2,}$", left):
                return True

        return False

    def _is_protected_comma_or_colon(
        self,
        text: str,
        punct_pos: int,
    ) -> bool:
        """Return True when comma/colon belongs to numeric data or URL/incomplete token."""

        if punct_pos < 0 or punct_pos >= len(text):
            return True

        char = text[punct_pos]

        if char not in {",", ":"}:
            return False

        # ---------------------------------------------------------------
        # Numeric punctuation: 10,000 or 12:30 or 10, while streaming
        # ---------------------------------------------------------------
        if punct_pos > 0 and text[punct_pos - 1].isdigit():
            if punct_pos < len(text) - 1:
                if text[punct_pos + 1].isdigit():
                    return True
            else:
                return True

        # ---------------------------------------------------------------
        # URL / URI check for colon (e.g. https:// or http:// or example.com:8080)
        # ---------------------------------------------------------------
        if char == ":":
            if punct_pos < len(text) - 1 and text[punct_pos + 1] == "/":
                return True
            for match in RE_URL_DOMAIN.finditer(text):
                if match.start() <= punct_pos < match.end():
                    return True

        return False

    # -----------------------------------------------------------------------
    # Word / phrase helpers
    # -----------------------------------------------------------------------

    def _count_words(self, text: str) -> int:
        """Count whitespace-delimited lexical words.

        This intentionally remains script-agnostic so English, Hindi,
        Marathi, Hinglish, and Minglish work through the same mechanism.
        """

        tokens = text.strip().split()

        return sum(
            1
            for token in tokens
            if any(char.isalnum() for char in token)
        )

    def _is_meaningful_candidate(
        self,
        candidate: str,
        *,
        required_words: int,
        required_chars: int,
    ) -> bool:
        """Check whether a candidate is large enough for early release.

        Important:

        The configured word and character thresholds are alternatives,
        not cumulative requirements.

        However, a hard two-word floor prevents releases such as:

            "Sure,"
            "हाँ,"
            "Okay,"

        from being emitted as isolated one-word fragments.
        """

        stripped = candidate.strip()

        if not stripped:
            return False

        word_count = self._count_words(stripped)

        # Safety floor based on configuration.
        safety_floor = self._min_first_chunk_words if not self._first_chunk_released else min(2, self._min_clause_words)
        if word_count < safety_floor:
            return False

        char_count = len(stripped)

        # Either threshold is sufficient once the safety floor is satisfied.
        return (
            word_count >= required_words
            or char_count >= required_chars
        )

    # -----------------------------------------------------------------------
    # Boundary detection
    # -----------------------------------------------------------------------

    def _find_early_clause_boundary(
        self,
        text: str,
    ) -> Optional[int]:
        """Find the earliest safe clause boundary.

        Boundary must:

        1. Be actual clause punctuation.
        2. Not be protected numeric punctuation.
        3. Have at least two words.
        4. Meet either configured word OR character threshold.

        The earliest valid boundary is returned.
        """

        if not text:
            return None

        required_words = (
            self._min_first_chunk_words
            if not self._first_chunk_released
            else self._min_clause_words
        )

        required_chars = (
            self._min_first_chunk_chars
            if not self._first_chunk_released
            else self._min_clause_chars
        )

        for index, char in enumerate(text):
            if char not in CLAUSE_PUNCTUATION:
                continue

            # Numeric punctuation such as:
            #   10,000
            #   12:30
            if self._is_protected_comma_or_colon(text, index):
                continue

            candidate = text[: index + 1]

            if self._is_meaningful_candidate(
                candidate,
                required_words=required_words,
                required_chars=required_chars,
            ):
                return index + 1

        return None

    def _find_sentence_boundary(
        self,
        text: str,
    ) -> Optional[int]:
        """Find a safe terminal sentence boundary."""

        if not text:
            return None

        # ---------------------------------------------------------------
        # Indic sentence punctuation
        # ---------------------------------------------------------------
        for index, char in enumerate(text):
            if char in UNAMBIGUOUS_SENTENCE_ENDING_PUNCTUATION:
                candidate = text[: index + 1].strip()

                if self._count_words(candidate) >= 1:
                    return index + 1

        # ---------------------------------------------------------------
        # Pipecat sentence matcher
        # ---------------------------------------------------------------
        eos = match_endofsentence(text)

        if eos <= 0:
            return None

        dot_pos = eos - 1

        while dot_pos >= 0 and text[dot_pos] in " \t\r\n":
            dot_pos -= 1

        if dot_pos >= 0 and text[dot_pos] == ".":
            if self._is_protected_period(text, dot_pos):
                return None

        return eos

    def _find_max_first_chunk_boundary(self, text: str) -> Optional[int]:
        """Release the first TTS-sized phrase without waiting for punctuation."""
        if (
            self._max_first_chunk_chars is None
            or self._first_chunk_released
            or len(text) < self._max_first_chunk_chars
        ):
            return None
        boundary = text.rfind(" ")
        if boundary <= 0:
            return None
        candidate = text[:boundary].strip()
        if not self._is_meaningful_candidate(
            candidate,
            required_words=self._min_first_chunk_words,
            required_chars=self._min_first_chunk_chars,
        ):
            return None
        return boundary

    # -----------------------------------------------------------------------
    # Aggregation
    # -----------------------------------------------------------------------

    async def aggregate(
        self,
        text: str,
    ) -> AsyncIterator[Aggregation]:
        """Consume streamed LLM text and emit safe chunks."""

        if self._aggregation_type == AggregationType.TOKEN:
            if text:
                yield Aggregation(
                    text=text,
                    type=AggregationType.TOKEN,
                )
            return

        if not text:
            return

        for char in text:
            self._buffer += char

            # -----------------------------------------------------------
            # Leading affirmative deduplication (Fast-path early ack)
            # -----------------------------------------------------------
            if (
                self._deduplicate_leading_affirmation
                and not self._leading_affirmation_stripped
                and not self._first_chunk_released
            ):
                match = RE_LEADING_AFFIRMATION.match(self._buffer)
                if match:
                    self._buffer = self._buffer[match.end():]
                    self._leading_affirmation_stripped = True

            # -----------------------------------------------------------
            # Period lookahead
            # -----------------------------------------------------------
            #
            # We delay a period decision until the following character
            # arrives so abbreviations such as "Dr." are not prematurely
            # released.
            #
            if self._needs_lookahead:
                self._needs_lookahead = False

                boundary = self._find_sentence_boundary(self._buffer)

                if boundary is not None:
                    result = self._buffer[:boundary].strip()

                    self._buffer = self._buffer[boundary:]

                    if result:
                        self._first_chunk_released = True

                        yield Aggregation(
                            text=result,
                            type=AggregationType.SENTENCE,
                        )

                        continue

            # -----------------------------------------------------------
            # Explicit terminal punctuation
            # -----------------------------------------------------------
            if (
                self._buffer
                and self._buffer[-1] in SENTENCE_ENDING_PUNCTUATION
            ):
                current_char = self._buffer[-1]

                # Unambiguous terminal punctuation:
                #
                #   !
                #   ?
                #   ।
                #   ॥
                #
                # can be released immediately.
                if (
                    current_char in UNAMBIGUOUS_SENTENCE_ENDING_PUNCTUATION
                    or current_char in {"!", "?"}
                ):
                    result = self._buffer.strip()

                    self._buffer = ""

                    if result:
                        self._first_chunk_released = True

                        yield Aggregation(
                            text=result,
                            type=AggregationType.SENTENCE,
                        )

                    continue

                # "." requires lookahead because it may be:
                #
                #   Dr.
                #   3.14
                #   example.com
                #   U.S.
                #
                if current_char == ".":
                    if not self._is_protected_period(
                        self._buffer,
                        len(self._buffer) - 1,
                    ):
                        self._needs_lookahead = True

                    continue

            # -----------------------------------------------------------
            # Early clause release
            # -----------------------------------------------------------
            clause_index = self._find_early_clause_boundary(
                self._buffer
            )

            if clause_index is None:
                clause_index = self._find_max_first_chunk_boundary(self._buffer)

            if clause_index is None:
                continue

            result = self._buffer[:clause_index].strip()

            remaining = self._buffer[clause_index:]

            if not result:
                continue

            self._buffer = remaining

            self._first_chunk_released = True

            yield Aggregation(
                text=result,
                type=AggregationType.SENTENCE,
            )

    # -----------------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------------

    async def flush(self) -> Aggregation | None:
        """Flush remaining buffered text at the end of an LLM turn."""

        if self._aggregation_type == AggregationType.TOKEN:
            return None

        remaining = self._buffer.strip()

        if not remaining:
            await self.reset()
            return None

        await self.reset()

        return Aggregation(
            text=remaining,
            type=AggregationType.SENTENCE,
        )

    async def handle_interruption(self):
        """Clear all buffered text after caller barge-in."""
        await self.reset()

    async def reset(self):
        """Reset all aggregation state."""
        self._buffer = ""
        self._needs_lookahead = False
        self._first_chunk_released = False
        self._deduplicate_leading_affirmation = False
        self._leading_affirmation_stripped = False
