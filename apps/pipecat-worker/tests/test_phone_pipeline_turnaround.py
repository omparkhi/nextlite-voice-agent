"""Targeted unit and integration tests for phone pipeline turnaround,

model compatibility normalization, turn strategy wiring, and frame forwarding.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock

from pipecat.frames.frames import (
    TranscriptionFrame,
    ProposedUserStartedSpeakingFrame,
    ProposedUserStoppedSpeakingFrame,
    InterruptionFrame,
)
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContext,
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.turns.user_turn_strategies import (
    ExternalUserTurnStrategies,
    ExternalUserTurnStartStrategy,
    ExternalUserTurnStopStrategy,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.workers.runner import WorkerRunner
from pipecat.processors.frame_processor import FrameDirection
from pipecat.adapters.schemas.function_schema import FunctionSchema

from app.language_manager import ConversationLanguageManager
from app.language_processor import LanguageContextProcessor
from app.runtime_config_client import RuntimeAgentConfig
from app.tools import ToolRegistry, ToolRuntimeContext


def normalize_tts_model(raw_model: str) -> str:
    """TTS compatibility normalization logic matching main.py."""
    if raw_model in ("bulbul:v2", "bulbul:v1", "bulbul"):
        return "bulbul:v3"
    return raw_model


def normalize_llm_model(raw_model: str) -> str:
    """LLM compatibility normalization logic matching main.py."""
    if raw_model in ("sarvam-105b", "sarvam-105b-v1"):
        return "sarvam-105b-conversations"
    return raw_model


# 1. bulbul:v2 compatibility normalization
def test_tts_normalization_bulbul_v2():
    assert normalize_tts_model("bulbul:v2") == "bulbul:v3"


# 2. bulbul:v1 compatibility normalization
def test_tts_normalization_bulbul_v1():
    assert normalize_tts_model("bulbul:v1") == "bulbul:v3"


# 3. bulbul compatibility normalization
def test_tts_normalization_bulbul_bare():
    assert normalize_tts_model("bulbul") == "bulbul:v3"


# 4. bulbul:v3 remains unchanged
def test_tts_normalization_bulbul_v3_unchanged():
    assert normalize_tts_model("bulbul:v3") == "bulbul:v3"


# 5. sarvam-105b compatibility normalization
def test_llm_normalization_sarvam_105b():
    assert normalize_llm_model("sarvam-105b") == "sarvam-105b-conversations"
    assert normalize_llm_model("sarvam-105b-v1") == "sarvam-105b-conversations"


# 6. sarvam-105b-conversations remains unchanged
def test_llm_normalization_sarvam_105b_conversations_unchanged():
    assert normalize_llm_model("sarvam-105b-conversations") == "sarvam-105b-conversations"


# 7. ExternalUserTurnStrategies configuration
def test_external_user_turn_strategies_configuration():
    user_params = LLMUserAggregatorParams(
        user_turn_strategies=ExternalUserTurnStrategies()
    )
    assert len(user_params.user_turn_strategies.start) > 0
    assert isinstance(user_params.user_turn_strategies.start[0], ExternalUserTurnStartStrategy)
    assert len(user_params.user_turn_strategies.stop) > 0
    assert isinstance(user_params.user_turn_strategies.stop[0], ExternalUserTurnStopStrategy)
    
    ctx = LLMContext(messages=[{"role": "system", "content": "test"}])
    pair = LLMContextAggregatorPair(ctx, user_params=user_params)
    user_aggregator = pair.user()
    assert user_aggregator is not None


# 8. Final transcript arriving after END_SPEECH
@pytest.mark.asyncio
async def test_turn_aggregation_speech_stop_then_transcript():
    user_params = LLMUserAggregatorParams(
        user_turn_strategies=ExternalUserTurnStrategies()
    )
    ctx = LLMContext(messages=[{"role": "system", "content": "You are a helpful assistant."}])
    pair = LLMContextAggregatorPair(ctx, user_params=user_params)
    user_aggregator = pair.user()
    assistant_aggregator = pair.assistant()

    pipeline = Pipeline([user_aggregator, assistant_aggregator])
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(audio_in_sample_rate=8000, audio_out_sample_rate=8000),
    )
    runner = WorkerRunner(handle_sigint=False, handle_sigterm=False)
    await runner.add_workers(worker)

    runner_task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.2)

    # 1. Proposed start speech arrives
    await worker.queue_frame(ProposedUserStartedSpeakingFrame())
    await asyncio.sleep(0.1)

    # 2. Proposed stop speech arrives (VAD END_SPEECH arrives first)
    await worker.queue_frame(ProposedUserStoppedSpeakingFrame())
    await asyncio.sleep(0.1)

    # 3. Final TranscriptionFrame arrives after END_SPEECH
    await worker.queue_frame(TranscriptionFrame(text="Hello world", user_id="user", timestamp="2026-09-10T18:00:00Z"))
    
    # Wait for turn stop timeout and aggregation
    for _ in range(35):
        await asyncio.sleep(0.1)
        messages = ctx.get_messages()
        if any(m.get("role") == "user" and m.get("content") == "Hello world" for m in messages):
            break

    # Verify user message was committed to LLM context
    messages = ctx.get_messages()
    assert any(m.get("role") == "user" and m.get("content") == "Hello world" for m in messages)

    await runner.cancel()
    try:
        await asyncio.wait_for(runner_task, timeout=2.0)
    except Exception:
        pass


# 9. LanguageContextProcessor forwards VAD frames
@pytest.mark.asyncio
async def test_language_context_processor_forwards_vad_frames():
    lang_mgr = ConversationLanguageManager(primary="en-IN", supported_languages=["en-IN", "hi-IN"])
    ctx = LLMContext(messages=[{"role": "system", "content": "test prompt"}])
    processor = LanguageContextProcessor(
        language_manager=lang_mgr,
        conversation_context=ctx,
        base_system_prompt="test prompt",
    )
    processor.push_frame = AsyncMock()

    start_vad = ProposedUserStartedSpeakingFrame()
    stop_vad = ProposedUserStoppedSpeakingFrame()
    interrupt = InterruptionFrame()

    await processor.process_frame(start_vad, FrameDirection.DOWNSTREAM)
    processor.push_frame.assert_called_with(start_vad, FrameDirection.DOWNSTREAM)

    await processor.process_frame(stop_vad, FrameDirection.DOWNSTREAM)
    processor.push_frame.assert_called_with(stop_vad, FrameDirection.DOWNSTREAM)

    await processor.process_frame(interrupt, FrameDirection.DOWNSTREAM)
    processor.push_frame.assert_called_with(interrupt, FrameDirection.DOWNSTREAM)


# 10. LanguageContextProcessor forwards TranscriptionFrame
@pytest.mark.asyncio
async def test_language_context_processor_forwards_transcription_frame():
    lang_mgr = ConversationLanguageManager(primary="en-IN", supported_languages=["en-IN", "hi-IN"])
    ctx = LLMContext(messages=[{"role": "system", "content": "base prompt"}])
    processor = LanguageContextProcessor(
        language_manager=lang_mgr,
        conversation_context=ctx,
        base_system_prompt="base prompt",
    )
    processor.push_frame = AsyncMock()

    trans_frame = TranscriptionFrame(text="Hello", user_id="user", timestamp=100.0)
    await processor.process_frame(trans_frame, FrameDirection.DOWNSTREAM)
    
    # Should push the transcription frame downstream
    assert processor.push_frame.call_count >= 1
    call_args_list = [call.args[0] for call in processor.push_frame.call_args_list]
    assert trans_frame in call_args_list


# 11. FunctionSchema handlers are resolved with handler
def test_tool_registry_function_schema_has_handler():
    registry = ToolRegistry()
    raw_config = {
        "tenant": {"tenantId": "t-1"},
        "agent": {"agentId": "a-1", "agentName": "test"},
        "deployment": {"deploymentId": "d-1", "versionId": "v-1"},
        "prompt": {"compiledSystemPrompt": "Hello"},
        "voice": {"provider": "sarvam", "voiceId": "shubh", "sttModel": "saaras:v3", "ttsModel": "bulbul:v3"},
        "language": {"primary": "en-IN", "supportedLanguages": ["en-IN"]},
        "runtime": {"llmModel": "sarvam-105b-conversations"},
        "knowledge": {"enabled": False},
        "tools": {
            "enabled": True,
            "tools": [
                {
                    "name": "book_appointment",
                    "description": "Book appointment",
                    "parameters": {"type": "object", "properties": {"doctorName": {"type": "string"}}},
                }
            ],
        },
        "variables": {"inputVariables": [], "outputVariables": []},
    }
    cfg = RuntimeAgentConfig.model_validate(raw_config)
    tool_ctx = ToolRuntimeContext(
        deployment_id="d-1",
        call_session_id="cs-1",
        caller_phone="+1234567890",
        tenant_id="t-1",
        agent_id="a-1",
        api_url="http://localhost:3001",
        worker_secret="secret",
    )
    tools = registry.resolve_tools(cfg, tool_ctx)
    assert len(tools) == 1
    assert isinstance(tools[0], FunctionSchema)
    assert tools[0].name == "book_appointment"
    assert tools[0].handler is not None


# 12. Dynamic RuntimeAgentConfig greeting remains authoritative
def test_runtime_agent_config_greeting_dynamic():
    raw_config_1 = {
        "tenant": {"tenantId": "t-1"},
        "agent": {"agentId": "a-1", "agentName": "test"},
        "deployment": {"deploymentId": "d-1", "versionId": "v-1"},
        "prompt": {"compiledSystemPrompt": "Hello", "greeting": "Welcome to Dr. Sharma Clinic!"},
        "voice": {"provider": "sarvam", "voiceId": "shubh"},
        "language": {"primary": "en-IN", "supportedLanguages": ["en-IN"]},
        "runtime": {},
        "knowledge": {"enabled": False},
        "tools": {"enabled": False, "tools": []},
        "variables": {"inputVariables": [], "outputVariables": []},
    }
    cfg1 = RuntimeAgentConfig.model_validate(raw_config_1)
    assert cfg1.prompt.greeting == "Welcome to Dr. Sharma Clinic!"

    raw_config_2 = {
        "tenant": {"tenantId": "t-1"},
        "agent": {"agentId": "a-1", "agentName": "test"},
        "deployment": {"deploymentId": "d-1", "versionId": "v-1"},
        "prompt": {"compiledSystemPrompt": "Hello", "greeting": "Hello, thank you for calling. How can I help you today?"},
        "voice": {"provider": "sarvam", "voiceId": "shubh"},
        "language": {"primary": "en-IN", "supportedLanguages": ["en-IN"]},
        "runtime": {},
        "knowledge": {"enabled": False},
        "tools": {"enabled": False, "tools": []},
        "variables": {"inputVariables": [], "outputVariables": []},
    }
    cfg2 = RuntimeAgentConfig.model_validate(raw_config_2)
    assert cfg2.prompt.greeting == "Hello, thank you for calling. How can I help you today?"


# 13. Plivo Serializer cleanly preserves audio/x-l16 linear PCM
@pytest.mark.asyncio
async def test_diagnostic_plivo_serializer_l16_preserves_linear_pcm():
    import base64
    import json
    import struct
    from pipecat.frames.frames import InputAudioRawFrame
    from pipecat.serializers.plivo import PlivoFrameSerializer
    from app.main import analyze_pcm_audio

    class DiagnosticPlivoFrameSerializer(PlivoFrameSerializer):
        def __init__(self, *args, encoding: str = "audio/x-mulaw", **kwargs):
            super().__init__(*args, **kwargs)
            self._media_count = 0
            self._stream_encoding = encoding

        async def deserialize(self, data: str | bytes):
            try:
                message = json.loads(data)
            except Exception:
                return None

            if message.get("event") == "media":
                media = message.get("media", {})
                payload_base64 = media.get("payload")
                if not payload_base64:
                    return None
                payload = base64.b64decode(payload_base64)
                if "l16" in self._stream_encoding:
                    deserialized_data = payload
                else:
                    from pipecat.audio.utils import ulaw_to_pcm
                    deserialized_data = await ulaw_to_pcm(
                        payload, self._plivo_sample_rate, self._sample_rate, self._input_resampler
                    )
                if deserialized_data is None or len(deserialized_data) == 0:
                    return None
                return InputAudioRawFrame(
                    audio=deserialized_data,
                    num_channels=1,
                    sample_rate=self._sample_rate or 8000,
                )
            return await super().deserialize(data)

    serializer = DiagnosticPlivoFrameSerializer(
        stream_id="test-stream",
        encoding="audio/x-l16",
        params=PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000),
    )
    # Generate 160 samples (320 bytes) of clean 8 kHz PCM at ~1000 amplitude
    raw_pcm = struct.pack("<160h", *[1000 if i % 2 == 0 else -1000 for i in range(160)])
    media_event = json.dumps({
        "event": "media",
        "media": {
            "payload": base64.b64encode(raw_pcm).decode("utf-8")
        }
    })
    frame = await serializer.deserialize(media_event)
    assert isinstance(frame, InputAudioRawFrame)
    assert frame.audio == raw_pcm
    assert len(frame.audio) == 320
    stats = analyze_pcm_audio(frame.audio)
    assert stats["peak"] == 1000
    assert stats["rms"] == 1000.0


# 14. Plivo Serializer decodes audio/x-mulaw to linear PCM
@pytest.mark.asyncio
async def test_diagnostic_plivo_serializer_mulaw_decodes():
    import base64
    import json
    import audioop
    from pipecat.frames.frames import InputAudioRawFrame
    from pipecat.serializers.plivo import PlivoFrameSerializer

    class DiagnosticPlivoFrameSerializer(PlivoFrameSerializer):
        def __init__(self, *args, encoding: str = "audio/x-mulaw", **kwargs):
            super().__init__(*args, **kwargs)
            self._media_count = 0
            self._stream_encoding = encoding

        async def deserialize(self, data: str | bytes):
            try:
                message = json.loads(data)
            except Exception:
                return None

            if message.get("event") == "media":
                media = message.get("media", {})
                payload_base64 = media.get("payload")
                if not payload_base64:
                    return None
                payload = base64.b64decode(payload_base64)
                target_rate = self._sample_rate or self._plivo_sample_rate or 8000
                if "l16" in self._stream_encoding:
                    deserialized_data = payload
                else:
                    from pipecat.audio.utils import ulaw_to_pcm
                    deserialized_data = await ulaw_to_pcm(
                        payload, self._plivo_sample_rate, target_rate, self._input_resampler
                    )
                if deserialized_data is None or len(deserialized_data) == 0:
                    return None
                return InputAudioRawFrame(
                    audio=deserialized_data,
                    num_channels=1,
                    sample_rate=target_rate,
                )
            return await super().deserialize(data)

    serializer = DiagnosticPlivoFrameSerializer(
        stream_id="test-stream",
        encoding="audio/x-mulaw",
        params=PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000),
    )
    # 160 bytes of mulaw
    mulaw_bytes = bytes([0x80] * 160)
    media_event = json.dumps({
        "event": "media",
        "media": {
            "payload": base64.b64encode(mulaw_bytes).decode("utf-8")
        }
    })
    frame = await serializer.deserialize(media_event)
    assert isinstance(frame, InputAudioRawFrame)
    assert len(frame.audio) == 320


# 15. LLMUserAggregator on_user_turn_stopped event handler signature accepts (aggregator, strategy, message)
@pytest.mark.asyncio
async def test_user_turn_stopped_event_handler_signature():
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContext,
        LLMContextAggregatorPair,
        LLMUserAggregatorParams,
        UserTurnStoppedMessage,
    )
    from pipecat.turns.user_turn_strategies import (
        ExternalUserTurnStrategies,
        ExternalUserTurnStopStrategy,
    )

    context = LLMContext()
    user_params = LLMUserAggregatorParams(
        user_turn_strategies=ExternalUserTurnStrategies()
    )
    pair = LLMContextAggregatorPair(context, user_params=user_params)
    user_agg = pair.user()

    captured_events = []

    @user_agg.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message=None):
        captured_events.append({
            "aggregator": aggregator,
            "strategy": strategy,
            "message": message,
        })

    mock_strategy = ExternalUserTurnStopStrategy()
    mock_msg = UserTurnStoppedMessage(content="Hello, I want to book an appointment.", timestamp="2026-09-11T00:50:00Z")

    # Emulate Pipecat internal event handler dispatch (passes 3 args: self, strategy, message)
    await user_agg._call_event_handler("on_user_turn_stopped", mock_strategy, mock_msg)
    await asyncio.sleep(0.05)

    assert len(captured_events) == 1
    assert captured_events[0]["aggregator"] == user_agg
    assert captured_events[0]["strategy"] == mock_strategy
    assert captured_events[0]["message"] == mock_msg
    assert captured_events[0]["message"].content == "Hello, I want to book an appointment."


def test_phase16c_turn_endpointing_strategies_configuration():
    """Verify Phase 16C optimized turn stop strategy timeout=0.35s and STT ttfs_p99_latency=0.20s."""
    from pipecat.turns.user_start import ExternalUserTurnStartStrategy
    from pipecat.turns.user_stop import ExternalUserTurnStopStrategy
    from pipecat.turns.user_turn_strategies import UserTurnStrategies
    from pipecat.processors.aggregators.llm_response_universal import LLMUserAggregatorParams
    from pipecat.services.sarvam.stt import SarvamSTTService

    stop_strat = ExternalUserTurnStopStrategy(timeout=0.35, wait_for_transcript=True)
    assert stop_strat._timeout == 0.35
    assert stop_strat._wait_for_transcript is True

    turn_strategies = UserTurnStrategies(
        start=[ExternalUserTurnStartStrategy(enable_interruptions=True)],
        stop=[stop_strat],
    )
    user_params = LLMUserAggregatorParams(user_turn_strategies=turn_strategies)
    assert user_params.user_turn_strategies.stop[0]._timeout == 0.35

    stt_service = SarvamSTTService(
        api_key="mock_key",
        settings=SarvamSTTService.Settings(model="saaras:v3", vad_signals=True),
        ttfs_p99_latency=0.20,
    )
    assert stt_service._ttfs_p99_latency == 0.20



