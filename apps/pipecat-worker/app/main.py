

# Phase 12: Call Startup Latency & Authoritative Current Date/Time Fix.
# Plivo PSTN -> FastAPI WebSocket Transport -> Resolve Deployment & Authoritative RuntimeAgentConfig
# -> Authoritative Clock Grounding & Temporal/Calendar Prompt Injection
# -> Control Plane CallSession (ACTIVE) with Shared HTTP Pool
# -> Sarvam STT -> Pipecat LLMContext -> Sarvam LLM -> Sarvam TTS -> FastAPI WebSocket Transport
# -> Accumulate turns/timing -> PATCH /api/internal/call-sessions/:id (COMPLETED/FAILED/MISSED).


import asyncio
import base64
import enum
import inspect
import json
import math
import struct
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from openai import AsyncOpenAI
from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response as PlainResponse
from loguru import logger

from app.call_lifecycle import (
    CallTranscriptCollector,
    TrustedCallContext,
    detect_call_context,
    format_plain_transcript,
)
from app.call_session_client import (
    CallSessionClient,
    CallSessionClientError,
    CreateCallSessionRequest,
    UpdateCallSessionRequest,
)
from app.config import settings
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeConfigClient,
    RuntimeConfigClientError,
    extract_deployment_id,
)
from app.language_manager import ConversationLanguageManager, build_full_instructions
from app.language_processor import LanguageContextProcessor
from app.temporal_context import (
    DEFAULT_TIMEZONE,
    build_temporal_and_calendar_instructions,
    get_temporal_context,
)
from app.tools import ToolRuntimeContext, tool_registry
from app.turn_timing import StartupTimingTracker, TurnTimingTracker, build_unified_call_timeline, log_phone_trace
from app.aggregators import EarlyReleaseTextAggregator
from pipecat.utils.types import NOT_GIVEN

# Top-level Pipecat imports for zero runtime import latency
try:
    from pipecat.frames.frames import (
        Frame,
        AudioRawFrame,
        InterimTranscriptionFrame,
        TranscriptionFrame,
        TTSSpeakFrame,
        TTSAudioRawFrame,
        TTSStartedFrame,
        TTSStoppedFrame,
        InterruptionFrame,
        InputAudioRawFrame,
        OutputAudioRawFrame,
        TextFrame,
        LLMTextFrame,
        AggregatedTextFrame,
        TTSTextFrame,
        LLMFullResponseStartFrame,
        LLMFullResponseEndFrame,
        LLMContextFrame,
        ProposedUserStartedSpeakingFrame,
        ProposedUserStoppedSpeakingFrame,
        UserStartedSpeakingFrame,
        UserStoppedSpeakingFrame,
        EndFrame,
        CancelFrame,
        FunctionCallsStartedFrame,
        FunctionCallInProgressFrame,
        FunctionCallResultFrame,
    )
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.worker import PipelineParams, PipelineWorker
    from pipecat.workers.runner import WorkerRunner
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContext,
        LLMContextAggregatorPair,
        LLMUserAggregatorParams,
    )
    from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
    from pipecat.serializers.plivo import PlivoFrameSerializer
    from pipecat.services.sarvam.llm import SarvamLLMService, SarvamLLMSettings
    from pipecat.services.sarvam.stt import SarvamRealtimeSTTService
    from pipecat.services.sarvam.tts import SarvamTTSService
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )
    from pipecat.turns.user_turn_strategies import ExternalUserTurnStrategies, UserTurnStrategies
    from pipecat.turns.user_start import ExternalUserTurnStartStrategy
    from pipecat.turns.user_stop import ExternalUserTurnStopStrategy
    from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver
except ImportError as e:
    FrameProcessor = object
    FrameDirection = None
    Frame = object

# Configure structured logging
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level=settings.LOG_LEVEL,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Pipecat Worker starting up (Phase 12: Startup Latency & Authoritative Temporal Grounding)")
    logger.info(
        f"Configuration: HOST={settings.HOST}, PORT={settings.PORT}, NEXTLITE_API_URL={settings.NEXTLITE_API_URL}, "
        f"STT={settings.STT_MODEL}, LLM={settings.LLM_MODEL}, TTS={settings.TTS_MODEL}"
    )
    # Shared persistent connection pool for Control Plane HTTP APIs
    app.state.http_client = httpx.AsyncClient(
        timeout=8.0,
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
    )
    # Phase 21B & 22C: Dedicated worker-lifetime HTTP connection pool for Sarvam LLM streaming
    app.state.sarvam_llm_http_client = httpx.AsyncClient(
        limits=httpx.Limits(
            max_connections=50,
            max_keepalive_connections=20,
            keepalive_expiry=120.0,
        ),
        timeout=httpx.Timeout(30.0, connect=10.0),
        http2=False,
    )
    # Phase 22C: Background TLS keepalive pre-warming for Sarvam LLM pool
    async def _prewarm_sarvam_llm():
        try:
            if settings.SARVAM_API_KEY:
                await app.state.sarvam_llm_http_client.get(
                    "https://api.sarvam.ai/v1/models",
                    headers={"api-subscription-key": settings.SARVAM_API_KEY},
                )
                logger.info("[LLM Connection Pool] Pre-warmed TLS keepalive connection to api.sarvam.ai")
        except Exception as e:
            logger.debug(f"[LLM Connection Pool] Background pre-warm notice: {e}")

    prewarm_task = asyncio.create_task(_prewarm_sarvam_llm())
    yield
    if prewarm_task and not prewarm_task.done():
        prewarm_task.cancel()
    if hasattr(app.state, "sarvam_llm_http_client") and app.state.sarvam_llm_http_client:
        await app.state.sarvam_llm_http_client.aclose()
    if hasattr(app.state, "http_client") and app.state.http_client:
        await app.state.http_client.aclose()
    logger.info("Pipecat Worker shutting down cleanly")


