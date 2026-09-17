

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
import re
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
from pipecat.utils.types import NOT_GIVEN, assert_given

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
    from pipecat.services.sarvam.tts import SarvamTTSService, traced_tts
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )
    from pipecat.turns.user_turn_strategies import ExternalUserTurnStrategies, UserTurnStrategies
    from pipecat.turns.user_start import ExternalUserTurnStartStrategy
    from pipecat.turns.user_stop import ExternalUserTurnStopStrategy
    from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver
    from pipecat.observers.loggers.metrics_log_observer import MetricsLogObserver
    from pipecat.observers.loggers.transcription_log_observer import TranscriptionLogObserver
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

    # Proactive Multilingual Starter Audio Pre-warming
    async def _prewarm_starters_task():
        try:
            if settings.SARVAM_API_KEY:
                from app.phrase_audio_cache import global_phrase_audio_cache
                for lang in ["mr-IN", "hi-IN", "en-IN"]:
                    try:
                        slot_reply = BOOKING_SLOT_COLLECTION_RESPONSES.get(lang)
                        slot_reply_pure = BOOKING_SLOT_COLLECTION_PURE_RESPONSES.get(lang)
                        add_phrases = [r for r in [slot_reply, slot_reply_pure] if r]
                        count = await global_phrase_audio_cache.prewarm_starters(
                            tenant_id="global",
                            language=lang,
                            voice_id=settings.PHASE2_TEST_VOICE_ID,
                            model=settings.TTS_MODEL,
                            sample_rate=8000,
                            api_key=settings.SARVAM_API_KEY,
                            additional_phrases=add_phrases,
                        )
                        logger.info(f"[Starter Cache Warming] Pre-warmed {count} phrases for language={lang}")
                    except Exception as e:
                        logger.debug(f"[Starter Cache Warming] Notice for lang={lang}: {e}")
        except Exception as e:
            logger.debug(f"[Starter Cache Warming] Background error: {e}")

    async def _prewarm_active_deployments_task():
        try:
            await asyncio.sleep(0.5)
            from app.runtime_config_client import RuntimeConfigClient
            rc_client = RuntimeConfigClient(http_client=app.state.http_client)
            await rc_client.prewarm_active_configs()
        except Exception as e:
            logger.debug(f"[RuntimeConfigCache Pre-warming] Notice: {e}")

    from app.redis_client import listen_cache_invalidation_loop, close_worker_redis
    prewarm_task = asyncio.create_task(_prewarm_sarvam_llm())
    starter_prewarm_task = asyncio.create_task(_prewarm_starters_task())
    config_prewarm_task = asyncio.create_task(_prewarm_active_deployments_task())
    invalidation_listener_task = asyncio.create_task(listen_cache_invalidation_loop())
    yield
    if invalidation_listener_task and not invalidation_listener_task.done():
        invalidation_listener_task.cancel()
    await close_worker_redis()
    if prewarm_task and not prewarm_task.done():
        prewarm_task.cancel()
    if starter_prewarm_task and not starter_prewarm_task.done():
        starter_prewarm_task.cancel()
    if config_prewarm_task and not config_prewarm_task.done():
        config_prewarm_task.cancel()
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


@app.api_route("/api/v1/integrations/whatsapp/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_whatsapp_integration(request: Request, path: str):
    """Proxies WhatsApp integration requests from port 8000 (ngrok) to port 3001 (NextLite Control Plane API)."""
    target_url = f"http://localhost:3001/api/v1/integrations/whatsapp/{path}"
    if request.query_params:
        target_url += f"?{request.query_params}"

    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    body = await request.body()

    async with httpx.AsyncClient() as client:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
            timeout=10.0,
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers={k: v for k, v in resp.headers.items() if k.lower() not in ("content-length", "content-encoding", "transfer-encoding")},
        )


@app.post("/internal/cache/invalidate")
async def invalidate_cache(
    deployment_id: Optional[str] = Query(default=None, alias="deploymentId"),
    all_entries: bool = Query(default=False, alias="all"),
    re_warm: bool = Query(default=True, alias="reWarm"),
):
    """Event-driven cache invalidation and atomic re-warming webhook."""
    from app.runtime_config_cache import runtime_config_cache
    from app.greeting_cache import global_greeting_cache
    from app.tools.knowledge_tool import global_knowledge_cache

    if all_entries or not deployment_id:
        runtime_config_cache.invalidate(None)
        global_greeting_cache.clear()
        global_knowledge_cache.invalidate(None)
        logger.info("[Cache Invalidate] Purged all cache tiers across worker")
        return {"status": "cleared_all", "timestamp": time.time()}

    clean_id = deployment_id.strip()
    runtime_config_cache.invalidate(clean_id)
    global_knowledge_cache.invalidate(clean_id)
    logger.info(f"[Cache Invalidate] Invalidated caches for deploymentId={clean_id}")

    rewarmed = False
    if re_warm and hasattr(app.state, "http_client"):
        try:
            client = RuntimeConfigClient(
                api_url=settings.NEXTLITE_API_URL,
                worker_secret=settings.WORKER_API_SECRET,
                timeout_seconds=5.0,
                http_client=app.state.http_client,
            )
            config = await client.get_runtime_config(clean_id)
            if config:
                rewarmed = True
                logger.info(f"[Cache Invalidate] Atomically pre-warmed fresh config for deploymentId={clean_id}")
        except Exception as e:
            logger.warning(f"[Cache Invalidate] Re-warm notice for deploymentId={clean_id}: {e}")

    return {
        "status": "invalidated_and_warmed" if rewarmed else "invalidated",
        "deployment_id": clean_id,
        "rewarmed": rewarmed,
        "timestamp": time.time(),
    }


@app.get("/internal/cache/stats")
async def get_cache_stats():
    """Returns real-time cache diagnostics and performance metrics."""
    from app.runtime_config_cache import runtime_config_cache
    from app.greeting_cache import global_greeting_cache
    from app.phrase_audio_cache import global_phrase_audio_cache
    from app.tools.knowledge_tool import global_knowledge_cache

    return {
        "status": "ok",
        "runtime_config_cache": runtime_config_cache.get_stats(),
        "greeting_cache_entries": len(getattr(global_greeting_cache, "_cache", {})),
        "phrase_audio_cache_entries": len(getattr(global_phrase_audio_cache, "_cache", {})),
        "knowledge_cache_hits": getattr(global_knowledge_cache, "_hits", 0),
        "knowledge_cache_misses": getattr(global_knowledge_cache, "_misses", 0),
    }


@app.api_route("/api/v1/telephony/plivo/inbound", methods=["GET", "POST"])
@app.api_route("/plivo/inbound", methods=["GET", "POST"])
@app.api_route("/telephony/inbound", methods=["GET", "POST"])
@app.api_route("/telephony/plivo/inbound", methods=["GET", "POST"])
@app.api_route("/plivo/test-xml", methods=["GET", "POST"])  # Backward compatibility alias
async def plivo_inbound_xml(
    request: Request,
    host: Optional[str] = None,
    deployment_id: Optional[str] = Query(default=None, alias="deploymentId"),
):
    """Production Multi-Tenant Inbound Voice Gateway for Plivo PSTN Calls.
    
    Dynamically maps incoming carrier calls (by dialed virtual DID) to the client's
    active AI receptionist deployment and returns bidirectional audio WebSocket Stream XML.
    """
    server_host = host or request.headers.get("host", f"localhost:{settings.PORT}")
    scheme = "wss" if request.headers.get("x-forwarded-proto") == "https" or "https" in str(request.url) else "ws"
    
    # Extract caller number and call UUID from query params or POST form data
    query_params = dict(request.query_params)
    form_params = {}
    if request.method == "POST":
        try:
            form_data = await request.form()
            form_params = dict(form_data)
        except Exception:
            pass

    caller_direction = (
        query_params.get("Direction")
        or query_params.get("direction")
        or form_params.get("Direction")
        or form_params.get("direction")
    )
    caller_from = (
        query_params.get("From")
        or query_params.get("from")
        or query_params.get("CallerName")
        or query_params.get("callerId")
        or form_params.get("From")
        or form_params.get("from")
        or form_params.get("CallerName")
        or form_params.get("callerId")
    )
    caller_to = (
        query_params.get("To")
        or query_params.get("to")
        or form_params.get("To")
        or form_params.get("to")
    )
    call_uuid = (
        query_params.get("CallUUID")
        or query_params.get("callId")
        or query_params.get("ALegUUID")
        or form_params.get("CallUUID")
        or form_params.get("callId")
        or form_params.get("ALegUUID")
    )

    if not deployment_id and caller_to:
        try:
            shared_http_client = getattr(request.app.state, "http_client", None)
            cfg_client = RuntimeConfigClient(http_client=shared_http_client)
            rc = await cfg_client.get_runtime_agent_config_by_phone(caller_to)
            if rc and rc.deployment and rc.deployment.deployment_id:
                deployment_id = rc.deployment.deployment_id
                logger.info(f"[Plivo XML] Inbound call to {caller_to} automatically matched deploymentId={deployment_id}")
        except Exception as lookup_err:
            logger.warning(f"[Plivo XML] Inbound phone lookup notice for {caller_to}: {lookup_err}")

    query_parts = []
    if deployment_id:
        query_parts.append(f"deploymentId={deployment_id}")
    if caller_direction:
        import urllib.parse
        query_parts.append(f"direction={urllib.parse.quote_plus(str(caller_direction))}")
    if caller_from:
        import urllib.parse
        query_parts.append(f"from={urllib.parse.quote_plus(str(caller_from))}")
    if caller_to:
        import urllib.parse
        query_parts.append(f"to={urllib.parse.quote_plus(str(caller_to))}")
    if call_uuid:
        import urllib.parse
        query_parts.append(f"callId={urllib.parse.quote_plus(str(call_uuid))}")

    query_suffix = f"?{'&'.join(query_parts)}" if query_parts else ""
    ws_url = f"{scheme}://{server_host}/ws/plivo{query_suffix}"

    import xml.sax.saxutils
    xml_ws_url = xml.sax.saxutils.escape(ws_url)

    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=8000">{xml_ws_url}</Stream>
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
    "en-IN": "Just a minute, let me check that for you.",
    "en": "Just a minute, let me check that for you.",
    "hi-IN": "एक मिनट, मैं अभी चेक कर लेता हूँ।",
    "hi": "एक मिनट, मैं अभी चेक कर लेता हूँ।",
    "mr-IN": "एक मिनिट, मी लगेच तपासतो.",
    "mr": "एक मिनिट, मी लगेच तपासतो.",
    "gu-IN": "એક મિનિટ, હું હમણાં જ તપાસ કરું છું.",
    "gu": "એક મિનિટ, હું હમણાં જ તપાસ કરું છું.",
    "bn-IN": "এক মিনিট, আমি এখনই দেখছি।",
    "bn": "এক মিনিট, আমি এখনই দেখছি।",
    "ta-IN": "ஒரு நிமிடம், நான் இப்போதே பார்க்கிறேன்.",
    "ta": "ஒரு நிமிடம், நான் இப்போதே பார்க்கிறேன்.",
    "te-IN": "ఒక్క నిమిషం, నేను ఇప్పుడే చూస్తాను.",
    "te": "ఒక్క నిమిషం, నేను ఇప్పుడే చూస్తాను.",
    "kn-IN": "ಒಂದು ನಿಮಿಷ, ನಾನು ಈಗಲೇ ಪರಿಶೀಲಿಸುತ್ತೇನೆ.",
    "kn": "ಒಂದು ನಿಮಿಷ, ನಾನು ಈಗಲೇ ಪರಿಶೀಲಿಸುತ್ತೇನೆ.",
}


DEFAULT_CONVERSATIONAL_ACK_PHRASES: Dict[str, str] = {
    "en-IN": "Sure,",
    "en": "Sure,",
    "hi-IN": "हाँ जी,",
    "hi": "हाँ जी,",
    "mr-IN": "होय,",
    "mr": "होय,",
    "gu-IN": "હા,",
    "gu": "હા,",
    "bn-IN": "হ্যাঁ,",
    "bn": "হ্যাঁ,",
    "ta-IN": "சரி,",
    "ta": "சரி,",
    "te-IN": "సరే,",
    "te": "సరే,",
    "kn-IN": "ಖಂಡಿತ,",
    "kn": "ಖಂಡಿತ,",
}

# This acknowledgement is intentionally reserved for an explicit booking
# request. Unlike a generic "yes/okay" filler it signals useful work and gives
# the TTS path a short safe phrase before the LLM serializes a tool call.
APPOINTMENT_INTENT_ACK_PHRASES: Dict[str, str] = {
    "en-IN": "I'm taking your appointment details.",
    "en": "I'm taking your appointment details.",
    "hi-IN": "मैं आपकी अपॉइंटमेंट की जानकारी ले रहा हूँ।",
    "hi": "मैं आपकी अपॉइंटमेंट की जानकारी ले रहा हूँ।",
    "mr-IN": "मी तुमच्या अपॉइंटमेंटची माहिती घेत आहे.",
    "mr": "मी तुमच्या अपॉइंटमेंटची माहिती घेत आहे.",
}

BOOKING_SLOT_COLLECTION_RESPONSES: Dict[str, str] = {
    "mr-IN": "हो नक्की, appointment book करून देतो. तुमचं नाव आणि age काय आहे?",
    "hi-IN": "जी बिल्कुल, मैं आपकी अपॉइंटमेंट बुक कर देता हूँ। आपका नाम और उम्र क्या है?",
    "en-IN": "Sure, I'll help you book an appointment. May I know your name and age?",
    "gu-IN": "હા ચોક્કસ, હું તમારી એપોઇન્ટમેન્ટ બુક કરી આપું છું. તમારું નામ અને ઉંમર જણાવશો?",
    "ta-IN": "நிச்சயமாக, நான் உங்கள் அப்பாயின்ட்மென்ட்டை பதிவு செய்கிறேன். உங்கள் பெயர் மற்றும் வயதை சொல்ல முடியுமா?",
    "te-IN": "తప్పకుండా, నేను మీ అపాయింట్‌మెంట్‌ని బుక్ చేస్తాను. మీ పేరు మరియు వయస్సు ఏమిటి?",
    "kn-IN": "ಖಂಡಿತ, ನಾನು ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡುತ್ತೇನೆ. ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ವಯಸ್ಸು ತಿಳಿಸುವಿರಾ?",
    "bn-IN": "হ্যাঁ নিশ্চয়ই, আমি আপনার অ্যাপয়েন্টমেন্ট বুক করে দিচ্ছি। আপনার নাম এবং বয়স কি?",
}

BOOKING_SLOT_COLLECTION_PURE_RESPONSES: Dict[str, str] = {
    "mr-IN": "हो नक्की, अपॉइंटमेंट बुक करून देतो. तुमचं नाव आणि वय काय आहे?",
    "hi-IN": "जी बिल्कुल, मैं आपकी अपॉइंटमेंट बुक कर देता हूँ। आपका नाम और उम्र क्या है?",
    "en-IN": "Sure, I'll help you book an appointment. May I know your name and age?",
    "gu-IN": "હા ચોક્કસ, હું તમારી એપોઇન્ટમેન્ટ બુક કરી આપું છું. તમારું નામ અને ઉંમર જણાવશો?",
    "ta-IN": "நிச்சயமாக, நான் உங்கள் அப்பாயின்ட்மென்ட்டை பதிவு செய்கிறேன். உங்கள் பெயர் மற்றும் வயதை சொல்ல முடியுமா?",
    "te-IN": "తప్పకుండా, నేను మీ అపాయింట్‌మెంట్‌ని బుಕ್ చేస్తాను. మీ పేరు మరియు వయస్సు ఏమిటి?",
    "kn-IN": "ಖಂಡಿತ, ನಾನು ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡುತ್ತೇನೆ. ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ವಯಸ್ಸು ತಿಳಿಸುವಿರಾ?",
    "bn-IN": "হ্যাঁ নিশ্চয়ই, আমি আপনার অ্যাপয়েন্টমেন্ট বুক করে দিচ্ছি। আপনার নাম এবং বয়স কি?",
}


def is_appointment_booking_intent(text: str) -> bool:
    """Return true only for an explicit request to create an appointment."""
    if not text or is_farewell_or_terminal_intent(text):
        return False

    normalized = text.casefold()
    # Match any phonetic / script variation of appointment / consultation
    has_appointment_concept = bool(
        re.search(
            r"\b(?:appointment|appt|consultation|visit|booking|slot)\b"
            r"|अप[ॉाोऑअ]?[ईइय]?ं?[टण]?[मन्]?[ेटे]?[ंट्ट]?"
            r"|अपॉइंटमेंट|अपॉईंटमेंट|अपॉईन्टमेंट|अॅपॉईंटमेंट|अपोइंटमेंट|बुकिंग",
            normalized,
        )
    )
    # Match any booking / scheduling / wanting action
    has_booking_action = bool(
        re.search(
            r"\b(?:book|booking|schedule|reserve|fix|need|want)\b"
            r"|कराय|करना|करनी|करवा|बुक|घ्याय|घेाय|हवी|हवा|पाहिजे|चाहिए|दाखवाय|भेटाय",
            normalized,
        )
    )
    # Direct short booking utterances like "appointment book", "booking karaychi hoti", etc.
    return (has_appointment_concept and has_booking_action) or bool(
        re.search(r"(?:appointment|अपॉ[ईं]ंटमेंट)\s*(?:बुक|book|पाहिजे|हवी|हवा|चाहिए)", normalized)
    )



