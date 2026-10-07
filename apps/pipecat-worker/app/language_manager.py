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


# [LS-OLD] def build_language_instruction(language_code: str, language_style: str = "mixed", base_instructions: str = "") -> str:
# [LS-OLD]     norm = normalize_language_code(language_code)
# [LS-OLD]     name = get_language_display_name(norm)
# [LS-OLD]     return (
# [LS-OLD]         "\n\n=== MULTILINGUAL & CODE-SWITCHING POLICY ===\n"
# [LS-OLD]         "- Operational Mode: Universal Multilingual Mirroring (Caller-Driven).\n"
# [LS-OLD]         "- MANDATORY LANGUAGE MIRRORING CONTRACT:\n"
# [LS-OLD]         "  1. The language of your response MUST strictly match the language of the caller's latest utterance.\n"
# [LS-OLD]         "  2. If the caller speaks in a different language (such as English, Hindi, Marathi, Arabic, Spanish, etc.), you MUST reply 100% in that language.\n"
# [LS-OLD]         "  3. PERSISTENCE: Once the conversation switches to a new language, continue all future responses in that language until the caller switches again.\n"
# [LS-OLD]         "  4. UNIFORMITY: Never mix sentences or append phrases from different languages in one turn.\n"
# [LS-OLD]         "- CONTEXT CONTINUITY: Seamlessly maintain all booking, inquiry, and conversational progress across language transitions without restarting greetings or repeating answered questions.\n"
# [LS-OLD]     )
# [LS-OLD] 
# [LS-OLD] 
# [LS-OLD] def build_lean_language_instruction(language_code: str, language_style: str = "mixed", base_instructions: str = "") -> str:
# [LS-OLD]     norm = normalize_language_code(language_code)
# [LS-OLD]     name = get_language_display_name(norm)
# [LS-OLD]     return (
# [LS-OLD]         "\n\n=== MULTILINGUAL & CODE-SWITCHING POLICY ===\n"
# [LS-OLD]         "- Operational Mode: Universal Multilingual Mirroring (Caller-Driven).\n"
# [LS-OLD]         "- MANDATORY LANGUAGE MIRRORING CONTRACT:\n"
# [LS-OLD]         "  1. The language of your response MUST strictly match the language of the caller's latest utterance.\n"
# [LS-OLD]         "  2. If the caller speaks another language (e.g. English, Hindi, etc.), reply 100% in that language.\n"
# [LS-OLD]         "  3. PERSISTENCE: Stay in the switched language for all future turns until the caller changes language.\n"
# [LS-OLD]         "  4. UNIFORMITY: Never mix languages in one turn. Keep full context across transitions.\n"
# [LS-OLD]     )
# [LS-OLD] 
# [LS-OLD] 
# [LS-OLD] def build_full_instructions(base_instructions: str, language_code: str,
# [LS-OLD]                             language_style: str = "mixed", lean_mode: Optional[bool] = None) -> str:
# [LS-OLD]     clean = re.sub(r"\n\n=== LANGUAGE \(MANDATORY\) ===[\s\S]*$", "", base_instructions)
# [LS-OLD]     clean = re.sub(r"\n\n=== LANGUAGE POLICY ===[\s\S]*$", "", clean)
# [LS-OLD]     clean = re.sub(r"\n\n=== ACTIVE LANGUAGE ===[\s\S]*$", "", clean)
# [LS-OLD]     clean = re.sub(r"\n\n# Active Conversation Language[\s\S]*$", "", clean)
# [LS-OLD]     if lean_mode is None:
# [LS-OLD]         try:
# [LS-OLD]             from app.config import settings
# [LS-OLD]             lean_mode = getattr(settings, "ENABLE_LEAN_PROMPT_COMPRESSION", True)
# [LS-OLD]         except Exception:
# [LS-OLD]             lean_mode = True
# [LS-OLD]     instr = (build_lean_language_instruction(language_code, language_style, clean)
# [LS-OLD]              if lean_mode else
# [LS-OLD]              build_language_instruction(language_code, language_style, clean))
# [LS-OLD]     return f"{clean}{instr}"


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


# [LS-OLD] def script_consistent(transcript: str, language_code: str) -> bool:
# [LS-OLD]     """
# [LS-OLD]     Generic consistency check between the ASR's reported language and the
# [LS-OLD]     transcript's script. Rejects the common misfire where an Indic utterance
# [LS-OLD]     containing an English loanword is reported as English.
# [LS-OLD]     """
# [LS-OLD]     if not transcript:
# [LS-OLD]         return True
# [LS-OLD]     base = normalize_language_code(language_code).split("-")[0].lower()
# [LS-OLD]     expected_family = LANGUAGE_TO_SCRIPT_FAMILY.get(base, "latin")
# [LS-OLD] 
# [LS-OLD]     counts = {tag: len(regex.findall(transcript)) for tag, regex in _COMPILED_SCRIPTS}
# [LS-OLD]     total_non_latin = sum(c for tag, c in counts.items() if tag != "latin")
# [LS-OLD]     total_chars = sum(counts.values())
# [LS-OLD] 
# [LS-OLD]     if total_chars == 0:
# [LS-OLD]         return True
# [LS-OLD] 
# [LS-OLD]     if expected_family == "latin":
# [LS-OLD]         return total_non_latin < 2
# [LS-OLD] 
# [LS-OLD]     expected_count = counts.get(expected_family, 0)
# [LS-OLD]     if expected_count > 0:
# [LS-OLD]         return True
# [LS-OLD] 
# [LS-OLD]     if total_non_latin > 0:
# [LS-OLD]         return False
# [LS-OLD] 
# [LS-OLD]     return True


