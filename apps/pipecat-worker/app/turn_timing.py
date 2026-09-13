"""Per-turn latency instrumentation, stage measurement, and structured telemetry module.

Tracks high-resolution monotonic timestamps (time.perf_counter()) across every stage
of a user conversation turn to provide isolated, non-cumulative, per-turn latency metrics.
"""

import json
import math
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from loguru import logger

DEVANAGARI_DIGITS = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
}

SPOKEN_DIGIT_MAP = {
    "शून्य": "0", "zero": "0", "जीरो": "0",
    "एक": "1", "one": "1", "वन": "1",
    "दो": "2", "two": "2", "टू": "2",
    "तीन": "3", "three": "3", "थ्री": "3",
    "चार": "4", "four": "4", "फोर": "4",
    "पांच": "5", "पाँच": "5", "five": "5", "फाइव": "5",
    "छह": "6", "six": "6", "सिक्स": "6",
    "सात": "7", "seven": "7", "सेवन": "7",
    "आठ": "8", "eight": "8", "एट": "8",
    "नौ": "9", "nine": "9", "नाइन": "9",
}


def safe_phone_trace(text_or_phone: Optional[str]) -> Dict[str, Any]:
    """Extracts non-PII phone trace characteristics without ever logging raw phone numbers.
    
    Returns:
        Dict with phoneObserved, digits count, masked last4, and representation type.
    """
    if not text_or_phone or not isinstance(text_or_phone, str):
        return {"phoneObserved": False, "digits": 0, "last4": None, "representation": "none"}

    text = text_or_phone.strip()
    if not text:
        return {"phoneObserved": False, "digits": 0, "last4": None, "representation": "none"}

    latin_digits = re.findall(r'[0-9]', text)
    devanagari_digits = [ch for ch in text if ch in DEVANAGARI_DIGITS]

    spoken_found = []
    text_lower = text.lower()
    # Unicode and ASCII token matching for Hindi, Marathi, and English spoken digit words
    tokens = re.findall(r'[\w\u0900-\u097F]+', text_lower)
    for token in tokens:
        if token in SPOKEN_DIGIT_MAP:
            spoken_found.append(token)

    total_digits_count = len(latin_digits) + len(devanagari_digits) + len(spoken_found)
    if total_digits_count == 0:
        return {
            "phoneObserved": False,
            "digits": 0,
            "last4": None,
            "representation": "none",
        }

    has_latin = len(latin_digits) > 0
    has_devanagari = len(devanagari_digits) > 0
    has_spoken = len(spoken_found) > 0

    rep_types = sum([1 if has_latin else 0, 1 if has_devanagari else 0, 1 if has_spoken else 0])
    if rep_types > 1:
        representation = "mixed"
    elif has_devanagari:
        representation = "devanagari"
    elif has_spoken:
        representation = "spoken_digits"
    else:
        representation = "latin_digits"

    all_digit_chars = []
    if has_spoken and not (has_latin or has_devanagari):
        for token in spoken_found:
            all_digit_chars.append(SPOKEN_DIGIT_MAP[token])
    else:
        for ch in text:
            if ch in '0123456789':
                all_digit_chars.append(ch)
            elif ch in DEVANAGARI_DIGITS:
                all_digit_chars.append(DEVANAGARI_DIGITS[ch])

    if len(all_digit_chars) >= 4:
        last4 = "".join(all_digit_chars[-4:])
    elif all_digit_chars:
        last4 = "".join(all_digit_chars)
    else:
        last4 = "none"

    return {
        "phoneObserved": True,
        "digits": total_digits_count,
        "last4": last4,
        "representation": representation,
    }


def log_phone_trace(
    text_or_phone: Optional[str] = None,
    stage: Optional[str] = None,
    boundary: Optional[str] = None,
    turn_id: Optional[str] = None,
    **kwargs,
):
    """Logs structured non-PII phone trace telemetry across pipeline boundaries."""
    # Support positional arguments boundary, turn_id, text_or_phone if passed in legacy order
    target_text = text_or_phone
    target_boundary = boundary or stage or kwargs.get("stage_name") or "pipeline"
    target_turn_id = turn_id or kwargs.get("turnId") or "unspecified"

    # If first arg looks like a boundary name and text is in kwargs or second arg
    if text_or_phone in ("stt_transcription_frame", "llm_context_in", "tool_arg_received", "control_plane_request") and "text" in kwargs:
        target_boundary = text_or_phone
        target_text = kwargs.get("text")

    trace = safe_phone_trace(target_text)
    if trace.get("phoneObserved"):
        payload = {
            "turnId": target_turn_id,
            "boundary": target_boundary,
            **trace,
        }
        logger.info(f"[PHONE_NUMBER_TRACE] {json.dumps(payload, separators=(',', ':'))}")


@dataclass
class ToolExecutionTiming:
    tool_name: str
    start_time: float
    end_time: float
    duration_ms: Optional[int]
    success: bool