def is_farewell_or_terminal_intent(text: str) -> bool:
    """Checks whether the user utterance expresses a farewell, stop, or termination intent."""
    if not text:
        return False
    t = text.strip().lower()
    terminal_words = {
        "bye", "goodbye", "बाय", "अलविदा", "बंद करा", "ठेवतो", "रुक", "थांब",
        "stop", "disconnect", "hang up", "cut the call", "call disconnect"
    }
    words = t.split()
    if len(words) <= 3 and any(w in terminal_words for w in words):
        return True
    return any(
        kw in t for kw in [
            "call cut", "bye bye", "बाय बाय", "फोन ठेवतो", "फोन कट करा", "रुकिए", "रहने दो"
        ]
    )


class InstrumentedAsyncStream:
    """Non-blocking async stream wrapper for observing chunk deltas, tool call boundaries, and early acknowledgements."""

    def __init__(
        self,
        raw_stream: Any,
        timing_tracker: Optional[TurnTimingTracker] = None,
        transcript_collector: Optional[CallTranscriptCollector] = None,
        active_language: str = "en-IN",
        is_call_terminating_fn: Optional[Any] = None,
        early_ack_callback: Optional[Any] = None,
    ):
        self._raw_stream = raw_stream
        self._timing_tracker = timing_tracker
        self._transcript_collector = transcript_collector
        self._active_language = active_language
        self._is_call_terminating_fn = is_call_terminating_fn
        self._early_ack_callback = early_ack_callback
        self._first_chunk_seen = False
        self._in_tool_call = False
        self._early_ack_triggered = False
        self._iter = None
        self._collected_tokens: List[str] = []

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
            if self._collected_tokens and self._transcript_collector:
                full_agent_text = "".join(self._collected_tokens).strip()
                if full_agent_text:
                    self._transcript_collector.record_agent_message(
                        response=full_agent_text,
                        active_language=self._active_language or "en-IN",
                    )
                self._collected_tokens = []
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
                    self._collected_tokens.clear()
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
                    content_str = delta.content
                    if content_str and isinstance(content_str, str):
                        self._collected_tokens.append(content_str)
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