# [LS-OLD] def detect_transcript_language(transcript: str, supported_languages: Optional[List[str]] = None) -> Optional[str]:
# [LS-OLD]     """Scalable, zero-hardcoding language identification across supported languages.
# [LS-OLD]     
# [LS-OLD]     Uses standard statistical ISO n-gram language classification (py3langid)
# [LS-OLD]     constrained to the deployment's supported languages, with automatic script-family fallback.
# [LS-OLD]     """
# [LS-OLD]     if not transcript or not transcript.strip():
# [LS-OLD]         return None
# [LS-OLD]     
# [LS-OLD]     clean_text = transcript.strip()
# [LS-OLD]     norm_supported = [normalize_language_code(l) for l in supported_languages] if supported_languages else []
# [LS-OLD]     
# [LS-OLD]     # 1. Standard Statistical ISO Language Identification (py3langid)
# [LS-OLD]     try:
# [LS-OLD]         import py3langid
# [LS-OLD]         # Extract native non-Latin script tokens if present to prevent Latin proper nouns (e.g. "Girish Bhoir") from skewing native script classification
# [LS-OLD]         non_latin_tokens = [w for w in clean_text.split() if not re.fullmatch(r"[A-Za-z0-9_.,!?-]+", w)]
# [LS-OLD]         eval_text = " ".join(non_latin_tokens).strip() if non_latin_tokens else clean_text
# [LS-OLD] 
# [LS-OLD]         if norm_supported:
# [LS-OLD]             base_supported = list({l.split("-")[0].lower() for l in norm_supported if l})
# [LS-OLD]             if len(base_supported) == 1:
# [LS-OLD]                 return match_supported_language(base_supported[0], norm_supported)
# [LS-OLD]             py3langid.set_languages(base_supported)
# [LS-OLD]         
# [LS-OLD]         detected_iso, _ = py3langid.classify(eval_text)
# [LS-OLD]         if detected_iso:
# [LS-OLD]             matched = match_supported_language(detected_iso, norm_supported) if norm_supported else detected_iso
# [LS-OLD]             if matched and script_consistent(clean_text, matched):
# [LS-OLD]                 return matched
# [LS-OLD]     except Exception:
# [LS-OLD]         pass
# [LS-OLD] 
# [LS-OLD]     # 2. Script-Family Fallback (for single-script unambiguous Indic languages like Tamil, Telugu, Bengali, Gujarati, etc.)
# [LS-OLD]     fam = script_family(clean_text)
# [LS-OLD]     if fam != "unknown" and norm_supported:
# [LS-OLD]         matching = [
# [LS-OLD]             l for l in norm_supported
# [LS-OLD]             if LANGUAGE_TO_SCRIPT_FAMILY.get(l.split("-")[0].lower()) == fam
# [LS-OLD]         ]
# [LS-OLD]         if len(matching) == 1:
# [LS-OLD]             return matching[0]
# [LS-OLD] 
# [LS-OLD]     return None


# [LS-OLD] @dataclass
# [LS-OLD] class ProcessTurnResult:
# [LS-OLD]     switched: bool
# [LS-OLD]     previous_language: str
# [LS-OLD]     current_language: str
# [LS-OLD]     reason: str
# [LS-OLD]     decision: Optional[str] = None
# [LS-OLD]     details: Optional[str] = None


