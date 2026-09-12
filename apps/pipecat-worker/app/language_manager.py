import re
from typing import Dict, List, Literal, Optional, Any
from dataclasses import dataclass

LANGUAGE_DISPLAY_NAMES: Dict[str, str] = {
    "en-IN": "English", "en-US": "English", "en-GB": "English", "en": "English",
    "hi-IN": "Hindi", "hi": "Hindi",
    "mr-IN": "Marathi", "mr": "Marathi",
    "bn-IN": "Bengali", "bn": "Bengali",
    "gu-IN": "Gujarati", "gu": "Gujarati",
    "kn-IN": "Kannada", "kn": "Kannada",
    "ml-IN": "Malayalam", "ml": "Malayalam",
    "od-IN": "Odia", "or-IN": "Odia", "od": "Odia", "or": "Odia",
    "pa-IN": "Punjabi", "pa": "Punjabi",
    "ta-IN": "Tamil", "ta": "Tamil",
    "te-IN": "Telugu", "te": "Telugu",
    "as-IN": "Assamese", "as": "Assamese",
    "ur-IN": "Urdu", "ur": "Urdu",
    "ne-IN": "Nepali", "ne": "Nepali",
    "sa-IN": "Sanskrit", "sa": "Sanskrit",
    "sd-IN": "Sindhi", "sd": "Sindhi",
    "kok-IN": "Konkani", "kok": "Konkani",
    "ks-IN": "Kashmiri", "ks": "Kashmiri",
    "mai-IN": "Maithili", "mai": "Maithili",
    "doi-IN": "Dogri", "doi": "Dogri",
    "sat-IN": "Santali", "sat": "Santali",
    "mni-IN": "Manipuri", "mni": "Manipuri",
    "brx-IN": "Bodo", "brx": "Bodo",
}

def normalize_language_code(code: str) -> str:
    if not code:
        return "en-IN"
    trimmed = code.strip().replace("_", "-")
    if trimmed.lower() == "unknown":
        return "unknown"

    lower = trimmed.lower()
    short_map = {
        "en": "en-IN", "hi": "hi-IN", "mr": "mr-IN", "bn": "bn-IN",
        "gu": "gu-IN", "kn": "kn-IN", "ml": "ml-IN", "od": "od-IN", "or": "od-IN",
        "pa": "pa-IN", "ta": "ta-IN", "te": "te-IN", "as": "as-IN",
        "ur": "ur-IN", "ne": "ne-IN", "sa": "sa-IN", "sd": "sd-IN",
        "kok": "kok-IN", "ks": "ks-IN", "mai": "mai-IN", "doi": "doi-IN",
        "sat": "sat-IN", "mni": "mni-IN", "brx": "brx-IN",
    }
    
    if lower in short_map:
        return short_map[lower]
        
    parts = trimmed.split("-")
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0].lower()}-{parts[1].upper()}"
        
    return trimmed

def get_language_display_name(code: str) -> str:
    if not code:
        return "English"
    normalized = normalize_language_code(code)
    return LANGUAGE_DISPLAY_NAMES.get(normalized) or LANGUAGE_DISPLAY_NAMES.get(code) or code

def match_supported_language(candidate: str, supported_languages: List[str]) -> Optional[str]:
    if not candidate or not supported_languages:
        return None
    
    norm_candidate = normalize_language_code(candidate)
    cand_prefix = norm_candidate.split("-")[0].lower() if norm_candidate else ""
    
    # 1. Exact / normalized match
    for supported in supported_languages:
        norm_supported = normalize_language_code(supported)
        if norm_supported.lower() == norm_candidate.lower():
            return norm_supported
            
    # 2. Base language prefix match
    for supported in supported_languages:
        norm_supported = normalize_language_code(supported)
        supp_prefix = norm_supported.split("-")[0].lower() if norm_supported else ""
        if supp_prefix and cand_prefix and supp_prefix == cand_prefix:
            return norm_supported
            
    return None

