"""Automated test suite for Master Tool-Turn Latency Optimization, Model Routing, and Safe Early Acknowledgement."""

import asyncio
import time
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.config import settings
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeAgentMetadata,
    RuntimeBehaviorConfig,
    RuntimeDeploymentMetadata,
    RuntimeKnowledgeConfig,
    RuntimeLanguageConfig,
    RuntimePromptConfig,
    RuntimeTenantConfig,
    RuntimeToolConfig,
    RuntimeVariableConfig,
)
from app.temporal_context import get_temporal_context
from app.tools import ToolRuntimeContext, tool_registry
from app.tools.appointment_tool import (
    APPOINTMENT_TOOL_PROPERTIES,
    APPOINTMENT_TOOL_REQUIRED,
    BOOK_APPOINTMENT_TOOL_NAME,
    create_book_appointment_tool_factory,
)
from app.tools.lead_tool import (
    CREATE_CALLBACK_LEAD_TOOL_NAME,
    LEAD_TOOL_PROPERTIES,
    LEAD_TOOL_REQUIRED,
    create_callback_lead_tool_factory,
)
from app.tools.knowledge_tool import (
    KNOWLEDGE_TOOL_PROPERTIES,
    KNOWLEDGE_TOOL_REQUIRED,
    QUERY_KNOWLEDGE_BASE_TOOL_NAME,
    create_knowledge_tool_factory,
)
from app.turn_timing import TurnTimingTracker
from app.main import (
    DEFAULT_EARLY_TOOL_ACK_PHRASES,
    InstrumentedAsyncStream,
    InstrumentedSarvamLLMService,
    RealtimeStreamingTimingMonitor,
)
from pipecat.frames.frames import (
    Frame,
    InterruptionFrame,
    ProposedUserStartedSpeakingFrame,
    ProposedUserStoppedSpeakingFrame,
    TTSAudioRawFrame,
    TTSSpeakFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.sarvam.llm import SarvamLLMSettings


def create_mock_runtime_config(
    tool_llm_model: Optional[str] = None,
    tool_max_tokens: int = 128,
    post_tool_max_tokens: int = 80,
    tool_reasoning_mode: Optional[str] = None,
    enable_early_tool_ack: bool = True,
    primary_language: str = "en-IN",
) -> RuntimeAgentConfig:
    return RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenant_id="test_tenant_123"),
        agent=RuntimeAgentMetadata(agent_id="agent_456", agent_name="Test Agent"),
        deployment=RuntimeDeploymentMetadata(deployment_id="dep_789", version_id="ver_001"),
        prompt=RuntimePromptConfig(compiled_system_prompt="You are a helpful assistant."),
        voice={"voiceId": "shubh", "provider": "sarvam"},
        language=RuntimeLanguageConfig(primary=primary_language),
        runtime=RuntimeBehaviorConfig(
            llm_model="sarvam-105b-conversations",
            tool_llm_model=tool_llm_model,
            tool_max_tokens=tool_max_tokens,
            post_tool_max_tokens=post_tool_max_tokens,
            tool_reasoning_mode=tool_reasoning_mode,
            enable_early_tool_ack=enable_early_tool_ack,
        ),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        tools=RuntimeToolConfig(enabled=True),
        variables=RuntimeVariableConfig(),
    )


# ---------------------------------------------------------------------------
# 1. Model Routing & Token Optimization Tests
# ---------------------------------------------------------------------------

def test_runtime_config_tool_routing_fields():
    """Verify RuntimeBehaviorConfig parses tool routing and token optimization options."""
    cfg = create_mock_runtime_config(
        tool_llm_model="sarvam-105b",
        tool_max_tokens=96,
        post_tool_max_tokens=64,
        tool_reasoning_mode="low",
        enable_early_tool_ack=True,
    )
    assert cfg.runtime.tool_llm_model == "sarvam-105b"
    assert cfg.runtime.tool_max_tokens == 96
    assert cfg.runtime.post_tool_max_tokens == 64
    assert cfg.runtime.tool_reasoning_mode == "low"
    assert cfg.runtime.enable_early_tool_ack is True


def test_llm_service_build_chat_completion_params_routing():
    """Verify InstrumentedSarvamLLMService applies tool_max_tokens and post_tool_max_tokens dynamically."""
    runtime_config = create_mock_runtime_config(
        tool_llm_model="sarvam-105b",
        tool_max_tokens=110,
        post_tool_max_tokens=55,
        tool_reasoning_mode="low",
    )
    service = InstrumentedSarvamLLMService(
        api_key="mock-key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
        runtime_config=runtime_config,
    )

    # 1. Pass 1 with tools
    pass1_params = {
        "messages": [{"role": "user", "content": "Book an appointment for tomorrow at 2 PM"}],
        "tools": [{"type": "function", "function": {"name": "book_appointment"}}],
    }
    built_pass1 = service.build_chat_completion_params(pass1_params)
    assert built_pass1["max_tokens"] == 110
    assert built_pass1["model"] == "sarvam-105b"
    assert built_pass1["reasoning_effort"] == "low"

    # 2. Pass 2 post-tool response (last message is tool result)
    pass2_params = {
        "messages": [
            {"role": "user", "content": "Book an appointment for tomorrow at 2 PM"},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "book_appointment"}}]},
            {"role": "tool", "tool_call_id": "c1", "content": '{"success": true, "appointmentId": "apt_123"}'},
        ],
        "tools": [{"type": "function", "function": {"name": "book_appointment"}}],
    }
    built_pass2 = service.build_chat_completion_params(pass2_params)
    assert built_pass2["max_tokens"] == 55


# ---------------------------------------------------------------------------
# 2. Schema Token Minimization & Field Classification Tests
# ---------------------------------------------------------------------------

def test_tool_schema_token_efficiency():
    """Verify tool schemas expose lean, necessary properties without bloated descriptions."""
    # Appointment Tool
    assert "customerName" in APPOINTMENT_TOOL_PROPERTIES
    assert "title" in APPOINTMENT_TOOL_PROPERTIES
    assert "bookingDate" in APPOINTMENT_TOOL_PROPERTIES
    assert "bookingTime" in APPOINTMENT_TOOL_PROPERTIES
    assert "tenantId" not in APPOINTMENT_TOOL_PROPERTIES  # Server-derived
    assert "agentId" not in APPOINTMENT_TOOL_PROPERTIES   # Server-derived
    assert len(APPOINTMENT_TOOL_REQUIRED) == 4

    # Lead Tool
    assert "customerName" in LEAD_TOOL_PROPERTIES
    assert "customerPhone" in LEAD_TOOL_PROPERTIES
    assert "tenantId" not in LEAD_TOOL_PROPERTIES  # Server-derived
    assert len(LEAD_TOOL_REQUIRED) == 1

    # Knowledge Tool
    assert "query" in KNOWLEDGE_TOOL_PROPERTIES
    assert len(KNOWLEDGE_TOOL_REQUIRED) == 1


# ---------------------------------------------------------------------------
# 3. Incremental Tool Streaming & Early Acknowledgement Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_instrumented_stream_triggers_early_ack_on_first_tool_delta():
    """Verify early acknowledgement callback is invoked immediately upon first tool delta."""
    turn_tracker = TurnTimingTracker(stream_id="test_stream")
    turn_tracker.start_new_turn(speech_start=time.perf_counter())
    turn_tracker.record_speech_stop(time.perf_counter())

    class MockFunctionCallParams:
        def __init__(self, function_name="mock_fn", tool_call_id="call_1", arguments=None, result_callback=None):
            self.function_name = function_name
            self.tool_call_id = tool_call_id
            self.arguments = arguments or {}
            self.result_callback = result_callback

    early_ack_called = False

    async def mock_early_ack():
        nonlocal early_ack_called
        early_ack_called = True

    # Simulate raw chunk stream with tool calls delta
    class MockChoice:
        def __init__(self, delta):
            self.delta = delta

    class MockDelta:
        def __init__(self, tool_calls=None, content=None):
            self.tool_calls = tool_calls
            self.content = content

    class MockChunk:
        def __init__(self, delta):
            self.choices = [MockChoice(delta)]

    async def mock_raw_stream():
        # Chunk 1: first tool delta
        yield MockChunk(MockDelta(tool_calls=[{"index": 0, "id": "call_1", "function": {"name": "book_appointment"}}]))
        # Chunk 2: arguments delta
        yield MockChunk(MockDelta(tool_calls=[{"index": 0, "function": {"arguments": '{"customerName": "Ramesh"}'}}]))
        # Chunk 3: end of tool call

    stream = InstrumentedAsyncStream(
        mock_raw_stream(),
        timing_tracker=turn_tracker,
        early_ack_callback=mock_early_ack,
    )

    chunks = []
    async for c in stream:
        chunks.append(c)

    await asyncio.sleep(0.01)

    assert len(chunks) == 2
    assert early_ack_called is True
    assert turn_tracker.tool_call_delta is not None
    assert turn_tracker.tool_delta_count == 2
    assert turn_tracker.tool_call_complete is not None


@pytest.mark.asyncio
async def test_llm_service_dispatches_multilingual_early_ack():
    """Verify InstrumentedSarvamLLMService dispatches proper multilingual filler phrases downstream."""
    turn_tracker = TurnTimingTracker(stream_id="test_stream")
    turn_tracker.start_new_turn(speech_start=time.perf_counter())

    pushed_frames = []

    # Hindi agent configuration
    hi_config = create_mock_runtime_config(primary_language="hi-IN")
    service_hi = InstrumentedSarvamLLMService(
        api_key="mock-key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
        timing_tracker=turn_tracker,
        runtime_config=hi_config,
    )

    async def mock_push_frame(frame, direction):
        pushed_frames.append(frame)

    service_hi.push_frame = mock_push_frame

    await service_hi._dispatch_early_tool_ack()

    assert len(pushed_frames) == 1
    assert isinstance(pushed_frames[0], TTSSpeakFrame)
    assert pushed_frames[0].text == "जी, मैं अभी चेक कर लेता हूँ।"
    assert turn_tracker.early_ack_sent is not None


