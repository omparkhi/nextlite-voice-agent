"""Indic and Marathi/Hindi data normalization utilities for Control Plane API.

Normalizes:
1. Spoken number words and Devanagari numerals to standard integer string (e.g. "बावीस" -> "22").
2. Spoken Marathi/Hindi time expressions into canonical "hh:mm AM/PM" (e.g. "साडे एक वाजता" -> "01:30 PM").
3. Service title sanitization from acoustic ASR noise/fillers.
"""

from typing import Optional, Any
import re

DEVANAGARI_DIGITS = {
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"
}

INDIC_WORD_NUMBERS = {
    # 0 - 10
    "शून्य": 0, "एक": 1, "दोन": 2, "दो": 2, "तीन": 3, "चार": 4, "पाच": 5, "पांच": 5,
    "सहा": 6, "छह": 6, "सात": 7, "आठ": 8, "नऊ": 9, "नौ": 9, "दहा": 10, "दस": 10,
    # 11 - 20
    "अकरा": 11, "ग्यारह": 11, "बारा": 12, "बारह": 12, "तेरा": 13, "तेरह": 13,
    "चौदा": 14, "चौदह": 14, "पंधरा": 15, "पंद्रह": 15, "सोळा": 16, "सोलह": 16,
    "सतरा": 17, "सत्रह": 17, "अठरा": 18, "अठारह": 18, "एकोणीस": 19, "उन्नीस": 19,
    "वीस": 20, "बीस": 20,
    # 21 - 30
    "एकवीस": 21, "इक्कीस": 21, "बावीस": 22, "बाईस": 22, "तेवीस": 23, "तेईस": 23,
    "चोवीस": 24, "चौबीस": 24, "पंचवीस": 25, "पच्चीस": 25, "सव्वीस": 26, "छब्बीस": 26,
    "सत्तावीस": 27, "सत्ताईस": 27, "अठ्ठावीस": 28, "अट्ठावीस": 28, "अट्ठाईस": 28,
    "एकोणतीस": 29, "उनतीस": 29, "तीस": 30,
    # 31 - 40
    "एकतीस": 31, "इकतीस": 31, "बत्तीस": 32, "तेहतीस": 33, "तैंतीस": 33,
    "चौतीस": 34, "चौंतीस": 34, "पस्तीस": 35, "पैंतीस": 35, "छत्तीस": 36,
    "सदतीस": 37, "सैंतीस": 37, "अडतीस": 38, "अड़तीस": 38, "एकोणचाळीस": 39, "उनचालीस": 39,
    "चाळीस": 40, "चालीस": 40,
    # 41 - 50
    "एक्केचाळीस": 41, "इकतालीस": 41, "बेचाळीस": 42, "बयालीस": 42, "त्रेचाळीस": 43, "तैंतालीस": 43,
    "चव्वेचाळीस": 44, "चौवालीस": 44, "पंचेचाळीस": 45, "पैंतालीस": 45, "शेहेचाळीस": 46, "छियालीस": 46,
    "सत्तेचाळीस": 47, "सैंतालीस": 47, "अठ्ठेचाळीस": 48, "अड़तालीस": 48, "एकोणपन्नास": 49, "उनचास": 49,
    "पन्नास": 50, "पचास": 50,
    # 51 - 60
    "एक्कावन्न": 51, "इक्यावन": 51, "बावन्न": 52, "बावन": 52, "त्रेपन्न": 53, "तिरपन": 53,
    "चोपन्न": 54, "चौवन": 54, "पंचावन्न": 55, "पचपन": 55, "छप्पन्न": 56, "छप्पन": 56,
    "सत्तावन्न": 57, "सत्तावन": 57, "अठ्ठावन्न": 58, "अठावन": 58, "एकोणसाठ": 59, "उनसठ": 59,
    "साठ": 60,
    # 61 - 70
    "एकसष्ठ": 61, "इकसठ": 61, "बासष्ठ": 62, "बासठ": 62, "त्रेसष्ठ": 63, "तिरसठ": 63,
    "चौसष्ठ": 64, "चौंसठ": 64, "पासष्ठ": 65, "पैंसठ": 65, "सहासष्ठ": 66, "छियासठ": 66,
    "सदुसष्ठ": 67, "सरसठ": 67, "अडुसष्ठ": 68, "अड़सठ": 68, "एकोणसत्तर": 69, "उनहत्तर": 69,
    "सत्तर": 70,
    # 71 - 80
    "एकाहत्तर": 71, "इकहत्तर": 71, "बाहत्तर": 72, "बहत्तर": 72, "त्र्याहत्तर": 73, "तिहत्तर": 73,
    "चौर्‍याहत्तर": 74, "चौहत्तर": 74, "पंचाहत्तर": 75, "पचहत्तर": 75, "शहात्तर": 76, "छिहत्तर": 76,
    "सत्त्याहत्तर": 77, "सतहत्तर": 77, "अठ्ठ्याहत्तर": 78, "अठहत्तर": 78, "एकोणऐंशी": 79, "उन्नासी": 79,
    "ऐंशी": 80, "अस्सी": 80,
    # 81 - 90
    "एक्याऐंशी": 81, "इक्यासी": 81, "ब्याऐंशी": 82, "बयासी": 82, "त्र्याऐंशी": 83, "तिरासी": 83,
    "चौऱ्याऐंशी": 84, "चौरासी": 84, "पंच्यांशी": 85, "पचासी": 85, "शहाऐंशी": 86, "छियासी": 86,
    "सत्त्याऐंशी": 87, "सतासी": 87, "अठ्ठ्याऐंशी": 88, "अठासी": 88, "एकोणनव्वद": 89, "नवासी": 89,
    "नव्वद": 90, "नब्बे": 90,
    # 91 - 100
    "एक्याण्णव": 91, "इक्यानवे": 91, "ब्याण्णव": 92, "बानवे": 92, "त्र्याण्णव": 93, "तिरानवे": 93,
    "चौऱ्याण्णव": 94, "चौरानवे": 94, "पंच्याण्णव": 95, "पंचानवे": 95, "शहाण्णव": 96, "छियानवे": 96,
    "सत्त्याण्णव": 97, "सतानवे": 97, "अठ्ठ्याण्णव": 98, "अठानवे": 98, "नव्व्याण्णव": 99, "निन्यानवे": 99,
    "शंभर": 100, "सौ": 100
}


