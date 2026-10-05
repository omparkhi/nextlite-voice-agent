"""
Language handling for the voice runtime.

We do NOT classify language from the transcript. Sarvam's Saaras STT performs
language identification and returns a language code on each TranscriptionFrame;
sarvam-105b is natively multilingual and mirrors the caller. This module only:
  1. normalises language codes,
  2. tracks the active language (driven by the ASR signal) to pick the TTS voice,
  3. builds ONE generic, script-agnostic language directive for the prompt.

No token sets, no per-language regexes, no hardcoded phrases in any language.
"""
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

LANGUAGE_DISPLAY_NAMES: Dict[str, str] = {
    "en": "English", "hi": "Hindi", "mr": "Marathi", "bn": "Bengali",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "or": "Odia", "od": "Odia",
    "pa": "Punjabi", "ta": "Tamil", "te": "Telugu", "as": "Assamese", "ur": "Urdu",
    "ne": "Nepali", "sa": "Sanskrit", "sd": "Sindhi", "kok": "Konkani", "ks": "Kashmiri",
    "mai": "Maithili", "doi": "Dogri", "sat": "Santali", "mni": "Manipuri", "brx": "Bodo",
}


def normalize_language_code(code: Any) -> str:
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
    return s


def get_language_display_name(code: Any) -> str:
    if not code:
        return "English"
    base = normalize_language_code(code).split("-")[0].lower()
    return LANGUAGE_DISPLAY_NAMES.get(base, str(code))


def match_supported_language(candidate: str, supported_languages: List[str]) -> Optional[str]:
    if not candidate or not supported_languages:
        return None
    cand = normalize_language_code(candidate)
    cand_base = cand.split("-")[0].lower()
    for s in supported_languages:
        if normalize_language_code(s).lower() == cand.lower():
            return normalize_language_code(s)
    for s in supported_languages:
        if normalize_language_code(s).split("-")[0].lower() == cand_base:
            return normalize_language_code(s)
    return None


def build_language_instruction(language_code: str, language_style: str = "mixed", base_instructions: str = "") -> str:
    norm = normalize_language_code(language_code)
    name = get_language_display_name(norm)
    return (
        "\n\n=== MULTILINGUAL & CODE-SWITCHING POLICY ===\n"
        "- Operational Mode: Universal Multilingual Mirroring (Caller-Driven).\n"
        "- MANDATORY LANGUAGE MIRRORING CONTRACT:\n"
        "  1. The language of your response MUST strictly match the language of the caller's latest utterance.\n"
        "  2. If the caller speaks in a different language (such as English, Hindi, Marathi, Arabic, Spanish, etc.), you MUST reply 100% in that language.\n"
        "  3. PERSISTENCE: Once the conversation switches to a new language, continue all future responses in that language until the caller switches again.\n"
        "  4. UNIFORMITY: Never mix sentences or append phrases from different languages in one turn.\n"
        "- CONTEXT CONTINUITY: Seamlessly maintain all booking, inquiry, and conversational progress across language transitions without restarting greetings or repeating answered questions.\n"
    )


def build_lean_language_instruction(language_code: str, language_style: str = "mixed", base_instructions: str = "") -> str:
    norm = normalize_language_code(language_code)
    name = get_language_display_name(norm)
    return (
        "\n\n=== MULTILINGUAL & CODE-SWITCHING POLICY ===\n"
        "- Operational Mode: Universal Multilingual Mirroring (Caller-Driven).\n"
        "- MANDATORY LANGUAGE MIRRORING CONTRACT:\n"
        "  1. The language of your response MUST strictly match the language of the caller's latest utterance.\n"
        "  2. If the caller speaks another language (e.g. English, Hindi, etc.), reply 100% in that language.\n"
        "  3. PERSISTENCE: Stay in the switched language for all future turns until the caller changes language.\n"
        "  4. UNIFORMITY: Never mix languages in one turn. Keep full context across transitions.\n"
    )


def build_full_instructions(base_instructions: str, language_code: str,
                            language_style: str = "mixed", lean_mode: Optional[bool] = None) -> str:
    clean = re.sub(r"\n\n=== LANGUAGE \(MANDATORY\) ===[\s\S]*$", "", base_instructions)
    clean = re.sub(r"\n\n=== LANGUAGE POLICY ===[\s\S]*$", "", clean)
    clean = re.sub(r"\n\n=== ACTIVE LANGUAGE ===[\s\S]*$", "", clean)
    clean = re.sub(r"\n\n# Active Conversation Language[\s\S]*$", "", clean)
    if lean_mode is None:
        try:
            from app.config import settings
            lean_mode = getattr(settings, "ENABLE_LEAN_PROMPT_COMPRESSION", True)
        except Exception:
            lean_mode = True
    instr = (build_lean_language_instruction(language_code, language_style, clean)
             if lean_mode else
             build_language_instruction(language_code, language_style, clean))
    return f"{clean}{instr}"


