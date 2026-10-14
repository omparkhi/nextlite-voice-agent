import httpx
from typing import Any, Optional, List
from loguru import logger

try:
    from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
    from pipecat.frames.frames import Frame, TranscriptionFrame
except ImportError:
    FrameProcessor = object
    FrameDirection = None
    Frame = object
    TranscriptionFrame = object

from app.language_manager import normalize_language_code


class LanguageContextProcessor(FrameProcessor):
    """
    Synchronizes language across Saaras STT, Sarvam-105b LLM, and Bulbul TTS.
    When STT acoustic LID is bypassed (explicit primary starting language), queries
    Sarvam's official neural Text-LID API (POST https://api.sarvam.ai/text-lid) to detect
    cross-lingual shifts without hardcoded keywords, regex, or dictionaries.
    """

    def __init__(
        self,
        tts_service: Optional[Any] = None,
        stt_service: Optional[Any] = None,
        workflow_state: Optional[Any] = None,
        supported_languages: Optional[List[str]] = None,
        http_client: Optional[Any] = None,
        api_key: Optional[str] = None,
        **kwargs,
    ):
        super().__init__()
        self._tts_service = tts_service
        self._stt_service = stt_service
        self._workflow_state = workflow_state
        self._supported_languages = (
            [normalize_language_code(l) for l in supported_languages]
            if supported_languages
            else None
        )
        self._http_client = http_client
        self._api_key = api_key

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and getattr(frame, "finalized", False):
            transcript_text = getattr(frame, "text", "") or ""
            target_lang = None

            # 1. Check if STT emitted a language (available when running in 'auto' mode)
            result = getattr(frame, "result", None) or {}
            stt_lang = result.get("language")
            if stt_lang and stt_lang.lower() not in ("unknown", "auto", "none"):
                target_lang = normalize_language_code(stt_lang)

            # 2. When STT acoustic LID is bypassed, query Sarvam's official neural Text-LID API
            if not target_lang and transcript_text.strip() and self._api_key:
                try:
                    client = self._http_client
                    if client is not None:
                        resp = await client.post(
                            "https://api.sarvam.ai/text-lid",
                            json={"input": transcript_text.strip()},
                            headers={"API-SUBSCRIPTION-KEY": self._api_key},
                            timeout=0.8,
                        )
                    else:
                        async with httpx.AsyncClient(timeout=0.8) as fallback_client:
                            resp = await fallback_client.post(
                                "https://api.sarvam.ai/text-lid",
                                json={"input": transcript_text.strip()},
                                headers={"API-SUBSCRIPTION-KEY": self._api_key},
                            )

                    if resp.status_code == 200:
                        detected = resp.json().get("language_code")
                        if detected:
                            target_lang = normalize_language_code(detected)
                except Exception as lid_err:
                    logger.debug(f"[LanguageContextProcessor] Sarvam text-lid notice: {lid_err}")

            # 3. Synchronize STT, TTS, and Workflow State if language shifted within allowed languages
            if target_lang:
                current_active = getattr(self._tts_service, "_active_language", None) if self._tts_service else None
                is_allowed = (target_lang in self._supported_languages) if self._supported_languages else True
                if current_active and target_lang != current_active and is_allowed:
                    logger.info(
                        f"[LanguageContextProcessor] Sarvam neural LID detected language shift: {current_active} -> {target_lang}"
                    )
                    # A. Update Bulbul TTS neural voice
                    if self._tts_service and hasattr(self._tts_service, "update_language_context"):
                        self._tts_service.update_language_context(target_lang)
                    # B. Update Saaras STT in-band via native WebSocket config.update
                    if self._stt_service and hasattr(self._stt_service, "update_config"):
                        try:
                            await self._stt_service.update_config(language_code=target_lang)
                            logger.info(
                                f"[LanguageContextProcessor] Sent Sarvam STT config.update with language_code={target_lang}"
                            )
                        except Exception as stt_err:
                            logger.warning(f"[LanguageContextProcessor] Failed to update STT config: {stt_err}")
                    # C. Update Workflow State
                    if self._workflow_state and hasattr(self._workflow_state, "active_language"):
                        self._workflow_state.active_language = target_lang

        await self.push_frame(frame, direction)