def normalize_devanagari_digits(text: str) -> str:
    """Replaces Devanagari numerals (०-९) with standard digits (0-9)."""
    if not text:
        return ""
    result = []
    for ch in str(text):
        result.append(DEVANAGARI_DIGITS.get(ch, ch))
    return "".join(result)


def normalize_indic_age(raw_age: Optional[Any]) -> Optional[str]:
    """Extracts and normalizes age from string or number."""
    if raw_age is None:
        return None
    s = str(raw_age).strip()
    if not s or s.lower() in ("none", "null", "undefined", "-"):
        return None

    # 1. Convert any Devanagari digits
    s = normalize_devanagari_digits(s)

    # 2. Look for explicit digits
    digits_match = re.search(r"\b(\d{1,3})\b", s)
    if digits_match:
        val = int(digits_match.group(1))
        if 0 < val <= 120:
            return str(val)

    # 3. Look for word matches in Marathi/Hindi
    words = re.findall(r"[\u0900-\u097F]+", s.lower())
    for w in words:
        if w in INDIC_WORD_NUMBERS:
            val = INDIC_WORD_NUMBERS[w]
            if 0 < val <= 120:
                return str(val)

    # Fallback to digits extraction if any exist
    clean = re.sub(r"[^\d]", "", s)
    if clean and len(clean) <= 3:
        val = int(clean)
        if 0 < val <= 120:
            return str(val)

    return s