app = FastAPI(
    title="NextLite Pipecat Worker (Phase 12)",
    description="Realtime Plivo Telephony & Sarvam Conversational Voice Pipeline with Authoritative Temporal Grounding",
    version="0.12.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Liveness health check endpoint."""
    return {
        "status": "ok",
        "service": "pipecat-worker",
        "phase": "phase-12-startup-latency-temporal-grounding",
        "stt_model": settings.STT_MODEL,
        "llm_model": settings.LLM_MODEL,
        "tts_model": settings.TTS_MODEL,
        "has_sarvam_key": bool(settings.SARVAM_API_KEY),
        "nextlite_api_url": settings.NEXTLITE_API_URL,
        "has_worker_secret": bool(settings.WORKER_API_SECRET),
        "timestamp": time.time(),
    }


@app.api_route("/plivo/test-xml", methods=["GET", "POST"])
async def plivo_test_xml(
    request: Request,
    host: Optional[str] = None,
    deployment_id: Optional[str] = Query(default=None, alias="deploymentId"),
):
    """Generate temporary Plivo XML for manual telephony testing."""
    server_host = host or request.headers.get("host", f"localhost:{settings.PORT}")
    scheme = "wss" if request.headers.get("x-forwarded-proto") == "https" or "https" in str(request.url) else "ws"
    query_suffix = f"?deploymentId={deployment_id}" if deployment_id else ""
    ws_url = f"{scheme}://{server_host}/ws/plivo{query_suffix}"

    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true">{ws_url}</Stream>
</Response>"""
    return PlainResponse(content=xml_content, media_type="application/xml")


class DeterministicTestEchoProcessor(FrameProcessor):
    """Deterministic frame processor for unit testing echo behavior."""

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if text:
                test_response_text = f"आपने कहा: {text}"
                await self.push_frame(TTSSpeakFrame(text=test_response_text), direction)
                return
        await self.push_frame(frame, direction)


DEFAULT_EARLY_TOOL_ACK_PHRASES: Dict[str, str] = {
    "en-IN": "Sure, let me check that for you.",
    "en": "Sure, let me check that for you.",
    "hi-IN": "जी, मैं अभी चेक कर लेता हूँ।",
    "hi": "जी, मैं अभी चेक कर लेता हूँ।",
    "mr-IN": "हो, मी लगेच तपासतो.",
    "mr": "हो, मी लगेच तपासतो.",
    "gu-IN": "હા, હું હમણાં જ તપાસ કરું છું.",
    "gu": "હા, હું હમણાં જ તપાસ કરું છું.",
    "bn-IN": "হ্যাঁ, আমি এখনই দেখছি।",
    "bn": "হ্যাঁ, আমি এখনই দেখছি।",
    "ta-IN": "சரிங்க, நான் இப்போதே பார்க்கிறேன்.",
    "ta": "சரிங்க, நான் இப்போதே பார்க்கிறேன்.",
    "te-IN": "సరేనండి, నేను ఇప్పుడే చూస్తాను.",
    "te": "సరేనండి, నేను ఇప్పుడే చూస్తాను.",
    "kn-IN": "ಖಂಡಿತ, ನಾನು ಈಗಲೇ ಪರಿಶೀಲಿಸುತ್ತೇನೆ.",
    "kn": "ಖಂಡಿತ, ನಾನು ಈಗಲೇ ಪರಿಶೀಲಿಸುತ್ತೇನೆ.",
}


class InstrumentedAsyncStream:
    """Non-blocking async stream wrapper for observing chunk deltas, tool call boundaries, and early acknowledgements."""

    def __init__(
        self,
        raw_stream: Any,
        timing_tracker: Optional[TurnTimingTracker] = None,
        is_call_terminating_fn: Optional[Any] = None,
        early_ack_callback: Optional[Any] = None,
    ):
        self._raw_stream = raw_stream
        self._timing_tracker = timing_tracker
        self._is_call_terminating_fn = is_call_terminating_fn
        self._early_ack_callback = early_ack_callback
        self._first_chunk_seen = False
        self._in_tool_call = False
        self._early_ack_triggered = False
        self._iter = None

    def __aiter__(self):
        self._iter = self._raw_stream.__aiter__()
        return self

    async def __anext__(self):
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            raise StopAsyncIteration

        if self._iter is None:
            self._iter = self._raw_stream.__aiter__()
        try:
            chunk = await self._iter.__anext__()
        except StopAsyncIteration:
            now = time.perf_counter()
            if self._in_tool_call and self._timing_tracker:
                self._timing_tracker.record_tool_call_complete(now)
                self._in_tool_call = False
            if self._timing_tracker:
                self._timing_tracker.record_llm_response_complete(now)
            raise

        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            raise StopAsyncIteration

        now = time.perf_counter()
        if not self._first_chunk_seen:
            self._first_chunk_seen = True

        if hasattr(chunk, "choices") and chunk.choices and len(chunk.choices) > 0:
            delta = chunk.choices[0].delta
            if delta:
                if getattr(delta, "tool_calls", None):
                    if not self._in_tool_call:
                        self._in_tool_call = True
                        if self._timing_tracker:
                            self._timing_tracker.record_tool_call_delta(now)
                        if self._early_ack_callback and not self._early_ack_triggered:
                            self._early_ack_triggered = True
                            try:
                                res = self._early_ack_callback()
                                if inspect.isawaitable(res):
                                    asyncio.create_task(res)
                            except Exception as e:
                                logger.debug(f"[EarlyToolAck] Error scheduling callback: {e}")
                    else:
                        if self._timing_tracker:
                            self._timing_tracker.record_tool_call_delta(now)
                elif getattr(delta, "content", None):
                    if self._in_tool_call:
                        if self._timing_tracker:
                            self._timing_tracker.record_tool_call_complete(now)
                        self._in_tool_call = False
                    if self._timing_tracker:
                        self._timing_tracker.record_first_llm_output(now)

        return chunk

    async def aclose(self):
        if hasattr(self._raw_stream, "aclose"):
            res = self._raw_stream.aclose()
            if inspect.isawaitable(res):
                await res
        elif hasattr(self._raw_stream, "close"):
            res = self._raw_stream.close()
            if inspect.isawaitable(res):
                await res

    async def close(self):
        if hasattr(self._raw_stream, "close"):
            res = self._raw_stream.close()
            if inspect.isawaitable(res):
                await res
        elif hasattr(self._raw_stream, "aclose"):
            res = self._raw_stream.aclose()
            if inspect.isawaitable(res):
                await res

    def __getattr__(self, name):
        return getattr(self._raw_stream, name)


class InstrumentedSarvamLLMService(SarvamLLMService):
    """Pipecat-native Sarvam service with granular HTTP dispatch, shared connection pool, stream timing, and safe early tool acknowledgement."""

    def __init__(
        self,
        *args,
        timing_tracker: Optional[TurnTimingTracker] = None,
        http_client: Optional[httpx.AsyncClient] = None,
        is_call_terminating_fn: Optional[Any] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        language_manager: Optional[ConversationLanguageManager] = None,
        **kwargs,
    ):
        self._shared_http_client = http_client
        super().__init__(*args, **kwargs)
        self._nextlite_timing_tracker = timing_tracker
        self._is_call_terminating_fn = is_call_terminating_fn
        self._runtime_config = runtime_config
        self._language_manager = language_manager
        self._early_ack_sent_turn_id: Optional[str] = None

    async def _dispatch_early_tool_ack(self):
        """Dispatches an immediate non-committal filler phrase to TTS in the active language."""
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            return
        if self._runtime_config and not getattr(self._runtime_config.runtime, "enable_early_tool_ack", True):
            return

        current_turn_id = self._nextlite_timing_tracker.active_turn_id if self._nextlite_timing_tracker else None
        if current_turn_id and self._early_ack_sent_turn_id == current_turn_id:
            return
        self._early_ack_sent_turn_id = current_turn_id

        # Resolve active language
        active_lang = "en-IN"
        if self._language_manager and getattr(self._language_manager, "current_language", None):
            active_lang = self._language_manager.current_language
        elif self._runtime_config and self._runtime_config.language and self._runtime_config.language.primary:
            active_lang = self._runtime_config.language.primary

        # Fallback check against current user transcript if active_lang is still English
        if (active_lang.startswith("en") or active_lang == "en-IN") and self._language_manager:
            user_text = getattr(self._nextlite_timing_tracker, "last_user_transcript", None) or ""
            if user_text:
                from app.language_manager import (
                    DEVANAGARI_REGEX,
                    HINDI_LATIN_MARKERS_REGEX,
                    MARATHI_LATIN_MARKERS_REGEX,
                    match_supported_language,
                )
                supported = self._language_manager.supported_languages
                if any(l.startswith("hi") for l in supported) and (DEVANAGARI_REGEX.search(user_text) or HINDI_LATIN_MARKERS_REGEX.search(user_text)):
                    active_lang = match_supported_language("hi-IN", supported) or "hi-IN"
                elif any(l.startswith("mr") for l in supported) and MARATHI_LATIN_MARKERS_REGEX.search(user_text):
                    active_lang = match_supported_language("mr-IN", supported) or "mr-IN"

        base_code = active_lang.split("-")[0]
        filler_phrase = (
            DEFAULT_EARLY_TOOL_ACK_PHRASES.get(active_lang)
            or DEFAULT_EARLY_TOOL_ACK_PHRASES.get(base_code)
            or DEFAULT_EARLY_TOOL_ACK_PHRASES["en-IN"]
        )

        now = time.perf_counter()
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_early_ack_sent(now)

        logger.info(
            f"[EarlyToolAck] Dispatched early safe filler phrase to TTS: '{filler_phrase}' "
            f"(lang={active_lang}, turn_id={current_turn_id})"
        )
        try:
            await self.push_frame(TTSSpeakFrame(text=filler_phrase), FrameDirection.DOWNSTREAM)
        except Exception as e:
            logger.warning(f"[EarlyToolAck] Failed to push early filler TTSSpeakFrame: {e}")

    def create_client(
        self,
        api_key=None,
        base_url=None,
        organization=None,
        project=None,
        default_headers=None,
        **kwargs,
    ):
        merged_headers = dict(default_headers or {})
        from pipecat.services.sarvam._sdk import sdk_headers
        merged_headers.update(sdk_headers())
        if api_key:
            merged_headers["api-subscription-key"] = api_key

        http_client = self._shared_http_client
        if http_client is None:
            from openai._base_client import DefaultAsyncHttpxClient
            http_client = DefaultAsyncHttpxClient(
                limits=httpx.Limits(
                    max_keepalive_connections=100, max_connections=1000, keepalive_expiry=None
                )
            )

        return AsyncOpenAI(
            api_key=api_key,
            base_url=base_url or "https://api.sarvam.ai/v1",
            organization=organization,
            project=project,
            http_client=http_client,
            default_headers=merged_headers,
        )

    def build_chat_completion_params(self, params_from_context: Any) -> dict:
        """Dynamically applies tool-calling token optimization, short post-tool responses, and model routing."""
        params = super().build_chat_completion_params(params_from_context)

        messages = params.get("messages", [])
        is_post_tool = bool(messages and messages[-1].get("role") == "tool")
        has_tools = bool(params.get("tools"))

        if self._runtime_config:
            runtime_cfg = self._runtime_config.runtime
            if is_post_tool:
                if runtime_cfg.post_tool_max_tokens:
                    params["max_tokens"] = runtime_cfg.post_tool_max_tokens
            elif has_tools:
                if runtime_cfg.tool_max_tokens:
                    params["max_tokens"] = runtime_cfg.tool_max_tokens
                if runtime_cfg.tool_llm_model:
                    params["model"] = runtime_cfg.tool_llm_model
                if runtime_cfg.tool_reasoning_mode:
                    params["reasoning_effort"] = runtime_cfg.tool_reasoning_mode

        return params

    async def get_chat_completions(self, context):
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            from openai.types.chat import ChatCompletionChunk
            async def _empty_gen():
                if False:
                    yield
            return InstrumentedAsyncStream(_empty_gen(), timing_tracker=self._nextlite_timing_tracker, is_call_terminating_fn=self._is_call_terminating_fn)

        t0 = time.perf_counter()
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_llm_request_created(t0)
            self._nextlite_timing_tracker.record_llm_request(t0)
        
        raw_stream = await super().get_chat_completions(context)
        t1 = time.perf_counter()
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_llm_first_provider_response(t1)

        return InstrumentedAsyncStream(
            raw_stream,
            timing_tracker=self._nextlite_timing_tracker,
            is_call_terminating_fn=self._is_call_terminating_fn,
            early_ack_callback=self._dispatch_early_tool_ack,
        )



class RealtimeStreamingTimingMonitor(FrameProcessor):
    """Timing, Telemetry & Diagnostic Transcript Monitor.
    
    Observes native Pipecat frame events to:
    1. Record isolated per-turn stage timestamps and calculate accurate latency metrics.
    2. Record user transcription and assistant response turns in CallTranscriptCollector.
    3. Emit structured [TURN_METRICS] telemetry on each completed assistant turn without duplicates.
    4. Emit structured [CALL_STARTUP_METRICS] telemetry on first assistant audio.
    """

    def __init__(
        self,
        timing_tracker: Optional[Dict[str, Any]] = None,
        turn_tracker: Optional[TurnTimingTracker] = None,
        startup_tracker: Optional[StartupTimingTracker] = None,
        transcript_collector: Optional[CallTranscriptCollector] = None,
        primary_language: str = "en-IN",
        greeting_cache_key: Optional[str] = None,
        startup_gate: Optional[Any] = None,
        is_call_terminating_fn: Optional[Any] = None,
    ):
        super().__init__()
        self._timing_tracker = timing_tracker if timing_tracker is not None else {}
        self._turn_tracker = turn_tracker
        self._startup_tracker = startup_tracker
        self._transcript_collector = transcript_collector
        self._primary_language = primary_language
        self._greeting_cache_key = greeting_cache_key
        self._startup_gate = startup_gate
        self._is_call_terminating_fn = is_call_terminating_fn
        self._greeting_audio_collector: List[bytes] = []
        self._greeting_sample_rate: Optional[int] = None
        self._greeting_num_channels: Optional[int] = None
        self._assistant_chunks: List[str] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            if isinstance(frame, (TTSAudioRawFrame, OutputAudioRawFrame, LLMTextFrame, TextFrame, TranscriptionFrame)):
                return

        await super().process_frame(frame, direction)

        if isinstance(frame, InputAudioRawFrame):
            if not hasattr(self, "_audio_in_count"):
                self._audio_in_count = 0
            self._audio_in_count += 1
            if self._audio_in_count == 1:
                logger.info("[Trace A] First InputAudioRawFrame reached pipeline timing_monitor")
            elif settings.PIPECAT_AUDIO_DEBUG and self._audio_in_count % 100 == 0:
                logger.info(f"[Trace A] {self._audio_in_count} InputAudioRawFrames reached timing_monitor")

        elif isinstance(frame, (ProposedUserStartedSpeakingFrame, UserStartedSpeakingFrame)):
            if self._turn_tracker:
                self._turn_tracker.record_speech_start()
            logger.info(f"[Trace C - {frame.__class__.__name__}] Server-side speech start proposal received")

        elif isinstance(frame, (ProposedUserStoppedSpeakingFrame, UserStoppedSpeakingFrame)):
            if self._turn_tracker:
                self._turn_tracker.record_speech_stop()
            logger.info(f"[Trace G - {frame.__class__.__name__}] Server-side speech stop proposal received")

        elif isinstance(frame, InterimTranscriptionFrame):
            text = frame.text.strip()
            if text:
                stt_partial_time = time.perf_counter()
                if self._turn_tracker and getattr(self._turn_tracker, "stt_first_partial", None) is None:
                    if hasattr(self._turn_tracker, "record_stt_first_partial"):
                        self._turn_tracker.record_stt_first_partial(stt_partial_time, transcript=text)
                self._timing_tracker["last_stt_partial_time"] = stt_partial_time
                logger.debug(f"[Trace STT Partial] text='{text}'")

        elif isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if text:
                stt_recv_time = time.perf_counter()
                if self._turn_tracker:
                    self._turn_tracker.record_stt_final(stt_recv_time, transcript=text)
                log_phone_trace(text, stage="stt_transcription_frame")
                self._timing_tracker["last_stt_transcript_time"] = stt_recv_time
                self._timing_tracker["first_llm_token_time"] = None
                self._timing_tracker["first_tts_audio_time"] = None
                speech_stop_time = (
                    self._turn_tracker.speech_stop
                    if (self._turn_tracker and self._turn_tracker.speech_stop)
                    else self._timing_tracker.get("last_speech_stop_time")
                )

                latency_str = ""
                if speech_stop_time:
                    stt_latency_ms = (stt_recv_time - speech_stop_time) * 1000
                    latency_str = f" | STT Latency: {stt_latency_ms:.1f}ms"

                logger.info(
                    f"[Trace E - STT Final TranscriptionFrame] text='{text}' | user_id={getattr(frame, 'user_id', 'user')}{latency_str}"
                )

                if self._transcript_collector:
                    self._transcript_collector.record_user_turn(
                        transcript=text,
                        detected_language=getattr(frame, "language", None),
                    )

        elif isinstance(frame, LLMContextFrame):
            if self._turn_tracker:
                self._turn_tracker.record_llm_context_frame()
            logger.info(f"[Trace I - LLMContextFrame] Forwarding LLM context frame to LLM service")

        elif isinstance(frame, (AggregatedTextFrame, TTSTextFrame)):
            # Synthesized TTS text frames, NOT LLM token generation frames.
            # Skip to prevent misclassifying TTS playback as LLM tokens or creating duplicate transcript entries.
            pass

        elif isinstance(frame, (LLMTextFrame, TextFrame)):
            # If current turn is greeting, skip (greeting does not go through LLM)
            if self._turn_tracker and self._turn_tracker.turn_type == "greeting":
                pass
            else:
                text_chunk = getattr(frame, "text", "")
                if text_chunk:
                    self._assistant_chunks.append(text_chunk)

                if self._timing_tracker.get("first_llm_token_time") is None:
                    first_token_time = time.perf_counter()
                    if self._turn_tracker:
                        self._turn_tracker.record_first_llm_output(first_token_time)
                    self._timing_tracker["first_llm_token_time"] = first_token_time
                    stt_time = (
                        self._turn_tracker.stt_final
                        if (self._turn_tracker and self._turn_tracker.stt_final)
                        else self._timing_tracker.get("last_stt_transcript_time")
                    )

                    ttft_str = ""
                    if stt_time:
                        ttft_ms = (first_token_time - stt_time) * 1000
                        ttft_str = f" | LLM TTFT: {ttft_ms:.1f}ms"

                    logger.info(f"[Trace K - LLM First Output Frame]{ttft_str}")

        elif isinstance(frame, TTSStartedFrame):
            tts_start_time = time.perf_counter()
            is_greeting = (
                (self._turn_tracker and self._turn_tracker.turn_type == "greeting")
                or (self._startup_tracker and self._startup_tracker.greeting_queued is not None and self._startup_tracker.greeting_completed is None)
            )
            if is_greeting and self._startup_tracker and self._startup_tracker.greeting_tts_started is None:
                self._startup_tracker.record_stage("greeting_tts_started", tts_start_time)
            if self._turn_tracker:
                if is_greeting and self._turn_tracker.turn_type == "greeting":
                    self._turn_tracker.record_greeting_tts_started(tts_start_time)
                else:
                    self._turn_tracker.record_tts_start(tts_start_time)
            self._timing_tracker["last_tts_trigger_time"] = tts_start_time
            self._timing_tracker["first_tts_audio_time"] = None
            logger.info(f"[Trace L - TTS Started] Synthesis started (context_id={getattr(frame, 'context_id', 'unknown')})")

        elif isinstance(frame, TTSAudioRawFrame):
            first_audio_time = time.perf_counter()
            is_greeting_context = (
                (self._turn_tracker and self._turn_tracker.turn_type == "greeting")
                or (self._startup_tracker and self._startup_tracker.greeting_queued is not None and self._startup_tracker.greeting_completed is None)
            )
            if is_greeting_context and self._startup_gate:
                self._startup_gate.set_greeting_first_audio()

            if is_greeting_context and self._greeting_cache_key and getattr(frame, "audio", None):
                self._greeting_audio_collector.append(bytes(frame.audio))
                if self._greeting_sample_rate is None:
                    self._greeting_sample_rate = getattr(frame, "sample_rate", 24000)
                    self._greeting_num_channels = getattr(frame, "num_channels", 1)

            if self._turn_tracker:
                if is_greeting_context and self._turn_tracker.turn_type == "greeting":
                    self._turn_tracker.record_greeting_first_audio(first_audio_time)
                else:
                    if self._turn_tracker.early_ack_sent is not None and self._turn_tracker.early_ack_first_audio is None:
                        self._turn_tracker.record_early_ack_first_audio(first_audio_time)
                    self._turn_tracker.record_first_tts_audio(first_audio_time)


            # Record first greeting audio and emit startup metrics ONLY in greeting context
            if is_greeting_context and self._startup_tracker and self._startup_tracker.first_greeting_audio is None:
                self._startup_tracker.record_stage("greeting_first_audio", first_audio_time)
                self._startup_tracker.record_stage("caller_ready", first_audio_time)
                self._startup_tracker.emit_startup_metrics_log()

            if self._timing_tracker.get("first_tts_audio_time") is None:
                self._timing_tracker["first_tts_audio_time"] = first_audio_time
                tts_trigger = (
                    self._turn_tracker.tts_start
                    if (self._turn_tracker and self._turn_tracker.tts_start)
                    else self._timing_tracker.get("last_tts_trigger_time")
                )
                speech_stop = (
                    self._turn_tracker.speech_stop
                    if (self._turn_tracker and self._turn_tracker.speech_stop)
                    else self._timing_tracker.get("last_speech_stop_time")
                )

                ttfb_str = ""
                if tts_trigger:
                    ttfb_ms = (first_audio_time - tts_trigger) * 1000
                    ttfb_str = f" | TTS TTFB: {ttfb_ms:.1f}ms"

                e2e_str = ""
                if speech_stop:
                    e2e_ms = (first_audio_time - speech_stop) * 1000
                    e2e_str = f" | Turn Stop->Audio Latency: {e2e_ms:.1f}ms"

                logger.info(f"[Trace M - First TTS Audio Chunk]{ttfb_str}{e2e_str}")

        elif isinstance(frame, TTSStoppedFrame):
            logger.info(f"[Trace N - TTS Stopped] Synthesis finished (context_id={getattr(frame, 'context_id', 'unknown')})")
            self._timing_tracker["first_llm_token_time"] = None

            is_greeting = False
            if self._turn_tracker and self._turn_tracker.turn_type == "greeting":
                is_greeting = True
            elif self._startup_tracker and self._startup_tracker.greeting_completed is None and self._startup_tracker.greeting_queued is not None:
                is_greeting = True

            now_stop = time.perf_counter()
            if is_greeting:
                if self._greeting_cache_key and self._greeting_audio_collector:
                    try:
                        from app.greeting_cache import global_greeting_cache
                        global_greeting_cache.put(
                            self._greeting_cache_key,
                            self._greeting_audio_collector,
                            sample_rate=self._greeting_sample_rate or 24000,
                            num_channels=self._greeting_num_channels or 1,
                        )
                    except Exception as cache_err:
                        logger.debug(f"[GreetingCache] Cache store notice: {cache_err}")
                    self._greeting_audio_collector = []
                    self._greeting_sample_rate = None
                    self._greeting_num_channels = None

                if self._startup_tracker:
                    self._startup_tracker.record_stage("greeting_completed", now_stop)
                    if self._startup_tracker.first_greeting_audio is None:
                        stream_id = getattr(self._startup_tracker, "stream_id", None) or getattr(self._turn_tracker, "stream_id", "unknown")
                        logger.warning(
                            f"Greeting TTS completed with ZERO audio frames for stream_id={stream_id}"
                        )
                        # Mark caller_ready so call proceeds, but do NOT fake greeting audio
                        self._startup_tracker.record_stage("caller_ready", now_stop)
                        self._startup_tracker.emit_startup_metrics_log()
                if self._startup_gate:
                    self._startup_gate.set_ready_for_user()
                if self._turn_tracker:
                    self._turn_tracker.record_greeting_completed(now_stop)
                    self._turn_tracker.turn_type = "user_turn"
                    self._turn_tracker.start_new_turn()
                self._assistant_chunks = []
                await self.push_frame(frame, direction)
                return

            # Guard: If this TTSStoppedFrame is from an early tool acknowledgement filler,
            # do not complete or split the conversational turn; wait for the actual assistant response.
            is_early_filler_stop = bool(
                self._turn_tracker
                and self._turn_tracker.early_ack_sent is not None
                and self._turn_tracker.first_post_tool_llm_output is None
            )

            if not is_early_filler_stop:
                if self._turn_tracker:
                    self._turn_tracker.record_tts_stop()
                    if self._turn_tracker.record_turn_complete_once():
                        self._turn_tracker.emit_turn_metrics_log()
                        self._turn_tracker.start_new_turn()

                if self._assistant_chunks:
                    full_agent_text = "".join(self._assistant_chunks).strip()
                    if full_agent_text and self._transcript_collector:
                        stt_t = self._timing_tracker.get("last_stt_transcript_time")
                        first_tok_t = self._timing_tracker.get("first_llm_token_time")
                        ttft_ms = (first_tok_t - stt_t) * 1000 if (first_tok_t and stt_t) else None
                        self._transcript_collector.record_agent_message(
                            response=full_agent_text,
                            active_language=self._primary_language,
                            ttft_ms=ttft_ms,
                        )
                    self._assistant_chunks = []

        elif isinstance(frame, (FunctionCallsStartedFrame, FunctionCallInProgressFrame, FunctionCallResultFrame)):
            if self._turn_tracker:
                self._turn_tracker.record_tool_call_delta()

        elif isinstance(frame, LLMFullResponseEndFrame):
            # Guard: If turn involves tool activity, completion occurs ONLY after post-tool TTS finishes
            has_tool_activity = bool(
                self._turn_tracker
                and self._turn_tracker.has_pending_tool_activity()
            )
            if (
                self._turn_tracker
                and not self._turn_tracker.tts_start
                and self._turn_tracker.turn_type != "greeting"
                and not has_tool_activity
            ):
                if self._turn_tracker.record_turn_complete_once():
                    self._turn_tracker.emit_turn_metrics_log()
                    self._turn_tracker.start_new_turn()

        elif isinstance(frame, InterruptionFrame):
            logger.info("[Interruption] User speech interruption detected — clearing Plivo audio buffer")
            if self._startup_gate:
                self._startup_gate.set_ready_for_user()
            if self._turn_tracker:
                self._turn_tracker.record_interruption("user_barge_in")
                if self._turn_tracker.turn_type == "greeting":
                    self._turn_tracker.record_greeting_completed()
                    self._turn_tracker.turn_type = "user_turn"
                    self._turn_tracker.start_new_turn()
                elif self._turn_tracker.speech_stop or self._turn_tracker.first_llm_output:
                    if self._turn_tracker.record_turn_complete_once():
                        self._turn_tracker.emit_turn_metrics_log()
                        self._turn_tracker.start_new_turn()
            self._timing_tracker["first_llm_token_time"] = None
            if self._assistant_chunks and self._transcript_collector:
                interrupted_text = "".join(self._assistant_chunks).strip()
                if interrupted_text:
                    self._transcript_collector.record_agent_message(
                        response=interrupted_text,
                        active_language=self._primary_language,
                        interrupted=True,
                    )
                self._assistant_chunks = []

        elif isinstance(frame, OutputAudioRawFrame):
            now_output = time.perf_counter()
            if self._startup_tracker and self._startup_tracker.output_audio_frame is None:
                self._startup_tracker.record_stage("output_audio_frame", now_output)
            if self._turn_tracker and self._turn_tracker.output_audio is None:
                self._turn_tracker.output_audio = now_output
                self._turn_tracker.record_event("output_audio_frame", now_output)
            logger.debug("[Trace O - Plivo Outbound Audio] Pushing audio frame to transport output")

        await self.push_frame(frame, direction)

    def flush_pending(self):
        """Flushes any pending assistant text chunks to transcript collector and completes open turn."""
        if self._turn_tracker and self._turn_tracker.turn_type == "greeting":
            self._assistant_chunks = []
            return

        if self._assistant_chunks:
            full_agent_text = "".join(self._assistant_chunks).strip()
            if full_agent_text and self._transcript_collector:
                stt_t = self._timing_tracker.get("last_stt_transcript_time")
                first_tok_t = self._timing_tracker.get("first_llm_token_time")
                ttft_ms = (first_tok_t - stt_t) * 1000 if (first_tok_t and stt_t) else None
                self._transcript_collector.record_agent_message(
                    response=full_agent_text,
                    active_language=self._primary_language,
                    interrupted=True,
                    ttft_ms=ttft_ms,
                )
            self._assistant_chunks = []

        if (
            self._turn_tracker
            and self._turn_tracker.speech_start is not None
            and self._turn_tracker.turn_complete is None
            and self._turn_tracker.turn_type != "greeting"
        ):
            if self._turn_tracker.record_turn_complete_once():
                self._turn_tracker.emit_turn_metrics_log()


def analyze_pcm_audio(audio_bytes: bytes) -> Dict[str, Any]:
    """Calculate non-sensitive acoustic signal metrics (sample count, RMS, peak, non-zero ratio)."""
    if not audio_bytes:
        return {"bytes": 0, "samples": 0, "rms": 0.0, "peak": 0, "nonzero_ratio": 0.0}
    num_samples = len(audio_bytes) // 2
    if num_samples == 0:
        return {"bytes": len(audio_bytes), "samples": 0, "rms": 0.0, "peak": 0, "nonzero_ratio": 0.0}
    try:
        samples = struct.unpack(f"<{num_samples}h", audio_bytes[: num_samples * 2])
        peak = max(abs(s) for s in samples)
        sum_sq = sum(s * s for s in samples)
        rms = math.sqrt(sum_sq / num_samples)
        nonzero_count = sum(1 for s in samples if abs(s) > 100)
        nonzero_ratio = round(nonzero_count / num_samples, 3)
        return {
            "bytes": len(audio_bytes),
            "samples": num_samples,
            "rms": round(rms, 1),
            "peak": peak,
            "nonzero_ratio": nonzero_ratio,
        }
    except Exception:
        return {"bytes": len(audio_bytes), "samples": num_samples, "rms": 0.0, "peak": 0, "nonzero_ratio": 0.0}


class StartupState(str, enum.Enum):
    STARTING = "STARTING"
    GREETING = "GREETING"
    READY_FOR_USER = "READY_FOR_USER"


class StartupGateProcessor(FrameProcessor):
    """Immediate Pre-STT Diagnostic & Startup State Gate Processor (Boundary B).
    
    Prevents PSTN line noise / ambient sound from:
    1. Reaching SarvamSTT before or during initial greeting delivery.
    2. Triggering false VAD speech-start and sending spurious InterruptionFrame / clearAudio to Plivo.
    3. Creating premature user aggregation and hallucinated LLM responses.
    
    Once the greeting is finished (or if no greeting was configured), transitions to
    READY_FOR_USER to allow full bidirectional speech recognition, VAD, LLM inference,
    and native Pipecat barge-in interruption.
    """

    def __init__(self, has_greeting: bool = False, allow_interruptions: bool = True):
        super().__init__()
        self._state: StartupState = StartupState.STARTING if has_greeting else StartupState.READY_FOR_USER
        self._has_greeting: bool = has_greeting
        self._allow_interruptions: bool = allow_interruptions
        self._greeting_first_audio_seen: bool = False
        self._inbound_frame_count: int = 0
        self._suppressed_frame_count: int = 0
        self._total_pcm_bytes: int = 0

    @property
    def state(self) -> StartupState:
        return self._state

    def set_greeting_active(self):
        """Called when initial greeting synthesis/playback begins."""
        if self._has_greeting and self._state == StartupState.STARTING:
            self._state = StartupState.GREETING
            logger.info("[StartupGate] State transitioned to GREETING (suppressing pre-greeting line noise)")

    def set_greeting_first_audio(self):
        """Called when first greeting audio frame is produced."""
        self._greeting_first_audio_seen = True
        logger.info("[StartupGate] First greeting audio active")

    def set_ready_for_user(self):
        """Called when initial greeting completes or is legitimately interrupted."""
        self._state = StartupState.READY_FOR_USER
        logger.info("[StartupGate] State transitioned to READY_FOR_USER (gate open for bidirectional conversation)")

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        if isinstance(frame, InputAudioRawFrame):
            self._inbound_frame_count += 1
            audio_bytes = getattr(frame, "audio", b"")
            self._total_pcm_bytes += len(audio_bytes)

            if self._inbound_frame_count == 1 or (
                settings.PIPECAT_AUDIO_DEBUG and self._inbound_frame_count % 50 == 0
            ):
                stats = analyze_pcm_audio(audio_bytes)
                logger.info(
                    f"[PreSTT Boundary B] Audio frame #{self._inbound_frame_count} | "
                    f"state={self._state.value} | "
                    f"sample_rate={getattr(frame, 'sample_rate', 8000)} | "
                    f"channels={getattr(frame, 'num_channels', 1)} | "
                    f"bytes={stats['bytes']} | rms={stats['rms']} | peak={stats['peak']} | "
                    f"nonzero_ratio={stats['nonzero_ratio']}"
                )

            # Gate check: Suppress startup line noise before/during greeting
            if self._state == StartupState.STARTING:
                self._suppressed_frame_count += 1
                return
            elif self._state == StartupState.GREETING:
                if not self._greeting_first_audio_seen:
                    self._suppressed_frame_count += 1
                    return
                elif not self._allow_interruptions:
                    self._suppressed_frame_count += 1
                    return

        elif isinstance(frame, (ProposedUserStartedSpeakingFrame, UserStartedSpeakingFrame, InterruptionFrame)):
            if self._state == StartupState.STARTING or (self._state == StartupState.GREETING and not self._greeting_first_audio_seen):
                logger.debug(f"[StartupGate] Suppressing premature {frame.__class__.__name__} during {self._state.value}")
                return

        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)


# Alias for backward compatibility
PreSTTDiagnosticProcessor = StartupGateProcessor


class DiagnosticPlivoFrameSerializer(PlivoFrameSerializer):
    def __init__(
        self,
        *args,
        encoding: str = "audio/x-mulaw",
        turn_tracker: Optional[TurnTimingTracker] = None,
        startup_tracker: Optional[StartupTimingTracker] = None,
        is_call_terminating_fn: Optional[Any] = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._media_count = 0
        self._stream_encoding = encoding
        self._turn_tracker = turn_tracker
        self._startup_tracker = startup_tracker
        self._is_call_terminating_fn = is_call_terminating_fn

    async def deserialize(self, data: str | bytes):
        try:
            message = json.loads(data)
        except Exception:
            return None

        event = message.get("event")
        if event in ("stop", "close"):
            logger.info(f"[Plivo Event] Received terminal '{event}' event from Plivo — signaling EndFrame")
            return EndFrame()

        if event == "media":
            media = message.get("media", {})
            payload_base64 = media.get("payload")
            if not payload_base64:
                return None

            payload = base64.b64decode(payload_base64)
            target_rate = self._sample_rate or self._plivo_sample_rate or 8000

            if "l16" in self._stream_encoding:
                deserialized_data = payload
            else:
                from pipecat.serializers.plivo import ulaw_to_pcm
                deserialized_data = await ulaw_to_pcm(
                    payload, self._plivo_sample_rate, target_rate, self._input_resampler
                )

            if deserialized_data is None or len(deserialized_data) == 0:
                return None

            frame = InputAudioRawFrame(
                audio=deserialized_data,
                num_channels=1,
                sample_rate=target_rate,
            )
            self._media_count += 1
            if self._media_count == 1 or (settings.PIPECAT_AUDIO_DEBUG and self._media_count % 50 == 0):
                stats = analyze_pcm_audio(frame.audio)
                logger.info(
                    f"[AudioInput Boundary A (Plivo Serializer)] InputAudioRawFrame #{self._media_count} | "
                    f"encoding={self._stream_encoding} | "
                    f"sample_rate={getattr(frame, 'sample_rate', 8000)} | "
                    f"channels={getattr(frame, 'num_channels', 1)} | "
                    f"bytes={stats['bytes']} | rms={stats['rms']} | peak={stats['peak']} | "
                    f"nonzero_ratio={stats['nonzero_ratio']}"
                )
            return frame

        return await super().deserialize(data)

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            return None

        payload = await super().serialize(frame)
        try:
            if payload and isinstance(frame, AudioRawFrame):
                now = time.perf_counter()
                if self._turn_tracker:
                    self._turn_tracker.record_audio_sent_to_plivo(now)
                if self._startup_tracker:
                    if self._startup_tracker.greeting_queued is not None and self._startup_tracker.greeting_completed is None:
                        if self._startup_tracker.greeting_first_audio_sent_to_plivo is None:
                            self._startup_tracker.record_stage("greeting_first_audio_sent_to_plivo", now)
                    if self._startup_tracker.first_audio_sent_to_plivo is None:
                        self._startup_tracker.record_stage("first_audio_sent_to_plivo", now)
                if not getattr(self, "_first_outbound_audio_logged", False):
                    self._first_outbound_audio_logged = True
                    logger.info(
                        f"[AudioOutput Boundary O (Plivo Serializer)] First outbound audio frame serialized & sent to Plivo "
                        f"| bytes={len(payload)}"
                    )
        except Exception as ser_err:
            logger.debug(f"[PlivoSerializer] Outbound audio logging notice: {ser_err}")
        return payload



@app.websocket("/ws/plivo")
async def websocket_plivo_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    deployment_id_param: Optional[str] = Query(default=None, alias="deploymentId"),
):
    """Plivo Bidirectional WebSocket Realtime Voice Endpoint (Phase 12)."""
    handler_entry_time = time.perf_counter()
    if settings.POC_SECRET_KEY and token != settings.POC_SECRET_KEY:
        logger.warning("Rejecting WebSocket connection: Invalid POC token")
        await websocket.close(code=4001, reason="Unauthorized POC token")
        return

    startup_tracker = StartupTimingTracker(stream_id="pending", start_time_monotonic=handler_entry_time)
    startup_tracker.record_stage("websocket_handler_entered", handler_entry_time)
    startup_tracker.record_stage("call_start", handler_entry_time)

    await websocket.accept()
    conn_start_time = time.perf_counter()
    session_start_epoch = time.time()
    started_at_iso = datetime.now(timezone.utc).isoformat()
    logger.info(f"Plivo WebSocket connected from {websocket.client}")

    startup_tracker.record_stage("websocket_accepted", conn_start_time)

    stream_id = None
    call_id = None
    start_payload: Dict[str, Any] = {}
    turn_tracker = TurnTimingTracker(stream_id="pending", session_start_monotonic=conn_start_time)
    timing_tracker: Dict[str, Any] = {
        "conn_start_time": conn_start_time,
        "first_inbound_audio_time": None,
        "last_speech_start_time": None,
        "last_speech_stop_time": None,
        "last_stt_transcript_time": None,
        "first_llm_token_time": None,
        "last_tts_trigger_time": None,
        "first_tts_audio_time": None,
    }

    # Per-call lifecycle state
    call_session_id: Optional[str] = None
    transcript_collector = CallTranscriptCollector()
    trusted_context: Optional[TrustedCallContext] = None
    conversation_context: Optional[Any] = None
    runtime_config: Optional[RuntimeAgentConfig] = None
    greeting_text: Optional[str] = None
    finalization_lock = asyncio.Lock()
    is_finalized = False
    is_finalizing = False
    is_call_terminating = False

    def is_terminating() -> bool:
        return is_call_terminating

    shared_http_client: Optional[httpx.AsyncClient] = getattr(websocket.app.state, "http_client", None)
    call_session_client = CallSessionClient(http_client=shared_http_client)

    async def finalize_call_session(final_status: str = "COMPLETED") -> None:
        """Atomically finalize call session in NextLite Control Plane exactly once."""
        nonlocal is_finalized, is_finalizing, is_call_terminating, call_session_id
        is_call_terminating = True
        async with finalization_lock:
            if is_finalized or is_finalizing:
                return
            is_finalizing = True

        try:
            if not runtime_config:
                logger.warning(f"[CallSession] Cannot finalize session for stream_id={stream_id}: runtime_config not resolved")
                is_finalized = True
                return

            # Ensure background CallSession creation task resolves before updating session
            if not call_session_id and 'call_session_task' in locals() and call_session_task is not None:
                try:
                    await asyncio.wait_for(asyncio.shield(call_session_task), timeout=5.0)
                except Exception as task_err:
                    logger.warning(f"[CallSession] Background call_session_task wait encountered: {task_err}")
                if 'call_session_holder' in locals() and call_session_holder.get("id"):
                    call_session_id = call_session_holder["id"]

            if not call_session_id:
                logger.warning(f"[CallSession] No call_session_id available to finalize for stream_id={stream_id}")
                is_finalized = True
                return

            # Flush any pending uncommitted assistant chunks / complete in-flight turn
            if 'timing_monitor' in locals() and timing_monitor is not None:
                timing_monitor.flush_pending()

            summary = transcript_collector.end_call()
            now_mono = time.perf_counter()
            call_duration_monotonic = max(0.0, now_mono - conn_start_time)
            duration_seconds = max(0, round(call_duration_monotonic))
            call_duration_ms = round(call_duration_monotonic * 1000)
            ended_at_iso = datetime.now(timezone.utc).isoformat()
            turns = summary.get("turns", [])

            # Defensive sync with conversation_context if turns were empty
            if len(turns) == 0 and conversation_context:
                msgs = conversation_context.get_messages()
                for msg in msgs:
                    role = msg.get("role")
                    content = msg.get("content", "")
                    if role == "user" and content:
                        transcript_collector.record_user_turn(content)
                    elif role == "assistant" and content and content != greeting_text:
                        transcript_collector.record_agent_message(
                            content,
                            active_language=runtime_config.language.primary or "en-IN",
                        )
                summary = transcript_collector.end_call()
                turns = summary.get("turns", [])

            plain_transcript = format_plain_transcript(turns)

            user_turns = [t for t in turns if t.get("user") is not None]
            total_user_turns = len(user_turns)

            status = final_status
            if status == "COMPLETED" and total_user_turns == 0 and duration_seconds < 5:
                status = "MISSED"

            call_baseline = turn_tracker.emit_call_baseline_summary(session_id=call_session_id or stream_id)
            startup_metrics = startup_tracker.calculate_metrics()
            startup_breakdown = startup_tracker.calculate_breakdown()
            unified_timeline = build_unified_call_timeline(startup_tracker=startup_tracker, turn_tracker=turn_tracker)

            metrics_payload: Dict[str, Any] = {
                "callDurationMs": call_duration_ms,
                "callStartedAt": started_at_iso,
                "callEndedAt": ended_at_iso,
                "totalTurns": total_user_turns,
                "totalUserTurns": total_user_turns,
                "totalTurnsWithGreeting": len(turns),
                "totalToolCalls": len(transcript_collector.tools_used),
                "executedToolsCount": len(transcript_collector.tools_used),
                "errorsCount": len(summary.get("errors", [])),
                "timing": timing_tracker,
                "latestTurnMetrics": turn_tracker.calculate_metrics(),
                "callBaseline": call_baseline,
                "startupMetrics": startup_metrics,
                "startupBreakdown": startup_breakdown,
                "turns": turn_tracker.completed_turns,
                "timeline": unified_timeline,
                "phoneTraces": turn_tracker.phone_traces,
                "toolsUsed": transcript_collector.tools_used,
            }
            if summary.get("errors"):
                metrics_payload["errors"] = summary["errors"]

            await asyncio.shield(
                call_session_client.update_call_session(
                    call_session_id,
                    UpdateCallSessionRequest(
                        tenantId=runtime_config.tenant.tenant_id,
                        status=status,
                        durationSeconds=duration_seconds,
                        endedAt=ended_at_iso,
                        primaryLanguage=runtime_config.language.primary or "en-IN",
                        transcriptText=plain_transcript or None,
                        turnsJson=turns if turns else None,
                        toolsUsed=transcript_collector.tools_used,
                        metricsJson=metrics_payload,
                    ),
                )
            )
            is_finalized = True
            logger.info(
                f"[CallSession] Finalized session {call_session_id} with status={status} | "
                f"duration={duration_seconds}s ({call_duration_ms}ms) | turns={len(turns)} | tools={transcript_collector.tools_used}"
            )
        except Exception as update_err:
            logger.error(f"[CallSession] Failed to update call session {call_session_id}: {update_err}")
        finally:
            is_finalizing = False

    try:
        # 1. Read first message from Plivo to extract stream metadata and start event
        startup_tracker.record_stage("websocket_waiting_first_msg")
        raw_first_msg = await websocket.receive_text()
        first_msg_received_time = time.perf_counter()
        try:
            initial_msg_obj = json.loads(raw_first_msg)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received on WebSocket handshake: {raw_first_msg[:100]}")
            await websocket.close(code=1003, reason="Invalid JSON")
            return

        event_type = initial_msg_obj.get("event")
        logger.info(f"Received initial Plivo event: '{event_type}'")

        media_format = {}
        if event_type == "start":
            startup_tracker.record_stage("plivo_start_received", first_msg_received_time)
            startup_tracker.record_stage("start_frame_received", first_msg_received_time)
            start_payload = initial_msg_obj.get("start", {})
            stream_id = start_payload.get("streamId")
            call_id = start_payload.get("callId", "")
            media_format = start_payload.get("mediaFormat", {})
            logger.info(
                f"Plivo stream started | stream_id={stream_id} | call_id={call_id} | mediaFormat={media_format}"
            )
        elif event_type == "connected":
            logger.info("Plivo stream connected event received, waiting for start event...")
            raw_second_msg = await websocket.receive_text()
            second_msg_received_time = time.perf_counter()
            initial_msg_obj = json.loads(raw_second_msg)
            if initial_msg_obj.get("event") == "start":
                startup_tracker.record_stage("plivo_start_received", second_msg_received_time)
                startup_tracker.record_stage("start_frame_received", second_msg_received_time)
                start_payload = initial_msg_obj.get("start", {})
                stream_id = start_payload.get("streamId")
                call_id = start_payload.get("callId", "")
                media_format = start_payload.get("mediaFormat", {})
                logger.info(f"Plivo stream started | stream_id={stream_id} | call_id={call_id} | mediaFormat={media_format}")
        else:
            startup_tracker.record_stage("plivo_start_received", first_msg_received_time)
            startup_tracker.record_stage("start_frame_received", first_msg_received_time)
            stream_id = initial_msg_obj.get("streamId", "unknown_stream")
            call_id = initial_msg_obj.get("callId", "")
            media_format = initial_msg_obj.get("mediaFormat", {})
            logger.warning(f"Unusual initial event: {event_type}, using stream_id={stream_id}")

        if not stream_id:
            stream_id = "default_stream"

        turn_tracker.stream_id = stream_id
        startup_tracker.stream_id = stream_id

        # Extract audio encoding and sample rate from Plivo media format
        stream_encoding = str(media_format.get("encoding", "audio/x-mulaw")).lower()
        stream_sample_rate = int(media_format.get("sampleRate", 8000))
        logger.info(f"[Plivo MediaFormat] encoding={stream_encoding} | sampleRate={stream_sample_rate}")

        # 2. Extract and Validate Authoritative deploymentId
        resolved_deployment_id = extract_deployment_id(
            query_params=dict(websocket.query_params),
            start_payload=start_payload,
        )
        startup_tracker.record_stage("deployment_id_resolved")

        if not resolved_deployment_id:
            logger.warning("Rejecting WebSocket connection: Missing deploymentId in query parameters or Plivo metadata")
            await websocket.close(code=4002, reason="Missing or invalid deploymentId")
            return

        logger.info(f"Resolved authoritative deploymentId={resolved_deployment_id} for stream_id={stream_id}")

        # 3. Request Authoritative RuntimeAgentConfig from NextLite Control Plane API using shared client pool
        runtime_config_client = RuntimeConfigClient(http_client=shared_http_client)
        startup_tracker.record_stage("runtime_config_start")
        startup_tracker.record_stage("runtime_config_request_start")
        try:
            runtime_config = await runtime_config_client.get_runtime_agent_config(resolved_deployment_id)
            startup_tracker.record_stage("runtime_config_resolved")
            startup_tracker.record_stage("runtime_config_response")
        except RuntimeConfigClientError as e:
            logger.warning(
                f"Rejecting WebSocket connection: Failed to resolve RuntimeAgentConfig for deploymentId={resolved_deployment_id} (status={e.status_code}, code={e.error_code})"
            )
            close_code = 4004 if e.status_code == 404 else (4009 if e.status_code == 409 else (4001 if e.status_code == 401 else 1011))
            await websocket.close(code=close_code, reason=f"Runtime config error: {e.error_code or 'FAILED'}")
            return

        # 4. Validate Minimum Required Configuration
        compiled_system_prompt = (runtime_config.prompt.compiled_system_prompt or "").strip()
        if not compiled_system_prompt:
            logger.error(f"Rejecting WebSocket connection: compiledSystemPrompt is empty for deploymentId={resolved_deployment_id}")
            await websocket.close(code=4003, reason="Empty compiled system prompt")
            return

        voice_id = (runtime_config.voice.voice_id or "").strip()
        if not voice_id:
            logger.error(f"Rejecting WebSocket connection: voiceId is empty for deploymentId={resolved_deployment_id}")
            await websocket.close(code=4003, reason="Empty voiceId in runtime config")
            return

        raw_stt_model = (runtime_config.voice.stt_model or settings.STT_MODEL).strip()
        if raw_stt_model in ("saaras:v3", "saaras:v2", "saaras", "saaras:v4", "saaras:v3-realtime"):
            stt_model = "saaras:v3-realtime"
            if raw_stt_model != "saaras:v3-realtime":
                logger.info(f"[STT Compatibility] Normalized STT model '{raw_stt_model}' to 'saaras:v3-realtime'")
        else:
            stt_model = raw_stt_model
        
        # TTS Model Compatibility Normalization
        raw_tts_model = (runtime_config.voice.tts_model or settings.TTS_MODEL).strip()
        if raw_tts_model in ("bulbul:v2", "bulbul:v1", "bulbul"):
            tts_model = "bulbul:v3"
            logger.info(f"[TTS Compatibility] Normalized deprecated TTS model '{raw_tts_model}' to 'bulbul:v3'")
        else:
            tts_model = raw_tts_model

        # LLM Model Compatibility Normalization
        raw_llm_model = (runtime_config.runtime.llm_model or settings.LLM_MODEL or "sarvam-105b-conversations").strip()
        allowed_sarvam_models = ("gemma4", "glm5.2", "sarvam-105b", "sarvam-105b-conversations")
        if raw_llm_model in ("sarvam-105b", "sarvam-105b-v1"):
            llm_model = "sarvam-105b-conversations"
            logger.info(f"[LLM Compatibility] Normalized LLM model '{raw_llm_model}' to 'sarvam-105b-conversations'")
        elif raw_llm_model not in allowed_sarvam_models:
            llm_model = "sarvam-105b-conversations"
            logger.info(f"[LLM Compatibility] Normalized unsupported/legacy LLM model '{raw_llm_model}' to 'sarvam-105b-conversations'")
        else:
            llm_model = raw_llm_model

        greeting = runtime_config.prompt.greeting.strip() if (runtime_config.prompt.greeting and runtime_config.prompt.greeting.strip()) else None
        greeting_text = greeting

        # Authoritative Temporal & Calendar Grounding
        startup_tracker.record_stage("temporal_context_start")
        tz_name = runtime_config.prompt.timezone or DEFAULT_TIMEZONE
        temporal_ctx = get_temporal_context(time_zone=tz_name)
        startup_tracker.record_stage("temporal_context_ready")
        temporal_log_data = {
            "timezone": temporal_ctx.timezone,
            "currentDate": temporal_ctx.current_date,
            "currentTime": temporal_ctx.current_time,
            "dayOfWeek": temporal_ctx.current_day,
        }
        logger.info(f"[TEMPORAL_CONTEXT] {json.dumps(temporal_log_data, separators=(',', ':'))}")

        # Extract caller phone number from trusted Plivo metadata
        raw_from = (
            start_payload.get("from")
            or start_payload.get("params", {}).get("From")
            or start_payload.get("customHeaders", {}).get("From")
            or start_payload.get("callerId")
            or websocket.query_params.get("from")
            or websocket.query_params.get("callerNumber")
        )
        direction, caller_number = detect_call_context(
            room_name=stream_id or call_id,
            from_number=raw_from,
        )

        # 5. Create ACTIVE CallSession in NextLite Control Plane concurrently (Phase 17B optimization)
        call_session_holder = {"id": None}
        call_session_task: Optional[asyncio.Task] = None
        language_manager = ConversationLanguageManager(
            primary=runtime_config.language.primary,
            supported_languages=runtime_config.language.supported_languages,
            auto_detect_enabled=runtime_config.language.auto_detect_enabled,
            language_switching_enabled=runtime_config.language.language_switching_enabled,
        )

        async def _bg_create_call_session() -> Optional[str]:
            startup_tracker.record_stage("call_session_start")
            startup_tracker.record_stage("call_session_request_start")
            try:
                session_record = await call_session_client.create_call_session(
                    CreateCallSessionRequest(
                        tenantId=runtime_config.tenant.tenant_id,
                        agentId=runtime_config.agent.agent_id,
                        deploymentId=resolved_deployment_id,
                        roomName=stream_id,
                        callerNumber=caller_number,
                        direction=direction,
                        status="ACTIVE",
                        primaryLanguage=language_manager.current_language,
                        startedAt=started_at_iso,
                    )
                )
                startup_tracker.record_stage("call_session_created")
                startup_tracker.record_stage("call_session_resolved")
                startup_tracker.record_stage("call_session_response")
                call_session_holder["id"] = session_record.id
                logger.info(
                    f"[CallSession] Created ACTIVE session id={session_record.id} in background | "
                    f"tenantId={runtime_config.tenant.tenant_id} | agentId={runtime_config.agent.agent_id} | "
                    f"direction={direction} | caller={caller_number or 'none'}"
                )
                return session_record.id
            except Exception as session_err:
                startup_tracker.record_stage("call_session_created")
                startup_tracker.record_stage("call_session_resolved")
                startup_tracker.record_stage("call_session_response")
                logger.error(
                    f"[CallSession] Non-fatal: Failed to create call session for deployment={resolved_deployment_id}: {session_err}"
                )
                return None

        call_session_task = asyncio.create_task(_bg_create_call_session())

        # Concurrent TTS Pre-warming (Phase 19 Immediate Voice Optimization)
        startup_tracker.record_stage("tts_service_create_start")
        tts_settings_kwargs = {
            "model": tts_model,
            "voice": voice_id,
            "language": language_manager.current_language,
            "min_buffer_size": 30,
            "max_chunk_length": 150,
        }
        if runtime_config.voice.speaking_speed is not None:
            tts_settings_kwargs["pace"] = runtime_config.voice.speaking_speed
        if runtime_config.voice.pitch is not None and tts_model == "bulbul:v2":
            tts_settings_kwargs["pitch"] = runtime_config.voice.pitch

        tts_service = SarvamTTSService(
            api_key=settings.SARVAM_API_KEY,
            sample_rate=stream_sample_rate,
            settings=SarvamTTSService.Settings(**tts_settings_kwargs),
        )
        # Phase 21A & 22D: Early Release Phrase & Clause Aggregator (fast first chunk dispatch)
        tts_service._text_aggregator = EarlyReleaseTextAggregator(
            min_first_chunk_words=3,
            min_first_chunk_chars=30,
            min_clause_words=3,
            min_clause_chars=15,
        )
        startup_tracker.record_stage("tts_service_created")

        @tts_service.event_handler("on_tts_request")
        async def on_tts_request(service, context_id: str, text: str):
            now_mono = time.perf_counter()
            # Isolate early tool filler from assistant text release timing
            is_early_filler = bool(
                turn_tracker.early_ack_sent is not None
                and turn_tracker.first_post_tool_llm_output is None
                and turn_tracker.has_pending_tool_activity()
            )
            if not is_early_filler:
                is_post_tool = bool(turn_tracker.has_pending_tool_activity() or turn_tracker.post_tool_llm_start is not None)
                turn_tracker.record_text_released_to_tts(now_mono, is_post_tool=is_post_tool)
            logger.info(f"[TTS Release] Text released to TTS (context_id={context_id}, len={len(text)}): '{text[:40]}...'")

        @tts_service.event_handler("on_connected")
        async def on_tts_connected(service):
            now_tts = time.perf_counter()
            if startup_tracker.tts_ready is None:
                startup_tracker.record_stage("tts_ready", now_tts)
                startup_tracker.record_stage("tts_connected", now_tts)
                turn_tracker.record_tts_connected(now_tts)
                logger.info(f"Sarvam TTS WebSocket connected (startup ready at {now_tts - conn_start_time:.3f}s)")
            else:
                turn_tracker.record_tts_connected(now_tts)
                logger.info(f"[TTS Reconnect] Sarvam TTS WebSocket reconnected during active call (elapsed: {now_tts - conn_start_time:.3f}s)")


        # Check Sarvam API key
        if not settings.SARVAM_API_KEY:
            logger.error("SARVAM_API_KEY is not configured. Cannot initialize pipeline.")
            await websocket.close(code=1011, reason="SARVAM_API_KEY required")
            return

        # 6. Instantiate Plivo Frame Serializer
        has_auth = bool(settings.PLIVO_AUTH_ID and settings.PLIVO_AUTH_TOKEN and call_id)
        serializer_params = PlivoFrameSerializer.InputParams(
            auto_hang_up=has_auth,
            plivo_sample_rate=stream_sample_rate,
        )
        serializer = DiagnosticPlivoFrameSerializer(
            stream_id=stream_id,
            call_id=call_id or None,
            auth_id=settings.PLIVO_AUTH_ID or None,
            auth_token=settings.PLIVO_AUTH_TOKEN or None,
            encoding=stream_encoding,
            params=serializer_params,
            turn_tracker=turn_tracker,
            startup_tracker=startup_tracker,
            is_call_terminating_fn=is_terminating,
        )

        # 7. Instantiate FastAPI WebSocket Transport
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                add_wav_header=False,
                serializer=serializer,
            ),
        )

        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(transport_instance, ws):
            nonlocal is_call_terminating
            is_call_terminating = True
            logger.info(f"[Plivo Transport] WebSocket client disconnected event triggered for stream_id={stream_id}")
            await finalize_call_session("COMPLETED")

        # 8. Instantiate Sarvam Realtime STT Service
        startup_tracker.record_stage("stt_service_create_start")
        logger.info(
            f"[SarvamRealtimeSTT Config] Initializing SarvamRealtimeSTTService | model={stt_model} | "
            f"stream_type=fast | sample_rate={stream_sample_rate} | language={language_manager.current_language}"
        )
        stt_service = SarvamRealtimeSTTService(
            api_key=settings.SARVAM_API_KEY,
            sample_rate=stream_sample_rate,
            settings=SarvamRealtimeSTTService.Settings(
                model=stt_model,
                language_code=language_manager.current_language or "en-IN",
                stream_type="fast",
            ),
            endpointing="vad",
            ttfs_p99_latency=0.15,
        )
        startup_tracker.record_stage("stt_service_created")

        @stt_service.event_handler("on_connected")
        async def on_stt_connected(service):
            startup_tracker.record_stage("stt_ready")
            startup_tracker.record_stage("stt_connected")
            logger.info(f"[SarvamRealtimeSTT] WebSocket connected successfully (elapsed: {time.perf_counter() - conn_start_time:.3f}s)")

        # 9. Resolve Authoritative Runtime Tools & Instantiate Native Conversation Context
        startup_tracker.record_stage("tool_registry_start")
        tool_context = ToolRuntimeContext(
            deployment_id=resolved_deployment_id,
            call_session_id=call_session_id,
            caller_phone=caller_number,
            tenant_id=runtime_config.tenant.tenant_id,
            agent_id=runtime_config.agent.agent_id,
            api_url=settings.NEXTLITE_API_URL,
            worker_secret=settings.WORKER_API_SECRET,
            timezone=tz_name,
            transcript_collector=transcript_collector,
            timing_tracker=turn_tracker,
            _call_session_task=call_session_task,
        )
        resolved_tools = tool_registry.resolve_tools(
            runtime_config=runtime_config,
            context=tool_context,
            http_client=shared_http_client,
        )
        startup_tracker.record_stage("tool_registry_resolved")
        if resolved_tools:
            logger.info(
                f"[ToolRegistry] Resolved {len(resolved_tools)} native Pipecat tools: "
                f"{[t.name for t in resolved_tools]}"
            )

        # Inject authoritative runtime temporal and calendar instructions into system prompt
        temporal_instructions = build_temporal_and_calendar_instructions(time_zone=tz_name)
        base_system_prompt_with_temporal = f"{compiled_system_prompt}\n\n{temporal_instructions}"
        initial_system_prompt = build_full_instructions(
            base_system_prompt_with_temporal,
            language_manager.current_language,
        )
        initial_messages = [{"role": "system", "content": initial_system_prompt}]
        if greeting:
            initial_messages.append({"role": "assistant", "content": greeting})

        conversation_context = LLMContext(
            messages=initial_messages,
            tools=resolved_tools if resolved_tools else NOT_GIVEN,
        )
        
        turn_strategies = UserTurnStrategies(
            start=[ExternalUserTurnStartStrategy(enable_interruptions=True)],
            stop=[ExternalUserTurnStopStrategy(timeout=0.18, wait_for_transcript=True)],
        )
        user_params = LLMUserAggregatorParams(
            user_turn_strategies=turn_strategies
        )
        context_aggregator = LLMContextAggregatorPair(
            conversation_context,
            user_params=user_params,
        )

        user_aggregator = context_aggregator.user()

        @user_aggregator.event_handler("on_user_turn_started")
        async def on_user_turn_started(aggregator, strategy):
            logger.info(f"[Trace D - UserStartedSpeakingFrame] User turn started via strategy={strategy.__class__.__name__}")

        @user_aggregator.event_handler("on_user_turn_stopped")
        async def on_user_turn_stopped(aggregator, strategy, message=None):
            content = getattr(message, "content", "") if message else ""
            content_str = f" | content='{content}'" if content else ""
            logger.info(f"[UserTurn] User turn stopped via strategy={strategy.__class__.__name__}{content_str}")

        @user_aggregator.event_handler("on_user_turn_inference_triggered")
        async def on_user_turn_inference_triggered(aggregator, strategy):
            turn_tracker.record_user_aggregation_finalized()
            logger.info(f"[Trace H - User Aggregation Finalized] User turn inference triggered via strategy={strategy.__class__.__name__}")

        # Instantiate Immediate Pre-STT Diagnostic & Startup Gate Processor (Boundary B)
        allow_interruptions = bool(
            runtime_config.runtime.interruption_mode is None
            or runtime_config.runtime.interruption_mode != "never"
        )
        pre_stt_processor = StartupGateProcessor(
            has_greeting=bool(greeting),
            allow_interruptions=allow_interruptions,
        )

        # Instantiate Language Context Processor (Boundary D) preserving authoritative temporal prompt
        language_processor = LanguageContextProcessor(
            language_manager=language_manager,
            conversation_context=conversation_context,
            base_system_prompt=base_system_prompt_with_temporal,
        )

        # 10. Instantiate Sarvam LLM Service (Phase 21B: Worker-Lifetime Shared Connection Pool)
        startup_tracker.record_stage("llm_service_create_start")
        llm_settings_kwargs = {
            "model": llm_model,
            "reasoning_effort": None,
        }
        if runtime_config.runtime.temperature is not None:
            llm_settings_kwargs["temperature"] = runtime_config.runtime.temperature

        sarvam_llm_pool: Optional[httpx.AsyncClient] = getattr(
            websocket.app.state, "sarvam_llm_http_client", None
        )

        llm_service = InstrumentedSarvamLLMService(
            api_key=settings.SARVAM_API_KEY,
            settings=SarvamLLMSettings(**llm_settings_kwargs),
            timing_tracker=turn_tracker,
            http_client=sarvam_llm_pool,
            is_call_terminating_fn=is_terminating,
            runtime_config=runtime_config,
            language_manager=language_manager,
        )

        startup_tracker.record_stage("llm_service_created")

        # Compute static greeting cache key (Phase 22A Greeting Fast Path)
        greeting_cache_key = None
        cached_greeting_chunks = None
        if greeting:
            from app.greeting_cache import (
                is_static_greeting,
                compute_greeting_cache_key,
                global_greeting_cache,
            )
            if is_static_greeting(greeting):
                greeting_cache_key = compute_greeting_cache_key(
                    tenant_id=runtime_config.tenant.tenant_id,
                    deployment_id=resolved_deployment_id,
                    model=tts_model,
                    voice=voice_id,
                    language=language_manager.current_language,
                    greeting_text=greeting,
                )
                cached_greeting_chunks = global_greeting_cache.get(greeting_cache_key)

        # 11. Timing & Transcript Monitor
        timing_monitor = RealtimeStreamingTimingMonitor(
            timing_tracker=timing_tracker,
            turn_tracker=turn_tracker,
            startup_tracker=startup_tracker,
            transcript_collector=transcript_collector,
            primary_language=runtime_config.language.primary or "en-IN",
            greeting_cache_key=greeting_cache_key,
            startup_gate=pre_stt_processor,
            is_call_terminating_fn=is_terminating,
        )

        # 13. Compose Pipecat Native Voice Pipeline
        startup_tracker.record_stage("pipeline_construct_start")
        pipeline = Pipeline([
            transport.input(),
            pre_stt_processor,
            stt_service,
            language_processor,
            context_aggregator.user(),
            llm_service,
            tts_service,
            timing_monitor,
            transport.output(),
            context_aggregator.assistant(),
        ])
        startup_tracker.record_stage("pipeline_created")

        user_bot_latency_observer = UserBotLatencyObserver()

        @user_bot_latency_observer.event_handler("on_latency_measured")
        async def on_pipecat_latency_measured(observer, latency: float):
            latency_ms = round(latency * 1000)
            logger.info(f"[PIPECAT_NATIVE_LATENCY] User-to-bot latency: {latency_ms}ms ({latency:.3f}s)")

        @user_bot_latency_observer.event_handler("on_latency_breakdown")
        async def on_pipecat_latency_breakdown(observer, breakdown):
            ttfb_info = [f"{b.processor}:{b.duration_secs*1000:.0f}ms" for b in breakdown.ttfb]
            text_agg_str = f"{breakdown.text_aggregation.duration_secs*1000:.0f}ms" if breakdown.text_aggregation else "none"
            logger.info(
                f"[PIPECAT_NATIVE_BREAKDOWN] TTFB=[{', '.join(ttfb_info)}] | "
                f"text_agg={text_agg_str} | user_turn={breakdown.user_turn_secs}s"
            )

        @user_bot_latency_observer.event_handler("on_first_bot_speech_latency")
        async def on_pipecat_first_bot_speech_latency(observer, latency: float):
            latency_ms = round(latency * 1000)
            logger.info(f"[PIPECAT_NATIVE_FIRST_SPEECH] First bot speech latency: {latency_ms}ms ({latency:.3f}s)")

        worker = PipelineWorker(
            pipeline,
            params=PipelineParams(
                audio_in_sample_rate=8000,
                audio_out_sample_rate=8000,
                enable_metrics=True,
            ),
            observers=[user_bot_latency_observer],
        )

        # Queue initial greeting immediately on pipeline start directly to TTS
        if greeting:
            turn_tracker.turn_type = "greeting"
            startup_tracker.record_stage("greeting_queue_start")
            turn_tracker.record_greeting_start()
            transcript_collector.record_agent_message(
                response=greeting,
                active_language=runtime_config.language.primary or "en-IN",
            )

            @worker.event_handler("on_pipeline_started")
            async def on_pipeline_started(worker_instance, frame):
                startup_tracker.record_stage("greeting_queued")
                if pre_stt_processor:
                    pre_stt_processor.set_greeting_active()
                if cached_greeting_chunks:
                    chunks = (
                        cached_greeting_chunks.audio_chunks
                        if hasattr(cached_greeting_chunks, "audio_chunks")
                        else cached_greeting_chunks
                    )
                    cached_sr = getattr(cached_greeting_chunks, "sample_rate", 24000)
                    cached_ch = getattr(cached_greeting_chunks, "num_channels", 1)
                    logger.info(
                        f"[GreetingFastPath] Emitting CACHED greeting for stream_id={stream_id} "
                        f"({len(chunks)} chunks, sample_rate={cached_sr}, channels={cached_ch}, "
                        f"key={greeting_cache_key[:10]}...)"
                    )
                    await timing_monitor.queue_frame(TTSStartedFrame(context_id="greeting_fast_path"))
                    for chunk in chunks:
                        await timing_monitor.queue_frame(
                            TTSAudioRawFrame(
                                audio=chunk,
                                sample_rate=cached_sr,
                                num_channels=cached_ch,
                                context_id="greeting_fast_path",
                            )
                        )
                    await timing_monitor.queue_frame(TTSStoppedFrame(context_id="greeting_fast_path"))
                else:
                    logger.info(f"Emitting initial assistant greeting for stream_id={stream_id}: '{greeting}'")
                    await worker_instance.queue_frame(TTSSpeakFrame(text=greeting))
        else:
            turn_tracker.turn_type = "user_turn"

        startup_tracker.record_stage("pipeline_start")
        startup_tracker.record_stage("tts_connection_start")
        runner = WorkerRunner(handle_sigint=False, handle_sigterm=False)
        await runner.add_workers(worker)

        startup_tracker.record_stage("pipeline_started")
        startup_tracker.record_stage("pipeline_runner_started")
        logger.info(
            f"Starting Pipecat Conversational Voice Pipeline for stream_id={stream_id} | "
            f"callSessionId={call_session_id or 'none'} | "
            f"tenantId={runtime_config.tenant.tenant_id} | agentId={runtime_config.agent.agent_id} | "
            f"deploymentId={resolved_deployment_id} | voiceId={voice_id} | stt={stt_model} | "
            f"llm={llm_model} | tts={tts_model} | timezone={tz_name} | greeting={'yes' if greeting else 'no'} | "
            f"setup time: {time.perf_counter() - conn_start_time:.3f}s"
        )

        max_duration = runtime_config.runtime.max_call_duration_seconds
        duration_task = None
        
        async def bounded_call_task(duration: int):
            await asyncio.sleep(duration)
            logger.warning(f"Maximum call duration of {duration}s reached for stream_id={stream_id}. Terminating call.")
            try:
                if not websocket.client_state.name == "DISCONNECTED":
                    await websocket.close(code=1000, reason="Max call duration reached")
            except Exception:
                pass

        if max_duration and max_duration > 0:
            duration_task = asyncio.create_task(bounded_call_task(max_duration))

        # 14. Run Pipeline until client disconnects or stop event is received
        await runner.run()

    except WebSocketDisconnect:
        is_call_terminating = True
        logger.info(f"Plivo WebSocket disconnected normally for stream_id={stream_id}")
        await finalize_call_session("COMPLETED")
    except asyncio.CancelledError:
        is_call_terminating = True
        logger.info(f"Plivo WebSocket task cancelled for stream_id={stream_id}")
        await finalize_call_session("COMPLETED")
    except Exception as e:
        is_call_terminating = True
        logger.error(f"Error in Plivo WebSocket handler for stream_id={stream_id}: {e}", exc_info=True)
        transcript_collector.record_error(str(e))
        await finalize_call_session("FAILED")
    finally:
        is_call_terminating = True
        if 'duration_task' in locals() and duration_task and not duration_task.done():
            duration_task.cancel()
        
        await finalize_call_session("COMPLETED")
        total_duration = time.perf_counter() - conn_start_time
        logger.info(f"Plivo WebSocket session finished | stream_id={stream_id} | duration={total_duration:.2f}s")
        try:
            if not websocket.client_state.name == "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass
