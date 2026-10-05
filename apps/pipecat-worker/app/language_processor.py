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

from app.config import settings
from app.language_manager import ConversationLanguageManager, build_full_instructions

# Pure hesitation noise tokens that contain 0 semantic content or intent
PURE_NOISE_TOKENS: Set[str] = {
    "हं", "हं.", "अ", "अ.", "...", "..", ".", "hmm", "hm", "uh", "um", "mhm", "ah", "ahh",
    "ह", "ह.", "आ", "आ.", "ऊ", "ऊ."
}


def clean_asr_hallucinations(text: str) -> str:
    """
    Cleans hallucinated repetitive token loops produced by realtime neural ASR models
    (e.g., 'Hello, hello, hello, hello...' repeating 10-100 times during ambient pauses).
    
    Collapses 3+ consecutive repetitions of identical words or phrases down to 1-2 occurrences,
    while carefully preserving natural human 2-word confirmations like 'हो हो' or '22 22'.
    """
    import re
    if not text or not isinstance(text, str):
        return ""
    
    cleaned = text.strip()
    if not cleaned:
        return ""

    # 1. Collapse 3+ single word repetitions (e.g. "hello, hello, hello, hello..." -> "Hello")
    pattern_word = re.compile(r'\b([^\W\d_]+(?:-[^\W\d_]+)?)\b(?:[\s,।॥!?-]+\b\1\b){2,}', re.IGNORECASE | re.UNICODE)
    cleaned = pattern_word.sub(r'\1', cleaned)

    # 2. Collapse 3+ repeated 2-word or 3-word n-gram phrases (e.g. "एक मिनिट एक मिनिट एक मिनिट" -> "एक मिनिट")
    pattern_phrase = re.compile(r'\b(.{2,25}?)\b(?:[\s,।॥!?-]+\b\1\b){2,}', re.IGNORECASE | re.UNICODE)
    cleaned = pattern_phrase.sub(r'\1', cleaned)

    # 3. Clean any trailing commas or abnormal repeated punctuation left over
    cleaned = re.sub(r'[,，\s]+$', '', cleaned)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    return cleaned.strip()


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
    Observes TranscriptionFrames, cleans ASR hallucination loops,
    and filters pure hesitation/static line noise tokens before LLM context aggregation.
    """

    def __init__(
        self,
        language_manager: Optional[ConversationLanguageManager] = None,
        conversation_context: Optional[LLMContext] = None,
        base_system_prompt: Optional[str] = None,
        tts_service: Optional[Any] = None,
        stt_service: Optional[Any] = None,
    ):
        super().__init__()
        self._language_manager = language_manager
        self._conversation_context = conversation_context
        self._base_system_prompt = base_system_prompt
        self._tts_service = tts_service
        self._stt_service = stt_service

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            frame.text = clean_asr_hallucinations(frame.text)
            transcript = frame.text.strip()

            # Suppress pure line noise / breath hesitation from triggering LLM turns
            if is_pure_hesitation_noise(transcript):
                logger.info(
                    f"[LanguageContextProcessor] Suppressed standalone hesitation noise token: '{transcript}'"
                )
                return

            # Synchronize STT-identified language code with language_manager
            stt_lang = getattr(frame, "language", None)
            if hasattr(stt_lang, "value"):
                stt_lang = stt_lang.value
            if not stt_lang and hasattr(frame, "result") and isinstance(frame.result, dict):
                stt_lang = frame.result.get("language_code") or frame.result.get("language")

            if self._language_manager:
                turn_result = self._language_manager.process_user_turn(transcript, stt_lang)
                if turn_result.switched:
                    logger.info(
                        f"[LanguageContextProcessor] Language switched {turn_result.previous_language} -> {turn_result.current_language} | reason={turn_result.reason}"
                    )
                    # 1. Update TTS active language
                    if self._tts_service and hasattr(self._tts_service, "update_language_context"):
                        self._tts_service.update_language_context(turn_result.current_language)
                    # 2. Update conversation context system prompt
                    if self._conversation_context and self._base_system_prompt:
                        updated_prompt = build_full_instructions(
                            self._base_system_prompt,
                            turn_result.current_language,
                            language_style=self._language_manager.language_style,
                        )
                        if self._conversation_context.messages:
                            self._conversation_context.messages[0]["content"] = updated_prompt
                        await self.push_frame(
                            LLMMessagesUpdateFrame(messages=self._conversation_context.messages),
                            direction,
                        )

        # Forward the cleaned frame downstream
        await self.push_frame(frame, direction)

