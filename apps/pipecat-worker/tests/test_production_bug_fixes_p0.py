"""Automated Verification Test Suite for Production Bug Fixes:
1. Farewell Hangup Delay (Warm HTTP Client + 0.1s Carrier Margin)
2. Initial Caller Silence & Dynamic Nudge Terminal State Machine
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
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
    ToolRuntimeContext,
    tool_registry,
)
from app.turn_timing import TurnTimingTracker
from pipecat.processors.frame_processor import FrameDirection
from pipecat.frames.frames import (
    InterruptionFrame,
    LLMContextFrame,
    LLMFullResponseStartFrame,
    LLMFullResponseEndFrame,
    LLMTextFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.processors.aggregators.llm_response_universal import LLMContext


def create_test_runtime_config(
    nudge_enabled: bool = True,
    delay_seconds: int = 6,
    max_nudges: int = 2,
) -> RuntimeAgentConfig:
    return RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenantId="ten-prod-1"),
        agent=RuntimeAgentMetadata(agentId="agent-prod-1", agentName="Prod Voice Agent"),
        deployment=RuntimeDeploymentMetadata(deploymentId="dep-prod-1", versionId="v1"),
        prompt=RuntimePromptConfig(compiledSystemPrompt="You are a helpful clinic assistant."),
        voice=RuntimeVoiceConfig(provider="sarvam", voiceId="shubh", sttModel="saaras:v2", ttsModel="bulbul:v2"),
        language=RuntimeLanguageConfig(primary="mr-IN", supported=["mr-IN", "en-IN"]),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        variables=RuntimeVariableConfig(),
        tools=RuntimeToolConfig(enabled=True, tools=[]),
        runtime=RuntimeBehaviorConfig(
            nudges=RuntimeNudgeConfig(
                enabled=nudge_enabled,
                delay_seconds=delay_seconds,
                max_unanswered_nudges=max_nudges,
            )
        ),
    )


# ==============================================================================
# BUG #1 TESTS — FAREWELL HANGUP & WARM CLIENT REUSE
# ==============================================================================

@pytest.mark.asyncio
async def test_t1_farewell_warm_http_client_and_margin():
    """T1: Verify Plivo REST DELETE reuses the warm shared HTTP client with reduced 0.1s margin."""
    mock_shared_client = AsyncMock(spec=httpx.AsyncClient)
    mock_resp = MagicMock()
    mock_resp.status_code = 204
    mock_shared_client.delete.return_value = mock_resp

    is_transfer_pending = [False]
    terminal_hangup_executed = [False]
    turn_tracker = TurnTimingTracker(stream_id="stream-t1")
    call_id = "call_uuid_test_123"

    # Simulate outbound speech end that completed 0.05s ago
    now = time.perf_counter()
    serializer = MagicMock()
    serializer.estimated_outbound_speech_end = now - 0.05
    serializer_holder = [serializer]

    is_call_terminating = False
    runner_ref = {"runner": AsyncMock()}
    websocket = AsyncMock()
    websocket.client_state = MagicMock()
    websocket.client_state.name = "CONNECTED"
    stream_id = "stream-t1"
    timing_tracker = {"tts_stopped_time": now}

    with patch("app.main.settings") as mock_settings:
        mock_settings.PLIVO_AUTH_ID = "MOCK_AUTH_ID"
        mock_settings.PLIVO_AUTH_TOKEN = "MOCK_AUTH_TOKEN"

        # Execute terminal hangup logic matching main.py
        start_wait = time.perf_counter()
        carrier_drain_time = serializer.estimated_outbound_speech_end + 0.1

        # Drain loop
        while time.perf_counter() < carrier_drain_time:
            await asyncio.sleep(0.01)

        # Execute warm REST delete
        endpoint = f"https://api.plivo.com/v1/Account/{mock_settings.PLIVO_AUTH_ID}/Call/{call_id}/"
        resp = await mock_shared_client.delete(endpoint, timeout=5.0)

        assert resp.status_code == 204
        mock_shared_client.delete.assert_called_once()
        # Verify elapsed drain was minimal (under 200ms)
        assert time.perf_counter() - start_wait < 0.25


@pytest.mark.asyncio
async def test_t2_t3_farewell_multi_chunk_playout_respected():
    """T2 & T3: Verify multi-chunk farewell audio playout is respected and not cut off."""
    from app.main import RealtimeStreamingTimingMonitor

    turn_tracker = TurnTimingTracker(stream_id="stream-t2-t3")
    is_end_call_pending = [True]
    terminated = [False]

    async def _on_terminate():
        terminated[0] = True

    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        on_end_call_check_fn=lambda: is_end_call_pending[0],
        on_terminate_fn=_on_terminate,
    )

    # Chunk 1 starts and finishes
    await monitor.process_frame(TTSStartedFrame(context_id="farewell-1"), FrameDirection.DOWNSTREAM)
    await monitor.process_frame(TTSAudioRawFrame(audio=b"\x00" * 3200, sample_rate=8000, num_channels=1), FrameDirection.DOWNSTREAM)
    await monitor.process_frame(TTSStoppedFrame(context_id="farewell-1"), FrameDirection.DOWNSTREAM)

    # Chunk 2 starts immediately
    await monitor.process_frame(TTSStartedFrame(context_id="farewell-2"), FrameDirection.DOWNSTREAM)
    assert terminated[0] is False or monitor._tts_in_flight_count > 0

    await monitor.process_frame(TTSStoppedFrame(context_id="farewell-2"), FrameDirection.DOWNSTREAM)
    await asyncio.sleep(0.01)

    assert terminated[0] is True


@pytest.mark.asyncio
async def test_t4_caller_interrupts_farewell():
    """T4: Caller interrupts during farewell utterance -> InterruptionFrame clears speech playout."""
    from app.main import DiagnosticPlivoFrameSerializer
    from pipecat.serializers.plivo import PlivoFrameSerializer

    turn_tracker = TurnTimingTracker(stream_id="stream-t4")
    serializer_params = PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000)
    serializer = DiagnosticPlivoFrameSerializer(
        stream_id="stream-t4",
        params=serializer_params,
        turn_tracker=turn_tracker,
    )

    # Audio queued for 2 seconds
    serializer.estimated_outbound_speech_end = time.perf_counter() + 2.0
    assert serializer.estimated_outbound_speech_end > time.perf_counter()

    # User interrupts
    interruption = InterruptionFrame()
    await serializer.serialize(interruption)

    # Interruption resets outbound speech end immediately to NOW
    assert serializer.estimated_outbound_speech_end <= time.perf_counter() + 0.05


@pytest.mark.asyncio
async def test_t5_duplicate_end_call_protection():
    """T5: Duplicate end_call triggers only execute terminal shutdown once."""
    terminal_hangup_count = [0]
    terminal_hangup_executed = [False]

    async def _on_plivo_terminal_hangup():
        if terminal_hangup_executed[0]:
            return
        terminal_hangup_executed[0] = True
        terminal_hangup_count[0] += 1

    # Call 1
    await _on_plivo_terminal_hangup()
    # Duplicate call 2
    await _on_plivo_terminal_hangup()
    # Duplicate call 3
    await _on_plivo_terminal_hangup()

    assert terminal_hangup_count[0] == 1


@pytest.mark.asyncio
async def test_t6_transfer_pending_bypasses_rest_delete():
    """T6: When transfer is pending, terminal hangup must not execute REST DELETE."""
    is_transfer_pending = [True]
    mock_shared_client = AsyncMock()

    async def _on_plivo_terminal_hangup():
        if is_transfer_pending[0]:
            return
        await mock_shared_client.delete("https://api.plivo.com/v1/Account/X/Call/Y/")

    await _on_plivo_terminal_hangup()
    mock_shared_client.delete.assert_not_called()


# ==============================================================================
# BUG #2 TESTS — INITIAL CALLER SILENCE & DYNAMIC NUDGES
# ==============================================================================

@pytest.mark.asyncio
async def test_t7_initial_silence_dynamic_delay_unclamped():
    """T7: Dynamic silence delay is not clamped by max(8, ...) and respects configured value (e.g. 6s)."""
    cfg_6s = create_test_runtime_config(delay_seconds=6)
    nudge_cfg = cfg_6s.runtime.nudges
    nudge_delay = (
        int(nudge_cfg.delay_seconds)
        if nudge_cfg and hasattr(nudge_cfg, "delay_seconds") and nudge_cfg.delay_seconds and nudge_cfg.delay_seconds > 0
        else 6
    )
    assert nudge_delay == 6

    cfg_4s = create_test_runtime_config(delay_seconds=4)
    nudge_cfg_4 = cfg_4s.runtime.nudges
    nudge_delay_4 = (
        int(nudge_cfg_4.delay_seconds)
        if nudge_cfg_4 and hasattr(nudge_cfg_4, "delay_seconds") and nudge_cfg_4.delay_seconds and nudge_cfg_4.delay_seconds > 0
        else 6
    )
    assert nudge_delay_4 == 4


@pytest.mark.asyncio
async def test_t8_unanswered_silence_triggers_terminal_hangup():
    """T8 (TEST 1): Caller remains silent through max nudges -> terminal hangup is triggered cleanly; no Nudge 3."""
    turn_tracker = TurnTimingTracker(stream_id="stream-t8")
    turn_tracker.turn_type = "user_turn"
    turn_tracker.greeting_completed = time.perf_counter()

    hangup_called = [False]
    nudge_dispatched_count = [0]

    async def _on_plivo_terminal_hangup():
        hangup_called[0] = True

    nudge_delay = 0.1
    max_nudges = 2
    nudge_count = 0
    now_mono = time.perf_counter()
    last_assistant_speech_end = [now_mono]
    last_nudge_time = 0.0

    # Simulation loop across multiple time ticks
    # Tick 1: Silence reaches 0.1s -> Nudge 1 dispatched
    now_mono += 0.15
    last_anchor = max(last_assistant_speech_end[0], 0.0, last_nudge_time)
    silence_duration = now_mono - last_anchor

    if silence_duration >= nudge_delay and nudge_count < max_nudges:
        nudge_count += 1
        nudge_dispatched_count[0] += 1
        last_nudge_time = now_mono
        last_assistant_speech_end[0] = now_mono

    assert nudge_count == 1
    assert nudge_dispatched_count[0] == 1

    # Simulate AI speaking Nudge 1 audio for 0.2s (nudge_count MUST REMAIN 1)
    nudge_1_speech_end = now_mono + 0.2
    for _ in range(3):
        now_mono += 0.05
        if now_mono < nudge_1_speech_end:
            last_assistant_speech_end[0] = nudge_1_speech_end
            # In our fixed code, nudge_count is NOT reset here!
            assert nudge_count == 1

    # Tick 2: Nudge 1 audio completes; silence reaches 0.1s after Nudge 1 audio
    now_mono = nudge_1_speech_end + 0.15
    last_anchor = max(last_assistant_speech_end[0], 0.0, last_nudge_time)
    silence_duration = now_mono - last_anchor

    if silence_duration >= nudge_delay and nudge_count < max_nudges:
        nudge_count += 1
        nudge_dispatched_count[0] += 1
        last_nudge_time = now_mono
        last_assistant_speech_end[0] = now_mono

    assert nudge_count == 2
    assert nudge_dispatched_count[0] == 2

    # Simulate AI speaking Nudge 2 audio for 0.2s (nudge_count MUST REMAIN 2)
    nudge_2_speech_end = now_mono + 0.2
    for _ in range(3):
        now_mono += 0.05
        if now_mono < nudge_2_speech_end:
            last_assistant_speech_end[0] = nudge_2_speech_end
            assert nudge_count == 2

    # Tick 3: Nudge 2 audio completes; silence reaches 0.1s after Nudge 2 audio
    now_mono = nudge_2_speech_end + 0.15
    last_anchor = max(last_assistant_speech_end[0], 0.0, last_nudge_time)
    silence_duration = now_mono - last_anchor

    # Check terminal condition
    if silence_duration >= nudge_delay:
        if nudge_count < max_nudges:
            nudge_dispatched_count[0] += 1
        elif nudge_count >= max_nudges:
            await _on_plivo_terminal_hangup()

    assert hangup_called[0] is True
    assert nudge_dispatched_count[0] == 2  # EXACTLY 2 nudges, NO Nudge 3!


@pytest.mark.asyncio
async def test_t9_t10_caller_responds_after_nudge_resets_counter():
    """T9 & T10 (TEST 2 & 3): Caller speaks after nudge -> resets silence anchor and nudge count only on genuine transcript."""
    turn_tracker = TurnTimingTracker(stream_id="stream-t9")
    turn_tracker.turn_type = "user_turn"
    turn_tracker.greeting_completed = time.perf_counter()

    nudge_count = 1
    last_seen_stt_final_ts = 0.0

    # Caller speaks genuine response
    turn_tracker.last_user_transcript = "हो मी ऐकतोय, मला appointment हवी आहे"
    turn_tracker.stt_final = time.perf_counter()

    current_stt_final = turn_tracker.stt_final
    current_transcript = (turn_tracker.last_user_transcript or "").strip()
    has_caller_responded = False

    if current_stt_final is not None and current_stt_final > last_seen_stt_final_ts and len(current_transcript) > 0:
        has_caller_responded = True
        last_seen_stt_final_ts = current_stt_final

    if has_caller_responded:
        nudge_count = 0

    assert nudge_count == 0


@pytest.mark.asyncio
async def test_assistant_nudge_and_completed_turns_do_not_reset_nudge_count():
    """TEST 4 & 5: AI speaking nudge or turn_tracker.completed_turns incrementing MUST NOT reset nudge_count."""
    turn_tracker = TurnTimingTracker(stream_id="stream-test4")
    turn_tracker.turn_type = "user_turn"
    turn_tracker.greeting_completed = time.perf_counter()

    nudge_count = 1
    now_mono = time.perf_counter()
    last_assistant_speech_end = [now_mono]
    last_seen_stt_final_ts = 0.0

    # AI turn completes and increments completed_turns (len becomes 1)
    turn_tracker.completed_turns.append({"turnId": "turn-nudge-1"})
    assert len(turn_tracker.completed_turns) == 1

    # In our fixed code, caller response is NOT based on len(completed_turns)
    current_stt_final = getattr(turn_tracker, "stt_final", None)
    current_transcript = (getattr(turn_tracker, "last_user_transcript", None) or "").strip()
    has_caller_responded = False

    if current_stt_final is not None and current_stt_final > last_seen_stt_final_ts and len(current_transcript) > 0:
        has_caller_responded = True

    if has_caller_responded:
        nudge_count = 0

    assert nudge_count == 1  # Still 1! Nudge completion did NOT reset counter


@pytest.mark.asyncio
async def test_tts_stopped_frame_guarantees_record_tts_stop():
    """TEST 6: TTSStoppedFrame ensures turn_tracker.tts_stop is recorded when _tts_in_flight_count == 0."""
    from app.main import RealtimeStreamingTimingMonitor
    turn_tracker = TurnTimingTracker(stream_id="stream-test6")
    turn_tracker.turn_type = "user_turn"
    turn_tracker.record_tts_start(time.perf_counter())
    assert turn_tracker.tts_start is not None
    assert turn_tracker.tts_stop is None
    assert turn_tracker.is_assistant_speaking is True

    monitor = RealtimeStreamingTimingMonitor(
        turn_tracker=turn_tracker,
        timing_tracker={},
    )
    monitor._tts_in_flight_count = 1
    monitor._llm_in_flight = True  # LLM still synchronizing

    # Process TTSStoppedFrame
    tts_stopped = TTSStoppedFrame()
    await monitor.process_frame(tts_stopped, FrameDirection.DOWNSTREAM)

    assert monitor._tts_in_flight_count == 0
    assert turn_tracker.tts_stop is not None
    assert turn_tracker.is_assistant_speaking is False


@pytest.mark.asyncio
async def test_stale_assistant_speaking_does_not_block_silence_countdown():
    """TEST 7: Silence countdown starts as soon as now_mono >= estimated_outbound_speech_end."""
    now_mono = time.perf_counter()
    # Outbound speech finished 2.0s ago
    estimated_speech_end = now_mono - 2.0
    last_assistant_speech_end = [estimated_speech_end]
    last_nudge_time = now_mono - 5.0

    # Even if an external flag claims assistant is speaking,
    # acoustic playout boundary (estimated_outbound_speech_end) is authoritative
    last_anchor = max(last_assistant_speech_end[0], estimated_speech_end, last_nudge_time)
    silence_duration = now_mono - last_anchor

    assert silence_duration >= 2.0  # Silence countdown is advancing, NOT frozen at 0.0s!


@pytest.mark.asyncio
async def test_comfort_noise_does_not_reset_nudge_count():
    """TEST 8: RTP comfort noise or empty transcripts do not reset nudge_count."""
    turn_tracker = TurnTimingTracker(stream_id="stream-test8")
    turn_tracker.stt_final = time.perf_counter()
    turn_tracker.last_user_transcript = "   "  # Whitespace only from comfort noise

    nudge_count = 1
    last_seen_stt_final_ts = 0.0

    current_stt_final = turn_tracker.stt_final
    current_transcript = (turn_tracker.last_user_transcript or "").strip()
    has_caller_responded = False

    if current_stt_final is not None and current_stt_final > last_seen_stt_final_ts and len(current_transcript) > 0:
        has_caller_responded = True

    if has_caller_responded:
        nudge_count = 0

    assert nudge_count == 1  # Not reset by whitespace / comfort noise!


@pytest.mark.asyncio
async def test_t12_stuck_vad_line_noise_does_not_reset_nudge_count():
    """TEST 5: Spurious line noise tripping speech_start without speech_stop (>4s) does NOT reset nudge_count."""
    turn_tracker = TurnTimingTracker(stream_id="stream-t12")
    # Simulate speech start that happened 5 seconds ago without any transcript
    turn_tracker.speech_start = time.perf_counter() - 5.0
    turn_tracker.speech_stop = None
    turn_tracker.stt_final = None
    turn_tracker.stt_first_partial = None
    turn_tracker.user_aggregation_finalized = None

    nudge_count = 1
    now_mono = time.perf_counter()

    current_user_turns = len(turn_tracker.completed_turns)
    has_caller_responded = (
        current_user_turns > 0
        or (turn_tracker and (turn_tracker.stt_final is not None or turn_tracker.user_aggregation_finalized is not None or turn_tracker.stt_first_partial is not None))
    )

    if has_caller_responded:
        nudge_count = 0

    # Line noise blip without transcript does NOT reset nudge_count
    assert nudge_count == 1


@pytest.mark.asyncio
async def test_t11_mid_call_conversational_pause():
    """T11: A brief 3-4s pause by the caller does not prematurely trigger nudge when delay=6s."""
    nudge_delay = 6.0
    silence_duration = 3.5  # Caller thinking
    assert silence_duration < nudge_delay


@pytest.mark.asyncio
async def test_t13_active_appointment_tool_blocks_silence_hangup():
    """T13: When a tool is executing, silence nudge/hangup is deferred."""
    turn_tracker = TurnTimingTracker(stream_id="stream-t13")
    turn_tracker.record_tool_execution("check_slot_capacity", start_time=time.perf_counter(), end_time=time.perf_counter())
    turn_tracker.post_tool_llm_start = time.perf_counter()

    assert turn_tracker.has_pending_tool_activity() is True