@pytest.mark.asyncio
async def test_early_ack_first_audio_and_turn_metrics():
    """Verify RealtimeStreamingTimingMonitor records early ack audio and computes effective response latency."""
    turn_tracker = TurnTimingTracker(stream_id="test_stream")
    t0 = 1000.0
    turn_tracker.start_new_turn(speech_start=t0)
    turn_tracker.record_speech_stop(t0 + 0.5)  # 500ms speech duration
    turn_tracker.record_stt_final(t0 + 0.75)  # 250ms STT
    turn_tracker.record_user_aggregation_finalized(t0 + 0.76)

    # LLM tool call delta & early ack dispatch at t0 + 1.1s
    turn_tracker.record_tool_call_delta(t0 + 1.1)
    turn_tracker.record_early_ack_sent(t0 + 1.12)
    turn_tracker.record_early_ack_first_audio(t0 + 1.35)  # Caller hears audio 850ms after user stop!

    # Tool execution completes in background at t0 + 3.8s
    turn_tracker.record_tool_call_complete(t0 + 3.78)
    turn_tracker.record_tool_execution(
        tool_name="book_appointment",
        start_time=t0 + 3.79,
        end_time=t0 + 3.805,
        success=True,
    )

    # Pass 2 runs and finishes at t0 + 4.5s
    turn_tracker.record_first_llm_output(t0 + 4.2)
    turn_tracker.record_first_tts_audio(t0 + 4.5)
    turn_tracker.record_turn_complete(t0 + 4.9)

    metrics = turn_tracker.calculate_metrics()

    # Crucial latency check: User stop to first audio MUST reflect the early acknowledgement (850ms), not 4.0s!
    assert metrics["userStopToFirstAudioMs"] == 850
    assert metrics["userStopToFirstToolDeltaMs"] == 600
    assert metrics["earlyAckSentToFirstAudioMs"] == 230
    assert metrics["toolDurationMs"] == 15
    assert metrics["toolExecutionMs"] == 15
    assert metrics["tools"] == [{"name": "book_appointment", "durationMs": 15, "success": True}]


# ---------------------------------------------------------------------------
# 4. Anti-Hallucination & Server-Side Security Isolation Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_appointment_tool_context_injection_and_anti_hallucination():
    """Verify tool executes securely with trusted context and refuses past dates without hallucination."""
    context = ToolRuntimeContext(
        deployment_id="dep_real_123",
        call_session_id="session_456",
        caller_phone="+919876543210",
        timezone="Asia/Kolkata",
    )
    schema = create_book_appointment_tool_factory(context)

    class MockFunctionCallParams:
        def __init__(self, function_name="mock_fn", tool_call_id="call_1", arguments=None, result_callback=None):
            self.function_name = function_name
            self.tool_call_id = tool_call_id
            self.arguments = arguments or {}
            self.result_callback = result_callback

    # 1. Missing required field
    params_missing = MockFunctionCallParams(
        function_name="book_appointment",
        tool_call_id="c1",
        arguments={"customerName": "Ramesh"},
    )
    res_missing = await schema.handler(params_missing)
    assert res_missing["success"] is False
    assert res_missing["error"] == "INVALID_ARGUMENTS"

    # 2. Past date protection
    params_past = MockFunctionCallParams(
        function_name="book_appointment",
        tool_call_id="c2",
        arguments={
            "customerName": "Ramesh",
            "title": "Consultation",
            "bookingDate": "2020-01-01",
            "bookingTime": "10:00 AM",
        },
    )
    res_past = await schema.handler(params_past)
    assert res_past["success"] is False
    assert res_past["error"] == "PAST_DATE_NOT_ALLOWED"



# ---------------------------------------------------------------------------
# 5. Caller Interruption / Barge-in Test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_caller_interruption_during_early_ack():
    """Verify caller barge-in during early ack registers interruption and resets state."""
    turn_tracker = TurnTimingTracker(stream_id="test_stream")
    t0 = 1000.0
    turn_tracker.start_new_turn(speech_start=t0)
    turn_tracker.record_tts_start(t0 + 0.8)
    turn_tracker.record_first_tts_audio(t0 + 1.1)

    interrupted = turn_tracker.record_interruption(reason="user_barge_in", ts=t0 + 1.2)
    assert interrupted is True
    assert turn_tracker.interrupted is True
    assert turn_tracker.interruption_reason == "user_barge_in"
