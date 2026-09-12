import time
from typing import Optional
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

class LanguageContextProcessor(FrameProcessor):
    """
    Observes TranscriptionFrames, processes language detection rules,
    and dynamically updates the LLM system prompt if a language switch occurs.
    """

    def __init__(
        self,
        language_manager: ConversationLanguageManager,
        conversation_context: LLMContext,
        base_system_prompt: str,
    ):
        super().__init__()
        self._language_manager = language_manager
        self._conversation_context = conversation_context
        self._base_system_prompt = base_system_prompt

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        if isinstance(frame, TranscriptionFrame):
            transcript = frame.text.strip()
            detected_language = getattr(frame, "language", None)
            
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
                    
                    # Update the LLM context's system prompt in-place
                    messages = self._conversation_context.get_messages()
                    system_msg = next((m for m in messages if m.get("role") == "system"), None)
                    if system_msg:
                        new_system_content = build_full_instructions(
                            self._base_system_prompt,
                            result.current_language
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
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)
