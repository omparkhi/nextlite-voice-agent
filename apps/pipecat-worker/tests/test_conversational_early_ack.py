"""Automated test suite for Step 2 Conversational Early Acknowledgment Fast-Path."""

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
    RuntimeToolDefinition,
    RuntimeVariableConfig,
)
from app.aggregators.early_release_aggregator import (
    EarlyReleaseTextAggregator,
    RE_LEADING_AFFIRMATION,
)
from app.turn_timing import TurnTimingTracker
from app.main import (
    DEFAULT_CONVERSATIONAL_ACK_PHRASES,
    DEFAULT_EARLY_TOOL_ACK_PHRASES,
    InstrumentedAsyncStream,
    InstrumentedSarvamLLMService,
    is_appointment_booking_intent,
    is_farewell_or_terminal_intent,
)
from pipecat.frames.frames import (
    Frame,
    TTSSpeakFrame,
    TTSAudioRawFrame,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.sarvam.llm import SarvamLLMSettings


def create_mock_runtime_config(
    enable_conversational_early_ack: bool = True,
    primary_language: str = "mr-IN",
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
            enable_early_tool_ack=True,
            enable_conversational_early_ack=enable_conversational_early_ack,
        ),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        tools=RuntimeToolConfig(enabled=True),
        variables=RuntimeVariableConfig(),
    )


def test_conversational_early_ack_is_disabled_by_default():
    """Ordinary turns must have exactly one speech source: the streamed LLM."""
    assert RuntimeBehaviorConfig().enable_conversational_early_ack is False


# ---------------------------------------------------------------------------
# 1. Intent Guard Tests
# ---------------------------------------------------------------------------

def test_farewell_or_terminal_intent_detection():
    """Verify that farewell and call termination utterances are correctly identified."""
    assert is_farewell_or_terminal_intent("बाय") is True
    assert is_farewell_or_terminal_intent("bye") is True
    assert is_farewell_or_terminal_intent("bye bye") is True
    assert is_farewell_or_terminal_intent("ओके बाय") is True
    assert is_farewell_or_terminal_intent("फोन ठेवतो") is True
    assert is_farewell_or_terminal_intent("call disconnect") is True
    assert is_farewell_or_terminal_intent("अलविदा") is True

    # Normal queries must NOT be marked as terminal
    assert is_farewell_or_terminal_intent("डॉक्टर जोशी कधी भेटतील?") is False
    assert is_farewell_or_terminal_intent("मला अपॉइंटमेंट हवी आहे") is False
    assert is_farewell_or_terminal_intent("Can I book a visit tomorrow?") is False
    assert is_farewell_or_terminal_intent("नमस्ते, मला माहिती हवी आहे") is False


# ---------------------------------------------------------------------------
# 2. Aggregator Affirmation Deduplication Tests
# ---------------------------------------------------------------------------

def test_appointment_intent_ack_is_strictly_booking_gated():
    assert is_appointment_booking_intent("Mala appointment book karaychi aahe") is True
    assert is_appointment_booking_intent("Can I schedule an appointment tomorrow?") is True
    assert is_appointment_booking_intent("What are your appointment hours?") is False
    assert is_appointment_booking_intent("bye, cancel my appointment") is False

@pytest.mark.asyncio
async def test_aggregator_leading_affirmation_deduplication_marathi():
    """Verify aggregator deduplicates leading affirmative prefix when fast-path early ack is active."""
    agg = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    agg.enable_leading_affirmation_deduplication(True)

    # LLM streams: "होय, डॉक्टर जोशी उपलब्ध आहेत."
    chunks = []
    async for item in agg.aggregate("होय, डॉक्टर जोशी "):
        chunks.append(item.text)
    async for item in agg.aggregate("उपलब्ध आहेत."):
        chunks.append(item.text)

    flushed = await agg.flush()
    if flushed:
        chunks.append(flushed.text)

    # The leading "होय," should have been stripped, so LLM stream begins with "डॉक्टर जोशी..."
    full_text = " ".join(chunks)
    assert "होय" not in full_text
    assert "डॉक्टर जोशी उपलब्ध आहेत." in full_text


@pytest.mark.asyncio
async def test_aggregator_leading_affirmation_deduplication_hindi():
    """Verify aggregator deduplicates leading Hindi affirmative prefix."""
    agg = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    agg.enable_leading_affirmation_deduplication(True)

    # LLM streams: "हाँ जी, मैं आपकी मदद कर सकता हूँ।"
    chunks = []
    async for item in agg.aggregate("हाँ जी, मैं आपकी "):
        chunks.append(item.text)
    async for item in agg.aggregate("मदद कर सकता हूँ।"):
        chunks.append(item.text)

    flushed = await agg.flush()
    if flushed:
        chunks.append(flushed.text)

    full_text = " ".join(chunks)
    assert "हाँ जी" not in full_text
    assert "मैं आपकी मदद कर सकता हूँ" in full_text


