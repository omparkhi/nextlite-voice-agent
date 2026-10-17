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
    Zero-latency language synchronizer.
    Reads Sarvam Saaras STT's in-band acoustic language identification
    (emitted directly in frame.result['language']) and immediately syncs
    Bulbul TTS and WorkflowState in 0ms overhead without external HTTP calls.
    """

    def __init__(
        self,
        tts_service: Optional[Any] = None,
        workflow_state: Optional[Any] = None,
        supported_languages: Optional[List[str]] = None,
        **kwargs,
    ):
        super().__init__()
        self._tts_service = tts_service
        self._workflow_state = workflow_state
        self._supported_languages = (
            [normalize_language_code(l) for l in supported_languages]
            if supported_languages
            else None
        )

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and getattr(frame, "finalized", False):
            # 1. Read Sarvam's native in-band acoustic language code (0ms overhead)
            result = getattr(frame, "result", None) or {}
            stt_lang = (
                result.get("language")
                or result.get("language_code")
                or (getattr(frame, "language", None).value if hasattr(getattr(frame, "language", None), "value") else getattr(frame, "language", None))
            )

            confidence = float(result.get("language_confidence", 1.0) or 1.0)
            if stt_lang and str(stt_lang).lower() not in ("unknown", "auto", "none") and confidence >= 0.7:
                target_lang = normalize_language_code(stt_lang)
                current_active = getattr(self._tts_service, "_active_language", None) if self._tts_service else None
                is_allowed = (target_lang in self._supported_languages) if self._supported_languages else True

                # 2. In-memory update when caller switches language
                if (current_active is None or target_lang != current_active) and is_allowed:
                    logger.info(
                        f"[LanguageContextProcessor] Sarvam acoustic LID detected language switch: {current_active} -> {target_lang}"
                    )
                    # Update Bulbul:v3 TTS synthesis voice before LLM finishes response
                    if self._tts_service and hasattr(self._tts_service, "update_language_context"):
                        self._tts_service.update_language_context(target_lang)
                    # Update deterministic WorkflowState for tool verbalization
                    if self._workflow_state and hasattr(self._workflow_state, "active_language"):
                        self._workflow_state.active_language = target_lang


        await self.push_frame(frame, direction)