class TurnTimingTracker:
    """Isolates and measures high-resolution timing across all user turn stages.
    
    Prevents stale timestamp leakage across turns by maintaining isolated state per turn_id.
    """

    def __init__(self, stream_id: Optional[str] = None, session_start_monotonic: Optional[float] = None):
        self.stream_id = stream_id or "stream_unknown"
        self.turn_count = 0
        self.active_turn_id: str = f"turn-{uuid.uuid4().hex[:8]}"
        self.session_start_time: float = session_start_monotonic if session_start_monotonic is not None else time.perf_counter()
        self._emitted: bool = False
        self.completed_turns: List[Dict[str, Any]] = []
        self.trace_events: List[Dict[str, Any]] = []
        self.phone_traces: List[Dict[str, Any]] = []
        
        # Stage timestamps (monotonic seconds via time.perf_counter())
        self.speech_start: Optional[float] = None
        self.speech_stop: Optional[float] = None
        self.sarvam_vad_stop: Optional[float] = None
        self.stt_utterance_end: Optional[float] = None
        self.stt_first_partial: Optional[float] = None
        self.stt_final: Optional[float] = None
        self.user_aggregation_finalized: Optional[float] = None
        self.llm_context_frame: Optional[float] = None
        self.llm_start: Optional[float] = None
        self.llm_request_created: Optional[float] = None
        self.llm_request_start: Optional[float] = None  # HTTP request started
        self.llm_first_provider_response: Optional[float] = None  # First HTTP response headers/connection
        self.first_llm_output: Optional[float] = None  # First text token delta
        self.llm_first_releasable_text: Optional[float] = None  # First complete clause/sentence
        self.text_released_to_tts: Optional[float] = None  # Text released/dispatched to TTS
        self.post_tool_text_released_to_tts: Optional[float] = None  # Post-tool text released to TTS
        self.last_user_transcript: Optional[str] = None  # Recent user transcript for heuristic fallbacks
        self.tool_call_delta: Optional[float] = None  # First tool call delta
        self.last_tool_delta: Optional[float] = None  # Last tool call delta
        self.tool_delta_count: int = 0
        self.tool_call_complete: Optional[float] = None  # Tool arguments JSON complete
        self.early_ack_sent: Optional[float] = None  # Immediate early non-committal filler dispatched to TTS
        self.early_ack_first_audio: Optional[float] = None  # Caller first heard early filler audio
        self.llm_response_complete: Optional[float] = None
        self.tool_executions: List[ToolExecutionTiming] = []
        self.post_tool_llm_start: Optional[float] = None
        self.post_tool_llm_request_start: Optional[float] = None
        self.post_tool_llm_first_provider_response: Optional[float] = None
        self.first_post_tool_llm_output: Optional[float] = None
        self.post_tool_llm_response_complete: Optional[float] = None
        self.tts_start: Optional[float] = None
        self.tts_connected: Optional[float] = None
        self.first_tts_audio: Optional[float] = None
        self.first_audio_sent_to_plivo: Optional[float] = None
        self.tts_stop: Optional[float] = None
        self.output_audio: Optional[float] = None
        self.turn_complete: Optional[float] = None
        self.turn_type: str = "user_turn"  # "greeting", "user_turn", "tool_turn", "system_turn"
        self.greeting_start: Optional[float] = None
        self.greeting_tts_started: Optional[float] = None
        self.greeting_first_audio: Optional[float] = None
        self.greeting_completed: Optional[float] = None
        self.interrupted: bool = False
        self.interruption_reason: Optional[str] = None
        self.active_turn_events: List[Dict[str, Any]] = []
        self.active_phone_trace: Optional[Dict[str, Any]] = None


    @property
    def is_assistant_speaking(self) -> bool:
        """True if assistant audio/synthesis is currently active."""
        return (self.tts_start is not None or self.first_tts_audio is not None) and self.tts_stop is None

    def record_greeting_start(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.greeting_start = now
        self.turn_type = "greeting"
        self.record_event("greeting_start", now)

    def record_greeting_tts_started(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.greeting_tts_started = now
        self.record_event("greeting_tts_started", now)

    def record_greeting_first_audio(self, ts: Optional[float] = None):
        if self.greeting_first_audio is not None:
            return
        now = ts if ts is not None else time.perf_counter()
        self.greeting_first_audio = now
        self.record_event("greeting_first_audio", now)

    def record_greeting_completed(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.greeting_completed = now
        self.record_event("greeting_completed", now)

    def start_new_turn(self, speech_start: Optional[float] = None, turn_type: str = "user_turn") -> str:
        """Resets the timing state for a new turn and generates a unique turn_id."""
        self.turn_count += 1
        self.active_turn_id = f"turn-{uuid.uuid4().hex[:8]}"
        self.turn_type = turn_type
        self.speech_start = speech_start
        self.speech_stop = None
        self.sarvam_vad_stop = None
        self.stt_utterance_end = None
        self.stt_first_partial = None
        self.stt_final = None
        self.user_aggregation_finalized = None
        self.llm_context_frame = None
        self.llm_start = None
        self.llm_request_created = None
        self.llm_request_start = None
        self.llm_first_provider_response = None
        self.first_llm_output = None
        self.llm_first_releasable_text = None
        self.text_released_to_tts = None
        self.post_tool_text_released_to_tts = None
        self.tool_call_delta = None
        self.last_tool_delta = None
        self.tool_delta_count = 0
        self.tool_call_complete = None
        self.early_ack_sent = None
        self.early_ack_first_audio = None
        self.llm_response_complete = None
        self.tool_executions = []
        self.post_tool_llm_start = None
        self.post_tool_llm_request_start = None
        self.post_tool_llm_first_provider_response = None
        self.first_post_tool_llm_output = None
        self.post_tool_llm_response_complete = None
        self.tts_start = None
        self.tts_connected = None
        self.first_tts_audio = None
        self.first_audio_sent_to_plivo = None
        self.tts_stop = None
        self.output_audio = None
        self.turn_complete = None
        self.interrupted = False
        self.interruption_reason = None
        self._emitted = False
        self.active_turn_events = []
        self.active_phone_trace = None
        return self.active_turn_id


    def record_audio_sent_to_plivo(self, ts: Optional[float] = None):
        """Records timestamp when first audio chunk is serialized and dispatched to Plivo."""
        if self.first_audio_sent_to_plivo is not None:
            return
        now = ts if ts is not None else time.perf_counter()
        self.first_audio_sent_to_plivo = now
        self.record_event("first_audio_sent_to_plivo", now)

    def record_speech_start(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.speech_start is not None and self.turn_complete is None:
            # Speech start already recorded for this active turn, avoid duplicate event
            return
        if self.turn_complete is not None or self.speech_start is None:
            self.start_new_turn(speech_start=now)
        else:
            self.speech_start = now
        self.record_event("user_speech_start", now)

    def record_speech_stop(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.speech_stop is not None:
            # Avoid duplicate speech stop events on the same turn
            return
        self.speech_stop = now
        self.sarvam_vad_stop = now
        self.record_event("user_speech_stop", now)

    def record_stt_utterance_end(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.stt_utterance_end is not None:
            return
        self.stt_utterance_end = now
        self.record_event("stt_utterance_end", now)

    def record_utterance_end(self, ts: Optional[float] = None):
        self.record_stt_utterance_end(ts)

    def record_stt_first_partial(self, ts: Optional[float] = None, transcript: Optional[str] = None):
        if self.stt_first_partial is not None:
            return
        now = ts if ts is not None else time.perf_counter()
        self.stt_first_partial = now
        self.record_event("stt_first_partial", now, transcript_len=len(transcript) if transcript else None)

    def record_stt_final(self, ts: Optional[float] = None, transcript: Optional[str] = None):
        now = ts if ts is not None else time.perf_counter()
        self.stt_final = now
        if transcript:
            self.last_user_transcript = transcript
            trace = safe_phone_trace(transcript)
            if trace.get("phoneObserved"):
                self.active_phone_trace = trace
                self.phone_traces.append({"turnId": self.active_turn_id, "boundary": "stt_final", **trace})
        self.record_event("stt_final", now, transcript_len=len(transcript) if transcript else None)

    def record_user_aggregation_finalized(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.user_aggregation_finalized is not None:
            return
        self.user_aggregation_finalized = now
        self.record_event("user_aggregated", now)

    def record_llm_context_frame(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.tool_executions:
            self.post_tool_llm_start = now
            self.record_event("post_tool_llm_context", now)
        else:
            if self.llm_context_frame is None:
                self.llm_context_frame = now
            if self.llm_start is None:
                self.llm_start = now
            self.record_event("llm_context", now)

    def record_llm_start(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.tool_executions:
            self.post_tool_llm_start = now
            self.record_event("post_tool_llm_start", now)
        elif self.llm_start is None:
            self.llm_start = now
            self.record_event("llm_start", now)

    def record_llm_request_created(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.tool_executions:
            self.record_event("post_tool_llm_request_created", now)
        elif self.llm_request_created is None:
            self.llm_request_created = now
            self.record_event("llm_request_created", now)

    def record_llm_request(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.tool_executions:
            if self.post_tool_llm_start is None:
                self.post_tool_llm_start = now
            if self.post_tool_llm_request_start is None:
                self.post_tool_llm_request_start = now
                self.record_event("post_tool_llm_http_request_started", now)
        elif self.llm_request_start is None:
            self.llm_request_start = now
            self.record_event("llm_http_request_started", now)

    def record_llm_first_provider_response(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.tool_executions:
            if self.post_tool_llm_first_provider_response is None:
                self.post_tool_llm_first_provider_response = now
                self.record_event("post_tool_llm_first_provider_response", now)
        elif self.llm_first_provider_response is None:
            self.llm_first_provider_response = now
            self.record_event("llm_first_provider_response", now)

    def record_tool_call_delta(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.tool_delta_count += 1
        self.last_tool_delta = now
        if self.tool_call_delta is None:
            self.tool_call_delta = now
            self.record_event("first_tool_call_delta", now)

    def record_early_ack_sent(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.early_ack_sent is None:
            self.early_ack_sent = now
            self.record_event("early_tool_ack_sent_to_tts", now)

    def record_early_ack_first_audio(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.early_ack_first_audio is None:
            self.early_ack_first_audio = now
            self.record_event("early_tool_ack_first_audio", now)

    def record_tool_call_complete(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.tool_call_complete is None:
            self.tool_call_complete = now
            self.record_event("tool_call_complete", now)


    def record_first_llm_output(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if (self.tool_executions or self.post_tool_llm_start is not None) and self.first_post_tool_llm_output is None:
            self.first_post_tool_llm_output = now
            self.record_event("post_tool_llm_first_output", now)
        elif self.first_llm_output is None:
            self.first_llm_output = now
            self.record_event("llm_first_text_output", now)

    def record_llm_response_complete(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.post_tool_llm_start is not None:
            self.post_tool_llm_response_complete = now
            self.record_event("post_tool_llm_response_complete", now)
        elif self.llm_response_complete is None:
            self.llm_response_complete = now
            self.record_event("llm_response_complete", now)

    def record_tool_execution(
        self,
        tool_name: str,
        start_time: float,
        end_time: float,
        success: bool = True,
        args: Optional[Dict[str, Any]] = None,
    ):
        if end_time < start_time:
            logger.warning(
                f"[TURN_METRICS_INVALID] turnId={self.active_turn_id} "
                f"metric=tool_duration tool={tool_name} reason=tool_end_before_tool_start"
            )
            duration_ms = None
        else:
            duration_ms = round((end_time - start_time) * 1000)

        self.tool_executions.append(
            ToolExecutionTiming(
                tool_name=tool_name,
                start_time=start_time,
                end_time=end_time,
                duration_ms=duration_ms,
                success=success,
            )
        )

        if args:
            for k, v in args.items():
                if isinstance(v, str) and ("phone" in k.lower() or "number" in k.lower()):
                    trace = safe_phone_trace(v)
                    if trace.get("phoneObserved"):
                        self.phone_traces.append({"turnId": self.active_turn_id, "boundary": f"tool_arg_{tool_name}", **trace})

        self.record_event("tool_executed", end_time, tool=tool_name, durationMs=duration_ms, success=success)

    def record_text_released_to_tts(self, ts: Optional[float] = None, is_post_tool: bool = False):
        """Records timestamp when first aggregated text clause/sentence of the assistant response is released to TTS."""
        now = ts if ts is not None else time.perf_counter()
        if is_post_tool or self.post_tool_llm_start is not None or self.has_pending_tool_activity():
            if self.post_tool_text_released_to_tts is None:
                self.post_tool_text_released_to_tts = now
                self.record_event("post_tool_text_released_to_tts", now)
        else:
            if self.text_released_to_tts is None:
                self.text_released_to_tts = now
                self.llm_first_releasable_text = now
                self.record_event("text_released_to_tts", now)

    def record_tts_start(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.tts_start = now
        self.record_event("tts_started", now)

    def record_tts_connected(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.tts_connected = now
        self.record_event("tts_connected", now)

    def record_first_tts_audio(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        if self.first_tts_audio is None:
            self.first_tts_audio = now
            self.record_event("tts_first_audio", now)

    def record_tts_stop(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.tts_stop = now
        self.record_event("tts_stopped", now)

    def record_interruption(self, reason: str = "user_barge_in", ts: Optional[float] = None) -> bool:
        """Records interruption ONLY if assistant was actively synthesizing or speaking."""
        now = ts if ts is not None else time.perf_counter()
        if not self.is_assistant_speaking:
            return False
        if self.interrupted:
            return False
        self.interrupted = True
        self.interruption_reason = reason
        self.record_event("interrupted", now, reason=reason)
        logger.info(f"[INTERRUPTION] turnId={self.active_turn_id} reason={reason}")
        return True

    def record_turn_complete(self, ts: Optional[float] = None):
        now = ts if ts is not None else time.perf_counter()
        self.turn_complete = now
        self.record_event("turn_completed", now)

    def has_pending_tool_activity(self) -> bool:
        """Returns True if the active turn involves tool calling that has not completed its post-tool TTS."""
        return bool(
            self.tool_call_delta is not None
            or len(self.tool_executions) > 0
            or self.post_tool_llm_start is not None
        )

    def record_turn_complete_once(self, ts: Optional[float] = None) -> bool:
        """Completes the turn if not already completed, preventing duplicate completions."""
        if self.turn_complete is not None:
            return False
        if self.speech_start is None and self.tts_start is None and self.first_llm_output is None:
            return False
        self.record_turn_complete(ts)
        return True

    def record_event(self, event: str, ts: Optional[float] = None, **fields: Any):
        """Records a monotonic and wall-clock trace event for stable turn correlation."""
        event_time = ts if ts is not None else time.perf_counter()
        elapsed_ms = round((event_time - self.session_start_time) * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        payload = {
            "turnId": self.active_turn_id,
            "event": event,
            "timestamp": now_iso,
            "monotonicTimestamp": round(event_time, 6),
            "elapsedFromCallStartMs": max(0, elapsed_ms),
            **fields,
        }
        self.trace_events.append(payload)
        self.active_turn_events.append(payload)
        logger.info(f"[PIPECAT_TURN_TRACE] {json.dumps(payload, separators=(',', ':'))}")

    def calculate_metrics(self) -> Dict[str, Any]:
        """Calculates stage latencies in milliseconds, validating timestamp ordering."""
        def diff_ms(t_end: Optional[float], t_start: Optional[float], metric_name: str) -> Optional[int]:
            if t_end is not None and t_start is not None:
                delta = t_end - t_start
                if delta < 0:
                    logger.warning(
                        f"[TURN_METRICS_INVALID] turnId={self.active_turn_id} "
                        f"metric={metric_name} reason=negative_duration ({delta * 1000:.1f}ms)"
                    )
                    return None
                return round(delta * 1000)
            return None

        # 1. speech_duration_ms = speech_stop - speech_start
        speech_duration_ms = diff_ms(self.speech_stop, self.speech_start, "speechDurationMs")

        # 2. vad_stop_to_utterance_end_ms = stt_utterance_end - speech_stop
        vad_stop_to_utterance_end_ms = diff_ms(self.stt_utterance_end, self.speech_stop, "vadStopToUtteranceEndMs")

        # 3. utterance_end_to_stt_final_ms = stt_final - stt_utterance_end
        utterance_end_to_stt_final_ms = diff_ms(self.stt_final, self.stt_utterance_end, "utteranceEndToSttFinalMs")

        # 4. vad_stop_to_stt_final_ms / speechStopToFinalTranscriptMs = stt_final - speech_stop
        vad_stop_to_stt_final_ms = diff_ms(self.stt_final, self.speech_stop, "vadStopToSttFinalMs")
        speech_stop_to_final_transcript_ms = vad_stop_to_stt_final_ms
        speech_start_to_first_partial_ms = diff_ms(self.stt_first_partial, self.speech_start, "speechStartToFirstPartialMs")

        # 5. stt_final_to_user_aggregation_ms / finalTranscriptToAggregationMs = user_aggregation_finalized - stt_final
        stt_final_to_aggregation_ms = diff_ms(self.user_aggregation_finalized, self.stt_final, "sttFinalToAggregationMs")
        final_transcript_to_aggregation_ms = stt_final_to_aggregation_ms

        # 6. user_aggregation_to_llm_start_ms / aggregationToLLMRequestMs = llm_request_start - user_aggregation_finalized
        aggregation_to_llm_request_ms = diff_ms(self.llm_request_start or self.llm_start, self.user_aggregation_finalized, "aggregationToLLMRequestMs")
        aggregation_to_llm_start_canonical = aggregation_to_llm_request_ms
        llm_context_ref = self.llm_context_frame or self.llm_start
        if self.llm_request_start is not None and llm_context_ref is not None and self.llm_request_start >= llm_context_ref:
            llm_context_to_request_ms = diff_ms(self.llm_request_start, llm_context_ref, "llmContextToRequestMs")
        else:
            llm_context_to_request_ms = None

        # 7. LLM Provider Request & Streaming
        llm_http_request_ms = diff_ms(self.llm_first_provider_response, self.llm_request_start, "llmHttpRequestMs")
        llm_provider_to_first_output_ms = diff_ms(self.first_llm_output, self.llm_first_provider_response, "llmProviderToFirstOutputMs")
        llm_to_first_output_ms = diff_ms(self.first_llm_output, self.llm_start or self.llm_request_start, "llmToFirstOutputMs")
        llm_request_to_first_output_ms = diff_ms(self.first_llm_output, self.llm_request_start, "llmRequestToFirstOutputMs")
        llm_start_to_first_output_ms = llm_to_first_output_ms or llm_request_to_first_output_ms

        # 8. Tool Call Generation Latency (LLM generating JSON tokens)
        llm_to_first_tool_delta_ms = diff_ms(self.tool_call_delta, self.llm_request_start or self.llm_start, "llmToFirstToolDeltaMs")
        user_stop_to_first_tool_delta_ms = diff_ms(self.tool_call_delta, self.speech_stop, "userStopToFirstToolDeltaMs")
        first_tool_delta_to_tool_complete_ms = diff_ms(self.tool_call_complete, self.tool_call_delta, "firstToolDeltaToToolCompleteMs")

        # 8b. Early Safe Tool Acknowledgement Latency
        early_ack_sent_to_first_audio_ms = diff_ms(self.early_ack_first_audio, self.early_ack_sent, "earlyAckSentToFirstAudioMs")
        user_stop_to_early_ack_first_audio_ms = diff_ms(self.early_ack_first_audio, self.speech_stop, "userStopToEarlyAckFirstAudioMs")

        # 9. Tool execution duration & post-tool latencies
        tool_duration_ms: Optional[int] = None
        tools_list: List[Dict[str, Any]] = []
        last_tool_end: Optional[float] = None
        tool_call_complete_to_execution_start_ms: Optional[int] = None
        tool_result_to_post_tool_llm_start_ms: Optional[int] = None
        post_tool_llm_to_first_output_ms: Optional[int] = None
        tool_result_to_first_audio_ms: Optional[int] = None
        first_output_to_tool_start_ms: Optional[int] = None
        post_tool_llm_to_tts_ms: Optional[int] = None
        post_tool_tts_to_first_audio_ms: Optional[int] = None

        if self.tool_executions:
            valid_durations = [t.duration_ms for t in self.tool_executions if t.duration_ms is not None]
            tool_duration_ms = sum(valid_durations) if valid_durations else None
            tools_list = [
                {"name": t.tool_name, "durationMs": t.duration_ms, "success": t.success}
                for t in self.tool_executions
            ]
            first_tool_start = self.tool_executions[0].start_time
            last_tool_end = self.tool_executions[-1].end_time

            if self.tool_call_complete is not None and first_tool_start >= self.tool_call_complete:
                tool_call_complete_to_execution_start_ms = diff_ms(
                    first_tool_start, self.tool_call_complete, "toolCallCompleteToExecutionStartMs"
                )

            if self.first_llm_output is not None and first_tool_start >= self.first_llm_output:
                first_output_to_tool_start_ms = diff_ms(first_tool_start, self.first_llm_output, "firstOutputToToolStartMs")

            post_llm_ref = self.post_tool_llm_request_start or self.post_tool_llm_start
            if post_llm_ref is not None and post_llm_ref >= last_tool_end:
                tool_result_to_post_tool_llm_start_ms = diff_ms(
                    post_llm_ref, last_tool_end, "toolResultToPostToolLlmStartMs"
                )
            post_tool_llm_to_first_output_ms = diff_ms(
                self.first_post_tool_llm_output, post_llm_ref, "postToolLlmToFirstOutputMs"
            )
            tool_result_to_first_audio_ms = diff_ms(
                self.first_tts_audio, last_tool_end, "toolResultToFirstAudioMs"
            )
            if self.tts_start is not None and self.first_post_tool_llm_output is not None:
                post_tool_llm_to_tts_ms = diff_ms(
                    self.tts_start, self.first_post_tool_llm_output, "postToolLlmToTTSMs"
                )
            if self.first_tts_audio is not None and self.tts_start is not None:
                post_tool_tts_to_first_audio_ms = diff_ms(
                    self.first_tts_audio, self.tts_start, "postToolTTSToFirstAudioMs"
                )

        post_tool_llm_ms = post_tool_llm_to_first_output_ms

        # 10. tts_start_to_first_audio_ms = first_tts_audio - tts_start
        tts_start_to_first_audio_ms = diff_ms(self.first_tts_audio, self.tts_start, "ttsStartToFirstAudioMs")

        # 11. tts_connection_ms = tts_connected - speech_start (guaranteed non-negative if connected in this turn)
        if self.tts_connected is not None and self.speech_start is not None and self.tts_connected >= self.speech_start:
            tts_connection_ms = diff_ms(self.tts_connected, self.speech_start, "ttsConnectionMs")
        else:
            tts_connection_ms = None

        # 12. Explicit user response latency = first audio heard (early filler or final speech) - speech_stop
        effective_first_audio = self.early_ack_first_audio or self.first_tts_audio
        if self.early_ack_first_audio is not None and self.first_tts_audio is not None:
            effective_first_audio = min(self.early_ack_first_audio, self.first_tts_audio)

        response_latency_ms = diff_ms(effective_first_audio, self.speech_stop, "responseLatencyMs")
        user_stop_to_first_audio_ms = response_latency_ms
        speech_stop_to_first_audio_ms = response_latency_ms

        # 13. aggregation_to_first_audio_ms = first_tts_audio - user_aggregation_finalized
        aggregation_to_first_audio_ms = diff_ms(effective_first_audio, self.user_aggregation_finalized, "aggregationToFirstAudioMs")

        # 14. llm_first_output_to_tts_start_ms / llmToTTSStartMs = tts_start - first_llm_output
        is_tool_turn = bool(self.tool_executions or self.post_tool_llm_start is not None)
        if is_tool_turn and self.first_post_tool_llm_output is not None:
            first_output_ref = self.first_post_tool_llm_output
            release_ref = self.post_tool_text_released_to_tts or self.text_released_to_tts
        else:
            first_output_ref = self.first_llm_output
            release_ref = self.text_released_to_tts

        if release_ref is not None and first_output_ref is not None and release_ref >= first_output_ref:
            llm_first_text_to_release_ms = diff_ms(release_ref, first_output_ref, "llmFirstTextToReleaseMs")
        else:
            llm_first_text_to_release_ms = None

        llm_first_output_to_tts_start_ms = diff_ms(self.tts_start, first_output_ref, "llmFirstOutputToTtsStartMs")
        llm_first_text_to_tts_start_ms = llm_first_output_to_tts_start_ms
        llm_to_tts_start_ms = llm_first_output_to_tts_start_ms

        # 15. first_llm_output_to_first_audio_ms = first_tts_audio - first_llm_output
        first_llm_output_to_first_audio_ms = diff_ms(self.first_tts_audio, first_output_ref, "firstLLMOutputToFirstAudioMs")
        llm_first_text_to_first_audio_ms = first_llm_output_to_first_audio_ms

        # 16. total_turn_duration_ms / totalTurnMs = turn_complete - speech_start
        end_ref = self.turn_complete or self.tts_stop or self.first_tts_audio
        total_turn_duration_ms = diff_ms(end_ref, self.speech_start, "totalTurnDurationMs")
        total_turn_ms = total_turn_duration_ms

        return {
            "turnId": self.active_turn_id,
            "turnIndex": self.turn_count,
            "responseLatencyMs": response_latency_ms,
            "speechDurationMs": speech_duration_ms,
            "vadStopToUtteranceEndMs": vad_stop_to_utterance_end_ms,
            "utteranceEndToSttFinalMs": utterance_end_to_stt_final_ms,
            "vadStopToSttFinalMs": vad_stop_to_stt_final_ms,
            "speechStopToFinalTranscriptMs": speech_stop_to_final_transcript_ms,
            "speechStartToFirstPartialMs": speech_start_to_first_partial_ms,
            "sttFinalToAggregationMs": stt_final_to_aggregation_ms,
            "finalTranscriptToAggregationMs": final_transcript_to_aggregation_ms,
            "aggregationToLlmStartMs": aggregation_to_llm_start_canonical,
            "aggregationToLLMStartMs": aggregation_to_llm_start_canonical,
            "aggregationToLLMRequestMs": aggregation_to_llm_request_ms,
            "llmContextToRequestMs": llm_context_to_request_ms,
            "llmHttpRequestMs": llm_http_request_ms,
            "llmProviderToFirstOutputMs": llm_provider_to_first_output_ms,
            "providerToFirstOutputMs": llm_provider_to_first_output_ms,
            "llmToFirstOutputMs": llm_to_first_output_ms,
            "llmStartToFirstOutputMs": llm_start_to_first_output_ms,
            "llmRequestToFirstOutputMs": llm_request_to_first_output_ms,
            "llmToFirstToolDeltaMs": llm_to_first_tool_delta_ms,
            "userStopToFirstToolDeltaMs": user_stop_to_first_tool_delta_ms,
            "firstToolDeltaToToolCompleteMs": first_tool_delta_to_tool_complete_ms,
            "toolDeltaCount": self.tool_delta_count,
            "earlyAckSentToFirstAudioMs": early_ack_sent_to_first_audio_ms,
            "userStopToEarlyAckFirstAudioMs": user_stop_to_early_ack_first_audio_ms,
            "toolCallCompleteToExecutionStartMs": tool_call_complete_to_execution_start_ms,
            "llmFirstTextToReleaseMs": llm_first_text_to_release_ms,
            "llmFirstTextToTtsStartMs": llm_first_text_to_tts_start_ms,
            "llmFirstOutputToTtsStartMs": llm_first_output_to_tts_start_ms,
            "llmToTTSStartMs": llm_to_tts_start_ms,
            "firstLLMOutputToFirstAudioMs": first_llm_output_to_first_audio_ms,
            "llmFirstTextToFirstAudioMs": llm_first_text_to_first_audio_ms,
            "toolDurationMs": tool_duration_ms,
            "toolExecutionMs": tool_duration_ms,
            "tools": tools_list if tools_list else None,
            "firstOutputToToolStartMs": first_output_to_tool_start_ms,
            "toolResultToPostToolLlmStartMs": tool_result_to_post_tool_llm_start_ms,
            "toolResultToPostToolLLMMs": tool_result_to_post_tool_llm_start_ms,
            "postToolLlmToFirstOutputMs": post_tool_llm_to_first_output_ms,
            "postToolLlmMs": post_tool_llm_ms,
            "postToolLLMToTTSMs": post_tool_llm_to_tts_ms,
            "postToolOutputToTTSMs": post_tool_llm_to_tts_ms,
            "postToolTTSToFirstAudioMs": post_tool_tts_to_first_audio_ms,
            "toolResultToFirstAudioMs": tool_result_to_first_audio_ms,
            "ttsStartToFirstAudioMs": tts_start_to_first_audio_ms,
            "ttsConnectionMs": tts_connection_ms,
            "userStopToFirstAudioMs": user_stop_to_first_audio_ms,
            "speechStopToFirstAudioMs": speech_stop_to_first_audio_ms,
            "aggregationToFirstAudioMs": aggregation_to_first_audio_ms,
            "totalTurnDurationMs": total_turn_duration_ms,
            "totalTurnMs": total_turn_ms,
            "interrupted": self.interrupted,
            "events": list(self.active_turn_events),
            "phoneTrace": self.active_phone_trace,
        }

    def emit_turn_metrics_log(self) -> Dict[str, Any]:

        """Emits a single compact structured log line for the completed turn and records it."""
        if self.speech_start is None and self.tts_start is None and self.first_llm_output is None:
            return {}
        metrics = self.calculate_metrics()
        if not self._emitted:
            self._emitted = True
            self.completed_turns.append(metrics)
            compact_metrics = {
                k: v for k, v in metrics.items()
                if v is not None or k in ("turnId", "responseLatencyMs", "totalTurnDurationMs")
            }
            logger.info(f"[TURN_METRICS] {json.dumps(compact_metrics, separators=(',', ':'))}")
        return metrics

    def emit_llm_ttft_audit_log(
        self,
        model: str = "sarvam-105b-conversations",
        message_count: Optional[int] = None,
        estimated_prompt_tokens: Optional[int] = None,
        tool_count: Optional[int] = None,
        tool_payload_bytes: Optional[int] = None,
        rag_context_bytes: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Emits structured [LLM_TTFT_AUDIT] telemetry for Phase 14A observation."""
        metrics = self.calculate_metrics()
        ttft_ms = metrics.get("llmToFirstOutputMs")
        category = "simple"
        if self.tool_executions:
            tool_names = [t.tool_name for t in self.tool_executions]
            if "query_knowledge_base" in tool_names:
                category = "rag"
            elif "create_callback_lead" in tool_names:
                category = "lead_tool"
            elif "book_appointment" in tool_names:
                category = "appointment_tool"
            else:
                category = "tool"

        audit_payload = {
            "turnId": self.active_turn_id,
            "category": category,
            "ttftMs": ttft_ms,
            "messageCount": message_count,
            "estimatedPromptTokens": estimated_prompt_tokens,
            "toolCount": tool_count,
            "toolPayloadBytes": tool_payload_bytes,
            "ragContextBytes": rag_context_bytes,
            "model": model,
            "streaming": True,
        }
        compact_audit = {k: v for k, v in audit_payload.items() if v is not None}
        logger.info(f"[LLM_TTFT_AUDIT] {json.dumps(compact_audit, separators=(',', ':'))}")
        return audit_payload

    def emit_call_baseline_summary(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """Calculates and emits a single compact call-level performance baseline summary."""
        identifier = session_id or self.stream_id
        total_turns = len(self.completed_turns)
        successful_turns = sum(1 for t in self.completed_turns if not t.get("interrupted", False))
        interrupted_turns = sum(1 for t in self.completed_turns if t.get("interrupted", False))
        tool_turns = sum(1 for t in self.completed_turns if t.get("toolDurationMs") is not None)

        def calc_percentiles(vals: List[int]):
            if not vals:
                return None, None, None
            sorted_v = sorted(vals)
            n = len(sorted_v)
            max_v = sorted_v[-1]
            if n < 3:
                return None, None, max_v
            mid = n // 2
            p50_v = sorted_v[mid] if n % 2 != 0 else round((sorted_v[mid - 1] + sorted_v[mid]) / 2)
            p90_idx = min(n - 1, math.ceil(0.90 * n) - 1)
            p90_v = sorted_v[p90_idx]
            return p50_v, p90_v, max_v

        valid_latencies = [
            t["responseLatencyMs"] for t in self.completed_turns
            if t.get("responseLatencyMs") is not None and isinstance(t["responseLatencyMs"], (int, float))
        ]
        p50, p90, max_latency = calc_percentiles(valid_latencies)

        tool_latencies = [
            t["responseLatencyMs"] for t in self.completed_turns
            if t.get("toolDurationMs") is not None and t.get("responseLatencyMs") is not None and isinstance(t["responseLatencyMs"], (int, float))
        ]
        tool_p50, tool_p90, tool_max = calc_percentiles(tool_latencies)

        non_tool_latencies = [
            t["responseLatencyMs"] for t in self.completed_turns
            if t.get("toolDurationMs") is None and t.get("responseLatencyMs") is not None and isinstance(t["responseLatencyMs"], (int, float))
        ]
        non_tool_p50, non_tool_p90, non_tool_max = calc_percentiles(non_tool_latencies)

        total_call_duration_ms = round((time.perf_counter() - self.session_start_time) * 1000)

        summary = {
            "sessionId": identifier,
            "totalTurns": total_turns,
            "successfulTurns": successful_turns,
            "interruptedTurns": interrupted_turns,
            "toolTurns": tool_turns,
            "responseLatencyP50Ms": p50,
            "responseLatencyP90Ms": p90,
            "responseLatencyMaxMs": max_latency,
            "toolLatencyP50Ms": tool_p50,
            "toolLatencyP90Ms": tool_p90,
            "toolLatencyMaxMs": tool_max,
            "nonToolLatencyP50Ms": non_tool_p50,
            "nonToolLatencyP90Ms": non_tool_p90,
            "nonToolLatencyMaxMs": non_tool_max,
            "totalCallDurationMs": total_call_duration_ms,
        }

        compact_summary = {
            k: v for k, v in summary.items()
            if v is not None or k in ("sessionId", "totalTurns", "totalCallDurationMs")
        }
        logger.info(f"[CALL_BASELINE] {json.dumps(compact_summary, separators=(',', ':'))}")
        return summary


class StartupTimingTracker:
    """Measures high-resolution monotonic timestamps across all call startup stages."""

    def __init__(self, stream_id: Optional[str] = None, start_time_monotonic: Optional[float] = None):
        self.stream_id = stream_id or "stream_unknown"
        self._emitted = False
        self.start_time_monotonic: float = start_time_monotonic if start_time_monotonic is not None else time.perf_counter()
        self.events: List[Dict[str, Any]] = []

        # Monotonic timestamps (time.perf_counter())
        self.call_start: Optional[float] = self.start_time_monotonic
        self.websocket_handler_entered: Optional[float] = None
        self.websocket_accept: Optional[float] = None
        self.websocket_accepted: Optional[float] = None
        self.plivo_start_received: Optional[float] = None
        self.start_frame_received: Optional[float] = None
        self.deployment_id_resolved: Optional[float] = None
        self.runtime_config_request_start: Optional[float] = None
        self.runtime_config_response: Optional[float] = None
        self.runtime_config_resolved: Optional[float] = None
        self.call_session_request_start: Optional[float] = None
        self.call_session_response: Optional[float] = None
        self.call_session_created: Optional[float] = None
        self.stt_service_create_start: Optional[float] = None
        self.stt_service_created: Optional[float] = None
        self.tts_service_create_start: Optional[float] = None
        self.tts_connection_start: Optional[float] = None
        self.tts_service_created: Optional[float] = None
        self.tts_connect_start: Optional[float] = None
        self.tts_connected: Optional[float] = None
        self.tool_registry_start: Optional[float] = None
        self.tool_registry_resolved: Optional[float] = None
        self.temporal_context_start: Optional[float] = None
        self.temporal_context_ready: Optional[float] = None
        self.llm_service_create_start: Optional[float] = None
        self.llm_service_created: Optional[float] = None
        self.pipeline_construct_start: Optional[float] = None
        self.pipeline_created: Optional[float] = None
        self.pipeline_start: Optional[float] = None
        self.pipeline_started: Optional[float] = None
        self.pipeline_runner_started: Optional[float] = None
        self.stt_ready: Optional[float] = None
        self.stt_connected: Optional[float] = None
        self.tts_ready: Optional[float] = None
        self.greeting_queue_start: Optional[float] = None
        self.greeting_queued: Optional[float] = None
        self.greeting_tts_started: Optional[float] = None
        self.greeting_first_audio: Optional[float] = None
        self.first_greeting_audio: Optional[float] = None
        self.greeting_completed: Optional[float] = None
        self.output_audio_frame: Optional[float] = None
        self.first_audio_sent_to_plivo: Optional[float] = None
        self.greeting_first_audio_sent_to_plivo: Optional[float] = None
        self.websocket_output_write_if_available: Optional[float] = None
        self.caller_ready: Optional[float] = None

    def record_stage(self, stage_name: str, ts: Optional[float] = None, **fields: Any):
        now = ts if ts is not None else time.perf_counter()

        # Idempotent latching for startup milestones: first event latches, subsequent events do not overwrite or duplicate events
        if stage_name in ("tts_ready", "tts_connected"):
            if self.tts_ready is not None:
                return
            self.tts_ready = now
            self.tts_connected = now
        elif stage_name in ("greeting_first_audio", "first_greeting_audio"):
            if self.greeting_first_audio is not None:
                return
            self.greeting_first_audio = now
            self.first_greeting_audio = now
        elif stage_name in ("first_audio_sent_to_plivo", "greeting_first_audio_sent_to_plivo"):
            if self.first_audio_sent_to_plivo is not None:
                return
            self.first_audio_sent_to_plivo = now
            self.greeting_first_audio_sent_to_plivo = now
        elif stage_name == "output_audio_frame":
            if self.output_audio_frame is not None:
                return
            self.output_audio_frame = now
        elif stage_name == "caller_ready":
            if self.caller_ready is not None:
                return
            self.caller_ready = now
        elif hasattr(self, stage_name):
            setattr(self, stage_name, now)

        # Sync aliases & reciprocal fields
        if stage_name == "websocket_accepted" and self.websocket_accept is None:
            self.websocket_accept = now
        elif stage_name == "websocket_accept" and self.websocket_accepted is None:
            self.websocket_accepted = now
        elif stage_name == "runtime_config_resolved" and self.runtime_config_response is None:
            self.runtime_config_response = now
        elif stage_name == "runtime_config_response" and self.runtime_config_resolved is None:
            self.runtime_config_resolved = now
        elif stage_name == "call_session_created" and self.call_session_response is None:
            self.call_session_response = now
        elif stage_name == "call_session_response" and self.call_session_created is None:
            self.call_session_created = now
        elif stage_name == "pipeline_runner_started" and self.pipeline_started is None:
            self.pipeline_started = now
            self.pipeline_start = now
        elif stage_name == "pipeline_started" and self.pipeline_runner_started is None:
            self.pipeline_runner_started = now
            self.pipeline_start = now
        elif stage_name == "pipeline_start":
            self.pipeline_started = now
            self.pipeline_runner_started = now
        elif stage_name == "stt_connected" and self.stt_ready is None:
            self.stt_ready = now
        elif stage_name == "stt_ready" and self.stt_connected is None:
            self.stt_connected = now
        elif stage_name == "tts_service_create_start":
            self.tts_service_create_start = now
            if self.tts_connection_start is None:
                self.tts_connection_start = now
        elif stage_name == "tts_connection_start":
            if self.tts_service_create_start is None:
                self.tts_service_create_start = now
        elif stage_name == "tts_connect_start":
            self.tts_connect_start = now
        
        elapsed_ms = round((now - self.start_time_monotonic) * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        event_payload = {
            "event": stage_name,
            "timestamp": now_iso,
            "monotonicTimestamp": round(now, 6),
            "elapsedFromCallStartMs": max(0, elapsed_ms),
            **fields,
        }
        self.events.append(event_payload)
        logger.info(f"[CALL_STARTUP_EVENT] {stage_name}: {elapsed_ms}ms from start")

    def calculate_breakdown(self) -> Dict[str, Any]:
        """Calculates all isolated startup latency stages in milliseconds directly from monotonic timestamps."""
        def diff_ms(t_end: Optional[float], t_start: Optional[float]) -> Optional[int]:
            if t_end is not None and t_start is not None:
                delta = t_end - t_start
                return round(delta * 1000) if delta >= 0 else None
            return None

        # Authoritative monotonic boundaries
        ws_accept = self.websocket_accepted or self.websocket_accept or self.start_time_monotonic
        plivo_start = self.plivo_start_received
        start_frame = self.start_frame_received or plivo_start
        cfg_req = self.runtime_config_request_start
        cfg_resp = self.runtime_config_response or self.runtime_config_resolved
        sess_req = self.call_session_request_start
        sess_resp = self.call_session_response or self.call_session_created
        pipe_start_construct = self.pipeline_construct_start
        pipe_created = self.pipeline_created
        stt_ready = self.stt_ready or self.stt_connected
        tts_ready = self.tts_ready or self.tts_connected
        greet_queued = self.greeting_queued
        greet_tts_started = self.greeting_tts_started
        greet_first_audio = self.greeting_first_audio or self.first_greeting_audio

        # Stage deltas
        ws_to_plivo_start = diff_ms(plivo_start, ws_accept)
        plivo_start_to_start_frame = diff_ms(start_frame, plivo_start)
        start_frame_to_runtime_cfg = diff_ms(cfg_resp or cfg_req, start_frame or plivo_start)
        runtime_cfg_ms = diff_ms(cfg_resp, cfg_req)
        runtime_cfg_to_call_sess = diff_ms(sess_resp or sess_req, cfg_resp)
        call_session_ms = diff_ms(sess_resp, sess_req)
        
        earliest_service = min(
            [t for t in (self.stt_service_created, self.tts_service_created, self.llm_service_created) if t is not None],
            default=None
        )
        call_sess_to_services = diff_ms(earliest_service, sess_resp)
        services_to_pipeline = diff_ms(pipe_created, earliest_service)
        call_sess_to_pipeline = diff_ms(pipe_created or pipe_start_construct, sess_resp)
        pipeline_construction_ms = diff_ms(pipe_created, pipe_start_construct)
        pipeline_to_stt_ready = diff_ms(stt_ready, pipe_created)
        pipeline_to_tts_ready = diff_ms(tts_ready, pipe_created)
        if greet_queued is not None and tts_ready is not None:
            if greet_queued >= tts_ready:
                tts_ready_to_greeting_queued = diff_ms(greet_queued, tts_ready)
            else:
                tts_ready_to_greeting_queued = 0
        else:
            tts_ready_to_greeting_queued = diff_ms(greet_queued, tts_ready or pipe_created)
        greeting_queued_to_tts_start = diff_ms(greet_tts_started, greet_queued)
        greeting_tts_start_to_first_audio = diff_ms(greet_first_audio, greet_tts_started)
        greeting_queue_to_first_audio = diff_ms(greet_first_audio, greet_queued)
        pickup_to_first_greeting_audio = diff_ms(greet_first_audio, ws_accept or self.call_start)

        # Phase 18C required direct monotonic stage differences
        websocket_accept_to_plivo_start_ms = ws_to_plivo_start
        plivo_start_to_runtime_config_ms = diff_ms(cfg_resp, plivo_start)
        runtime_config_to_pipeline_ms = diff_ms(pipe_created or pipe_start_construct, cfg_resp)
        pipeline_to_tts_ready_ms = pipeline_to_tts_ready
        tts_ready_to_greeting_queue_ms = tts_ready_to_greeting_queued
        greeting_queue_to_first_audio_ms = greeting_queue_to_first_audio
        plivo_start_to_first_greeting_audio_ms = diff_ms(greet_first_audio, plivo_start)
        websocket_accept_to_first_greeting_audio_ms = diff_ms(greet_first_audio, ws_accept)
        call_start_to_first_greeting_audio_ms = diff_ms(greet_first_audio, self.call_start)

        return {
            "pickupToWebsocketMs": diff_ms(ws_accept, self.call_start or self.start_time_monotonic),
            "websocketAcceptToPlivoStartMs": ws_to_plivo_start,
            "websocketToStartFrameMs": ws_to_plivo_start,
            "plivoStartToStartFrameMs": plivo_start_to_start_frame,
            "startFrameToRuntimeConfigMs": start_frame_to_runtime_cfg,
            "runtimeConfigMs": runtime_cfg_ms,
            "runtimeConfigToCallSessionMs": runtime_cfg_to_call_sess,
            "callSessionMs": call_session_ms,
            "callSessionToServicesMs": call_sess_to_services,
            "servicesToPipelineMs": services_to_pipeline,
            "callSessionToPipelineMs": call_sess_to_pipeline,
            "pipelineConstructionMs": pipeline_construction_ms,
            "pipelineToSTTReadyMs": pipeline_to_stt_ready,
            "pipelineToTTSReadyMs": pipeline_to_tts_ready,
            "ttsReadyToGreetingQueuedMs": tts_ready_to_greeting_queued,
            "greetingQueuedToTTSStartMs": greeting_queued_to_tts_start,
            "greetingTTSStartToFirstAudioMs": greeting_tts_start_to_first_audio,
            "greetingQueuedToFirstAudioMs": greeting_queue_to_first_audio,
            "pickupToFirstGreetingAudioMs": pickup_to_first_greeting_audio,
            # Phase 18C canonical keys
            "websocket_accept_to_plivo_start_ms": websocket_accept_to_plivo_start_ms,
            "plivo_start_to_runtime_config_ms": plivo_start_to_runtime_config_ms,
            "runtime_config_to_pipeline_ms": runtime_config_to_pipeline_ms,
            "pipeline_to_tts_ready_ms": pipeline_to_tts_ready_ms,
            "tts_ready_to_greeting_queue_ms": tts_ready_to_greeting_queue_ms,
            "greeting_queue_to_first_audio_ms": greeting_queue_to_first_audio_ms,
            "plivo_start_to_first_greeting_audio_ms": plivo_start_to_first_greeting_audio_ms,
            "websocket_accept_to_first_greeting_audio_ms": websocket_accept_to_first_greeting_audio_ms,
            "call_start_to_first_greeting_audio_ms": call_start_to_first_greeting_audio_ms,
        }

    def calculate_metrics(self) -> Dict[str, Any]:
        breakdown = self.calculate_breakdown()
        return {
            "streamId": self.stream_id,
            "websocketAcceptToPlivoStartMs": breakdown["websocketAcceptToPlivoStartMs"],
            "plivoStartToStartFrameMs": breakdown["plivoStartToStartFrameMs"],
            "startFrameToRuntimeConfigMs": breakdown["startFrameToRuntimeConfigMs"],
            "runtimeConfigMs": breakdown["runtimeConfigMs"],
            "runtimeConfigToCallSessionMs": breakdown["runtimeConfigToCallSessionMs"],
            "callSessionMs": breakdown["callSessionMs"],
            "callSessionToServicesMs": breakdown["callSessionToServicesMs"],
            "servicesToPipelineMs": breakdown["servicesToPipelineMs"],
            "callSessionToPipelineMs": breakdown["callSessionToPipelineMs"],
            "pipelineConstructionMs": breakdown["pipelineConstructionMs"],
            "pipelineToSttReadyMs": breakdown["pipelineToSTTReadyMs"],
            "pipelineToTtsReadyMs": breakdown["pipelineToTTSReadyMs"],
            "ttsReadyToGreetingQueuedMs": breakdown["ttsReadyToGreetingQueuedMs"],
            "greetingQueuedToTTSStartMs": breakdown["greetingQueuedToTTSStartMs"],
            "greetingTTSStartToFirstAudioMs": breakdown["greetingTTSStartToFirstAudioMs"],
            "greetingQueueToFirstAudioMs": breakdown["greetingQueuedToFirstAudioMs"],
            "totalCallStartupToFirstAudioMs": breakdown["pickupToFirstGreetingAudioMs"],
            "pickupToFirstGreetingAudioMs": breakdown["pickupToFirstGreetingAudioMs"],
            # Phase 18C canonical keys
            "websocket_accept_to_plivo_start_ms": breakdown["websocket_accept_to_plivo_start_ms"],
            "plivo_start_to_runtime_config_ms": breakdown["plivo_start_to_runtime_config_ms"],
            "runtime_config_to_pipeline_ms": breakdown["runtime_config_to_pipeline_ms"],
            "pipeline_to_tts_ready_ms": breakdown["pipeline_to_tts_ready_ms"],
            "tts_ready_to_greeting_queue_ms": breakdown["tts_ready_to_greeting_queue_ms"],
            "greeting_queue_to_first_audio_ms": breakdown["greeting_queue_to_first_audio_ms"],
            "plivo_start_to_first_greeting_audio_ms": breakdown["plivo_start_to_first_greeting_audio_ms"],
            "websocket_accept_to_first_greeting_audio_ms": breakdown["websocket_accept_to_first_greeting_audio_ms"],
            "call_start_to_first_greeting_audio_ms": breakdown["call_start_to_first_greeting_audio_ms"],
            "breakdown": breakdown,
            "events": list(self.events),
            "stages": {
                "callStart": self.call_start,
                "websocketHandlerEntered": self.websocket_handler_entered,
                "websocketAccept": self.websocket_accept,
                "websocketAccepted": self.websocket_accepted,
                "plivoStartReceived": self.plivo_start_received,
                "startFrameReceived": self.start_frame_received,
                "deploymentIdResolved": self.deployment_id_resolved,
                "runtimeConfigRequestStart": self.runtime_config_request_start,
                "runtimeConfigResponse": self.runtime_config_response,
                "runtimeConfigResolved": self.runtime_config_resolved,
                "callSessionRequestStart": self.call_session_request_start,
                "callSessionResponse": self.call_session_response,
                "callSessionCreated": self.call_session_created,
                "sttServiceCreateStart": self.stt_service_create_start,
                "sttServiceCreated": self.stt_service_created,
                "ttsServiceCreateStart": self.tts_service_create_start,
                "ttsConnectionStart": self.tts_connection_start,
                "ttsServiceCreated": self.tts_service_created,
                "ttsConnectStart": self.tts_connect_start,
                "ttsConnected": self.tts_connected,
                "toolRegistryStart": self.tool_registry_start,
                "toolRegistryResolved": self.tool_registry_resolved,
                "temporalContextStart": self.temporal_context_start,
                "temporalContextReady": self.temporal_context_ready,
                "llmServiceCreateStart": self.llm_service_create_start,
                "llmServiceCreated": self.llm_service_created,
                "pipelineConstructStart": self.pipeline_construct_start,
                "pipelineCreated": self.pipeline_created,
                "pipelineStart": self.pipeline_start,
                "pipelineStarted": self.pipeline_started,
                "pipelineRunnerStarted": self.pipeline_runner_started,
                "sttReady": self.stt_ready,
                "sttConnected": self.stt_connected,
                "ttsReady": self.tts_ready,
                "greetingQueueStart": self.greeting_queue_start,
                "greetingQueued": self.greeting_queued,
                "greetingTtsStarted": self.greeting_tts_started,
                "greetingFirstAudio": self.greeting_first_audio,
                "greetingCompleted": self.greeting_completed,
                "firstGreetingAudio": self.first_greeting_audio,
                "outputAudioFrame": self.output_audio_frame,
                "websocketOutputWriteIfAvailable": self.websocket_output_write_if_available,
                "callerReady": self.caller_ready,
            }
        }

    def emit_startup_metrics_log(self) -> Dict[str, Any]:
        """Emits ONE compact structured log line for call startup metrics."""
        metrics = self.calculate_metrics()
        if not self._emitted:
            self._emitted = True
            compact = {
                "streamId": metrics["streamId"],
                "websocketAcceptToPlivoStartMs": metrics["websocketAcceptToPlivoStartMs"],
                "plivoStartToRuntimeConfigMs": metrics["startFrameToRuntimeConfigMs"],
                "runtimeConfigToCallSessionMs": metrics["runtimeConfigToCallSessionMs"],
                "callSessionToPipelineMs": metrics["callSessionToPipelineMs"],
                "pipelineToSttReadyMs": metrics["pipelineToSttReadyMs"],
                "pipelineToTtsReadyMs": metrics["pipelineToTtsReadyMs"],
                "greetingQueueToFirstAudioMs": metrics["greetingQueueToFirstAudioMs"],
                "totalCallStartupToFirstAudioMs": metrics["totalCallStartupToFirstAudioMs"],
            }
            logger.info(f"[CALL_STARTUP_METRICS] {json.dumps(compact, separators=(',', ':'))}")
        return metrics


def build_unified_call_timeline(
    startup_tracker: Optional[StartupTimingTracker] = None,
    turn_tracker: Optional[TurnTimingTracker] = None,
) -> List[Dict[str, Any]]:
    """Merges startup and turn trace events into a single, ordered, non-fabricated timeline."""
    raw_events: List[Dict[str, Any]] = []
    if startup_tracker and startup_tracker.events:
        for evt in startup_tracker.events:
            raw_events.append({
                "type": "STARTUP",
                **evt,
            })
    if turn_tracker and turn_tracker.trace_events:
        for evt in turn_tracker.trace_events:
            raw_events.append({
                "type": "TURN",
                **evt,
            })

    # Sort strictly by monotonicTimestamp
    raw_events.sort(key=lambda x: x.get("monotonicTimestamp", 0.0))
    return raw_events

