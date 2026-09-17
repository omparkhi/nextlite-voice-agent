"""Comprehensive validation tests for Audited Issues ISS-01, ISS-02, ISS-03, and ISS-04.

Verifies:
1. ISS-01: Knowledge grounding contract in prompt compiler & unambiguous knowledge tool outputs.
2. ISS-02: Multilingual early tool acknowledgement fallback on Hindi/Hinglish transcripts.
3. ISS-03: Non-negative telemetry duration with early-ack timestamp isolation.
4. ISS-04: Turn lifecycle early-ack non-splitting (single conversational turn completion).
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.language_manager import ConversationLanguageManager
from app.turn_timing import TurnTimingTracker
from app.call_lifecycle import CallTranscriptCollector
from app.tools.knowledge_tool import create_knowledge_tool_factory
from app.tools.tool_registry import ToolRuntimeContext
from pipecat.services.llm_service import FunctionCallParams
from pipecat.frames.frames import (
    TTSStoppedFrame,
    TTSSpeakFrame,
    LLMTextFrame,
    TranscriptionFrame,
)
from pipecat.processors.frame_processor import FrameDirection


# ============================================================================
# ISS-01: Knowledge Grounding Contract & Tool Output Schema
# ============================================================================

def test_iss01_prompt_compiler_knowledge_grounding_contract():
    """Verify prompt compiler includes authoritative knowledge grounding and slot distinction."""
    import sys
    from pathlib import Path
    root_path = str(Path(__file__).resolve().parents[3])
    if root_path not in sys.path:
        sys.path.insert(0, root_path)
    from apps.api.app.services.prompt_compiler_service import PromptCompilerService
    
    compiler = PromptCompilerService()
    compiled = compiler.compile_system_prompt({
        "identity": {"businessName": "Apex Dental Care"},
        "businessInformation": {"hours": "Mon-Sat 9AM-7PM"},
    })
    
    # Assert Knowledge Grounding rule is present
    assert "KNOWLEDGE RETRIEVAL & FACT GROUNDING" in compiled
    assert "NEVER claim that you cannot access the requested list" in compiled
    assert "query_knowledge_base returns results" in compiled
    
    # Assert Operating Hours vs Slot Availability rule is preserved & clear
    assert "OPERATING HOURS VS SLOT AVAILABILITY" in compiled
    assert "retrieved staff or provider working schedules are NOT specific confirmed slot availability" in compiled
    assert "You may state general operating hours and provider shift timings" in compiled


class MockFunctionCallParams:
    def __init__(self, function_name="query_knowledge_base", tool_call_id="call_1", arguments=None, result_callback=None):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments or {}
        self.result_callback = result_callback


@pytest.mark.asyncio
async def test_iss01_knowledge_tool_output_structure():
    """Verify query_knowledge_base returns unambiguous semantic fields: status, knowledge_found, information."""
    context = ToolRuntimeContext(
        deployment_id="dep-test-123",
        api_url="http://localhost:8000",
        worker_secret="secret",
    )
    
    # Mock HTTP client
    mock_http = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "results": [
            {"content": "Dr. Rohit Sharma (Senior Dentist): Mon-Fri 10:00 AM - 2:00 PM", "score": 0.92},
            {"content": "Dr. Anjali Gupta (Orthodontist): Tue, Thu, Sat 3:00 PM - 7:00 PM", "score": 0.88},
        ]
    }
    mock_http.post = AsyncMock(return_value=mock_response)
    
    schema = create_knowledge_tool_factory(context=context, http_client=mock_http)
    
    result_cb = AsyncMock()
    params = MockFunctionCallParams(
        function_name="query_knowledge_base",
        tool_call_id="call_kb_1",
        arguments={"query": "doctor availability"},
        result_callback=result_cb,
    )
    
    result = await schema.handler(params)
    
    assert result["status"] == "success"
    assert result["knowledge_found"] is True
    assert len(result["information"]) == 2
    assert "Dr. Rohit Sharma" in result["information"][0]
    assert len(result["results"]) == 2
    assert result["results"][0]["relevanceScore"] == 0.92
    result_cb.assert_awaited_once_with(result)


# ============================================================================
# ISS-02: Multilingual Early Tool Acknowledgement
# ============================================================================

def test_iss02_language_manager_heuristic_when_stt_language_unknown():
    """Verify Hindi/Hinglish transcript auto-switches to Hindi even if STT language tag is missing/unknown."""
    manager = ConversationLanguageManager(
        primary="en-IN",
        supported_languages=["en-IN", "hi-IN"],
        auto_detect_enabled=True,
        language_switching_enabled=True,
    )
    assert manager.current_language == "en-IN"
    
    # Caller speaks Hindi query with detected_language_code=None or 'unknown'
    res = manager.process_user_turn("Kaunse kaunse doctor available hai?", detected_language_code=None)
    assert res.switched is True
    assert res.current_language == "hi-IN"
    assert manager.current_language == "hi-IN"


def test_iss02_early_ack_phrase_selection_for_hindi_transcript():
    """Verify early tool ack fallback resolves Hindi phrase for Hindi transcript when language manager was en-IN."""
    from app.main import DEFAULT_EARLY_TOOL_ACK_PHRASES
    from app.language_manager import (
        DEVANAGARI_REGEX,
        HINDI_LATIN_MARKERS_REGEX,
        match_supported_language,
    )
    
    language_manager = ConversationLanguageManager(
        primary="en-IN",
        supported_languages=["en-IN", "hi-IN"],
    )
    
    user_text = "Kaunse kaunse doctor available hai?"
    active_lang = language_manager.current_language  # "en-IN"
    
    if active_lang.startswith("en") and language_manager:
        supported = language_manager.supported_languages
        if any(l.startswith("hi") for l in supported) and (DEVANAGARI_REGEX.search(user_text) or HINDI_LATIN_MARKERS_REGEX.search(user_text)):
            active_lang = match_supported_language("hi-IN", supported) or "hi-IN"
            
    assert active_lang == "hi-IN"
    filler_phrase = DEFAULT_EARLY_TOOL_ACK_PHRASES[active_lang]
    assert filler_phrase == "एक मिनट, मैं अभी चेक कर लेता हूँ।"


# ============================================================================
# ISS-03: Negative Telemetry Duration Prevention
# ============================================================================

def test_iss03_early_ack_does_not_contaminate_llm_first_text_to_release():
    """Verify early filler timing does not cause negative llmFirstTextToReleaseMs."""
    tracker = TurnTimingTracker(stream_id="test_stream_iss03")
    
    t0 = 100.0
    tracker.record_speech_start(t0)
    tracker.record_speech_stop(t0 + 1.2)
    tracker.record_stt_final(t0 + 1.5, transcript="Kaunse kaunse doctor available hai?")
    
    # 1. LLM initiates tool call
    tracker.record_llm_start(t0 + 1.6)
    tracker.record_tool_call_delta(t0 + 1.8)
    
    # 2. Early tool ack is dispatched to TTS at t=101.9
    tracker.record_early_ack_sent(t0 + 1.9)
    # Early filler audio heard
    tracker.record_early_ack_first_audio(t0 + 2.2)
    
    # 3. Tool executes
    tracker.record_tool_execution("query_knowledge_base", start_time=t0 + 2.0, end_time=t0 + 2.4, success=True)
    
    # 4. Post-tool LLM streams response tokens
    tracker.record_first_llm_output(t0 + 2.8)  # sets first_post_tool_llm_output = 102.8
    
    # 5. Assistant response text released to TTS at t=102.9 (+100ms after first post-tool output)
    tracker.record_text_released_to_tts(t0 + 2.9, is_post_tool=True)
    
    tracker.record_tts_start(t0 + 2.95)
    tracker.record_first_tts_audio(t0 + 3.1)
    tracker.record_tts_stop(t0 + 4.5)
    tracker.record_turn_complete(t0 + 4.55)
    
    metrics = tracker.calculate_metrics()
    
    # Must NOT be negative
    release_latency = metrics.get("llmFirstTextToReleaseMs")
    assert release_latency is not None
    assert release_latency >= 0
    assert release_latency == 100  # (102.9 - 102.8) * 1000 = 100ms


# ============================================================================
# ISS-04: Turn Lifecycle / Turn-Count Mismatch Guard
# ============================================================================

@pytest.mark.asyncio
async def test_iss04_early_ack_tts_stopped_does_not_split_turn():
    """Verify TTSStoppedFrame from early filler does not prematurely complete turn or increment turn count."""
    from app.main import RealtimeStreamingTimingMonitor
    
    turn_tracker = TurnTimingTracker(stream_id="test_stream_iss04")
    transcript_collector = CallTranscriptCollector()
    
    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        transcript_collector=transcript_collector,
        primary_language="hi-IN",
    )
    
    # Start turn
    turn_tracker.record_speech_start(100.0)
    turn_tracker.record_speech_stop(101.0)
    turn_tracker.record_stt_final(101.3, transcript="Kaunse kaunse doctor available hai?")
    transcript_collector.record_user_turn("Kaunse kaunse doctor available hai?")
    
    # LLM issues tool call and early ack
    turn_tracker.record_tool_call_delta(101.5)
    turn_tracker.record_early_ack_sent(101.6)
    
    # Early filler TTS starts and stops
    turn_tracker.record_early_ack_first_audio(101.9)
    
    # Early filler TTSStoppedFrame arrives BEFORE post-tool LLM output
    assert turn_tracker.first_post_tool_llm_output is None
    
    # Process early filler TTSStoppedFrame
    await monitor.process_frame(TTSStoppedFrame(), FrameDirection.DOWNSTREAM)
    
    # Turn must NOT be completed, completed_turns must be empty
    assert len(turn_tracker.completed_turns) == 0
    assert turn_tracker.turn_complete is None
    
    # Now tool completes and post-tool response arrives
    turn_tracker.record_tool_execution("query_knowledge_base", 101.7, 102.0, success=True)
    turn_tracker.record_first_llm_output(102.3)
    
    # Assistant text chunks accumulate
    await monitor.process_frame(LLMTextFrame(text="हमारे पास डॉ. रोहित शर्मा उपलब्ध हैं।"), FrameDirection.DOWNSTREAM)
    
    # Real assistant response TTS stops
    await monitor.process_frame(TTSStoppedFrame(), FrameDirection.DOWNSTREAM)
    
    # Now turn should be completed and exactly 1 turn recorded
    assert len(turn_tracker.completed_turns) == 1
    # Exactly one agent message recorded in transcript
    turns = transcript_collector.get_turns()
    assert len(turns) == 1
    assert turns[0]["agent"]["response"] == "हमारे पास डॉ. रोहित शर्मा उपलब्ध हैं।"
