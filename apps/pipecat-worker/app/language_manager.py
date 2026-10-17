"""
Language handling for the voice runtime.

Sarvam's Saaras STT performs neural acoustic language identification on each turn
(emitted in frame.result["language"]), and sarvam-105b is natively multilingual.
This module provides:
  1. Language code normalization.
  2. Language display names.
  3. Universal language mirroring prompt directive.

Zero regex heuristics, zero script token counting, zero per-language prompt mutations.
"""
from typing import Dict, Any

LANGUAGE_DISPLAY_NAMES: Dict[str, str] = {
    "en": "English", "hi": "Hindi", "mr": "Marathi", "bn": "Bengali",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "or": "Odia", "od": "Odia",
    "pa": "Punjabi", "ta": "Tamil", "te": "Telugu", "as": "Assamese", "ur": "Urdu",
    "ne": "Nepali", "sa": "Sanskrit", "sd": "Sindhi", "kok": "Konkani", "ks": "Kashmiri",
    "mai": "Maithili", "doi": "Dogri", "sat": "Santali", "mni": "Manipuri", "brx": "Bodo",
    "es": "Spanish", "fr": "French", "de": "German", "ar": "Arabic", "zh": "Chinese",
    "ja": "Japanese", "pt": "Portuguese", "ru": "Russian", "it": "Italian",
}

LANGUAGE_MIRROR_DIRECTIVE: str = (
    "\n\n=== MULTILINGUAL MIRRORING RULES ===\n"
    "1. Always respond in the language of the caller's LATEST utterance. "
    "If the caller speaks or switches to another language, immediately switch and respond 100% in that language.\n"
    "2. TOOL VERBALIZATION: When reporting results from tools (`check_available_slots`, `book_appointment`, etc.), "
    "ALWAYS formulate the response in the language specified in `respondInLanguage` from the tool output. "
    "NEVER fall back to any default clinic language or prior language when reporting tool results."
)


def normalize_language_code(code: Any) -> str:
    """Normalizes any language input into standard BCP-47 tag (e.g. 'hi' -> 'hi-IN')."""
    if not code:
        return "en-IN"
    if hasattr(code, "value"):
        code = code.value
    s = str(code).strip().replace("_", "-")
    if s.lower() in ("unknown", "auto"):
        return s.lower()
    parts = s.split("-")
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0].lower()}-{parts[1].upper()}"
    if len(parts) == 1 and len(parts[0]) == 2:
        return f"{parts[0].lower()}-IN"
    return s


def get_language_display_name(code: Any) -> str:
    if not code:
        return "English"
    base = normalize_language_code(code).split("-")[0].lower()
    return LANGUAGE_DISPLAY_NAMES.get(base, str(code))