SCRIPT_RANGES = [
    ("devanagari", "\u0900-\u097F"),   # Hindi, Marathi, Nepali, Sanskrit
    ("bengali",    "\u0980-\u09FF"),   # Bengali, Assamese
    ("gurmukhi",   "\u0A00-\u0A7F"),   # Punjabi
    ("gujarati",   "\u0A80-\u0AFF"),   # Gujarati
    ("tamil",      "\u0B80-\u0BFF"),
    ("telugu",     "\u0C00-\u0C7F"),
    ("kannada",    "\u0C80-\u0CFF"),
    ("malayalam",  "\u0D00-\u0D7F"),
    ("arabic",     "\u0600-\u06FF"),   # Urdu, Arabic
    ("cyrillic",   "\u0400-\u04FF"),
    ("cjk",        "\u4E00-\u9FFF"),
    ("hangul",     "\uAC00-\uD7AF"),
    ("latin",      "A-Za-z"),
]

_COMPILED_SCRIPTS = [(tag, re.compile(f"[{r}]")) for tag, r in SCRIPT_RANGES]

LANGUAGE_TO_SCRIPT_FAMILY: Dict[str, str] = {
    "en": "latin",
    "hi": "devanagari",
    "mr": "devanagari",
    "ne": "devanagari",
    "sa": "devanagari",
    "bn": "bengali",
    "as": "bengali",
    "pa": "gurmukhi",
    "gu": "gujarati",
    "ta": "tamil",
    "te": "telugu",
    "kn": "kannada",
    "ml": "malayalam",
    "ur": "arabic",
    "ar": "arabic",
    "ru": "cyrillic",
    "uk": "cyrillic",
    "zh": "cjk",
    "ja": "cjk",
    "ko": "hangul",
}


def script_family(text: str) -> str:
    """Returns the script-family tag with the most characters in the text, or 'unknown'."""
    if not text:
        return "unknown"
    counts = {tag: len(regex.findall(text)) for tag, regex in _COMPILED_SCRIPTS}
    best_tag, best_count = max(counts.items(), key=lambda item: item[1])
    return best_tag if best_count > 0 else "unknown"


def script_consistent(transcript: str, language_code: str) -> bool:
    """
    Generic consistency check between the ASR's reported language and the
    transcript's script. Rejects the common misfire where an Indic utterance
    containing an English loanword is reported as English.
    """
    if not transcript:
        return True
    base = normalize_language_code(language_code).split("-")[0].lower()
    expected_family = LANGUAGE_TO_SCRIPT_FAMILY.get(base, "latin")

    counts = {tag: len(regex.findall(transcript)) for tag, regex in _COMPILED_SCRIPTS}
    total_non_latin = sum(c for tag, c in counts.items() if tag != "latin")
    total_chars = sum(counts.values())

    if total_chars == 0:
        return True

    if expected_family == "latin":
        return total_non_latin < 2

    expected_count = counts.get(expected_family, 0)
    if expected_count > 0:
        return True

    if total_non_latin > 0:
        return False

    return True


def detect_transcript_language(transcript: str, supported_languages: Optional[List[str]] = None) -> Optional[str]:
    """Scalable, zero-hardcoding language identification across supported languages.
    
    Uses standard statistical ISO n-gram language classification (py3langid)
    constrained to the deployment's supported languages, with automatic script-family fallback.
    """
    if not transcript or not transcript.strip():
        return None
    
    clean_text = transcript.strip()
    norm_supported = [normalize_language_code(l) for l in supported_languages] if supported_languages else []
    
    # 1. Standard Statistical ISO Language Identification (py3langid)
    try:
        import py3langid
        # Extract native non-Latin script tokens if present to prevent Latin proper nouns (e.g. "Girish Bhoir") from skewing native script classification
        non_latin_tokens = [w for w in clean_text.split() if not re.fullmatch(r"[A-Za-z0-9_.,!?-]+", w)]
        eval_text = " ".join(non_latin_tokens).strip() if non_latin_tokens else clean_text

        if norm_supported:
            base_supported = list({l.split("-")[0].lower() for l in norm_supported if l})
            if len(base_supported) == 1:
                return match_supported_language(base_supported[0], norm_supported)
            py3langid.set_languages(base_supported)
        
        detected_iso, _ = py3langid.classify(eval_text)
        if detected_iso:
            matched = match_supported_language(detected_iso, norm_supported) if norm_supported else detected_iso
            if matched and script_consistent(clean_text, matched):
                return matched
    except Exception:
        pass

    # 2. Script-Family Fallback (for single-script unambiguous Indic languages like Tamil, Telugu, Bengali, Gujarati, etc.)
    fam = script_family(clean_text)
    if fam != "unknown" and norm_supported:
        matching = [
            l for l in norm_supported
            if LANGUAGE_TO_SCRIPT_FAMILY.get(l.split("-")[0].lower()) == fam
        ]
        if len(matching) == 1:
            return matching[0]

    return None


