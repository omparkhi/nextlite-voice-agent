import pytest
from unittest.mock import AsyncMock, MagicMock
from pipecat.frames.frames import TranscriptionFrame
from pipecat.processors.frame_processor import FrameDirection
from pipecat.processors.aggregators.llm_response_universal import LLMContext

from app.language_processor import LanguageContextProcessor, is_pure_hesitation_noise
from app.language_manager import ConversationLanguageManager


def test_is_pure_hesitation_noise_classification():
    # Pure noise tokens -> should return True
    assert is_pure_hesitation_noise("हं") is True
    assert is_pure_hesitation_noise("हं.") is True
    assert is_pure_hesitation_noise("अ") is True
    assert is_pure_hesitation_noise("अ.") is True
    assert is_pure_hesitation_noise("...") is True
    assert is_pure_hesitation_noise("..") is True
    assert is_pure_hesitation_noise(".") is True
    assert is_pure_hesitation_noise("hmm") is True
    assert is_pure_hesitation_noise("uh") is True
    assert is_pure_hesitation_noise("um") is True
    assert is_pure_hesitation_noise("mhm") is True
    assert is_pure_hesitation_noise("") is True

    # Real questions & clarifications -> MUST return False (never silenced)
    assert is_pure_hesitation_noise("काय") is False
    assert is_pure_hesitation_noise("काय?") is False
    assert is_pure_hesitation_noise("काय म्हटलं?") is False
    assert is_pure_hesitation_noise("काय म्हणालीस") is False
    assert is_pure_hesitation_noise("kya") is False
    assert is_pure_hesitation_noise("kya?") is False
    assert is_pure_hesitation_noise("what") is False
    assert is_pure_hesitation_noise("what?") is False
    assert is_pure_hesitation_noise("sorry") is False
    assert is_pure_hesitation_noise("कळलं नाही") is False

    # Real answers & affirmations -> MUST return False
    assert is_pure_hesitation_noise("हो") is False
    assert is_pure_hesitation_noise("नाही") is False
    assert is_pure_hesitation_noise("yes") is False
    assert is_pure_hesitation_noise("no") is False
    assert is_pure_hesitation_noise("नाव ओम पारखी") is False
    assert is_pure_hesitation_noise("वय बावीस") is False
    assert is_pure_hesitation_noise("अ अपॉइंटमेंट बुक करायची होती") is False


@pytest.mark.asyncio
async def test_language_context_processor_suppresses_pure_noise():
    lang_mgr = ConversationLanguageManager(primary="mr-IN", supported_languages=["mr-IN", "en-IN"])
    ctx = LLMContext(messages=[{"role": "system", "content": "base prompt"}])
    processor = LanguageContextProcessor(
        language_manager=lang_mgr,
        conversation_context=ctx,
        base_system_prompt="base prompt",
    )
    processor.push_frame = AsyncMock()

    # Inbound pure noise frame
    noise_frame = TranscriptionFrame(text="हं.", user_id="user", timestamp=100.0)
    await processor.process_frame(noise_frame, FrameDirection.DOWNSTREAM)

    # Must be suppressed (not pushed downstream to user aggregator)
    assert processor.push_frame.call_count == 0


@pytest.mark.asyncio
async def test_language_context_processor_forwards_real_clarification_queries():
    lang_mgr = ConversationLanguageManager(primary="mr-IN", supported_languages=["mr-IN", "en-IN"])
    ctx = LLMContext(messages=[{"role": "system", "content": "base prompt"}])
    processor = LanguageContextProcessor(
        language_manager=lang_mgr,
        conversation_context=ctx,
        base_system_prompt="base prompt",
    )
    processor.push_frame = AsyncMock()

    # Inbound real clarification question
    query_frame = TranscriptionFrame(text="काय?", user_id="user", timestamp=100.0)
    await processor.process_frame(query_frame, FrameDirection.DOWNSTREAM)

    # Must be pushed downstream to trigger LLM clarification
    assert processor.push_frame.call_count >= 1
    call_args_list = [call.args[0] for call in processor.push_frame.call_args_list]
    assert query_frame in call_args_list