EXPLICIT_LANGUAGE_RULES = [
    {
        "languageCode": "en-IN",
        "patterns": [
            re.compile(r"(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+english", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+english", re.IGNORECASE),
            re.compile(r"talk\s+to\s+me\s+in\s+english", re.IGNORECASE),
            re.compile(r"can\s+you\s+speak\s+english", re.IGNORECASE),
            re.compile(r"\benglish\s+please\b", re.IGNORECASE),
            re.compile(r"\bswitch\s+to\s+english\b", re.IGNORECASE),
            re.compile(r"\benglish\s*me(?:in)?\s*(?:baat|bolo|batao|karo)\b", re.IGNORECASE),
            re.compile(r"\benglish\s*(?:madhe|it)\s*(?:bola|sanga)\b", re.IGNORECASE),
            re.compile(r"\bin\s+english\b", re.IGNORECASE),
            re.compile(r"\benglish\s+mein\b", re.IGNORECASE),
            re.compile(r"\bi\s+want\s+to\s+continue\s+in\s+english\b", re.IGNORECASE),
            re.compile(r"\bi\s+prefer\s+english\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "hi-IN",
        "patterns": [
            re.compile(r"हिंदी\s*में\s*(?:बात\s*करो|बोलो|बात\s*कीजिए|बात\s*कर\s*सकते\s*हो|संभाषण|बताओ|बताइए)", re.IGNORECASE),
            re.compile(r"हिन्दी\s*में\s*(?:बात\s*करो|बोलो|बात\s*कीजिए|बात\s*कर\s*सकते\s*हो|संभाषण|बताओ|बताइए)", re.IGNORECASE),
            re.compile(r"क्या\s*आप\s*हिंदी\s*में\s*बात\s*कर\s*सकते\s*हैं", re.IGNORECASE),
            re.compile(r"क्या\s*आप\s*हिन्दी\s*में\s*बात\s*कर\s*सकते\s*हैं", re.IGNORECASE),
            re.compile(r"हिंदी\s*में\s*बताओ", re.IGNORECASE),
            re.compile(r"हिंदी\s*में\s*बताइए", re.IGNORECASE),
            re.compile(r"हिंदी\s*बोलो", re.IGNORECASE),
            re.compile(r"\bhindi\s*me(?:in)?\s*(?:baat\s*karo|bolo|baat\s*kijiye|batao|bataiye)\b", re.IGNORECASE),
            re.compile(r"(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+hindi", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+hindi", re.IGNORECASE),
            re.compile(r"talk\s+to\s+me\s+in\s+hindi", re.IGNORECASE),
            re.compile(r"\bswitch\s+to\s+hindi\b", re.IGNORECASE),
            re.compile(r"\bhindi\s+please\b", re.IGNORECASE),
            re.compile(r"\bin\s+hindi\b", re.IGNORECASE),
            re.compile(r"\bhindi\s+mein\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "mr-IN",
        "patterns": [
            re.compile(r"मराठीत\s*(?:बोला|बोल|सांगा|संभाषण\s*करा)", re.IGNORECASE),
            re.compile(r"मराठी\s*मध्ये\s*(?:बोला|बोल|सांगा)", re.IGNORECASE),
            re.compile(r"तुम्ही\s*मराठीत\s*बोलू\s*शकता\s*का", re.IGNORECASE),
            re.compile(r"मराठी\s*भाषा\s*वापरा", re.IGNORECASE),
            re.compile(r"मराठी\s*बोला", re.IGNORECASE),
            re.compile(r"मराठी\s*सांगा", re.IGNORECASE),
            re.compile(r"\bmarathit\s*(?:bola|bol|sanga)\b", re.IGNORECASE),
            re.compile(r"\bmarathi\s*madhe\s*(?:bola|bol|sanga)\b", re.IGNORECASE),
            re.compile(r"(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+marathi", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+marathi", re.IGNORECASE),
            re.compile(r"talk\s+to\s+me\s+in\s+marathi", re.IGNORECASE),
            re.compile(r"\bswitch\s+to\s+marathi\b", re.IGNORECASE),
            re.compile(r"\bmarathi\s+please\b", re.IGNORECASE),
            re.compile(r"\bin\s+marathi\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "bn-IN",
        "patterns": [
            re.compile(r"বাংলায়\s*(?:বলুন|কথা\s*বলুন)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+bengali", re.IGNORECASE),
            re.compile(r"\bbangla\s+me(?:in)?\s+bolo\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "gu-IN",
        "patterns": [
            re.compile(r"ગુજરાતીમાં\s*(?:બોલો|વાત\s*કરો)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+gujarati", re.IGNORECASE),
            re.compile(r"\bgujarati\s+ma\s+bolo\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "kn-IN",
        "patterns": [
            re.compile(r"ಕನ್ನಡದಲ್ಲಿ\s*(?:ಮಾತನಾಡಿ|ಹೇಳಿ)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+kannada", re.IGNORECASE),
            re.compile(r"\bkannada\s+dalli\s+mathadi\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "ml-IN",
        "patterns": [
            re.compile(r"മലയാളത്തിൽ\s*സംസാരിക്കൂ", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+malayalam", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "pa-IN",
        "patterns": [
            re.compile(r"ਪੰਜਾਬੀ\s*ਵਿੱਚ\s*(?:ਬੋਲੋ|ਗੱਲ\s*ਕਰੋ)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+punjabi", re.IGNORECASE),
            re.compile(r"\bpunjabi\s+vich\s+bolo\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "ta-IN",
        "patterns": [
            re.compile(r"தமிழில்\s*(?:பேசுங்கள்|பேசு)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+tamil", re.IGNORECASE),
            re.compile(r"\btamilil\s+pesunga\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "te-IN",
        "patterns": [
            re.compile(r"తెలుగులో\s*(?:మాట్లాడండి|చెప్పండి)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+telugu", re.IGNORECASE),
            re.compile(r"\btelugulo\s+matladandi\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "od-IN",
        "patterns": [
            re.compile(r"ଓଡ଼ିଆରେ\s*(?:କୁହନ୍ତୁ|କଥାବାର୍ତ୍ତା\s*କରନ୍ତୁ)", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+odia", re.IGNORECASE),
        ]
    },
]

def detect_explicit_language_request(text: str) -> Optional[str]:
    if not text or not isinstance(text, str):
        return None
    trimmed = text.strip()
    for rule in EXPLICIT_LANGUAGE_RULES:
        for pattern in rule["patterns"]:
            if pattern.search(trimmed):
                return rule["languageCode"]
    return None

INDIC_SCRIPT_REGEX = re.compile(r"[\u0900-\u0D7F]")
DEVANAGARI_REGEX = re.compile(r"[\u0900-\u097F]")

HINDI_LATIN_MARKERS_REGEX = re.compile(
    r"\b(?:ka|ki|ke|hai|hain|tha|thi|hoga|hogi|hoge|kya|chahiye|batao|bataiye|karo|kijiye|sakta|sakti|sakte|milna|lena|denge|dijiye|aaj|kal|samay|tarikh|nahi|nahin|haan|bhai|mujhe|aap|kaha|kahan|kaun|kaunsa|kitna|kitni|kitne|bolo|baat|liye|mein|se|ko)\b",
    re.IGNORECASE
)

MARATHI_LATIN_MARKERS_REGEX = re.compile(
    r"\b(?:madhe|cha|chi|che|chya|ahe|aahe|ahet|hota|hoti|kay|hava|have|havi|sanga|bola|kara|shaktat|shakta|bhetayche|ghyayche|dya|aaj|udya|vel|tarikh|divas|nahi|nahin|yancha|yanchi|sathi|mala|tumhi|amhi|kiti|koni|konti|kadhi|kuthun|kuthe)\b",
    re.IGNORECASE
)

def is_reliable_automatic_switch(transcript: str, candidate_language: str, current_language: str) -> bool:
    if not transcript or not isinstance(transcript, str):
        return False
    trimmed = transcript.strip()
    if len(trimmed) < 5:
        return False
        
    words = [w for w in re.split(r"\s+", trimmed) if w]
    if len(words) < 3:
        return False
        
    cand_norm = normalize_language_code(candidate_language)
    curr_norm = normalize_language_code(current_language)
    
    cand_base = cand_norm.split("-")[0].lower() if cand_norm else ""
    curr_base = curr_norm.split("-")[0].lower() if curr_norm else ""
    
    if cand_base == "en" and curr_base != "en":
        if INDIC_SCRIPT_REGEX.search(trimmed):
            return False
        if curr_base == "hi" and HINDI_LATIN_MARKERS_REGEX.search(trimmed):
            return False
        if curr_base == "mr" and MARATHI_LATIN_MARKERS_REGEX.search(trimmed):
            return False
        return len(words) >= 3
        
    if cand_base == "hi":
        if DEVANAGARI_REGEX.search(trimmed) or HINDI_LATIN_MARKERS_REGEX.search(trimmed):
            return len(words) >= 2
        return len(words) >= 3
        
    if cand_base == "mr":
        if MARATHI_LATIN_MARKERS_REGEX.search(trimmed):
            return len(words) >= 2
        return len(words) >= 3
        
    return len(words) >= 3

def build_language_instruction(language_code: str) -> str:
    norm = normalize_language_code(language_code)
    lang_name = get_language_display_name(norm)
    base_lang = norm.split("-")[0].lower() if norm else ""
    
    if base_lang == "hi":
        code_switching_guidance = (
            "- Respond in Hindi (conversational Hinglish).\n"
            "- Speak natural conversational Hinglish (Hindi + English). Do not force archaic or pure textbook Hindi.\n"
            "- Keep standard business/everyday terms in English naturally (e.g. appointment, booking, timing, phone number, team, fees, pricing, WhatsApp, payment, confirm).\n"
            "- DO NOT switch the entire conversation to English merely because the caller uses English words or numbers."
        )
    elif base_lang == "mr":
        code_switching_guidance = (
            "- Respond in Marathi (conversational Minglish).\n"
            "- Speak natural conversational Minglish (Marathi + English). Do not force archaic or pure textbook Marathi.\n"
            "- Keep standard business/everyday terms in English naturally (e.g. appointment, booking, timing, phone number, team, fees, pricing, WhatsApp, payment, confirm).\n"
            "- DO NOT switch the entire conversation to English merely because the caller uses English words or numbers."
        )
    else:
        code_switching_guidance = (
            f"- Respond in {lang_name}.\n"
            "- Maintain this language as the active conversation language until the user explicitly requests another supported language or clearly switches."
        )
        
    return (
        f"\n\n=== ACTIVE CONVERSATION LANGUAGE POLICY ===\n"
        f"- Active Conversation Language: {lang_name} ({norm})\n"
        f"{code_switching_guidance}\n"
        f"- LATEST USER INTENT: Always prioritize answering the user's latest question directly first (e.g. today's date, operating hours, fees/pricing, location) before continuing any prior conversational step.\n"
        f"- SHORT UTTERANCES: Interpret short utterances (e.g. \"हाँ\", \"नहीं\", \"नहीं नहीं\", \"Okay\") in context of the previous turn rather than treating them as language changes.\n"
        f"- PHONE NUMBER SEMANTICS: If the caller says \"यही नंबर है\" or \"use this number\", use incoming caller phone if available; if not available, politely ask for their number without claiming fake caller ID."
    )

def build_full_instructions(base_instructions: str, language_code: str) -> str:
    clean_base = re.sub(r"\n\n=== ACTIVE CONVERSATION LANGUAGE POLICY ===[\s\S]*$", "", base_instructions)
    clean_base = re.sub(r"\n\n# Active Conversation Language[\s\S]*$", "", clean_base)
    return f"{clean_base}{build_language_instruction(language_code)}"

@dataclass
class ProcessTurnResult:
    switched: bool
    previous_language: str
    current_language: str
    reason: Literal["explicit", "auto_detect", "none"]
    decision: Optional[Literal["SWITCHED", "REJECTED", "SAME_LANGUAGE", "NO_DETECTION"]] = None
    details: Optional[str] = None

class ConversationLanguageManager:
    def __init__(self, primary: Optional[str] = None, supported_languages: Optional[List[str]] = None,
                 auto_detect_enabled: Optional[bool] = None, language_switching_enabled: Optional[bool] = None):
        self._primary = normalize_language_code(primary) if primary else "en-IN"
        raw_supported = supported_languages if supported_languages and len(supported_languages) > 0 else [self._primary]
        self._supported = [normalize_language_code(l) for l in raw_supported]
        if self._primary not in self._supported:
            self._supported.insert(0, self._primary)
            
        self._auto_detect = auto_detect_enabled is not False
        self._language_switching = language_switching_enabled is not False
        self._current = self._primary

    @property
    def primary_language(self) -> str:
        return self._primary

    @property
    def supported_languages(self) -> List[str]:
        return list(self._supported)

    @property
    def auto_detect_enabled(self) -> bool:
        return self._auto_detect

    @property
    def language_switching_enabled(self) -> bool:
        return self._language_switching

    @property
    def current_language(self) -> str:
        return self._current

    def get_stt_initial_language(self) -> str:
        return "unknown" if self._auto_detect else self._primary

    def get_tts_current_language(self) -> str:
        return self._current

    def process_user_turn(self, transcript: str, detected_language_code: Optional[str] = None) -> ProcessTurnResult:
        prev = self._current
        
        explicit_code = detect_explicit_language_request(transcript)
        if explicit_code:
            matched = match_supported_language(explicit_code, self._supported)
            if matched:
                if matched != self._current:
                    self._current = matched
                    return ProcessTurnResult(
                        switched=True,
                        previous_language=prev,
                        current_language=self._current,
                        reason="explicit",
                        decision="SWITCHED",
                        details=f"Explicit request for {get_language_display_name(matched)} ({matched})"
                    )
                return ProcessTurnResult(
                    switched=False,
                    previous_language=prev,
                    current_language=self._current,
                    reason="none",
                    decision="SAME_LANGUAGE",
                    details=f"Explicit request for current active language ({matched})"
                )
            return ProcessTurnResult(
                switched=False,
                previous_language=prev,
                current_language=self._current,
                reason="none",
                decision="REJECTED",
                details=f"Explicit request for unsupported language ({explicit_code})"
            )
            
        if not self._language_switching or not self._auto_detect:
            reason_detail = "Language switching disabled in configuration" if not self._language_switching else "Auto detection disabled in configuration"
            return ProcessTurnResult(
                switched=False,
                previous_language=prev,
                current_language=self._current,
                reason="none",
                decision="REJECTED",
                details=reason_detail
            )
            
        if detected_language_code and detected_language_code != "unknown":
            matched = match_supported_language(detected_language_code, self._supported)
            if matched:
                if matched != self._current:
                    if is_reliable_automatic_switch(transcript, matched, self._current):
                        self._current = matched
                        return ProcessTurnResult(
                            switched=True,
                            previous_language=prev,
                            current_language=self._current,
                            reason="auto_detect",
                            decision="SWITCHED",
                            details=f"Reliable automatic speech detection in {get_language_display_name(matched)} ({matched})"
                        )
                    return ProcessTurnResult(
                        switched=False,
                        previous_language=prev,
                        current_language=self._current,
                        reason="none",
                        decision="REJECTED",
                        details=f"STT detection for {matched} rejected: isolated word, filler, noise, or natural code-switching"
                    )
                return ProcessTurnResult(
                    switched=False,
                    previous_language=prev,
                    current_language=self._current,
                    reason="none",
                    decision="SAME_LANGUAGE",
                    details=f"Detected language matches active language ({self._current})"
                )
            return ProcessTurnResult(
                switched=False,
                previous_language=prev,
                current_language=self._current,
                reason="none",
                decision="REJECTED",
                details=f"Detected language ({detected_language_code}) not in configured supportedLanguages"
            )
            
        return ProcessTurnResult(
            switched=False,
            previous_language=prev,
            current_language=self._current,
            reason="none",
            decision="NO_DETECTION",
            details="No STT language code detected on utterance"
        )