# [LS-OLD] class ConversationLanguageManager:
# [LS-OLD]     def __init__(self, primary: Optional[str] = None,
# [LS-OLD]                  supported_languages: Optional[List[str]] = None,
# [LS-OLD]                  auto_detect_enabled: Optional[bool] = None,
# [LS-OLD]                  language_switching_enabled: Optional[bool] = None,
# [LS-OLD]                  language_style: Optional[str] = "mixed",
# [LS-OLD]                  switch_after_turns: int = 1,
# [LS-OLD]                  min_words_for_switch: int = 3):
# [LS-OLD]         self._primary = normalize_language_code(primary) if primary else "en-IN"
# [LS-OLD]         raw = supported_languages if supported_languages else [self._primary]
# [LS-OLD]         self._supported = [normalize_language_code(l) for l in raw]
# [LS-OLD]         if self._primary not in self._supported:
# [LS-OLD]             self._supported.insert(0, self._primary)
# [LS-OLD]         self._switching = language_switching_enabled if language_switching_enabled is not None else True
# [LS-OLD]         self._language_style = (language_style or "mixed").lower()
# [LS-OLD]         self._current = self._primary
# [LS-OLD]         self._pending = None
# [LS-OLD]         self._pending_streak = 0
# [LS-OLD]         self._switch_after_turns = max(1, int(switch_after_turns or 1))
# [LS-OLD]         self._min_words = max(1, int(min_words_for_switch or 1))
# [LS-OLD] 
# [LS-OLD]     @property
# [LS-OLD]     def language_style(self) -> str: return self._language_style
# [LS-OLD]     @property
# [LS-OLD]     def primary_language(self) -> str: return self._primary
# [LS-OLD]     @property
# [LS-OLD]     def supported_languages(self) -> List[str]: return list(self._supported)
# [LS-OLD]     @property
# [LS-OLD]     def auto_detect_enabled(self) -> bool: return True
# [LS-OLD]     @property
# [LS-OLD]     def language_switching_enabled(self) -> bool: return self._switching
# [LS-OLD]     @property
# [LS-OLD]     def current_language(self) -> str: return self._current
# [LS-OLD]     @property
# [LS-OLD]     def switch_after_turns(self) -> int: return self._switch_after_turns
# [LS-OLD]     @property
# [LS-OLD]     def min_words_for_switch(self) -> int: return self._min_words
# [LS-OLD] 
# [LS-OLD]     def get_stt_initial_language(self) -> str:
# [LS-OLD]         if self._primary and self._primary.lower() not in ("unknown", "auto"):
# [LS-OLD]             return self._primary
# [LS-OLD]         return "auto"
# [LS-OLD] 
# [LS-OLD]     def get_tts_current_language(self) -> str:
# [LS-OLD]         return self._current
# [LS-OLD] 
# [LS-OLD]     def process_user_turn(self, transcript: str, detected_language_code: Optional[str] = None) -> ProcessTurnResult:
# [LS-OLD]         prev = self._current
# [LS-OLD]         if not self._switching:
# [LS-OLD]             return ProcessTurnResult(False, prev, self._current, "none", "DISABLED",
# [LS-OLD]                                      "Language switching disabled")
# [LS-OLD] 
# [LS-OLD]         words = [w for w in (transcript or "").strip().split() if w]
# [LS-OLD]         if len(words) < self._min_words:
# [LS-OLD]             self._pending = None
# [LS-OLD]             self._pending_streak = 0
# [LS-OLD]             return ProcessTurnResult(False, prev, self._current, "none", "SAME_LANGUAGE", "insufficient words for switch")
# [LS-OLD] 
# [LS-OLD]         candidate = None
# [LS-OLD]         # ASR detected language (the neural acoustic switch authority)
# [LS-OLD]         if detected_language_code and str(detected_language_code).lower() not in ("unknown", "auto"):
# [LS-OLD]             matched = match_supported_language(detected_language_code, self._supported)
# [LS-OLD]             if matched and script_consistent(transcript or "", matched):
# [LS-OLD]                 candidate = matched
# [LS-OLD] 
# [LS-OLD]          # 2. Generic script & character distribution classification across deployment's supported languages
# [LS-OLD]         if candidate is None:
# [LS-OLD]             detected = detect_transcript_language(transcript, self._supported)
# [LS-OLD]             if detected:
# [LS-OLD]                 candidate = detected
# [LS-OLD] 
# [LS-OLD]         if candidate is None or candidate == self._current:
# [LS-OLD]             self._pending = None
# [LS-OLD]             self._pending_streak = 0
# [LS-OLD]             return ProcessTurnResult(False, prev, self._current, "none", "SAME_LANGUAGE", None)
# [LS-OLD] 
# [LS-OLD]         # Check turn stability / threshold (hysteresis)
# [LS-OLD]         if candidate == self._pending:
# [LS-OLD]             self._pending_streak += 1
# [LS-OLD]         else:
# [LS-OLD]             self._pending = candidate
# [LS-OLD]             self._pending_streak = 1
# [LS-OLD] 
# [LS-OLD]         if self._pending_streak >= self._switch_after_turns:
# [LS-OLD]             self._current = candidate
# [LS-OLD]             self._pending = None
# [LS-OLD]             self._pending_streak = 0
# [LS-OLD]             return ProcessTurnResult(True, prev, self._current, "dynamic", "SWITCHED",
# [LS-OLD]                                      f"switched to {candidate}")
# [LS-OLD] 
# [LS-OLD]         return ProcessTurnResult(False, prev, self._current, "none", "PENDING",
# [LS-OLD]                                  f"{candidate} pending ({self._pending_streak}/{self._switch_after_turns})")
# [LS-NEW]
LANGUAGE_MIRROR_DIRECTIVE = (
    "\n\n=== LANGUAGE ===\n"
    "Always respond in the language of the caller's LATEST utterance. "
    "If the caller speaks a different language or explicitly asks to switch, follow the "
    "caller immediately. Never persist in a previous language. Never mix languages in one turn."
)