@dataclass
class ProcessTurnResult:
    switched: bool
    previous_language: str
    current_language: str
    reason: str
    decision: Optional[str] = None
    details: Optional[str] = None


class ConversationLanguageManager:
    def __init__(self, primary: Optional[str] = None,
                 supported_languages: Optional[List[str]] = None,
                 auto_detect_enabled: Optional[bool] = None,
                 language_switching_enabled: Optional[bool] = None,
                 language_style: Optional[str] = "mixed",
                 switch_after_turns: int = 1,
                 min_words_for_switch: int = 3):
        self._primary = normalize_language_code(primary) if primary else "en-IN"
        raw = supported_languages if supported_languages else [self._primary]
        self._supported = [normalize_language_code(l) for l in raw]
        if self._primary not in self._supported:
            self._supported.insert(0, self._primary)
        self._switching = language_switching_enabled if language_switching_enabled is not None else True
        self._language_style = (language_style or "mixed").lower()
        self._current = self._primary
        self._pending = None
        self._pending_streak = 0
        self._switch_after_turns = max(1, int(switch_after_turns or 1))
        self._min_words = max(1, int(min_words_for_switch or 1))

    @property
    def language_style(self) -> str: return self._language_style
    @property
    def primary_language(self) -> str: return self._primary
    @property
    def supported_languages(self) -> List[str]: return list(self._supported)
    @property
    def auto_detect_enabled(self) -> bool: return True
    @property
    def language_switching_enabled(self) -> bool: return self._switching
    @property
    def current_language(self) -> str: return self._current
    @property
    def switch_after_turns(self) -> int: return self._switch_after_turns
    @property
    def min_words_for_switch(self) -> int: return self._min_words

    def get_stt_initial_language(self) -> str:
        if self._primary and self._primary.lower() not in ("unknown", "auto"):
            return self._primary
        return "auto"

    def get_tts_current_language(self) -> str:
        return self._current

    def process_user_turn(self, transcript: str, detected_language_code: Optional[str] = None) -> ProcessTurnResult:
        prev = self._current
        if not self._switching:
            return ProcessTurnResult(False, prev, self._current, "none", "DISABLED",
                                     "Language switching disabled")

        words = [w for w in (transcript or "").strip().split() if w]
        if len(words) < self._min_words:
            self._pending = None
            self._pending_streak = 0
            return ProcessTurnResult(False, prev, self._current, "none", "SAME_LANGUAGE", "insufficient words for switch")

        candidate = None
        # ASR detected language (the neural acoustic switch authority)
        if detected_language_code and str(detected_language_code).lower() not in ("unknown", "auto"):
            matched = match_supported_language(detected_language_code, self._supported)
            if matched and script_consistent(transcript or "", matched):
                candidate = matched

         # 2. Generic script & character distribution classification across deployment's supported languages
        if candidate is None:
            detected = detect_transcript_language(transcript, self._supported)
            if detected:
                candidate = detected

        if candidate is None or candidate == self._current:
            self._pending = None
            self._pending_streak = 0
            return ProcessTurnResult(False, prev, self._current, "none", "SAME_LANGUAGE", None)

        # Check turn stability / threshold (hysteresis)
        if candidate == self._pending:
            self._pending_streak += 1
        else:
            self._pending = candidate
            self._pending_streak = 1

        if self._pending_streak >= self._switch_after_turns:
            self._current = candidate
            self._pending = None
            self._pending_streak = 0
            return ProcessTurnResult(True, prev, self._current, "dynamic", "SWITCHED",
                                     f"switched to {candidate}")

        return ProcessTurnResult(False, prev, self._current, "none", "PENDING",
                                 f"{candidate} pending ({self._pending_streak}/{self._switch_after_turns})")
