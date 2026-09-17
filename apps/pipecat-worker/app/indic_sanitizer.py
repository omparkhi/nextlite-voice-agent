"""NextLite Voice V3 — Indic Text Sanitizer for Sarvam TTS.

Converts romanized Indian proper nouns (names, locations, clinic terms) to explicit Devanagari script
to ensure 100% natural pronunciation across Sarvam Bulbul TTS models.
"""

import re
from typing import Dict

PROPER_NOUN_DEVANA_MAP: Dict[str, str] = {
    # Pronouns, Verbs & Conversational Fillers (Marathi & Hindi)
    "tumchi": "तुमची",
    "tumcha": "तुमचा",
    "tumhi": "तुम्ही",
    "tumha": "तुम्हा",
    "tumhala": "तुम्हाला",
    "apla": "आपला",
    "apli": "आपली",
    "aapla": "आपला",
    "aapli": "आपली",
    "aaple": "आपले",
    "zali": "झाली",
    "jhali": "झाली",
    "zala": "झाला",
    "jhala": "झाला",
    "ahe": "आहे",
    "aahe": "आहे",
    "ahet": "आहेत",
    "kahi": "काही",
    "adchan": "अडचण",
    "sanga": "सांगा",
    "nakkich": "नक्कीच",
    "nakki": "नक्की",
    "mi": "मी",
    "kay": "काय",
    "ho": "हो",
    "thik": "ठीक",
    "shubh": "शुभ",
    "divas": "दिवस",
    "dhanyawad": "धन्यवाद",
    "dhanyavad": "धन्यवाद",
    "maiti": "माहिती",
    "maahiti": "माहिती",
    "karun": "करून",
    "deto": "देतो",
    "deta": "देतो",
    "sangto": "संगतो",
    "shaky": "शक्य",
    "shakya": "शक्य",
    "naaw": "नाव",
    "naav": "नाव",
    "naam": "नाम",
    "aani": "आणि",
    "ani": "आणि",
    "aah": "आहे",
    "vaya": "वय",
    "vay": "वय",
    "umr": "उम्र",
    "umra": "उम्र",
    "kaay": "काय",
    "baddal": "बद्दल",
    "badal": "बद्दल",
    "sangital": "सांगितलं",
    "sangitale": "सांगितले",
    "bolu": "बोलू",
    "kasa": "कसा",
    "kashi": "कशी",
    "kashe": "कसे",

    # English Loanwords Common in Telephony Voice Confirmations
    "appointment": "अपॉइंटमेंट",
    "appointments": "अपॉइंटमेंट्स",
    "book": "बुक",
    "booked": "बुक",
    "booking": "बुकिंग",
    "doctor": "डॉक्टर",
    "doctors": "डॉक्टर्स",
    "slot": "स्लॉट",
    "slots": "स्लॉट",
    "date": "तारीख",
    "time": "वेळ",
    "confirm": "कन्फर्म",
    "confirmed": "कन्फर्म",
    "help": "मदत",
    "age": "वय",
    "name": "नाव",
    "number": "नंबर",
    "mobile": "मोबाइल",
    "phone": "फोन",
    "call": "कॉल",

    # Common Surnames
    "deshmukh": "देशमुख",
    "pardeshi": "परदेशी",
    "parkhi": "पारखी",
    "choudhary": "चौधरी",
    "chowdhury": "चौधरी",
    "kulkarni": "कुलकर्णी",
    "patil": "पाटील",
    "sharma": "शर्मा",
    "verma": "वर्मा",
    "gupta": "गुप्ता",
    "joshi": "जोशी",
    "pawar": "पवार",
    "jhavar": "झावर",
    "more": "मोरे",
    "shinde": "शिंदे",
    "gaikwad": "गायकवाड",
    "jadhav": "जाधव",
    "kamble": "कांबळे",
    "kadam": "कदम",

    # Locations
    "pune": "पुणे",
    "mumbai": "मुंबई",
    "kothrud": "कोथरूड",
    "baner": "बानेर",
    "wakad": "वाकड",
    "hadapsar": "हडपसर",
    "vimannagar": "विमाननगर",
    "viman nagar": "विमाननगर",
    "camp": "कॅम्प",
    "deccan": "डेक्कन",
    "katraj": "कात्रज",
    "hinjawadi": "हिंजवडी",
    "hinjewadi": "हिंजवडी",

    # Clinic Terms
    "glaze": "ग्लेज",
    "dental": "डेन्टल",
    "clinic": "क्लिनिक",
}


LLM_SPECIAL_TOKEN_REGEX = re.compile(r"<\|.*?\|>|</s>|<s>|<[\w_]+>", re.IGNORECASE)


def sanitize_indic_tts_text(text: str, language: str = "mr-IN") -> str:
    """Sanitizes text for TTS playback by stripping LLM special tokens and mapping romanized terms to Indic script."""
    if not text or not isinstance(text, str):
        return text or ""

    # 1. Strip LLM special control tokens & ChatML tags (e.g. <|end_of_turn|>, <|im_end|>, etc.)
    sanitized = LLM_SPECIAL_TOKEN_REGEX.sub("", text).strip()
    if not sanitized:
        return ""

    lang_prefix = (language or "").lower().split("-")[0]
    if lang_prefix not in ("mr", "hi"):
        return sanitized

    for roman, devanagari in PROPER_NOUN_DEVANA_MAP.items():
        pattern = re.compile(rf"\b{re.escape(roman)}\b", re.IGNORECASE)
        sanitized = pattern.sub(devanagari, sanitized)

    return sanitized
