import pytest
from unittest.mock import AsyncMock, MagicMock
from app.language_manager import (
    normalize_language_code,
    get_language_display_name,
    LANGUAGE_MIRROR_DIRECTIVE,
)
from app.language_processor import LanguageContextProcessor

def test_normalize_language_code():
    assert normalize_language_code("hi") == "hi-IN"
    assert normalize_language_code("en") == "en-IN"
    assert normalize_language_code("mr") == "mr-IN"
    assert normalize_language_code("unknown") == "unknown"
    assert normalize_language_code("en-us") == "en-US"
    assert normalize_language_code(None) == "en-IN"

def test_get_language_display_name():
    assert get_language_display_name("hi-IN") == "Hindi"
    assert get_language_display_name("en-IN") == "English"
    assert get_language_display_name("mr-IN") == "Marathi"
    assert get_language_display_name("ta-IN") == "Tamil"
    assert get_language_display_name(None) == "English"

def test_language_mirror_directive():
    assert "Always respond in the language of the caller's LATEST utterance" in LANGUAGE_MIRROR_DIRECTIVE

class MockTTSService:
    def __init__(self, initial="en-IN"):
        self._active_language = initial
        self.history = [initial]
    def update_language_context(self, code):
        self._active_language = code
        self.history.append(code)

from pipecat.frames.frames import TranscriptionFrame

class MockTranscriptionFrame(TranscriptionFrame):
    def __init__(self, text: str, detected_language: str, finalized: bool = True):
        super().__init__(text=text, user_id="user", timestamp="2026-10-11T00:00:00Z")
        self.finalized = finalized
        self.result = {"language": detected_language}

@pytest.mark.asyncio
async def test_language_context_processor_dynamic_switch():
    tts = MockTTSService(initial="mr-IN")
    processor = LanguageContextProcessor(tts_service=tts)
    processor.push_frame = AsyncMock()

    # Finalized frame with hi-IN from Saaras STT
    frame = MockTranscriptionFrame("नमस्ते", "hi-IN", finalized=True)
    await processor.process_frame(frame, None)
    assert tts._active_language == "hi-IN"

    # Finalized frame with en-IN
    frame2 = MockTranscriptionFrame("Hello", "en-IN", finalized=True)
    await processor.process_frame(frame2, None)
    assert tts._active_language == "en-IN"

    # Non-finalized frame should NOT trigger switch
    frame_interim = MockTranscriptionFrame("हो", "mr-IN", finalized=False)
    await processor.process_frame(frame_interim, None)
    assert tts._active_language == "en-IN"


@pytest.mark.asyncio
async def test_language_context_processor_in_band_acoustic_lid_sync():
    class MockWorkflowState:
        def __init__(self):
            self.active_language = "mr-IN"

    tts = MockTTSService(initial="mr-IN")
    wf = MockWorkflowState()

    processor = LanguageContextProcessor(
        tts_service=tts,
        workflow_state=wf,
        supported_languages=["mr-IN", "hi-IN", "en-IN"],
    )
    processor.push_frame = AsyncMock()

    # Turn 1: Caller speaks Hindi, Sarvam STT emits hi-IN in frame.result["language"]
    frame_hi = MockTranscriptionFrame("मुझे डॉक्टर से मिलना है", "hi-IN", finalized=True)
    await processor.process_frame(frame_hi, None)

    # 1. TTS updated to Hindi immediately
    assert tts._active_language == "hi-IN"
    # 2. Workflow state updated to Hindi for tool verbalization
    assert wf.active_language == "hi-IN"

    # Turn 2: Caller switches to English
    frame_en = MockTranscriptionFrame("Can I reschedule my appointment?", "en-IN", finalized=True)
    await processor.process_frame(frame_en, None)
    assert tts._active_language == "en-IN"
    assert wf.active_language == "en-IN"

    # Turn 3: Caller switches back to Marathi
    frame_mr = MockTranscriptionFrame("हो नक्की, खूप खूप धन्यवाद.", "mr-IN", finalized=True)
    await processor.process_frame(frame_mr, None)
    assert tts._active_language == "mr-IN"
    assert wf.active_language == "mr-IN"

    # Verify history
    assert tts.history == ["mr-IN", "hi-IN", "en-IN", "mr-IN"]


@pytest.mark.asyncio
async def test_language_context_processor_preserves_frame_text():
    tts = MockTTSService(initial="hi-IN")
    processor = LanguageContextProcessor(tts_service=tts)
    processor.push_frame = AsyncMock()

    # Turn 1: Caller speaks English -> switches from hi-IN to en-IN -> frame.text MUST remain pure!
    frame_en = MockTranscriptionFrame("And please tell me about the hospital time.", "en-IN", finalized=True)
    await processor.process_frame(frame_en, None)
    assert frame_en.text == "And please tell me about the hospital time."
    assert tts._active_language == "en-IN"

    # Turn 2: Caller continues in English -> frame.text remains pure
    frame_en_continue = MockTranscriptionFrame("What are the fees?", "en-IN", finalized=True)
    await processor.process_frame(frame_en_continue, None)
    assert frame_en_continue.text == "What are the fees?"
    assert tts._active_language == "en-IN"

    # Turn 3: Caller switches to Tamil -> frame.text remains pure
    frame_ta = MockTranscriptionFrame("வணக்கம்", "ta-IN", finalized=True)
    await processor.process_frame(frame_ta, None)
    assert frame_ta.text == "வணக்கம்"
    assert tts._active_language == "ta-IN"


def test_in_flight_language_directive_formatting():
    from app.language_manager import get_language_display_name
    
    # Test user turn directive
    display_name = get_language_display_name("hi-IN")
    user_content = "मुझे कल दोपहर को 12 बजे चाहिए।"
    steered_user = f"{user_content}\n\n[Language directive: Respond in {display_name}]"
    assert "[Language directive: Respond in Hindi]" in steered_user
    assert steered_user.startswith(user_content)

    # Test post-tool turn directive
    display_name_en = get_language_display_name("en-IN")
    tool_content = '{"status": "success", "data": "Root Canal Treatment"}'
    steered_tool = f"{tool_content}\n\n[Language directive: Respond to the caller in {display_name_en}]"
    assert "[Language directive: Respond to the caller in English]" in steered_tool
    assert steered_tool.startswith(tool_content)