def normalize_indic_time(raw_time: Optional[Any]) -> str:
    """Parses spoken Indic/Marathi/Hindi or standard time strings to canonical 'hh:mm AM/PM'."""
    if not raw_time:
        return "10:00 AM"

    orig = str(raw_time).strip()
    s = normalize_devanagari_digits(orig).lower()

    # Determine period intent (morning / afternoon / evening / night)
    period = None
    if any(m in s for m in ("सकाळी", "morning", "am", "a.m.")):
        period = "AM"
    elif any(e in s for e in ("संध्याकाळी", "सायंकाळी", "evening", "रात्री", "night", "pm", "p.m.")):
        period = "PM"
    elif any(d in s for d in ("दुपारी", "afternoon")):
        period = "PM"

    # 1. Special Marathi word fractions (दीड, अडीच)
    if "दीड" in s or "dedh" in s:
        p = period or "PM"
        return f"01:30 {p}"
    if "अडीच" in s or "adhai" in s or "dhai" in s:
        p = period or "PM"
        return f"02:30 {p}"

    # 2. Marathi / Hindi time fractions (साडे, सव्वा, पावणे)
    hour_words = {
        "एक": 1, "दोन": 2, "दो": 2, "तीन": 3, "चार": 4, "पाच": 5, "पांच": 5,
        "सहा": 6, "छह": 6, "सात": 7, "आठ": 8, "नऊ": 9, "नौ": 9, "दहा": 10, "दस": 10,
        "अकरा": 11, "ग्यारह": 11, "बारा": 12, "बारह": 12,
        "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "11": 11, "12": 12
    }

    # "साडे X" -> X:30
    sade_match = re.search(r"(?:साडे|saade|sade)\s*([^\s]+)", s)
    if sade_match:
        hw = sade_match.group(1).strip()
        if hw in hour_words:
            h = hour_words[hw]
            p = period or ("AM" if 9 <= h <= 11 else "PM")
            return f"{h:02d}:30 {p}"

    # "सव्वा X" -> X:15
    savva_match = re.search(r"(?:सव्वा|savva|sawwa)\s*([^\s]+)", s)
    if savva_match:
        hw = savva_match.group(1).strip()
        if hw in hour_words:
            h = hour_words[hw]
            p = period or ("AM" if 9 <= h <= 11 else "PM")
            return f"{h:02d}:15 {p}"

    # "पावणे X" -> (X-1):45
    pavne_match = re.search(r"(?:पावणे|paune|pavne)\s*([^\s]+)", s)
    if pavne_match:
        hw = pavne_match.group(1).strip()
        if hw in hour_words:
            target_h = hour_words[hw]
            h = 12 if target_h == 1 else target_h - 1
            p = period or ("AM" if 9 <= h <= 11 else "PM")
            return f"{h:02d}:45 {p}"

    # 3. Simple word hours (e.g. "सहा वाजता", "दहा वाजता", "सात बजे", "संध्याकाळी सात", "दुपारी एक")
    if not any(f in s for f in ("साडे", "सव्वा", "पावणे", "दीड", "अडीच", "sade", "savva", "paune")):
        for w, h in hour_words.items():
            if re.search(rf"(?:^|\s){w}(?:\s|$|वाजता|बजे|o'clock|hrs|hr)", s):
                p = period or ("AM" if 9 <= h <= 11 else "PM")
                return f"{h:02d}:00 {p}"

    # 4. Standard Digital Time format parsing (e.g. "11:30 AM", "06:00 PM", "1:30", "17:00")
    std_match = re.search(r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?", s)
    if std_match:
        hour = int(std_match.group(1))
        minute = int(std_match.group(2)) if std_match.group(2) else 0
        tag = std_match.group(3)

        if tag:
            period = tag.upper()
        elif hour >= 13:
            hour -= 12
            period = "PM"
        elif not period:
            if 9 <= hour <= 11:
                period = "AM"
            else:
                period = "PM"

        if hour > 12:
            hour = hour % 12
        if hour == 0:
            hour = 12

        return f"{hour:02d}:{minute:02d} {period}"

    return orig


def sanitize_service_title(raw_title: Optional[Any], default_service: str = "General Consultation") -> str:
    """Sanitizes service titles from conversational filler phrases or ASR mistranscriptions."""
    if not raw_title:
        return default_service

    s = str(raw_title).strip()
    if not s or s.lower() in ("none", "null", "undefined", "-", "general", "na", "n/a"):
        return default_service

    lower_s = s.lower()
    if lower_s in ("nala nayika", "mala nayika", "mala nahi ka", "nahi ka", "नाही का", "नाळ नायिका"):
        return default_service

    return s
