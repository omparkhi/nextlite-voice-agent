from typing import Any, Optional
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
    Synchronizes Sarvam Saaras STT's detected language directly to the Bulbul TTS service.
    Zero-overhead, zero regex. Driven 100% natively by Sarvam's neural language identification.
    """

    def __init__(self, tts_service: Optional[Any] = None, **kwargs):
        super().__init__()
        self._tts_service = tts_service

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and getattr(frame, "finalized", False):
            result = getattr(frame, "result", None) or {}
            stt_lang = result.get("language")
            if not stt_lang:
                frame_lang = getattr(frame, "language", None)
                if hasattr(frame_lang, "value"):
                    stt_lang = frame_lang.value
                elif frame_lang:
                    stt_lang = str(frame_lang)

            if stt_lang and self._tts_service and hasattr(self._tts_service, "update_language_context"):
                norm_lang = normalize_language_code(stt_lang)
                if norm_lang != getattr(self._tts_service, "_active_language", None):
                    logger.info(f"[LanguageContextProcessor] Dynamic language switch to {norm_lang}")
                    self._tts_service.update_language_context(norm_lang)

        await self.push_frame(frame, direction)
