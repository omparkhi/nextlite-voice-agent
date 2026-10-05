import httpx
from typing import Optional
from ..config import settings
from ..logging import logger

SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"


async def translate_text(
    text: str,
    target_language_code: str,
    source_language_code: str = "auto",
    mode: str = "modern-colloquial",
    speaker_gender: Optional[str] = None,
    model: str = "mayura:v1",
) -> Optional[str]:
    """Translate text via Sarvam Translate. Returns the translated string or None on failure."""
    if not text or not str(text).strip():
        return text
    api_key = getattr(settings, "SARVAM_API_KEY", None)
    if not api_key:
        logger.warning("[Translate] SARVAM_API_KEY missing; skipping translation")
        return None

    payload = {
        "input": str(text)[:1000],
        "source_language_code": source_language_code,
        "target_language_code": target_language_code,
        "model": model,
        "mode": mode,
    }
    if speaker_gender:
        payload["speaker_gender"] = speaker_gender

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                SARVAM_TRANSLATE_URL,
                headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
                json=payload,
            )
            if res.status_code != 200:
                logger.error(f"[Translate] HTTP {res.status_code}: {res.text}")
                return None
            data = res.json()
            return data.get("translated_text") or data.get("translatedText")
    except Exception as e:
        logger.error(f"[Translate] error: {e}")
        return None