class InstrumentedSarvamTTSService(SarvamTTSService):
    """Production SarvamTTSService with zero-latency cached starter phrase audio injection.

    When the LLM outputs a conversational starter (e.g. 'ठीक आहे', 'समजलं', 'हो', 'Sure', 'हाँ बिल्कुल'),
    this service intercepts the clause, immediately appends the pre-warmed PCM audio chunks directly to the
    active audio context (0ms TTS delay), and streams any remainder sentence text to the Sarvam WebSocket.
    """

    def __init__(
        self,
        *args,
        tenant_id: Optional[str] = None,
        language: Optional[str] = None,
        voice_id: Optional[str] = None,
        model_name: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._tenant_id = tenant_id or "default"
        self._active_language = language or "en-IN"
        self._voice_id = voice_id or "shubh"
        self._model_name = model_name or "bulbul:v3"

    def update_language_context(self, language: str):
        self._active_language = language
        if hasattr(self, "_settings") and self._settings:
            self._settings.language = language
        if hasattr(self, "_websocket") and self._websocket:
            try:
                import asyncio
                asyncio.create_task(self._send_config())
                logger.info(f"[TTS] Resent Sarvam TTS WebSocket config with target_language={language}")
            except Exception as e:
                logger.warning(f"[TTS] Failed to resend config on language update: {e}")

    @traced_tts
    async def run_tts(self, text: str, context_id: str):
        from app.phrase_audio_cache import global_phrase_audio_cache
        from pipecat.frames.frames import TTSAudioRawFrame, TTSStartedFrame, TTSStoppedFrame

        sample_rate = getattr(self, "sample_rate", 8000)

        # 1. Check for pre-rendered full phrase match (e.g. Turn 1 slot collection response)
        full_match = global_phrase_audio_cache.get_full_phrase(
            tenant_id=self._tenant_id,
            language=self._active_language,
            voice_id=self._voice_id,
            model=self._model_name,
            sample_rate=sample_rate,
            phrase_text=text,
        )
        if full_match and full_match.is_telephony_safe(sample_rate):
            logger.info(f"[TTSFastPath] Full response cache hit for text='{text[:30]}...' ({len(full_match.audio_chunks)} chunks)")
            yield TTSStartedFrame(context_id=context_id)
            for chunk in full_match.audio_chunks:
                yield TTSAudioRawFrame(
                    audio=chunk,
                    sample_rate=sample_rate,
                    num_channels=1,
                    context_id=context_id,
                )
            yield TTSStoppedFrame(context_id=context_id)
            return

        # 2. Check for starter prefix match (e.g. "ठीक आहे, मी तपासतो...")
        is_greeting_context = bool(
            context_id == "greeting_fast_path"
            or (hasattr(self, "_current_turn_type") and getattr(self, "_current_turn_type", None) == "greeting")
        )
        starter_match = global_phrase_audio_cache.match_starter(
            text_chunk=text,
            tenant_id=self._tenant_id,
            language=self._active_language,
            voice_id=self._voice_id,
            model=self._model_name,
            sample_rate=sample_rate,
        )
        if starter_match:
            cached_starter, remainder = starter_match
            # Avoid sentence splitting when remainder is a long uncached sentence (>15 chars or >2 words)
            # or during call greeting context, as starter audio (~300ms) finishes long before Sarvam TTS
            # network synthesis of the remainder completes (~2500ms), causing mid-sentence silence breaks.
            is_long_uncached_remainder = bool(remainder and (len(remainder.strip()) > 15 or len(remainder.strip().split()) > 2))
            if not is_greeting_context and not is_long_uncached_remainder:
                logger.info(
                    f"[TTSFastPath] Starter audio injected for text='{text[:30]}...' "
                    f"({len(cached_starter.audio_chunks)} chunks, remainder='{remainder[:25]}...')"
                )
                yield TTSStartedFrame(context_id=context_id)
                for chunk in cached_starter.audio_chunks:
                    yield TTSAudioRawFrame(
                        audio=chunk,
                        sample_rate=sample_rate,
                        num_channels=1,
                        context_id=context_id,
                    )
                if remainder:
                    async for frame in super().run_tts(remainder, context_id):
                        # Suppress duplicate TTSStartedFrame since starter audio already started playback
                        if not isinstance(frame, TTSStartedFrame):
                            yield frame
                else:
                    yield TTSStoppedFrame(context_id=context_id)
                return
            else:
                logger.debug(
                    f"[TTSFastPath] Bypassing starter splitting for long sentence/greeting text='{text[:30]}...' "
                    "to maintain contiguous streaming TTS audio"
                )

        # 3. Fallback to normal live Sarvam Bulbul WebSocket TTS
        async for frame in super().run_tts(text, context_id):
            yield frame


class InstrumentedSarvamLLMService(SarvamLLMService):
    """Pipecat-native Sarvam service with granular HTTP dispatch, shared connection pool, stream timing, and safe early tool acknowledgement."""

    def __init__(
        self,
        *args,
        timing_tracker: Optional[TurnTimingTracker] = None,
        transcript_collector: Optional[CallTranscriptCollector] = None,
        http_client: Optional[httpx.AsyncClient] = None,
        is_call_terminating_fn: Optional[Any] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        language_manager: Optional[ConversationLanguageManager] = None,
        tts_service: Optional[Any] = None,
        **kwargs,
    ):
        self._shared_http_client = http_client
        self._nextlite_timing_tracker = timing_tracker
        self._transcript_collector = transcript_collector
        self._is_call_terminating_fn = is_call_terminating_fn
        self._runtime_config = runtime_config
        self._language_manager = language_manager
        self._tts_service = tts_service
        self._early_tool_ack_sent_turn_id: Optional[str] = None
        self._early_conv_ack_sent_turn_id: Optional[str] = None
        super().__init__(*args, **kwargs)

    async def _dispatch_early_tool_ack(self):
        """Dispatches an immediate non-committal filler phrase to TTS in the active language."""
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            return
        if self._runtime_config and not getattr(self._runtime_config.runtime, "enable_early_tool_ack", True):
            return

        current_turn_id = self._nextlite_timing_tracker.active_turn_id if self._nextlite_timing_tracker else None
        if current_turn_id and self._early_tool_ack_sent_turn_id == current_turn_id:
            return
        self._early_tool_ack_sent_turn_id = current_turn_id

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

    def _appointment_tool_is_available(self) -> bool:
        """Only acknowledge an appointment action that this deployment can do."""
        if not self._runtime_config or not self._runtime_config.tools.enabled:
            return False
        return any(
            tool.enabled and tool.name == "book_appointment"
            for tool in self._runtime_config.tools.tools
        )

    async def _dispatch_appointment_intent_ack(self, user_transcript: str) -> None:
        """Speak one intent-gated action acknowledgement before LLM dispatch."""
        if self._runtime_config and not getattr(self._runtime_config.runtime, "enable_appointment_intent_ack", False):
            return
        if not is_appointment_booking_intent(user_transcript):
            return
        if not self._appointment_tool_is_available():
            return
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            return

        current_turn_id = self._nextlite_timing_tracker.active_turn_id if self._nextlite_timing_tracker else None
        if current_turn_id and self._early_tool_ack_sent_turn_id == current_turn_id:
            return
        self._early_tool_ack_sent_turn_id = current_turn_id

        active_lang = "en-IN"
        if self._language_manager and getattr(self._language_manager, "current_language", None):
            active_lang = self._language_manager.current_language
        elif self._runtime_config and self._runtime_config.language:
            active_lang = self._runtime_config.language.primary or active_lang

        phrase = (
            APPOINTMENT_INTENT_ACK_PHRASES.get(active_lang)
            or APPOINTMENT_INTENT_ACK_PHRASES.get(active_lang.split("-")[0])
            or APPOINTMENT_INTENT_ACK_PHRASES["en-IN"]
        )
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_early_ack_sent(time.perf_counter())
        logger.info(
            f"[AppointmentIntentAck] Dispatched before LLM request "
            f"(lang={active_lang}, turn_id={current_turn_id})"
        )
        try:
            await self.push_frame(TTSSpeakFrame(text=phrase), FrameDirection.DOWNSTREAM)
        except Exception as exc:
            logger.warning(f"[AppointmentIntentAck] Failed to push TTS frame: {exc}")

    async def _dispatch_early_conversational_ack(self, user_transcript: str = ""):
        """Dispatches an immediate conversational acknowledgment particle to TTS in the active language."""
        if self._is_call_terminating_fn and self._is_call_terminating_fn():
            return
        if self._runtime_config and not getattr(self._runtime_config.runtime, "enable_conversational_early_ack", False):
            return

        current_turn_id = self._nextlite_timing_tracker.active_turn_id if self._nextlite_timing_tracker else None
        if current_turn_id and self._early_conv_ack_sent_turn_id == current_turn_id:
            return
        self._early_conv_ack_sent_turn_id = current_turn_id

        # Resolve active language
        active_lang = "en-IN"
        if self._language_manager and getattr(self._language_manager, "current_language", None):
            active_lang = self._language_manager.current_language
        elif self._runtime_config and self._runtime_config.language and self._runtime_config.language.primary:
            active_lang = self._runtime_config.language.primary

        # Fallback check against current user transcript if active_lang is still English
        user_text = user_transcript or (getattr(self._nextlite_timing_tracker, "last_user_transcript", None) or "")
        if (active_lang.startswith("en") or active_lang == "en-IN") and user_text:
            from app.language_manager import (
                DEVANAGARI_REGEX,
                HINDI_LATIN_MARKERS_REGEX,
                MARATHI_LATIN_MARKERS_REGEX,
                match_supported_language,
            )
            supported = self._language_manager.supported_languages if self._language_manager else ["en-IN", "hi-IN", "mr-IN"]
            if MARATHI_LATIN_MARKERS_REGEX.search(user_text):
                active_lang = match_supported_language("mr-IN", supported) or "mr-IN"
            elif any(l.startswith("mr") for l in supported) and not any(l.startswith("hi") for l in supported) and DEVANAGARI_REGEX.search(user_text):
                active_lang = match_supported_language("mr-IN", supported) or "mr-IN"
            elif DEVANAGARI_REGEX.search(user_text) or HINDI_LATIN_MARKERS_REGEX.search(user_text):
                active_lang = match_supported_language("hi-IN", supported) or "hi-IN"

        base_code = active_lang.split("-")[0]
        filler_phrase = (
            DEFAULT_CONVERSATIONAL_ACK_PHRASES.get(active_lang)
            or DEFAULT_CONVERSATIONAL_ACK_PHRASES.get(base_code)
            or DEFAULT_CONVERSATIONAL_ACK_PHRASES["en-IN"]
        )

        now = time.perf_counter()
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_early_ack_sent(now)

        # Notify text aggregator to deduplicate repeated affirmative particle from LLM stream
        if self._tts_service and hasattr(self._tts_service, "_text_aggregator") and self._tts_service._text_aggregator:
            if hasattr(self._tts_service._text_aggregator, "enable_leading_affirmation_deduplication"):
                self._tts_service._text_aggregator.enable_leading_affirmation_deduplication(True)

        logger.info(
            f"[ConversationalEarlyAck] Dispatched conversational fast-path filler to TTS: '{filler_phrase}' "
            f"(lang={active_lang}, turn_id={current_turn_id})"
        )
        try:
            await self.push_frame(TTSSpeakFrame(text=filler_phrase), FrameDirection.DOWNSTREAM)
        except Exception as e:
            logger.warning(f"[ConversationalEarlyAck] Failed to push early filler TTSSpeakFrame: {e}")

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
        http_client = self._shared_http_client
        if http_client is None:
            from openai._base_client import DefaultAsyncHttpxClient
            http_client = DefaultAsyncHttpxClient(
                limits=httpx.Limits(
                    max_keepalive_connections=100, max_connections=1000, keepalive_expiry=None
                )
            )

        from pipecat.services.sarvam._sdk import sdk_headers
        merged_headers.update(sdk_headers())
        if api_key:
            merged_headers["api-subscription-key"] = api_key

        return AsyncOpenAI(
            api_key=api_key or settings.SARVAM_API_KEY,
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

        messages = []
        if hasattr(context, "get_messages"):
            messages = context.get_messages()
        elif hasattr(context, "messages"):
            messages = context.messages
        elif isinstance(context, list):
            messages = context

        is_post_tool = bool(messages and messages[-1].get("role") == "tool")
        is_greeting = bool(
            self._nextlite_timing_tracker
            and (self._nextlite_timing_tracker.turn_type == "greeting" or getattr(self._nextlite_timing_tracker, "turn_count", 0) == 0)
        )

        if not is_post_tool:
            last_user_message = next(
                (
                    message.get("content", "")
                    for message in reversed(messages)
                    if message.get("role") == "user" and isinstance(message.get("content"), str)
                ),
                "",
            )
            await self._dispatch_appointment_intent_ack(last_user_message)

            # Turn-1 Booking Intent Fast-Path:
            # If user explicitly requests booking without having given their details (e.g. "मला अपॉइंटमेंट बुक करायची आहे"):
            # Return the slot collection question in < 1ms, skipping LLM GPU prefill completely.
            user_msg_clean = last_user_message.strip().lower()
            if (
                self._appointment_tool_is_available()
                and is_appointment_booking_intent(user_msg_clean)
                and not re.search(r"\b(?:\d{1,2}|years?|वय|वर्षे|नाव|name)\b", user_msg_clean, re.IGNORECASE)
            ):
                active_lang = "en-IN"
                if self._language_manager and getattr(self._language_manager, "current_language", None):
                    active_lang = self._language_manager.current_language
                elif self._runtime_config and self._runtime_config.language and self._runtime_config.language.primary:
                    active_lang = self._runtime_config.language.primary

                is_pure_style = False
                if self._language_manager and getattr(self._language_manager, "language_style", None) == "pure":
                    is_pure_style = True
                elif self._runtime_config and self._runtime_config.language and getattr(self._runtime_config.language, "language_style", None) == "pure":
                    is_pure_style = True

                resp_dict = BOOKING_SLOT_COLLECTION_PURE_RESPONSES if is_pure_style else BOOKING_SLOT_COLLECTION_RESPONSES
                fast_reply = (
                    resp_dict.get(active_lang)
                    or resp_dict.get(active_lang.split("-")[0])
                    or resp_dict["en-IN"]
                )
                logger.info(f"[FastPath Intent] Instant Turn-1 Slot Collection matched: '{fast_reply}' (lang={active_lang})")

                from openai.types.chat import ChatCompletionChunk
                from openai.types.chat.chat_completion_chunk import Choice, ChoiceDelta

                async def _instant_booking_stream():
                    yield ChatCompletionChunk(
                        id="fast-turn1-intent",
                        choices=[Choice(delta=ChoiceDelta(content=fast_reply), index=0, finish_reason="stop")],
                        created=int(time.time()),
                        model=self._settings.model,
                        object="chat.completion.chunk",
                    )

                now_fast = time.perf_counter()
                if self._nextlite_timing_tracker:
                    self._nextlite_timing_tracker.record_llm_request_created(now_fast)
                    self._nextlite_timing_tracker.record_llm_request(now_fast)
                    self._nextlite_timing_tracker.record_llm_first_provider_response(now_fast)

                return InstrumentedAsyncStream(
                    _instant_booking_stream(),
                    timing_tracker=self._nextlite_timing_tracker,
                    transcript_collector=self._transcript_collector,
                    active_language=active_lang,
                    is_call_terminating_fn=self._is_call_terminating_fn,
                )

        t0 = time.perf_counter()
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_llm_request_created(t0)
            self._nextlite_timing_tracker.record_llm_request(t0)

        adapter = self.get_llm_adapter()
        params_from_context = adapter.get_llm_invocation_params(
            context,
            system_instruction=assert_given(self._settings.system_instruction),
            convert_developer_to_user=not self.supports_developer_role,
        )
        params = self.build_chat_completion_params(params_from_context)

        raw_stream = await self._client.chat.completions.create(**params)

        t1 = time.perf_counter()
        if self._nextlite_timing_tracker:
            self._nextlite_timing_tracker.record_llm_first_provider_response(t1)

        active_lang = "en-IN"
        if self._language_manager and getattr(self._language_manager, "current_language", None):
            active_lang = self._language_manager.current_language
        elif self._runtime_config and self._runtime_config.language and self._runtime_config.language.primary:
            active_lang = self._runtime_config.language.primary

        return InstrumentedAsyncStream(
            raw_stream,
            timing_tracker=self._nextlite_timing_tracker,
            transcript_collector=self._transcript_collector,
            active_language=active_lang,
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
            # Suppress interruptions during tool execution & confirmation audio release so the appointment confirmation plays completely without breaking mid-sentence
            if self._turn_tracker and self._turn_tracker.has_pending_tool_activity():
                logger.info("[Interruption] Suppressed interruption during active tool execution & confirmation audio release.")
                return

            # Suppress early line-noise interruptions during initial greeting playout so initial greeting plays completely without breaking
            if self._turn_tracker and self._turn_tracker.turn_type == "greeting" and self._turn_tracker.greeting_completed is None:
                logger.info("[Interruption] Suppressed early line-noise interruption during initial greeting playout.")
                return

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
        on_hangup_fn: Optional[Any] = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._media_count = 0
        self._stream_encoding = encoding
        self._turn_tracker = turn_tracker
        self._startup_tracker = startup_tracker
        self._is_call_terminating_fn = is_call_terminating_fn
        self._on_hangup_fn = on_hangup_fn
        self.last_inbound_audio_time = time.perf_counter()

        # Dynamic Telephony Jitter Buffer Monitoring & Adaptive Pacing
        self._last_inbound_ts: Optional[float] = None
        self._jitter_samples: list = []
        self._estimated_jitter_ms: float = 0.0
        self._adaptive_pacing_window_ms: float = 20.0

    def _update_jitter_estimate(self, now: float):
        if self._last_inbound_ts is not None:
            delta_ms = (now - self._last_inbound_ts) * 1000.0
            # Expected interval for Plivo media frames is ~20ms
            jitter = abs(delta_ms - 20.0)
            self._jitter_samples.append(jitter)
            if len(self._jitter_samples) > 20:
                self._jitter_samples.pop(0)

            avg_jitter = sum(self._jitter_samples) / len(self._jitter_samples)
            self._estimated_jitter_ms = avg_jitter

            # Dynamically adapt buffer pacing window:
            # High jitter (> 35ms) -> Scale buffer window to 40ms to smooth out audio under poor mobile signals
            # Normal jitter (< 15ms) -> Keep low latency 20ms window
            if avg_jitter > 35.0 and self._adaptive_pacing_window_ms != 40.0:
                self._adaptive_pacing_window_ms = 40.0
                logger.info(f"[JitterBuffer] Network jitter detected ({avg_jitter:.1f}ms). Adapted audio buffer window to 40ms.")
            elif avg_jitter < 15.0 and self._adaptive_pacing_window_ms != 20.0:
                self._adaptive_pacing_window_ms = 20.0
                logger.info(f"[JitterBuffer] Network signal stabilized ({avg_jitter:.1f}ms). Restored low-latency 20ms buffer window.")

        self._last_inbound_ts = now

    @property
    def estimated_jitter_ms(self) -> float:
        return self._estimated_jitter_ms

    @property
    def adaptive_pacing_window_ms(self) -> float:
        return self._adaptive_pacing_window_ms

    async def deserialize(self, data: str | bytes):
        try:
            message = json.loads(data)
        except Exception:
            return None

        event = message.get("event")
        if event in ("stop", "close"):
            logger.info(f"[Plivo Event] Received terminal '{event}' event from Plivo — signaling EndFrame & terminating runner")
            if self._on_hangup_fn:
                try:
                    if asyncio.iscoroutinefunction(self._on_hangup_fn):
                        asyncio.create_task(self._on_hangup_fn())
                    else:
                        self._on_hangup_fn()
                except Exception as e:
                    logger.debug(f"[Plivo Event] on_hangup error: {e}")
            return EndFrame()

        if event == "media":
            now_media = time.perf_counter()
            self.last_inbound_audio_time = now_media
            self._update_jitter_estimate(now_media)
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

        if isinstance(frame, InterruptionFrame):
            if self._turn_tracker and self._turn_tracker.has_pending_tool_activity():
                logger.info("[PlivoSerializer] Suppressed InterruptionFrame clearAudio during active tool execution & post-tool confirmation audio release.")
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
    call_session_holder: Dict[str, Optional[str]] = {"id": None}
    call_session_task: Optional[asyncio.Task] = None
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
        nonlocal is_finalized, is_finalizing, is_call_terminating, call_session_id, transcript_collector, call_session_holder, call_session_task
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
            if not call_session_id and call_session_holder.get("id"):
                call_session_id = call_session_holder["id"]

            if not call_session_id and call_session_task is not None:
                try:
                    await asyncio.wait_for(asyncio.shield(call_session_task), timeout=5.0)
                except Exception as task_err:
                    logger.warning(f"[CallSession] Background call_session_task wait encountered: {task_err}")
                if call_session_holder.get("id"):
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

            # Sync with conversation_context to guarantee complete, verbatim multi-turn transcript
            if conversation_context:
                msgs = conversation_context.get_messages()
                chat_msgs = [m for m in msgs if m.get("role") in ("user", "assistant") and m.get("content")]
                collector_user_turns = [t for t in turns if t.get("user") is not None]
                context_user_msgs = [m for m in chat_msgs if m.get("role") == "user"]
                if len(context_user_msgs) > len(collector_user_turns) or len(turns) <= 1:
                    fresh_collector = CallTranscriptCollector()
                    for msg in chat_msgs:
                        role = msg.get("role")
                        content = msg.get("content", "")
                        if role == "user" and content:
                            fresh_collector.record_user_turn(
                                transcript=content,
                                detected_language=runtime_config.language.primary or "en-IN",
                            )
                        elif role == "assistant" and content:
                            fresh_collector.record_agent_message(
                                response=content,
                                active_language=runtime_config.language.primary or "en-IN",
                            )
                    for err in transcript_collector.errors:
                        fresh_collector.record_error(err.get("message", "Error"), source=err.get("source", "system"))
                    for tool_name in transcript_collector.tools_used:
                        if tool_name not in fresh_collector.tools_used:
                            fresh_collector._tools_used.append(tool_name)
                    summary = fresh_collector.end_call()
                    turns = summary.get("turns", [])
                    transcript_collector = fresh_collector

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

        # 2. Extract and Validate Authoritative deploymentId or Inbound DID
        resolved_deployment_id = extract_deployment_id(
            query_params=dict(websocket.query_params),
            start_payload=start_payload,
        )
        inbound_phone = (
            websocket.query_params.get("to")
            or websocket.query_params.get("To")
            or start_payload.get("to")
            or start_payload.get("To")
            or start_payload.get("calledNumber")
        )
        startup_tracker.record_stage("deployment_id_resolved")

        if not resolved_deployment_id and not inbound_phone:
            logger.warning("Rejecting WebSocket connection: Missing deploymentId and inbound phone number in parameters")
            await websocket.close(code=4002, reason="Missing or invalid deploymentId")
            return

        if resolved_deployment_id:
            logger.info(f"Resolved authoritative deploymentId={resolved_deployment_id} for stream_id={stream_id}")
        else:
            logger.info(f"Resolving authoritative config for inbound phone={inbound_phone} for stream_id={stream_id}")

        # 3. Request Authoritative RuntimeAgentConfig from NextLite Control Plane API using shared client pool
        runtime_config_client = RuntimeConfigClient(http_client=shared_http_client)
        startup_tracker.record_stage("runtime_config_start")
        startup_tracker.record_stage("runtime_config_request_start")
        try:
            if resolved_deployment_id:
                runtime_config = await runtime_config_client.get_runtime_agent_config(resolved_deployment_id)
            else:
                runtime_config = await runtime_config_client.get_runtime_agent_config_by_phone(inbound_phone)
                resolved_deployment_id = runtime_config.deployment.deployment_id
            startup_tracker.record_stage("runtime_config_resolved")
            startup_tracker.record_stage("runtime_config_response")
        except RuntimeConfigClientError as e:
            logger.warning(
                f"Rejecting WebSocket connection: Failed to resolve RuntimeAgentConfig for deploymentId={resolved_deployment_id or inbound_phone} (status={e.status_code}, code={e.error_code})"
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

        # Extract direction and speaker phone number from trusted Plivo metadata
        raw_direction = (
            websocket.query_params.get("direction")
            or websocket.query_params.get("Direction")
            or start_payload.get("direction")
            or start_payload.get("Direction")
            or start_payload.get("params", {}).get("Direction")
            or start_payload.get("customHeaders", {}).get("Direction")
        )
        raw_from = (
            websocket.query_params.get("from")
            or websocket.query_params.get("From")
            or start_payload.get("from")
            or start_payload.get("params", {}).get("From")
            or start_payload.get("customHeaders", {}).get("From")
            or start_payload.get("callerId")
            or websocket.query_params.get("callerNumber")
        )
        raw_to = (
            websocket.query_params.get("to")
            or websocket.query_params.get("To")
            or start_payload.get("to")
            or start_payload.get("params", {}).get("To")
            or start_payload.get("customHeaders", {}).get("To")
        )
        direction, caller_number = detect_call_context(
            room_name=stream_id or call_id,
            from_number=raw_from,
            to_number=raw_to,
            direction=raw_direction,
        )

        # 5. Create ACTIVE CallSession in NextLite Control Plane concurrently (Phase 17B optimization)
        language_manager = ConversationLanguageManager(
            primary=runtime_config.language.primary,
            supported_languages=runtime_config.language.supported_languages,
            auto_detect_enabled=runtime_config.language.auto_detect_enabled,
            language_switching_enabled=runtime_config.language.language_switching_enabled,
            language_style=runtime_config.language.language_style,
        )

        # Resolve a static greeting asset as soon as its tenant-scoped runtime
        # identity is known.  This deliberately happens before STT, tools, and
        # LLM construction so a cache hit can use the direct phone fast path.
        greeting_cache_key = None
        cached_greeting_chunks = None
        if greeting:
            from app.greeting_cache import (
                compute_greeting_cache_key,
                global_greeting_cache,
                is_static_greeting,
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
            # This provider/account rejects lower values with a generic config
            # error. Keep the proven production value; cached greetings bypass
            # this path entirely, so their startup latency is unaffected.
            "min_buffer_size": 30,
            "max_chunk_length": 150,
        }
        if runtime_config.voice.speaking_speed is not None:
            tts_settings_kwargs["pace"] = runtime_config.voice.speaking_speed
        if runtime_config.voice.pitch is not None and tts_model == "bulbul:v2":
            tts_settings_kwargs["pitch"] = runtime_config.voice.pitch

        tts_service = InstrumentedSarvamTTSService(
            api_key=settings.SARVAM_API_KEY,
            sample_rate=stream_sample_rate,
            settings=SarvamTTSService.Settings(**tts_settings_kwargs),
            tenant_id=runtime_config.tenant.tenant_id,
            language=language_manager.current_language,
            voice_id=voice_id,
            model_name=tts_model,
        )
        # Phase 21A & 22D: Early Release Phrase & Clause Aggregator (natural clause streaming without choppy micro-breaks)
        tts_service._text_aggregator = EarlyReleaseTextAggregator(
            min_first_chunk_words=2,
            min_first_chunk_chars=10,
            min_clause_words=3,
            min_clause_chars=18,
            max_first_chunk_chars=40,
        )
        startup_tracker.record_stage("tts_service_created")

        tts_ready_event = asyncio.Event()

        # Background TTS WebSocket Keepalive task to eliminate idle timeouts (e.g. at 30s)
        async def _tts_websocket_keepalive_loop():
            try:
                while not is_terminating():
                    await asyncio.sleep(12)
                    if not is_terminating() and hasattr(tts_service, "_websocket") and tts_service._websocket:
                        try:
                            await tts_service._websocket.ping()
                            logger.debug("[TTS Keepalive] Sent ping frame to keep Sarvam TTS WebSocket alive")
                        except Exception as ping_err:
                            logger.debug(f"[TTS Keepalive] Ping notice: {ping_err}")
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.debug(f"[TTS Keepalive] Error in keepalive loop: {e}")

        tts_keepalive_task = asyncio.create_task(_tts_websocket_keepalive_loop())

        @tts_service.event_handler("on_tts_request")
        async def on_tts_request(service, context_id: str, text: str):
            now_mono = time.perf_counter()
            from app.indic_sanitizer import sanitize_indic_tts_text
            sanitized_text = sanitize_indic_tts_text(text, language_manager.current_language)
            # Isolate early tool filler from assistant text release timing
            is_early_filler = bool(
                turn_tracker.early_ack_sent is not None
                and turn_tracker.first_post_tool_llm_output is None
                and turn_tracker.has_pending_tool_activity()
            )
            if not is_early_filler:
                is_post_tool = bool(turn_tracker.has_pending_tool_activity() or turn_tracker.post_tool_llm_start is not None)
                turn_tracker.record_text_released_to_tts(now_mono, is_post_tool=is_post_tool)
            logger.info(f"[TTS Release] Text released to TTS (context_id={context_id}, len={len(sanitized_text)}): '{sanitized_text[:40]}...'")

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
            tts_ready_event.set()


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
        runner_ref: Dict[str, Any] = {"runner": None}

        async def _on_plivo_terminal_hangup():
            nonlocal is_call_terminating
            is_call_terminating = True
            logger.info(f"[Plivo Hangup] Terminal hangup detected for stream_id={stream_id} — cancelling pipeline runner")
            r = runner_ref.get("runner")
            if r:
                try:
                    await r.cancel()
                except Exception:
                    pass
            try:
                if not websocket.client_state.name == "DISCONNECTED":
                    await websocket.close()
            except Exception:
                pass

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
            on_hangup_fn=_on_plivo_terminal_hangup,
        )

        # A cache hit is already validated by a tenant/deployment/voice/language
        # content-addressed key.  Send it directly to Plivo now, rather than
        # waiting for STT, tools, LLM, Pipecat TTS, or pipeline startup.  The
        # rest of the runtime continues to initialize while this task paces the
        # cached PCM chunks at their original audio duration.
        startup_gate_holder: Dict[str, Any] = {"processor": None}
        direct_greeting_state = {"active": False, "completed": False, "sent_first": False}
        direct_greeting_first_chunk = asyncio.Event()
        direct_greeting_task: Optional[asyncio.Task] = None

        cache_entry_is_safe = bool(
            cached_greeting_chunks
            and hasattr(cached_greeting_chunks, "is_telephony_safe")
            and cached_greeting_chunks.is_telephony_safe(stream_sample_rate)
        )
        if cached_greeting_chunks and not cache_entry_is_safe:
            logger.warning(
                "[GreetingFastPath] Ignoring cache entry with incompatible audio format "
                f"for stream_id={stream_id}; falling back to streaming TTS"
            )

        if cache_entry_is_safe:
            direct_greeting_state["active"] = True
            turn_tracker.turn_type = "greeting"
            startup_tracker.record_stage("greeting_queue_start")
            startup_tracker.record_stage("greeting_queued")
            turn_tracker.record_greeting_start()

            async def _play_cached_greeting_directly():
                chunks = cached_greeting_chunks.audio_chunks
                try:
                    logger.info(
                        f"[GreetingFastPath] Direct Plivo playback started for stream_id={stream_id} "
                        f"({len(chunks)} chunks, key={greeting_cache_key[:10]}...)"
                    )
                    for index, chunk in enumerate(chunks):
                        if is_terminating():
                            return
                        now = time.perf_counter()
                        payload = await serializer.serialize(
                            TTSAudioRawFrame(
                                audio=chunk,
                                sample_rate=stream_sample_rate,
                                num_channels=1,
                                context_id="greeting_fast_path",
                            )
                        )
                        if payload is None:
                            raise RuntimeError("Plivo serializer produced no cached greeting payload")
                        if isinstance(payload, bytes):
                            await websocket.send_bytes(payload)
                        else:
                            await websocket.send_text(payload)

                        if index == 0:
                            startup_tracker.record_stage("greeting_tts_started", now)
                            turn_tracker.record_greeting_tts_started(now)
                            startup_tracker.record_stage("greeting_first_audio", now)
                            turn_tracker.record_greeting_first_audio(now)
                            direct_greeting_state["sent_first"] = True
                            transcript_collector.record_agent_message(
                                response=greeting,
                                active_language=runtime_config.language.primary or "en-IN",
                            )
                            direct_greeting_first_chunk.set()

                        # PCM is 16-bit mono. Pacing prevents an entire greeting
                        # being buffered at Plivo and preserves natural barge-in.
                        if index + 1 < len(chunks):
                            await asyncio.sleep(max(0.001, len(chunk) / (stream_sample_rate * 2)))
                except Exception as playback_error:
                    logger.error(
                        f"[GreetingFastPath] Direct playback failed for stream_id={stream_id}: {playback_error}"
                    )
                finally:
                    direct_greeting_first_chunk.set()
                    direct_greeting_state["active"] = False
                    direct_greeting_state["completed"] = True
                    now = time.perf_counter()
                    if direct_greeting_state["sent_first"]:
                        startup_tracker.record_stage("greeting_completed", now)
                        turn_tracker.record_greeting_completed(now)
                        turn_tracker.turn_type = "user_turn"
                    startup_gate = startup_gate_holder["processor"]
                    if startup_gate:
                        startup_gate.set_ready_for_user()

            direct_greeting_task = asyncio.create_task(_play_cached_greeting_directly())
            try:
                await asyncio.wait_for(direct_greeting_first_chunk.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                logger.warning(
                    f"[GreetingFastPath] First cached chunk timed out for stream_id={stream_id}; using TTS fallback"
                )
            if not direct_greeting_state["sent_first"]:
                direct_greeting_state["active"] = False

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
            try:
                if 'runner' in locals() and runner is not None:
                    await runner.cancel()
            except Exception as cancel_err:
                logger.debug(f"[Plivo Transport] Runner cancel notice on disconnect: {cancel_err}")

        # 8. Instantiate Sarvam Realtime STT Service
        startup_tracker.record_stage("stt_service_create_start")
        initial_stt_lang = language_manager.get_stt_initial_language()
        logger.info(
            f"[SarvamRealtimeSTT Config] Initializing SarvamRealtimeSTTService | model={stt_model} | "
            f"stream_type=fast | sample_rate={stream_sample_rate} | language={initial_stt_lang} "
            f"(primary={language_manager.primary_language})"
        )
        stt_service = SarvamRealtimeSTTService(
            api_key=settings.SARVAM_API_KEY,
            sample_rate=stream_sample_rate,
            settings=SarvamRealtimeSTTService.Settings(
                model=stt_model,
                language_code=initial_stt_lang,
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

        # Single authoritative prompt assembly: avoid injecting duplicate 1.8KB 7-day calendar table
        # if the compiled prompt already contains authoritative temporal grounding.
        if "=== TEMPORAL CONTEXT ===" not in compiled_system_prompt and "=== RUNTIME TEMPORAL CONTEXT ===" not in compiled_system_prompt:
            temporal_instructions = build_temporal_and_calendar_instructions(time_zone=tz_name)
            base_system_prompt_with_temporal = f"{compiled_system_prompt}\n\n{temporal_instructions}"
        else:
            base_system_prompt_with_temporal = compiled_system_prompt

        initial_system_prompt = build_full_instructions(
            base_system_prompt_with_temporal,
            language_manager.current_language,
            language_style=language_manager.language_style,
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
            stop=[ExternalUserTurnStopStrategy(timeout=0.12, wait_for_transcript=True)],
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
            turn_tracker.record_speech_start()
            logger.info(f"[Trace D - UserStartedSpeakingFrame] User turn started via strategy={strategy.__class__.__name__}")

        @user_aggregator.event_handler("on_user_turn_stopped")
        async def on_user_turn_stopped(aggregator, strategy, message=None):
            turn_tracker.record_speech_stop()
            content = getattr(message, "content", "") if message else ""
            content_str = f" | content='{content}'" if content else ""
            logger.info(f"[UserTurn] User turn stopped via strategy={strategy.__class__.__name__}{content_str}")
            if content and transcript_collector:
                transcript_collector.record_user_turn(
                    transcript=content,
                    detected_language=runtime_config.language.primary or "en-IN",
                )

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
        startup_gate_holder["processor"] = pre_stt_processor
        if direct_greeting_state["sent_first"]:
            if direct_greeting_state["completed"]:
                pre_stt_processor.set_ready_for_user()
            else:
                pre_stt_processor.set_greeting_active()

        # Instantiate Language Context Processor (Boundary D) preserving authoritative temporal prompt
        language_processor = LanguageContextProcessor(
            language_manager=language_manager,
            conversation_context=conversation_context,
            base_system_prompt=base_system_prompt_with_temporal,
            tts_service=tts_service,
        )

        # 10. Instantiate Sarvam LLM Service (Phase 21B: Worker-Lifetime Shared Connection Pool)
        startup_tracker.record_stage("llm_service_create_start")
        llm_settings_kwargs = {
            "model": llm_model,
            "reasoning_effort": None,
            "max_tokens": getattr(runtime_config.runtime, "max_tokens", 150) or 150,
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
            transcript_collector=transcript_collector,
            http_client=sarvam_llm_pool,
            is_call_terminating_fn=is_terminating,
            runtime_config=runtime_config,
            language_manager=language_manager,
            tts_service=tts_service,
        )

        # Background LLM prompt prefill to preload GPU attention KV-cache in VRAM after initial greeting
        async def _warm_llm_prompt_kv_cache():
            try:
                # Dynamically wait until initial greeting audio finish signal is recorded (or 12s safety limit)
                start_wait = time.perf_counter()
                while time.perf_counter() - start_wait < 12.0:
                    if hasattr(turn_tracker, "greeting_completed") and turn_tracker.greeting_completed is not None:
                        break
                    await asyncio.sleep(0.4)

                if settings.SARVAM_API_KEY and llm_service:
                    client = getattr(llm_service, "_client", None)
                    if client:
                        warmup_params = {
                            "model": llm_model,
                            "messages": initial_messages,
                            "max_tokens": 1,
                            "temperature": 0.0,
                        }
                        if resolved_tools:
                            adapter = llm_service.get_llm_adapter()
                            p = adapter.get_llm_invocation_params(
                                conversation_context,
                                system_instruction=None,
                                convert_developer_to_user=not llm_service.supports_developer_role,
                            )
                            if p.get("tools"):
                                warmup_params["tools"] = p["tools"]
                        await client.chat.completions.create(**warmup_params)
                        logger.info("[LLM KV Warmup] Successfully preloaded system prompt into Sarvam GPU VRAM cache after initial greeting")
            except Exception as e:
                logger.debug(f"[LLM KV Warmup] Background warmup notice: {e}")

        asyncio.create_task(_warm_llm_prompt_kv_cache())

        startup_tracker.record_stage("llm_service_created")

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
                enable_usage_metrics=True,
            ),
            observers=[
                user_bot_latency_observer,
                MetricsLogObserver(),
                TranscriptionLogObserver(level="DEBUG"),
            ],
        )

        # The live-TTS fallback is used only when no direct cached audio was
        # dispatched.  A single pipeline-start trigger avoids the previous
        # background-task / event-handler scheduling race.
        greeting_task = None
        if greeting and not direct_greeting_state["sent_first"]:
            turn_tracker.turn_type = "greeting"
            startup_tracker.record_stage("greeting_queue_start")
            turn_tracker.record_greeting_start()
            transcript_collector.record_agent_message(
                response=greeting,
                active_language=runtime_config.language.primary or "en-IN",
            )

            async def _emit_initial_greeting():
                if not cached_greeting_chunks and not tts_ready_event.is_set():
                    try:
                        await asyncio.wait_for(tts_ready_event.wait(), timeout=0.05)
                    except asyncio.TimeoutError:
                        logger.debug(f"TTS connection asynchronously warming for stream_id={stream_id}, queueing initial greeting frame immediately")

                if startup_tracker.greeting_queued is not None:
                    return
                startup_tracker.record_stage("greeting_queued")
                logger.info(f"Emitting initial greeting directly after TTS ready gate (elapsed: {time.perf_counter() - conn_start_time:.3f}s)")
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
                    worker_instance = worker
                    await worker_instance.queue_frame(TTSSpeakFrame(text=greeting))

            @worker.event_handler("on_pipeline_started")
            async def on_pipeline_started(worker_instance, frame):
                await _emit_initial_greeting()

        elif not direct_greeting_state["sent_first"]:
            turn_tracker.turn_type = "user_turn"

        startup_tracker.record_stage("pipeline_start")
        startup_tracker.record_stage("tts_connection_start")
        runner = WorkerRunner(handle_sigint=False, handle_sigterm=False)
        runner_ref["runner"] = runner
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

        # Pre-warm starter phrases and full tenant dynamic greeting in background after greeting playback completes
        if settings.SARVAM_API_KEY:
            from app.phrase_audio_cache import global_phrase_audio_cache
            active_lang = (runtime_config.language.primary or "mr-IN").strip()
            add_phrases = [greeting] if greeting else None

            async def _delayed_prewarm():
                # Dynamically wait until greeting speech is completely finished (or 12s fallback)
                start_wait = time.perf_counter()
                while time.perf_counter() - start_wait < 12.0:
                    if hasattr(turn_tracker, "greeting_completed") and turn_tracker.greeting_completed is not None:
                        break
                    await asyncio.sleep(0.4)

                await global_phrase_audio_cache.prewarm_starters(
                    tenant_id=runtime_config.tenant.tenant_id,
                    language=active_lang,
                    voice_id=voice_id,
                    model=tts_model,
                    sample_rate=stream_sample_rate,
                    api_key=settings.SARVAM_API_KEY,
                    additional_phrases=add_phrases,
                )

            asyncio.create_task(_delayed_prewarm())

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

        # 13. Silence Watchdog & Quiet Caller Nudges
        watchdog_task: Optional[asyncio.Task] = None
        async def _hangup_silence_watchdog():
            try:
                # Wait 15 seconds for initial conversation establishment
                await asyncio.sleep(15)
                while not is_terminating():
                    await asyncio.sleep(3)
                    if hasattr(serializer, "last_inbound_audio_time"):
                        idle_time = time.perf_counter() - serializer.last_inbound_audio_time
                        if idle_time > 45.0:
                            logger.info(
                                f"[SilenceWatchdog] No inbound audio for {idle_time:.1f}s for stream_id={stream_id}. "
                                "Caller hung up. Cleanly terminating call session."
                            )
                            if not is_terminating():
                                await _on_plivo_terminal_hangup()
                                break
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.debug(f"[SilenceWatchdog] Notice: {e}")

        watchdog_task = asyncio.create_task(_hangup_silence_watchdog())

        # In-Call Nudges for Quiet Callers (User silence timeout)
        nudge_task: Optional[asyncio.Task] = None
        nudge_cfg = getattr(runtime_config.runtime, "nudges", None)
        nudge_enabled = bool(nudge_cfg.enabled) if nudge_cfg and hasattr(nudge_cfg, "enabled") else True
        nudge_delay = int(nudge_cfg.delay_seconds) if nudge_cfg and hasattr(nudge_cfg, "delay_seconds") else 5
        max_nudges = int(nudge_cfg.max_unanswered_nudges) if nudge_cfg and hasattr(nudge_cfg, "max_unanswered_nudges") else 2
        nudge_msgs = list(nudge_cfg.messages) if nudge_cfg and hasattr(nudge_cfg, "messages") and nudge_cfg.messages else []

        if nudge_enabled:
            async def _quiet_caller_nudge_loop():
                try:
                    await asyncio.sleep(max(3.0, float(nudge_delay)))
                    nudge_count = 0
                    last_nudge_time = 0.0

                    while not is_terminating():
                        await asyncio.sleep(1.0)
                        now_mono = time.perf_counter()

                        # Inbound audio silence calculation
                        inbound_silence = (
                            now_mono - serializer.last_inbound_audio_time
                            if hasattr(serializer, "last_inbound_audio_time") and serializer.last_inbound_audio_time
                            else 0.0
                        )

                        # User speaking status
                        user_speaking = bool(
                            turn_tracker and turn_tracker.speech_start is not None and turn_tracker.speech_stop is None
                        )
                        has_active_tool = bool(turn_tracker and turn_tracker.has_pending_tool_activity())
                        is_user_turn = bool(
                            turn_tracker and (turn_tracker.turn_type == "user_turn" or turn_tracker.greeting_completed is not None)
                        )

                        # Reset nudge count if user spoke recently (inbound audio within 3 seconds)
                        if inbound_silence < 3.0:
                            nudge_count = 0

                        last_activity = max(
                            getattr(serializer, "last_inbound_audio_time", now_mono),
                            turn_tracker.last_audio_sent_time or 0.0,
                            last_nudge_time,
                        )
                        silence_duration = now_mono - last_activity

                        if (
                            is_user_turn
                            and not user_speaking
                            and not has_active_tool
                            and silence_duration >= nudge_delay
                            and nudge_count < max_nudges
                        ):
                            nudge_count += 1
                            last_nudge_time = now_mono

                            lang = (language_manager.current_language or "en-IN").lower()
                            if lang.startswith("mr"):
                                nudge_text = "तुम्ही आहात का? मला सांगा मी काही मदत करू का."
                            elif lang.startswith("hi"):
                                nudge_text = "क्या आप हैं? बताइए मैं आपकी क्या मदद कर सकता हूँ।"
                            elif lang.startswith("gu"):
                                nudge_text = "તમે છો? મને જણાવો જો હું કોઈ મદદ કરી શકું."
                            else:
                                nudge_text = "Are you there? Let me know if you need any help."

                            if nudge_msgs and len(nudge_msgs) > 0 and nudge_msgs[0]:
                                configured_msg = nudge_msgs[(nudge_count - 1) % len(nudge_msgs)]
                                if configured_msg and configured_msg.strip():
                                    from app.indic_sanitizer import sanitize_indic_tts_text
                                    nudge_text = sanitize_indic_tts_text(configured_msg.strip(), language_manager.current_language)

                            logger.info(
                                f"[QuietCallerNudge] Dispatched gentle silence reminder #{nudge_count}/{max_nudges} "
                                f"after {silence_duration:.1f}s silence: '{nudge_text}' (lang={language_manager.current_language})"
                            )

                            from pipecat.frames.frames import TTSSpeakFrame
                            if 'task' in locals() and task:
                                await task.queue_frame(TTSSpeakFrame(text=nudge_text))
                            elif 'runner' in locals() and runner:
                                await runner.queue_frame(TTSSpeakFrame(text=nudge_text))
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.debug(f"[QuietCallerNudge] Loop notice: {e}")

            nudge_task = asyncio.create_task(_quiet_caller_nudge_loop())

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
        if 'greeting_task' in locals() and greeting_task and not greeting_task.done():
            greeting_task.cancel()
        if 'direct_greeting_task' in locals() and direct_greeting_task and not direct_greeting_task.done():
            direct_greeting_task.cancel()
        if 'tts_keepalive_task' in locals() and tts_keepalive_task and not tts_keepalive_task.done():
            tts_keepalive_task.cancel()
        if 'watchdog_task' in locals() and watchdog_task and not watchdog_task.done():
            watchdog_task.cancel()
        
        await finalize_call_session("COMPLETED")
        total_duration = time.perf_counter() - conn_start_time
        logger.info(f"Plivo WebSocket session finished | stream_id={stream_id} | duration={total_duration:.2f}s")
        try:
            if not websocket.client_state.name == "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass
