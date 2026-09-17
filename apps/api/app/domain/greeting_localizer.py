import re
from typing import Optional


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
    while preserving custom business names, agent identity, and already-localized greetings.
    """
    if not greeting or not str(greeting).strip():
        return greeting

    trimmed = str(greeting).strip()
    norm_lang = (primary_lang or "en-IN").strip().lower()
    base_lang = norm_lang.split("-")[0]
    is_pure = (language_style or "").lower() == "pure"

    # If primary language is English, keep greeting as is
    if base_lang == "en":
        return trimmed

    # If the user already wrote the greeting in Hindi / Marathi / regional language, keep it verbatim (sanitizing 'help' if pure)
    if is_already_localized(trimmed):
        if is_pure:
            trimmed = re.sub(r"\bhelp\b", "मदत", trimmed, flags=re.IGNORECASE)
        return trimmed

    # Extract business name from text or parameter
    b_name = business_name
    if not b_name:
        m = re.search(r"(?:welcome to|thank you for calling|contacting)\s+([^.,!]+)", trimmed, re.IGNORECASE)
        if m:
            b_name = m.group(1).strip()

    has_business = bool(b_name and b_name.lower() not in ["our business", "the business", "the company", "us"])

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
                return f"नमस्ते! मैं {valid_agent_name}, {b_name} से बात कर रहा हूँ। मैं आपकी क्या {help_term} कर {verb_ending}?"
            return f"नमस्ते! {b_name} में आपका स्वागत है। मैं आपकी क्या {help_term} कर {verb_ending}?"
        else:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्ते! मैं {valid_agent_name} बोल रहा हूँ। मैं आपकी क्या {help_term} कर {verb_ending}?"
            return f"नमस्ते! मैं आपकी क्या {help_term} कर {verb_ending}?"

    elif base_lang == "mr":
        verb_ending = "शकतो" if is_male else "शकते"
        help_term = "मदत" if is_pure else "help"
        if has_business:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्कार! मी {valid_agent_name}, {b_name} मधून बोलत आहे. मी तुमची काय {help_term} करू {verb_ending}?"
            return f"नमस्कार! {b_name} मध्ये तुमचं स्वागत आहे. मी तुमची काय {help_term} करू {verb_ending}?"
        else:
            if has_explicit_intro and valid_agent_name:
                return f"नमस्कार! मी {valid_agent_name} बोलत आहे. मी तुमची काय {help_term} करू {verb_ending}?"
            return f"नमस्कार! मी तुमची काय {help_term} करू {verb_ending}?"

    elif base_lang == "gu":
        if has_business:
            return f"નમસ્તે! {b_name} માં આપનું સ્વાગત છે. હું તમારી શું મદદ કરી શકું?"
        return "નમસ્તે! હું તમારી શું મદદ કરી શકું?"

    elif base_lang == "bn":
        if has_business:
            return f"নমস্কার! {b_name}-এ আপনাকে স্বাগতম। আমি আপনাকে কীভাবে সাহায্য করতে পারি?"
        return "নমস্কার! আমি আপনাকে কীভাবে সাহায্য করতে পারি?"

    elif base_lang == "ta":
        if has_business:
            return f"வணக்கம்! {b_name}-க்கு வரவேற்கிறோம். நான் உங்களுக்கு எப்படி உதவ முடியும்?"
        return "வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?"

    elif base_lang == "te":
        if has_business:
            return f"నమస్కారం! {b_name} కి స్వాగతం. నేను మీకు ఎలా సహాయపడగలను?"
        return "నమస్కారం! నేను మీకు ఎలా సహాయపడగలను?"

    elif base_lang == "kn":
        if has_business:
            return f"ನಮಸ್ಕಾರ! {b_name} ಗೆ ಸುಸ್ವಾಗತ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"
        return "ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"

    return trimmed
