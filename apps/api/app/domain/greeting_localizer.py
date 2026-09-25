import re
from typing import Optional, List, Tuple, Dict


# Ordered list of (regex_pattern, translations_dict) from most specific to least specific
CLINIC_AND_BUSINESS_PATTERNS: List[Tuple[str, Dict[str, str]]] = [
    # 1. Dental specialties
    (
        r"(?i)\b(?:dental\s+clinic(?:\s*&\s*implant\s+cent(?:re|er))?|dental\s+care|dental\s+hospital|dental\s+cent(?:re|er)|dental\s+surgery|dental)\b",
        {
            "mr": "दातांचा दवाखाना",
            "hi": "दांतों का दवाखाना",
            "gu": "દાંતનું દવાખાનું",
            "bn": "দাঁতের ক্লিনিক",
            "ta": "பல் மருத்துவமனை",
            "te": "దంత వైద్యశాల",
            "kn": "ಹಲ್ಲಿನ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 2. Eye / Ophthalmology specialties
    (
        r"(?i)\b(?:eye\s+clinic|eye\s+care|eye\s+hospital|eye\s+cent(?:re|er)|ophthalmology\s+clinic|netralaya)\b",
        {
            "mr": "डोळ्यांचा दवाखाना",
            "hi": "आंखों का अस्पताल",
            "gu": "આંખની હોસ્પિટલ",
            "bn": "চোখের হাসপাতাল",
            "ta": "கண் மருத்துவமனை",
            "te": "కంటి ఆసుపత్రి",
            "kn": "ಕಣ್ಣಿನ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 3. Skin & Hair / Dermatology
    (
        r"(?i)\b(?:skin\s+(?:&|and)\s+hair\s+clinic|skin\s+clinic|skin\s+care|dermatology\s+clinic|derma\s+clinic|cosmetology\s+clinic)\b",
        {
            "mr": "त्वचारोग दवाखाना",
            "hi": "त्वचा का अस्पताल",
            "gu": "ચામડીનું દવાખાનું",
            "bn": "ত্বকের ক্লিনিক",
            "ta": "தோல் மருத்துவமனை",
            "te": "చర్మ వైద్యశాల",
            "kn": "ಚರ್ಮದ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 4. Children / Pediatric
    (
        r"(?i)\b(?:children(?:'s)?\s+hospital|children(?:'s)?\s+clinic|pediatric\s+clinic|child\s+care\s+clinic|child\s+hospital|kids\s+clinic)\b",
        {
            "mr": "लहान मुलांचा दवाखाना",
            "hi": "बच्चों का अस्पताल",
            "gu": "બાળકોની હોસ્પિટલ",
            "bn": "শিশু হাসপাতাল",
            "ta": "குழந்தைகள் மருத்துவமனை",
            "te": "పిల్లల ఆసుపత్రి",
            "kn": "ಮಕ್ಕಳ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 5. Orthopedic / Bone & Joint
    (
        r"(?i)\b(?:orthopedic\s+hospital|orthopedic\s+clinic|ortho\s+clinic|bone\s+(?:&|and)\s+joint\s+clinic|bone\s+clinic|fracture\s+clinic)\b",
        {
            "mr": "हाडांचा दवाखाना",
            "hi": "हड्डियों का अस्पताल",
            "gu": "હાડકાંની હોસ્પિટલ",
            "bn": "হাড়ের হাসপাতাল",
            "ta": "எலும்பு மருத்துவமனை",
            "te": "ఎముకల ఆసుపత్రి",
            "kn": "ಮೂಳೆ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 6. Heart / Cardiac
    (
        r"(?i)\b(?:cardiac\s+hospital|heart\s+hospital|heart\s+clinic|cardiology\s+clinic)\b",
        {
            "mr": "हृदयरोग रुग्णालय",
            "hi": "हृदय रोग अस्पताल",
            "gu": "હૃદયની હોસ્પિટલ",
            "bn": "হার্ট হাসপাতাল",
            "ta": "இதய மருத்துவமனை",
            "te": "గుండె ఆసుపత్రి",
            "kn": "ಹೃದಯ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 7. Maternity / Women's care
    (
        r"(?i)\b(?:maternity\s+hospital|maternity\s+home|women(?:'s)?\s+hospital|gynecology\s+clinic|gynaecology\s+clinic)\b",
        {
            "mr": "स्त्रीरोग रुग्णालय",
            "hi": "महिला अस्पताल",
            "gu": "સ્ત્રીઓની હોસ્પિટલ",
            "bn": "মাতৃসেবা হাসপাতাল",
            "ta": "மகளிர் மருத்துவமனை",
            "te": "మహిళా ఆసుపత్రి",
            "kn": "ಮಹಿಳಾ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 8. Polyclinic / Multi-specialty
    (
        r"(?i)\b(?:multi-?specialty\s+hospital|multi-?speciality\s+hospital|multi-?specialty\s+clinic|multi-?speciality\s+clinic|polyclinic)\b",
        {
            "mr": "मल्टीस्पेशालिटी दवाखाना",
            "hi": "मल्टीस्पेशलिटी अस्पताल",
            "gu": "મલ્ટીસ્પેશ્યાલિટી હોસ્પિટલ",
            "bn": "মাল্টিস্পেশালিটি হাসপাতাল",
            "ta": "பன்முக மருத்துவமனை",
            "te": "మల్టీస్పెషాలిటీ ఆసుపత్రి",
            "kn": "ಮಲ್ಟಿಸ್ಪೆಷಾಲಿಟಿ ಆಸ್ಪತ್ರೆ",
        },
    ),
    # 9. General Clinic / Dispensary
    (
        r"(?i)\b(?:clinic|dispensary|care\s+clinic|family\s+clinic)\b",
        {
            "mr": "दवाखाना",
            "hi": "दवाखाना",
            "gu": "દવાખાનું",
            "bn": "ক্লিনিক",
            "ta": "கிளினிக்",
            "te": "క్లినిక్",
            "kn": "ಚಿಕಿತ್ಸಾಲಯ",
        },
    ),
    # 10. General Hospital / Medical Centre
    (
        r"(?i)\b(?:hospital|medical\s+cent(?:re|er)|health\s+cent(?:re|er))\b",
        {
            "mr": "रुग्णालय",
            "hi": "अस्पताल",
            "gu": "હોસ્પિટલ",
            "bn": "হাসপাতাল",
            "ta": "மருத்துவமனை",
            "te": "ఆసుపత్రి",
            "kn": "ಆಸ್ಪತ್ರೆ",
        },
    ),
]


def localize_business_name(business_name: Optional[str], target_lang: str = "en") -> str:
    """
    Dynamically translates clinic specialties and business category descriptors into colloquial,
    natural regional terms (e.g., 'Glaze Dental Clinic' -> 'Glaze दातांचा दवाखाना' in Marathi,
    'Glaze दांतों का दवाखाना' in Hindi) while preserving unique brand or doctor names.
    Non-medical/unmatched business names are preserved as-is.
    """
    if not business_name or not str(business_name).strip():
        return ""

    name = str(business_name).strip()
    base_lang = (target_lang or "en").split("-")[0].lower()

    if base_lang == "en":
        return name

    # If the business name is already in Indic script, keep as-is
    if re.search(r"[\u0900-\u0D7F]", name):
        return name

    for pattern, lang_dict in CLINIC_AND_BUSINESS_PATTERNS:
        if base_lang in lang_dict:
            replacement = lang_dict[base_lang]
            matched = re.search(pattern, name)
            if matched:
                return re.sub(pattern, replacement, name, count=1).strip()

    return name


def is_already_localized(text: str) -> bool:
    """Checks if the greeting already contains Indic script or explicit Hinglish/regional keywords."""
    if not text:
        return False
    # Check for Indic Unicode characters (Devanagari, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Gurmukhi, Odia)
    if re.search(r"[\u0900-\u0D7F]", text):
        return True

    # Check for common romanized/Hinglish/Minglish opening keywords
    lower = text.lower()
    indic_markers = [
        "namaste", "namaskar", "swagat", "madad", "kar sakta", "kar sakti",
        "kaise madad", "kya madad", "aple swagat", "kay madat", "karu shakto",
        "karu shakte", "vanakkam", "namaskaram", "sat sri akal", "kem cho", "kemon achen"
    ]
    return any(marker in lower for marker in indic_markers)


def localize_greeting(
    greeting: str,
    primary_lang: str = "en-IN",
    business_name: Optional[str] = None,
    agent_name: Optional[str] = None,
    is_male: bool = True,
    language_style: str = "mixed",
) -> str:
    """
    Dynamically adapts an English greeting to the configured primary language (e.g. Hindi, Marathi)
    while preserving custom business names, agent identity, dynamic clinic specialty localization,
    and already-localized greetings.
    """
    if not greeting or not str(greeting).strip():
        return greeting

    trimmed = str(greeting).strip()
    norm_lang = (primary_lang or "en-IN").strip().lower()
    base_lang = norm_lang.split("-")[0]
    is_pure = (language_style or "").lower() == "pure"

    # Extract business name from text or parameter
    b_name = business_name
    if not b_name:
        m = re.search(r"(?:welcome to|thank you for calling|contacting)\s+([^.,!]+)", trimmed, re.IGNORECASE)
        if m:
            b_name = m.group(1).strip()

    # If primary language is English, keep greeting as is (substituting template vars if present)
    if base_lang == "en":
        if b_name:
            trimmed = trimmed.replace("{businessName}", b_name).replace("{business_name}", b_name)
        return trimmed

    # If the user already wrote the greeting in Hindi / Marathi / regional language, keep it verbatim (resolving vars & sanitizing 'help' if pure)
    if is_already_localized(trimmed):
        if is_pure:
            trimmed = re.sub(r"\bhelp\b", "मदत", trimmed, flags=re.IGNORECASE)
        if b_name:
            b_name_localized = localize_business_name(b_name, base_lang)
            trimmed = trimmed.replace("{businessName}", b_name_localized).replace("{business_name}", b_name_localized)
        return trimmed

    has_business = bool(b_name and b_name.lower() not in ["our business", "the business", "the company", "us"])
    b_name_localized = localize_business_name(b_name, base_lang) if has_business else ""

    # Check if original greeting is a "Welcome" or greeting-style rather than an explicit self-intro
    is_welcome_style = bool(re.search(r"\b(welcome|thank you for calling|calling|how can i help|how can i assist)\b", trimmed, re.IGNORECASE))
    has_explicit_intro = bool(re.search(r"\b(i am|this is|my name is)\b", trimmed, re.IGNORECASE))

    # Filter out generic or placeholder agent names like 'Assistant'
    valid_agent_name = agent_name if (agent_name and agent_name.lower() not in ["assistant", "ai", "bot", "virtual assistant"]) else None

    # Adapt based on target base language:
    if base_lang == "hi":
        verb_ending = "सकता हूँ" if is_male else "सकती हूँ"
        help_term = "मदद" if is_pure else "help"
        if has_business:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्ते! मैं {valid_agent_name}, {b_name_localized} से बात कर रहा हूँ। मैं आपकी क्या {help_term} कर {verb_ending}?"
            return f"नमस्ते! {b_name_localized} में आपका स्वागत है। मैं आपकी क्या {help_term} कर {verb_ending}?"
        else:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्ते! मैं {valid_agent_name} बोल रहा हूँ। मैं आपकी क्या {help_term} कर {verb_ending}?"
            return f"नमस्ते! मैं आपकी क्या {help_term} कर {verb_ending}?"

    elif base_lang == "mr":
        verb_ending = "शकतो" if is_male else "शकते"
        help_term = "मदत" if is_pure else "help"
        if has_business:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्कार! मी {valid_agent_name}, {b_name_localized} मधून बोलत आहे. मी तुमची काय {help_term} करू {verb_ending}?"
            return f"नमस्कार! {b_name_localized} मध्ये तुमचं स्वागत आहे. मी तुमची काय {help_term} करू {verb_ending}?"
        else:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्कार! मी {valid_agent_name} बोलत आहे. मी तुमची काय {help_term} करू {verb_ending}?"
            return f"नमस्कार! मी तुमची काय {help_term} करू {verb_ending}?"

    elif base_lang == "gu":
        if has_business:
            return f"નમસ્તે! {b_name_localized} માં આપનું સ્વાગત છે. હું તમારી શું મદદ કરી શકું?"
        return "નમસ્તે! હું તમારી શું મદદ કરી શકું?"

    elif base_lang == "bn":
        if has_business:
            return f"নমস্কার! {b_name_localized}-এ আপনাকে স্বাগতম। আমি আপনাকে কীভাবে সাহায্য করতে পারি?"
        return "নমস্কার! আমি আপনাকে কীভাবে সাহায্য করতে পারি?"

    elif base_lang == "ta":
        if has_business:
            return f"வணக்கம்! {b_name_localized}-க்கு வரவேற்கிறோம். நான் உங்களுக்கு எப்படி உதவ முடியும்?"
        return "வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?"

    elif base_lang == "te":
        if has_business:
            return f"నమస్కారం! {b_name_localized} కి స్వాగతం. నేను మీకు ఎలా సహాయపడగలను?"
        return "నమస్కారం! నేను మీకు ఎలా సహాయపడగలను?"

    elif base_lang == "kn":
        if has_business:
            return f"ನಮಸ್ಕಾರ! {b_name_localized} ಗೆ ಸುಸ್ವಾಗತ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"
        return "ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"

    return trimmed

