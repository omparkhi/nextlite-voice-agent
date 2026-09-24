"""Unit and integration tests for end_call tool and dynamic silence/nudge system."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeAgentMetadata,
    RuntimeBehaviorConfig,
    RuntimeDeploymentMetadata,
    RuntimeKnowledgeConfig,
    RuntimeLanguageConfig,
    RuntimeNudgeConfig,
    RuntimePromptConfig,
    RuntimeTenantConfig,
    RuntimeToolConfig,
    RuntimeToolDefinition,
    RuntimeVariableConfig,
    RuntimeVoiceConfig,
)
from app.tools import (
    END_CALL_TOOL_NAME,
    ToolRegistry,
    ToolRuntimeContext,
    tool_registry,
)
from app.turn_timing import TurnTimingTracker
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.processors.frame_processor import FrameDirection
from pipecat.frames.frames import (
    InputAudioRawFrame,
    LLMContextFrame,
    LLMFullResponseStartFrame,
    LLMFullResponseEndFrame,
    LLMTextFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.processors.aggregators.llm_response_universal import LLMContext
from pipecat.services.llm_service import FunctionCallParams


def create_mock_runtime_config(
    end_call_enabled: bool = True,
    nudge_enabled: bool = True,
    nudge_delay: int = 5,
    max_nudges: int = 2,
) -> RuntimeAgentConfig:
    tools = [
        RuntimeToolDefinition(
            toolId="end_call",
            name="end_call",
            description="Politely end and terminate the phone call when the conversation is complete.",
            enabled=end_call_enabled,
        )
    ]
    return RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenantId="test-tenant-123"),
        agent=RuntimeAgentMetadata(agentId="test-agent-123", agentName="Test Agent"),
        deployment=RuntimeDeploymentMetadata(deploymentId="test-dep-123", versionId="ver-1"),
        prompt=RuntimePromptConfig(compiledSystemPrompt="You are a helpful assistant."),
        voice=RuntimeVoiceConfig(provider="sarvam", voiceId="shubh", sttModel="saaras:v2", ttsModel="bulbul:v2"),
        language=RuntimeLanguageConfig(primary="en-IN", supported=["en-IN"]),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        variables=RuntimeVariableConfig(),
        tools=RuntimeToolConfig(enabled=True, tools=tools),
        runtime=RuntimeBehaviorConfig(
            nudges=RuntimeNudgeConfig(
                enabled=nudge_enabled,
                delay_seconds=nudge_delay,
                max_unanswered_nudges=max_nudges,
            )
        ),
    )


# ==============================================================================
# 1. END_CALL TOOL REGISTRATION & RESOLUTION
# ==============================================================================

def test_end_call_tool_registered_in_worker_registry():
    assert END_CALL_TOOL_NAME in tool_registry._factories
    factory = tool_registry.get(END_CALL_TOOL_NAME)
    assert factory is not None
    assert factory.tool_id == "end_call"


class MockFunctionCallParams:
    def __init__(self, arguments: dict, function_name: str = "end_call", tool_call_id: str = "call_123"):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments
        self.result = None
        self.callback_called = False

    async def result_callback(self, result, *args, **kwargs):
        self.result = result
        self.callback_called = True


def test_end_call_schema():
    factory = tool_registry.get(END_CALL_TOOL_NAME)
    context = ToolRuntimeContext(
        deployment_id="dep-1",
        call_session_id="session-1",
        caller_phone="+919876543210",
        tenant_id="ten-1",
        agent_id="ag-1",
    )
    schema = factory.create(context=context)
    assert isinstance(schema, FunctionSchema)
    assert schema.name == "end_call"
    assert "end and terminate" in schema.description.lower() or "hang up" in schema.description.lower()


def test_end_call_disabled_not_available():
    config = create_mock_runtime_config(end_call_enabled=False)
    context = ToolRuntimeContext(
        deployment_id="dep-1",
        call_session_id="session-1",
        caller_phone="+919876543210",
        tenant_id="ten-1",
        agent_id="ag-1",
    )
    resolved = tool_registry.resolve_tools(config, context)
    assert not any(t.name == "end_call" for t in resolved)


def test_end_call_enabled_available():
    config = create_mock_runtime_config(end_call_enabled=True)
    context = ToolRuntimeContext(
        deployment_id="dep-1",
        call_session_id="session-1",
        caller_phone="+919876543210",
        tenant_id="ten-1",
        agent_id="ag-1",
    )
    resolved = tool_registry.resolve_tools(config, context)
    assert any(t.name == "end_call" for t in resolved)


@pytest.mark.asyncio
async def test_end_call_execution_triggers_callback():
    triggered = [False]
    received_reason = [None]

    async def mock_trigger_end_call(reason=None):
        triggered[0] = True
        received_reason[0] = reason

    context = ToolRuntimeContext(
        deployment_id="dep-1",
        call_session_id="session-1",
        caller_phone="+919876543210",
        tenant_id="ten-1",
        agent_id="ag-1",
        trigger_end_call=mock_trigger_end_call,
    )
    factory = tool_registry.get(END_CALL_TOOL_NAME)
    schema = factory.create(context=context)
    handler = schema.handler

    params = MockFunctionCallParams(arguments={"reason": "Customer said goodbye"})
    result = await handler(params)

    assert result["success"] is True
    assert result["action"] == "HANGUP"
    assert triggered[0] is True
    assert received_reason[0] == "Customer said goodbye"


# ==============================================================================
# 2. GRACEFUL TERMINATION & SPEECH TRACKING
# ==============================================================================

@pytest.mark.asyncio
async def test_end_call_graceful_termination_after_tts_completes():
    from app.main import RealtimeStreamingTimingMonitor

    turn_tracker = TurnTimingTracker(stream_id="stream-1")
    is_end_call_pending = [False]
    terminated = [False]
    assistant_speech_stopped_count = [0]

    def _on_assistant_speech_stopped():
        assistant_speech_stopped_count[0] += 1

    async def _on_terminate():
        terminated[0] = True

    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        on_assistant_speech_stopped_fn=_on_assistant_speech_stopped,
        on_end_call_check_fn=lambda: is_end_call_pending[0],
        on_terminate_fn=_on_terminate,
    )

    # 1. LLM executes end_call -> sets is_end_call_pending to True
    is_end_call_pending[0] = True

    # Call should NOT be terminated yet while assistant is still speaking final goodbye
    assert terminated[0] is False

    # 2. TTS plays final goodbye audio
    await monitor.process_frame(TTSStartedFrame(context_id="turn-1"), FrameDirection.DOWNSTREAM)
    assert terminated[0] is False

    # 3. TTS stops -> closing turn finishes -> triggers graceful termination
    await monitor.process_frame(TTSStoppedFrame(context_id="turn-1"), FrameDirection.DOWNSTREAM)
    await asyncio.sleep(0.01)

    assert assistant_speech_stopped_count[0] == 1
    assert terminated[0] is True


@pytest.mark.asyncio
async def test_end_call_multi_chunk_tts_does_not_prematurely_hangup():
    """Verify that multi-sentence/multi-chunk farewells (e.g. 'धन्यवाद, काळजी घ्या! नमस्कार.') do not get cut off after chunk 1."""
    from app.main import RealtimeStreamingTimingMonitor

    turn_tracker = TurnTimingTracker(stream_id="stream-multi-chunk")
    is_end_call_pending = [False]
    terminated = [False]
    assistant_speech_stopped_count = [0]

    def _on_assistant_speech_stopped():
        assistant_speech_stopped_count[0] += 1

    async def _on_terminate():
        terminated[0] = True

    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        on_assistant_speech_stopped_fn=_on_assistant_speech_stopped,
        on_end_call_check_fn=lambda: is_end_call_pending[0],
        on_terminate_fn=_on_terminate,
    )

    is_end_call_pending[0] = True

    # 1. LLM begins response stream
    await monitor.process_frame(LLMFullResponseStartFrame(), FrameDirection.DOWNSTREAM)
    await monitor.process_frame(LLMTextFrame(text="धन्यवाद,"), FrameDirection.DOWNSTREAM)

    # 2. Chunk 1 starts TTS synthesis
    await monitor.process_frame(TTSStartedFrame(context_id="chunk-1"), FrameDirection.DOWNSTREAM)
    assert terminated[0] is False

    # 3. LLM streams more text while Chunk 1 finishes TTS
    await monitor.process_frame(LLMTextFrame(text=" काळजी घ्या! नमस्कार."), FrameDirection.DOWNSTREAM)
    await monitor.process_frame(TTSStoppedFrame(context_id="chunk-1"), FrameDirection.DOWNSTREAM)
    await asyncio.sleep(0.01)

    # CRITICAL: Even though Chunk 1 stopped, call must NOT be terminated because LLM is still in flight!
    assert terminated[0] is False
    assert assistant_speech_stopped_count[0] == 0

    # 4. LLM finishes full response
    await monitor.process_frame(LLMFullResponseEndFrame(), FrameDirection.DOWNSTREAM)

    # 5. Chunk 2 starts and finishes TTS synthesis
    await monitor.process_frame(TTSStartedFrame(context_id="chunk-2"), FrameDirection.DOWNSTREAM)
    assert terminated[0] is False

    await monitor.process_frame(TTSStoppedFrame(context_id="chunk-2"), FrameDirection.DOWNSTREAM)
    await asyncio.sleep(0.01)

    # NOW all LLM tokens and TTS chunks are complete -> graceful terminal disconnect triggers!
    assert terminated[0] is True
    assert assistant_speech_stopped_count[0] == 1


# ==============================================================================
# 3. SILENCE DETECTION & DYNAMIC NUDGE
# ==============================================================================

def test_speech_tracking_silence_state():
    turn_tracker = TurnTimingTracker(stream_id="stream-1")
    turn_tracker.record_greeting_completed()

    # Initial state: user is not speaking, assistant is not speaking
    assert turn_tracker.is_assistant_speaking is False
    assert turn_tracker.speech_start is None

    # User speaks
    turn_tracker.record_speech_start()
    assert turn_tracker.speech_start is not None
    assert turn_tracker.speech_stop is None

    # User finishes speaking
    turn_tracker.record_speech_stop()
    assert turn_tracker.speech_stop is not None
    assert turn_tracker.speech_stop >= turn_tracker.speech_start


@pytest.mark.asyncio
async def test_dynamic_nudge_injection():
    messages = [{"role": "system", "content": "System prompt."}]
    context = LLMContext(messages=messages)

    # Simulate silence event injection
    silence_duration = 6.2
    silence_seconds_int = int(silence_duration)
    system_nudge_prompt = (
        f"[SYSTEM/RUNTIME EVENT]\n"
        f"The caller has been silent for {silence_seconds_int} seconds after you spoke. "
        f"Generate one brief, natural conversational check-in in the active language and persona to ask if they are still there or need help. "
        f"Keep it to one short sentence. Do not repeat verbatim."
    )

    context.add_message({"role": "system", "content": system_nudge_prompt})

    ctx_msgs = context.get_messages()
    assert len(ctx_msgs) == 2
    assert ctx_msgs[-1]["role"] == "system"
    assert "[SYSTEM/RUNTIME EVENT]" in ctx_msgs[-1]["content"]
    assert "6 seconds" in ctx_msgs[-1]["content"]
    # Verify no hardcoded multilingual fallback strings in prompt
    assert "तुम्ही आहात का?" not in ctx_msgs[-1]["content"]
    assert "क्या आप हैं?" not in ctx_msgs[-1]["content"]


def test_turn_in_flight_prevents_premature_silence():
    turn_tracker = TurnTimingTracker(stream_id="stream-1")
    assert turn_tracker.is_turn_in_flight is False

    # User speaks
    turn_tracker.record_speech_start()
    assert turn_tracker.is_turn_in_flight is True

    # User stops speaking but LLM is generating
    turn_tracker.record_speech_stop()
    assert turn_tracker.is_turn_in_flight is True

    # Turn completes
    turn_tracker.record_turn_complete_once()
    assert turn_tracker.is_turn_in_flight is False