@pytest.mark.asyncio
async def test_aggregator_leading_affirmation_deduplication_english():
    """Verify aggregator deduplicates leading English affirmative prefix."""
    agg = EarlyReleaseTextAggregator(
        min_first_chunk_words=2,
        min_first_chunk_chars=12,
        min_clause_words=3,
        min_clause_chars=15,
    )
    agg.enable_leading_affirmation_deduplication(True)

    # LLM streams: "Sure, I can check that for you."
    chunks = []
    async for item in agg.aggregate("Sure, I can check "):
        chunks.append(item.text)
    async for item in agg.aggregate("that for you."):
        chunks.append(item.text)

    flushed = await agg.flush()
    if flushed:
        chunks.append(flushed.text)

    full_text = " ".join(chunks)
    assert "Sure" not in full_text
    assert "I can check that for you." in full_text


# ---------------------------------------------------------------------------
# 3. Conversational Early Ack Dispatch & Telemetry Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_conversational_early_ack_dispatch_marathi():
    """Verify conversational early ack dispatches correct Marathi particle and records timing."""
    turn_tracker = TurnTimingTracker()
    turn_tracker.start_new_turn("turn_mr_1")
    turn_tracker.record_speech_stop(time.perf_counter() - 0.02)

    runtime_config = create_mock_runtime_config(primary_language="mr-IN")
    mock_tts = MagicMock()
    mock_tts._text_aggregator = EarlyReleaseTextAggregator()

    service = InstrumentedSarvamLLMService(
        api_key="test_key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
        timing_tracker=turn_tracker,
        runtime_config=runtime_config,
        tts_service=mock_tts,
    )

    dispatched_frames = []
    async def mock_push_frame(frame, direction):
        dispatched_frames.append(frame)

    service.push_frame = mock_push_frame

    # Trigger conversational early ack
    await service._dispatch_early_conversational_ack(user_transcript="मला अपॉइंटमेंट हवी आहे")

    assert len(dispatched_frames) == 1
    frame = dispatched_frames[0]
    assert isinstance(frame, TTSSpeakFrame)
    assert frame.text == "होय,"
    assert turn_tracker.early_ack_sent is not None
    assert mock_tts._text_aggregator._deduplicate_leading_affirmation is True


@pytest.mark.asyncio
async def test_conversational_early_ack_disabled_by_config():
    """Verify conversational early ack is skipped when enable_conversational_early_ack is False."""
    turn_tracker = TurnTimingTracker()
    turn_tracker.start_new_turn("turn_disabled_1")
    runtime_config = create_mock_runtime_config(enable_conversational_early_ack=False)

    service = InstrumentedSarvamLLMService(
        api_key="test_key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
        timing_tracker=turn_tracker,
        runtime_config=runtime_config,
    )

    dispatched_frames = []
    async def mock_push_frame(frame, direction):
        dispatched_frames.append(frame)

    service.push_frame = mock_push_frame

    await service._dispatch_early_conversational_ack(user_transcript="मला अपॉइंटमेंट हवी आहे")
    assert len(dispatched_frames) == 0
    assert turn_tracker.early_ack_sent is None


@pytest.mark.asyncio
async def test_appointment_intent_ack_is_emitted_once_for_enabled_booking_tool():
    turn_tracker = TurnTimingTracker()
    turn_tracker.start_new_turn("turn_booking_1")
    runtime_config = create_mock_runtime_config(primary_language="mr-IN")
    runtime_config.runtime.enable_appointment_intent_ack = True
    runtime_config.tools = RuntimeToolConfig(
        enabled=True,
        tools=[
            RuntimeToolDefinition(
                name="book_appointment",
                description="Book an appointment",
                enabled=True,
            )
        ],
    )
    service = InstrumentedSarvamLLMService(
        api_key="test_key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
        timing_tracker=turn_tracker,
        runtime_config=runtime_config,
    )
    frames = []

    async def mock_push_frame(frame, direction):
        frames.append(frame)

    service.push_frame = mock_push_frame
    await service._dispatch_appointment_intent_ack("Mala appointment book karaychi aahe")
    await service._dispatch_appointment_intent_ack("Mala appointment book karaychi aahe")

    assert len(frames) == 1
    assert isinstance(frames[0], TTSSpeakFrame)
    assert turn_tracker.early_ack_sent is not None


def test_normal_llm_turns_do_not_schedule_conversational_filler():
    """Regression: one normal turn must not produce both worker and LLM speech."""
    import inspect

    source = inspect.getsource(InstrumentedSarvamLLMService.get_chat_completions)
    assert "_dispatch_early_conversational_ack(last_user_msg)" not in source
