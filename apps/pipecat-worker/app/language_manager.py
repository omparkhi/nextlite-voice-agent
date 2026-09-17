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
            re.compile(r"\benglish\s*me(?:in)?\s*(?:baat\s*karo|baat\s*kijiye|bolo|bol\s*sakte\s*ho|batao|bataiye|karo)\b", re.IGNORECASE),
            re.compile(r"\benglish\s*(?:madhe|it)\s*(?:bola|bol|sanga)\b", re.IGNORECASE),
            re.compile(r"\bin\s+english\b", re.IGNORECASE),
            re.compile(r"\benglish\s+mein\b", re.IGNORECASE),
            re.compile(r"\bi\s+want\s+to\s+continue\s+in\s+english\b", re.IGNORECASE),
            re.compile(r"\bi\s+prefer\s+english\b", re.IGNORECASE),
            re.compile(r"(?:kya\s+)?(?:aap\s+)?english\s*(?:me|mein|mai)?\s*(?:baat\s*kar\s*sakte\s*ho|baat\s*kr\s*skte\s*ho|bol\s*sakte\s*ho|bol\s*skte\s*ho|bolo|baat\s*karo)", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "hi-IN",
        "patterns": [
            re.compile(r"(?:क्या\s*आप\s*)?(?:हिंदी|हिन्दी)\s*में\s*(?:बात\s*कर\s*सकते\s*हो|बात\s*कर\s*सकते\s*हैं|बात\s*करो|बोलो|बोल\s*सकते\s*हो|बोल\s*सकते\s*हैं|बात\s*कीजिए|संभाषण|बताओ|बताइए)", re.IGNORECASE),
            re.compile(r"(?:हिंदी|हिन्दी)\s*(?:बोलो|बताओ|बताइए|बोल\s*सकते\s*हो|बात\s*करो)", re.IGNORECASE),
            re.compile(r"(?:kya\s+)?(?:aap\s+)?(?:hindi|हिन्दी|हिंदी)\s*(?:me(?:in)?|mai|m)?\s*(?:baat\s*kar\s*sakte\s*ho|baat\s*kr\s*skte\s*ho|baat\s*kar\s*sakte\s*hain|baat\s*kr\s*skte\s*hn|baat\s*karo|baat\s*kijiye|bolo|bol\s*sakte\s*ho|bol\s*skte\s*ho|bolte\s*ho|aati\s*hai|batao|bataiye)", re.IGNORECASE),
            re.compile(r"(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+hindi", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+hindi", re.IGNORECASE),
            re.compile(r"talk\s+to\s+me\s+in\s+hindi", re.IGNORECASE),
            re.compile(r"can\s+you\s+speak\s+hindi", re.IGNORECASE),
            re.compile(r"\bswitch\s+to\s+hindi\b", re.IGNORECASE),
            re.compile(r"\bhindi\s+please\b", re.IGNORECASE),
            re.compile(r"\bin\s+hindi\b", re.IGNORECASE),
            re.compile(r"\bhindi\s+mein\b", re.IGNORECASE),
            re.compile(r"\bhindi\s+me\b", re.IGNORECASE),
            re.compile(r"\bhindi\s*bolo\b", re.IGNORECASE),
        ]
    },
    {
        "languageCode": "mr-IN",
        "patterns": [
            re.compile(r"(?:तुम्ही\s*)?मराठीत\s*(?:बोला|बोल|सांगा|बोलू\s*शकता\s*का|संभाषण\s*करा)", re.IGNORECASE),
            re.compile(r"मराठी\s*मध्ये\s*(?:बोला|बोल|सांगा|बोलू\s*शकता\s*का)", re.IGNORECASE),
            re.compile(r"मराठी\s*भाषा\s*वापरा", re.IGNORECASE),
            re.compile(r"मराठी\s*बोला", re.IGNORECASE),
            re.compile(r"मराठी\s*सांगा", re.IGNORECASE),
            re.compile(r"(?:tumhi\s+)?(?:marathi|मराठी)\s*(?:madhe|t|it|me)?\s*(?:bolu\s*shakta\s*ka|bola|bol|sanga|baat\s*karo|bol\s*sakte\s*ho)", re.IGNORECASE),
            re.compile(r"\bmarathit\s*(?:bola|bol|sanga)\b", re.IGNORECASE),
            re.compile(r"\bmarathi\s*madhe\s*(?:bola|bol|sanga)\b", re.IGNORECASE),
            re.compile(r"(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+marathi", re.IGNORECASE),
            re.compile(r"(?:speak|talk|continue|switch)\s+(?:in|to)\s+marathi", re.IGNORECASE),
            re.compile(r"talk\s+to\s+me\s+in\s+marathi", re.IGNORECASE),
            re.compile(r"can\s+you\s+speak\s+marathi", re.IGNORECASE),
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

MARATHI_DEVANAGARI_REGEX = re.compile(
    r"\b(?:आहे|आहेत|नाही|नाहीत|नाव|लिहायचं|लिहायचे|लिहायची|लिहाचं|करायचं|करायचे|करायची|हवं|हवा|हवी|पाहिजे|भेटायचं|घ्यायचं|सांगा|सांग|बोला|बोल|द्या|कधी|कुठे|कसा|कशी|कसे|कोण|काय|किती|माझं|माझे|माझी|मला|तुम्हाला|आम्हाला|त्यांना|होता|होती|होते|मराठी|मराठीत|दुपारी|सकाळी|संध्याकाळी|उद्या|परवा|चालू|पत्ता|दवाखाना|तपासणी|नोंदणी|घ्या|द्या)\b|"
    r"(?:ायचं|ायची|ायचा|ायचे|ावं|णार|लोय|ल्या|मध्ये|बद्दल|साठी|कडून|वरून)\b",
    re.IGNORECASE
)

HINDI_DEVANAGARI_REGEX = re.compile(
    r"\b(?:है|हैं|था|थी|थे|होगी|होगा|होंगे|चाहिए|बताओ|बताइए|करो|कीजिए|सकता|सकती|सकते|मिलना|लेना|देंगे|दीजिए|कल|परसों|समय|तारीख|नहीं|हाँ|मुझे|आप|आपको|कहाँ|कौन|कौनसा|कितना|कितनी|कितने|बोलो|बात|लिए|में|से|को|नाम|लिखना|दर्ज|करवाना|अपॉइंटमेंट|हिंदी|हिन्दी)\b",
    re.IGNORECASE
)

HINDI_LATIN_MARKERS_REGEX = re.compile(
    r"\b(?:kya|aap|mujhe|hum|humko|chahiye|hai|hain|tha|thi|the|hoga|hogi|hoge|batao|bataiye|karo|kijiye|sakta|sakti|sakte|skte|skta|skti|milna|lena|denge|dijiye|aaj|kal|samay|tarikh|nahi|nahin|haan|bhai|kaha|kahan|kaun|kaunsa|kitna|kitni|kitne|bolo|baat|liye|mein|mai|se|ko|kyu|kyon|kaise)\b",
    re.IGNORECASE
)

MARATHI_LATIN_MARKERS_REGEX = re.compile(
    r"\b(?:madhe|cha|chi|che|chya|ahe|aahe|ahet|hota|hoti|kay|hava|have|havi|sanga|bola|shaktat|shakta|bhetayche|ghyayche|dya|udya|divas|yancha|yanchi|sathi|mala|tumhi|amhi|kiti|koni|konti|kadhi|kuthun|kuthe|lihacha|lihayche|pahije)\b",
    re.IGNORECASE
)

def is_reliable_automatic_switch(transcript: str, candidate_language: str, current_language: str) -> bool:
    if not transcript or not isinstance(transcript, str):
        return False
    trimmed = transcript.strip()
    if len(trimmed) < 2:
        return False
        
    words = [w for w in re.split(r"\s+", trimmed) if w]
    if len(words) < 1:
        return False
        
    cand_norm = normalize_language_code(candidate_language)
    curr_norm = normalize_language_code(current_language)
    
    cand_base = cand_norm.split("-")[0].lower() if cand_norm else ""
    curr_base = curr_norm.split("-")[0].lower() if curr_norm else ""
    
    if cand_base == "en" and curr_base != "en":
        if INDIC_SCRIPT_REGEX.search(trimmed):
            return False
        if curr_base == "hi" and (HINDI_DEVANAGARI_REGEX.search(trimmed) or HINDI_LATIN_MARKERS_REGEX.search(trimmed)):
            return False
        if curr_base == "mr" and (MARATHI_DEVANAGARI_REGEX.search(trimmed) or MARATHI_LATIN_MARKERS_REGEX.search(trimmed)):
            return False
        return len(words) >= 2

    if cand_base == "mr":
        if MARATHI_DEVANAGARI_REGEX.search(trimmed) or MARATHI_LATIN_MARKERS_REGEX.search(trimmed):
            return True
        return len(words) >= 2

    if cand_base == "hi":
        if HINDI_DEVANAGARI_REGEX.search(trimmed) or HINDI_LATIN_MARKERS_REGEX.search(trimmed):
            return True
        return len(words) >= 2
        
    return len(words) >= 2

def build_language_instruction(language_code: str, language_style: str = "mixed", base_instructions: str = "") -> str:
    norm = normalize_language_code(language_code)
    lang_name = get_language_display_name(norm)
    base_lang = norm.split("-")[0].lower() if norm else ""
    
    # Check if system prompt explicitly requests pure language or if language_style is 'pure'
    prompt_lower = (base_instructions or "").lower()
    is_pure_mode = (
        (language_style or "").lower() == "pure"
        or "pure marathi" in prompt_lower
        or "pure hindi" in prompt_lower
        or "pure language" in prompt_lower
        or "strictly in pure" in prompt_lower
        or "pure script" in prompt_lower
    )
    
    universal_human_rules = (
        "- HUMAN PERSONA & TONE: Speak warmly and naturally like a human receptionist on a phone call. Keep replies brief (1–2 short sentences, under 15 words).\n"
        "- BANNED AI PHRASES: NEVER say 'system access', 'database', 'I am an AI', 'system limitations', 'access permissions', or 'system error'. Speak strictly like a helpful staff member.\n"
        "- SLOT GROUPING: When collecting caller information, ask naturally related questions together rather than interrogating one by one.\n"
        "- DIRECT DATE INQUIRIES: When asking for dates or timings, ask directly and simply without lecturing about current day, date, or calendar calculations."
    )

    if base_lang == "hi":
        if is_pure_mode:
            code_switching_guidance = (
                f"{universal_human_rules}\n"
                "- Respond strictly in Pure Devanagari Hindi Unicode script.\n"
                "- CRITICAL SCRIPT RULE: Write 100% in Devanagari Unicode characters (e.g. 'आपका नाम और उम्र क्या है?'). NEVER output Latin/Romanized letters (e.g. NEVER say 'aapka', 'naam', 'umr', 'age', 'kya', 'hai').\n"
                "- CRITICAL VOCABULARY RULE: You MUST speak in Pure Hindi without mixing English words or English numbers.\n"
                "- STRICT VOCABULARY REPLACEMENTS:\n"
                "  * Never use 'help' -> use 'मदद' (e.g. 'मैं आपकी क्या मदद कर सकता हूँ?').\n"
                "  * Never use 'age' -> use 'उम्र' / 'आयु' (e.g. 'आपका नाम और उम्र क्या है?').\n"
                "  * Never use 'name' -> use 'नाम' (e.g. 'आपका नाम क्या है?').\n"
                "  * Never use 'appointment' or 'booking' -> use 'अपॉइंटमेंट' / 'समय निश्चित करना' / 'पक्का करना' (e.g. 'हाँ, अपॉइंटमेंट बुक कर देता हूँ').\n"
                "  * Never use 'timing' or 'slot' -> use 'समय'.\n"
                "  * Never use 'date' -> use 'तारीख'.\n"
                "  * Never write English digits like '22' or '12' -> write full words in Hindi (e.g. 'बाईस', 'बारह').\n"
                "- Read all numbers, dates, and times in Hindi (e.g. 'सतरह सितंबर', 'दोपहर बारह बजे').\n"
                "- Speak warm, natural conversational Hindi."
            )
        else:
            code_switching_guidance = (
                f"{universal_human_rules}\n"
                "- Respond in Hindi (conversational Hinglish).\n"
                "- CRITICAL RULE: You MUST speak in Hindi/Hinglish now. If the caller asks in Hindi ('क्या आप हिंदी में बात कर सकते हैं?', 'हिंदी में बोलो', 'kya aap hindi me baat kar sakte ho'), reply in fluent Hindi (e.g. 'हाँ, मैं हिंदी में बात कर सकता हूँ। बताइए मैं आपकी क्या help करूँ?').\n"
                "- Speak natural conversational Hinglish (Hindi + English). Do not force archaic or textbook Hindi.\n"
                "- Keep standard business/everyday terms in English naturally (e.g. appointment, booking, timing, date, age, location, team, fees, pricing, WhatsApp, payment, confirm).\n"
                "- DO NOT use stiff literary Hindi translations like 'पंजीकरण', 'दिनांक', 'आयु', 'पुष्टि'. Use 'booking', 'date', 'age', 'confirm'.\n"
                "- DO NOT switch the entire conversation to English merely because the caller uses English words or numbers."
            )
    elif base_lang == "mr":
        if is_pure_mode:
            code_switching_guidance = (
                f"{universal_human_rules}\n"
                "- Respond strictly in Pure Devanagari Marathi Unicode script.\n"
                "- CRITICAL SCRIPT RULE: Write 100% in Devanagari Unicode characters (e.g. 'तुमचं नाव आणि वय काय आहे?'). NEVER output Latin/Romanized letters (e.g. NEVER say 'tumcha', 'naaw', 'aani', 'age', 'kay', 'aah').\n"
                "- CRITICAL VOCABULARY RULE: You MUST speak in Pure Marathi without mixing English words or English numbers.\n"
                "- STRICT VOCABULARY REPLACEMENTS:\n"
                "  * Never use 'help' -> use 'मदत' (e.g. 'मी तुमची काय मदत करू शकतो?').\n"
                "  * Never use 'age' -> use 'वय' (e.g. 'तुमचं नाव आणि वय काय आहे?').\n"
                "  * Never use 'name' or 'naaw' -> use 'नाव' (e.g. 'तुमचं नाव काय आहे?').\n"
                "  * Never use 'appointment' or 'booking' -> use 'अपॉइंटमेंट' / 'वेळ निश्चित करणे' / 'नक्की करणे' (e.g. 'हो नक्की, अपॉइंटमेंट बुक करून देतो').\n"
                "  * Never use 'timing' or 'slot' -> use 'वेळ' / 'वेळेची सोय'.\n"
                "  * Never use 'date' -> use 'तारीख'.\n"
                "  * Never write English digits like '22' or '12' -> write full words in Marathi (e.g. 'बावीस', 'बारा').\n"
                "- Read all numbers, dates, and times in Marathi (e.g. 'सतरा सप्टेंबर', 'दुपारी बारा वाजता').\n"
                "- Speak warm, natural conversational Marathi. Use natural everyday pronouns ('तुमचं / तुम्ही')."
            )
        else:
            code_switching_guidance = (
                f"{universal_human_rules}\n"
                "- Respond in Marathi (conversational Minglish).\n"
                "- CRITICAL RULE: You MUST speak in Marathi/Minglish now. If the caller asks in Marathi ('तुम्ही मराठीत बोलू शकता का?', 'मराठीत बोला'), reply in fluent Marathi (e.g. 'हो, मी मराठीत बोलू शकतो. सांगा मी तुमची काय help करू?').\n"
                "- Speak natural conversational Minglish (Marathi + English). Do not force archaic or textbook Marathi.\n"
                "- Use natural everyday conversational pronouns: Use 'तुमचं / तुम्ही' (never use archaic formal 'आपले / आपली').\n"
                "- Keep standard business/everyday terms in English naturally (e.g. appointment, booking, timing, date, age, location, place, team, fees, pricing, WhatsApp, payment, confirm).\n"
                "- DO NOT use stiff literary Marathi translations like 'नोंदणी', 'दिनांक', 'वयमर्यादा', 'पुष्टीकरण', 'शुल्करचना', 'भेट'. Use 'appointment booking', 'date', 'timing', 'age', 'confirm', 'fees', 'location'.\n"
                "- DO NOT switch the entire conversation to English merely because the caller uses English words or numbers."
            )
    else:
        code_switching_guidance = (
            f"{universal_human_rules}\n"
            f"- Respond in {lang_name}.\n"
            f"- CRITICAL RULE: You MUST speak in {lang_name} now. If the caller asked in English, reply in English ('Yes, I can speak in English. How can I help you today?').\n"
            f"- Maintain this language as the active conversation language until the user explicitly requests another supported language or clearly switches."
        )
        
    return (
        f"\n\n=== ACTIVE CONVERSATION LANGUAGE POLICY ===\n"
        f"- Active Conversation Language: {lang_name} ({norm})\n"
        f"{code_switching_guidance}"
    )

def build_full_instructions(base_instructions: str, language_code: str, language_style: str = "mixed") -> str:
    clean_base = re.sub(r"\n\n=== ACTIVE CONVERSATION LANGUAGE POLICY ===[\s\S]*$", "", base_instructions)
    clean_base = re.sub(r"\n\n# Active Conversation Language[\s\S]*$", "", clean_base)
    return f"{clean_base}{build_language_instruction(language_code, language_style=language_style, base_instructions=clean_base)}"

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
                 auto_detect_enabled: Optional[bool] = None, language_switching_enabled: Optional[bool] = None,
                 language_style: Optional[str] = "mixed"):
        self._primary = normalize_language_code(primary) if primary else "en-IN"
        raw_supported = supported_languages if supported_languages and len(supported_languages) > 0 else [self._primary]
        self._supported = [normalize_language_code(l) for l in raw_supported]
        if self._primary not in self._supported:
            self._supported.insert(0, self._primary)
            
        self._auto_detect = auto_detect_enabled is not False
        self._language_switching = language_switching_enabled is not False
        self._language_style = (language_style or "mixed").lower()
        self._current = self._primary

    @property
    def language_style(self) -> str:
        return self._language_style

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
            
        candidate_code = detected_language_code
        if not candidate_code or candidate_code == "unknown":
            trimmed = (transcript or "").strip()
            if trimmed:
                hi_supported = any(normalize_language_code(l).startswith("hi") for l in self._supported)
                mr_supported = any(normalize_language_code(l).startswith("mr") for l in self._supported)
                en_supported = any(normalize_language_code(l).startswith("en") for l in self._supported)

                hi_matches = (len(HINDI_DEVANAGARI_REGEX.findall(trimmed)) + len(HINDI_LATIN_MARKERS_REGEX.findall(trimmed))) if hi_supported else 0
                mr_matches = (len(MARATHI_DEVANAGARI_REGEX.findall(trimmed)) + len(MARATHI_LATIN_MARKERS_REGEX.findall(trimmed))) if mr_supported else 0

                if hi_supported and hi_matches > mr_matches:
                    candidate_code = "hi-IN"
                elif mr_supported and mr_matches > hi_matches:
                    candidate_code = "mr-IN"
                elif mr_supported and mr_matches > 0:
                    candidate_code = "mr-IN"
                elif hi_supported and hi_matches > 0:
                    candidate_code = "hi-IN"
                elif any(normalize_language_code(l).startswith("gu") for l in self._supported) and re.search(r"[\u0A80-\u0AFF]", trimmed):
                    candidate_code = "gu-IN"
                elif any(normalize_language_code(l).startswith("bn") for l in self._supported) and re.search(r"[\u0980-\u09FF]", trimmed):
                    candidate_code = "bn-IN"
                elif any(normalize_language_code(l).startswith("ta") for l in self._supported) and re.search(r"[\u0B80-\u0BFF]", trimmed):
                    candidate_code = "ta-IN"
                elif any(normalize_language_code(l).startswith("te") for l in self._supported) and re.search(r"[\u0C00-\u0C7F]", trimmed):
                    candidate_code = "te-IN"
                elif any(normalize_language_code(l).startswith("kn") for l in self._supported) and re.search(r"[\u0C80-\u0CFF]", trimmed):
                    candidate_code = "kn-IN"
                elif en_supported and not INDIC_SCRIPT_REGEX.search(trimmed):
                    candidate_code = "en-IN"
                elif DEVANAGARI_REGEX.search(trimmed):
                    # Default Devanagari fallback if neither matched: check if primary is mr vs hi
                    candidate_code = self._primary if self._primary.startswith("mr") else "hi-IN"

        if candidate_code and candidate_code != "unknown":
            matched = match_supported_language(candidate_code, self._supported)
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
                details=f"Detected language ({candidate_code}) not in configured supportedLanguages"
            )
            
        return ProcessTurnResult(
            switched=False,
            previous_language=prev,
            current_language=self._current,
            reason="none",
            decision="NO_DETECTION",
            details="No STT language code detected on utterance"
        )
