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
    def update_language_context(self, code):
        self._active_language = code

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
async def test_language_context_processor_sarvam_text_lid_switch():
    class MockSTT:
        def __init__(self):
            self.updated_code = None
        async def update_config(self, **fields):
            self.updated_code = fields.get("language_code")

    class MockWorkflowState:
        def __init__(self):
            self.active_language = "mr-IN"

    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"language_code": "hi-IN", "script_code": "Deva"}
    mock_client.post.return_value = mock_resp

    tts = MockTTSService(initial="mr-IN")
    stt = MockSTT()
    wf = MockWorkflowState()

    processor = LanguageContextProcessor(
        tts_service=tts,
        stt_service=stt,
        workflow_state=wf,
        supported_languages=["mr-IN", "hi-IN", "en-IN"],
        http_client=mock_client,
        api_key="test-key",
    )
    processor.push_frame = AsyncMock()

    # Frame with NO language emitted by STT (as happens when started with mr-IN)
    frame = MockTranscriptionFrame("कोणसे कोणसे डॉक्टर अवेलेबल रहते हैं?", None, finalized=True)
    await processor.process_frame(frame, None)

    # 1. TTS updated to Hindi
    assert tts._active_language == "hi-IN"
    # 2. STT in-band config.update sent with Hindi
    assert stt.updated_code == "hi-IN"
    # 3. Workflow state updated to Hindi
    assert wf.active_language == "hi-IN"

    # Turn 2: Switch from Hindi to English
    mock_resp2 = MagicMock()
    mock_resp2.status_code = 200
    mock_resp2.json.return_value = {"language_code": "en-IN", "script_code": "Latn"}
    mock_client.post.return_value = mock_resp2

    frame_en = MockTranscriptionFrame("Can I reschedule my appointment?", None, finalized=True)
    await processor.process_frame(frame_en, None)
    assert tts._active_language == "en-IN"
    assert stt.updated_code == "en-IN"
    assert wf.active_language == "en-IN"

    # Turn 3: Switch from English back to Marathi
    mock_resp3 = MagicMock()
    mock_resp3.status_code = 200
    mock_resp3.json.return_value = {"language_code": "mr-IN", "script_code": "Deva"}
    mock_client.post.return_value = mock_resp3

    frame_mr = MockTranscriptionFrame("हो नक्की, खूप खूप धन्यवाद.", None, finalized=True)
    await processor.process_frame(frame_mr, None)
    assert tts._active_language == "mr-IN"
    assert stt.updated_code == "mr-IN"
    assert wf.active_language == "mr-IN"


