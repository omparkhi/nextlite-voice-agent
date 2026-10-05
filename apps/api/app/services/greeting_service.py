import re
from typing import List, Optional, Dict, Any
from ..logging import logger
from .translation_service import translate_text

_PLACEHOLDER = re.compile(r"\{+[a-zA-Z0-9_]+\}+")


def _clean_empty_placeholders(text: str) -> str:
    cleaned = re.sub(r"\bto\s+\{+business[Nn]ame\}+", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\{+business[Nn]ame\}+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\{+agent[Nn]ame\}+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bto\s*([.,!?])", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([.,!?])", r"\1", cleaned)
    return cleaned.strip()


def _is_broken_greeting(text: str, has_biz: bool) -> bool:
    """Detects malformed translations containing unresolved placeholder tokens or leading punctuation."""
    if not text or not isinstance(text, str):
        return True
    t = text.strip()
    if _PLACEHOLDER.search(t) or "__PH" in t:
        return True
    if re.match(r"^[^\w\s]", t, re.UNICODE):
        return True
    if not has_biz and (t.lower().startswith("welcome") and len(t.split()) < 3):
        return True
    return False


async def _translate_preserving_placeholders(
    text: str, target: str, source: str, gender: Optional[str]
) -> Optional[str]:
    stash: Dict[str, str] = {}

    def _stash(m):
        key = f"__PH{len(stash)}__"
        stash[key] = m.group(0)
        return key

    protected = _PLACEHOLDER.sub(_stash, text)
    translated = await translate_text(protected, target, source, speaker_gender=gender)
    if not translated:
        return None
    for key, val in stash.items():
        translated = translated.replace(key, val)
    return translated


async def ensure_localized_greeting(
    configuration: Dict[str, Any],
    supported_languages: List[str],
    speaker_gender: str = "Male",
) -> Dict[str, Any]:
    """Ensures identity.greeting is a {lang: text} map with an entry per language.
    Missing languages are translated once. Agent-constant placeholders are resolved
    so the greeting is STATIC (cacheable). Idempotent."""
    identity = configuration.setdefault("identity", {})
    greeting = identity.get("greeting") or configuration.get("greeting")
    if not greeting:
        return configuration

    if isinstance(greeting, dict):
        greeting_map = {k: str(v) for k, v in greeting.items() if v}
    else:
        greeting_map = {"en-IN": str(greeting)}

    source_lang = next(iter(greeting_map.keys()), "en-IN")
    source_text = greeting_map.get(source_lang, "")

    biz = (configuration.get("businessInformation") or {}).get("businessName") or \
          (identity.get("businessName")) or ""
    if not biz.strip():
        biz = identity.get("agentName") or ""

    agent = identity.get("agentName") or ""
    has_biz = bool(biz.strip())

    const_map = {
        "{businessName}": biz,
        "{business_name}": biz,
        "{{businessName}}": biz,
        "{{business_name}}": biz,
        "{agentName}": agent,
        "{agent_name}": agent,
        "{{agentName}}": agent,
        "{{agent_name}}": agent,
    }

    translation_source = source_text if has_biz else _clean_empty_placeholders(source_text)

    for lang in supported_languages:
        if greeting_map.get(lang):
            continue
        translated = await _translate_preserving_placeholders(
            translation_source, target=lang, source=source_lang, gender=speaker_gender
        )
        if translated:
            greeting_map[lang] = translated
        else:
            logger.warning(f"[Greeting] Could not translate greeting to {lang}")

    resolved_source_text = translation_source
    for ph, val in const_map.items():
        resolved_source_text = resolved_source_text.replace(ph, val)
    resolved_source_text = _clean_empty_placeholders(resolved_source_text) if not has_biz else resolved_source_text.strip()

    for lang, text in list(greeting_map.items()):
        for ph, val in const_map.items():
            text = text.replace(ph, val)

        cleaned_text = _clean_empty_placeholders(text) if not has_biz else text.strip()
        if _is_broken_greeting(cleaned_text, has_biz=has_biz):
            logger.warning(
                f"[Greeting] Translated greeting for {lang} contains malformed artifacts: '{cleaned_text}'. "
                f"Falling back to resolved source greeting: '{resolved_source_text}'"
            )
            cleaned_text = resolved_source_text

        greeting_map[lang] = cleaned_text

    identity["greeting"] = greeting_map
    return configuration

