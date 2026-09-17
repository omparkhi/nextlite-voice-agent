import time
from typing import Any, Optional, Set
from loguru import logger

try:
    from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
    from pipecat.frames.frames import (
        Frame,
        TranscriptionFrame,
        LLMMessagesUpdateFrame,
    )
    from pipecat.processors.aggregators.llm_response_universal import LLMContext
except ImportError:
    FrameProcessor = object
    FrameDirection = None
    Frame = object
    TranscriptionFrame = object
    LLMMessagesUpdateFrame = object
    LLMContext = object

from app.language_manager import ConversationLanguageManager, build_full_instructions

# Pure hesitation noise tokens that contain 0 semantic content or intent
PURE_NOISE_TOKENS: Set[str] = {
    "हं", "हं.", "अ", "अ.", "...", "..", ".", "hmm", "hm", "uh", "um", "mhm", "ah", "ahh",
    "ह", "ह.", "आ", "आ.", "ऊ", "ऊ."
}


def is_pure_hesitation_noise(text: str) -> bool:
    """
    Returns True ONLY for pure single-syllable hesitation tokens, breathing artifacts,
    or ambient line static punctuation.
    
    Explicitly preserves semantic single-word queries, clarifications, and answers:
    - Questions / Clarifications: "काय", "काय?", "काय म्हटलं", "kya", "kya?", "what", "what?", "sorry", "कळलं नाही"
    - Confirmations / Negations: "हो", "नाही", "yes", "no", "haan", "nahi", "ok", "okay"
    - Action verbs: "बोल", "सांग", "करा", "द्या"
    """
    if not text:
        return True
    cleaned = text.strip().lower()
    if cleaned in PURE_NOISE_TOKENS:
        return True
    stripped = cleaned.strip(".,?!:; \t\r\n")
    if stripped in PURE_NOISE_TOKENS:
        return True
    return False


class LanguageContextProcessor(FrameProcessor):
    """
    Observes TranscriptionFrames, processes language detection rules,
    filters pure hesitation/static noise tokens, and dynamically updates
    the LLM system prompt if a language switch occurs.
    """

    def __init__(
        self,
        language_manager: ConversationLanguageManager,
        conversation_context: LLMContext,
        base_system_prompt: str,
        tts_service: Optional[Any] = None,
    ):
        super().__init__()
        self._language_manager = language_manager
        self._conversation_context = conversation_context
        self._base_system_prompt = base_system_prompt
        self._tts_service = tts_service

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            transcript = frame.text.strip()
            detected_language = getattr(frame, "language", None)

            # Suppress pure line noise / breath hesitation from triggering LLM turns
            if is_pure_hesitation_noise(transcript):
                logger.info(
                    f"[LanguageContextProcessor] Suppressed standalone hesitation noise token: '{transcript}'"
                )
                return

            if transcript:
                result = self._language_manager.process_user_turn(
                    transcript=transcript,
                    detected_language_code=detected_language
                )
                
                if result.switched:
                    logger.info(
                        f"[LanguageManager] Language switched from {result.previous_language} "
                        f"to {result.current_language} | Reason: {result.reason} | Details: {result.details}"
                    )
                    
                    # Update TTS service target language in real-time
                    if self._tts_service:
                        try:
                            if hasattr(self._tts_service, "_settings"):
                                self._tts_service._settings.language = result.current_language
                            if hasattr(self._tts_service, "update_language_context"):
                                self._tts_service.update_language_context(result.current_language)
                            logger.info(f"[LanguageManager] Updated TTS service target language to {result.current_language}")
                        except Exception as e:
                            logger.warning(f"[LanguageManager] Non-fatal: failed to update TTS language: {e}")

                    # Update the LLM context's system prompt in-place
                    messages = self._conversation_context.get_messages()
                    system_msg = next((m for m in messages if m.get("role") == "system"), None)
                    if system_msg:
                        new_system_content = build_full_instructions(
                            self._base_system_prompt,
                            result.current_language,
                            language_style=getattr(self._language_manager, "language_style", "mixed")
                        )
                        system_msg["content"] = new_system_content
                        
                        # Send the updated messages downstream to sync the LLM service
                        await self.push_frame(
                            LLMMessagesUpdateFrame(messages=self._conversation_context.get_messages()),
                            FrameDirection.DOWNSTREAM
                        )
                else:
                    logger.debug(
                        f"[LanguageManager] No switch. Current: {result.current_language}. "
                        f"Decision: {result.decision} | Details: {result.details}"
                    )

        # Forward the frame downstream/upstream
        await self.push_frame(frame, direction)
