"""NextLite Pipecat Call Lifecycle & Metadata Module.

Provides deterministic helpers for:
1. Call direction and caller number detection (WEB_TEST vs OUTBOUND vs INBOUND)
2. Sensitive data masking (PII & secrets)
3. Plain-text transcript formatting from debug turns
4. Per-call isolated diagnostic turn trace collection (CallTranscriptCollector)
5. TrustedCallContext encapsulation
"""

import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class TrustedCallContext:
    """Per-call immutable context established after authoritative session creation.
    
    This context is strictly server-derived and immutable with respect to caller/LLM input.
    """
    call_session_id: str
    deployment_id: str
    tenant_id: str
    agent_id: str
    caller_phone: Optional[str]
    direction: str
    start_time: float
    started_at_iso: str


def detect_call_context(
    room_name: Optional[str] = None,
    from_number: Optional[str] = None,
    participant_identity: Optional[str] = None,
    participant_attributes: Optional[Dict[str, str]] = None,
) -> Tuple[str, Optional[str]]:
    """Detects call direction and caller phone number based on room name and caller metadata.
    
    Rules:
    1. WEB_TEST:
       - roomName starts with 'test-' OR identity/from starts with 'tester-'
       - callerNumber is strictly None (no fabricated phone numbers)
    2. OUTBOUND:
       - roomName starts with 'phone-test-' OR identity starts with 'sip-' from outbound SIP flow
       - callerNumber extracted from identity (e.g. sip-+919876543210-1234) or attributes
    3. INBOUND:
       - Standard telephony inbound call
       - callerNumber extracted from from_number or attributes
    
    Returns:
        Tuple[str, Optional[str]]: (direction, caller_number)
    """
    clean_room = (room_name or "").strip()
    clean_identity = (participant_identity or "").strip()
    clean_from = (from_number or "").strip()

    # 1. WEB_TEST Detection
    if (
        clean_room.startswith("test-")
        or clean_identity.startswith("tester-")
        or clean_from.startswith("tester-")
    ):
        return "WEB_TEST", None

    # 2. OUTBOUND Detection
    if clean_room.startswith("phone-test-") or clean_identity.startswith("sip-"):
        phone: Optional[str] = None
        if participant_attributes and participant_attributes.get("sip.phoneNumber"):
            phone = participant_attributes["sip.phoneNumber"].strip()
        elif clean_identity.startswith("sip-"):
            match = re.match(r"^sip-([0-9+]+)-", clean_identity)
            if match and match.group(1):
                raw_num = match.group(1)
                phone = raw_num if raw_num.startswith("+") else f"+{raw_num}"
        elif clean_from:
            phone = clean_from

        return "OUTBOUND", phone

    # 3. INBOUND / Other SIP Detection
    inbound_phone: Optional[str] = None
    if participant_attributes:
        raw = (
            participant_attributes.get("sip.phoneNumber")
            or participant_attributes.get("sip.callerId")
            or participant_attributes.get("sip.trunkPhoneNumber")
            or participant_attributes.get("caller_id")
            or participant_attributes.get("phone_number")
        )
        if raw and isinstance(raw, str) and raw.strip():
            inbound_phone = raw.strip()

    if not inbound_phone and clean_from:
        inbound_phone = clean_from

    return "INBOUND", inbound_phone


def mask_sensitive(text: str) -> str:
    """Masks sensitive user personal info (e.g. 10-digit Indian phone numbers) and redacts secrets."""
    if not text or not isinstance(text, str):
        return text

    # Mask 10-digit Indian mobile numbers (e.g., 9876543210 -> ******3210, +919876543210 -> +91******3210)
    phone_regex = re.compile(r"(?:\+?91[\s-]?)?([6-9]\d{1})(\d{4})(\d{4})\b")
    masked = phone_regex.sub(lambda m: f"******{m.group(3)}", text)

    # Redact potential bearer tokens, secret keys, or passwords
    masked = re.sub(r"(?:Bearer\s+[A-Za-z0-9-_.]+)", "Bearer [REDACTED]", masked, flags=re.IGNORECASE)
    masked = re.sub(r"(?:api[_-]?key[:=]\s*[\"']?)[A-Za-z0-9-_.]+(?:[\"']?)", "apiKey=[REDACTED]", masked, flags=re.IGNORECASE)
    masked = re.sub(r"(?:password[:=]\s*[\"']?)[^\s\"']+(?:[\"']?)", "password=[REDACTED]", masked, flags=re.IGNORECASE)

    return masked


def format_plain_transcript(turns: List[Dict[str, Any]]) -> str:
    """Formats transcript text from debug turns into a readable plain-text representation.
    
    Format:
    User: <user utterance>
    Assistant: <assistant response>
    """
    lines: List[str] = []
    for turn in turns:
        user = turn.get("user")
        if isinstance(user, dict):
            transcript = user.get("transcript")
            if transcript and isinstance(transcript, str) and transcript.strip():
                lines.append(f"User: {transcript.strip()}")

        agent = turn.get("agent")
        if isinstance(agent, dict):
            response = agent.get("response")
            if response and isinstance(response, str) and response.strip():
                lines.append(f"Assistant: {response.strip()}")

    return "\n".join(lines)


class CallTranscriptCollector:
    """Per-call isolated turn trace collector for Pipecat calls.
    
    Accumulates user speech turns, assistant responses, and diagnostic metrics without
    module-level shared state.
    """

    def __init__(self):
        self._start_time_iso = datetime.now(timezone.utc).isoformat()
        self._end_time_iso: Optional[str] = None
        self._turns: List[Dict[str, Any]] = []
        self._errors: List[Dict[str, Any]] = []
        self._tools_used: List[str] = []
        self._current_turn: Optional[Dict[str, Any]] = None
        self._turn_counter = 0

    @property
    def turns(self) -> List[Dict[str, Any]]:
        return self._turns

    def get_turns(self) -> List[Dict[str, Any]]:
        return list(self._turns)

    @property
    def errors(self) -> List[Dict[str, Any]]:
        return self._errors

    def get_errors(self) -> List[Dict[str, Any]]:
        return list(self._errors)

    @property
    def tools_used(self) -> List[str]:
        return list(self._tools_used)

    def record_user_turn(
        self,
        transcript: str,
        detected_language: Optional[str] = None,
        created_at_iso: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Records a user speech turn."""
        clean_text = (transcript or "").strip()
        if not clean_text:
            return {}

        now_iso = created_at_iso or datetime.now(timezone.utc).isoformat()

        # Finalize previous turn if still open
        if self._current_turn and not self._current_turn.get("endTime"):
            self._current_turn["endTime"] = now_iso

        self._turn_counter += 1
        turn_id = self._turn_counter

        user_turn = {
            "transcript": mask_sensitive(clean_text),
            "detectedLanguage": detected_language or None,
            "timestamp": now_iso,
        }

        turn: Dict[str, Any] = {
            "turnId": turn_id,
            "startTime": now_iso,
            "user": user_turn,
            "tools": [],
        }

        self._current_turn = turn
        self._turns.append(turn)
        return turn

    def record_agent_message(
        self,
        response: str,
        active_language: Optional[str] = None,
        interrupted: bool = False,
        ttft_ms: Optional[float] = None,
        duration_ms: Optional[float] = None,
        created_at_iso: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Records an assistant spoken response."""
        clean_text = (response or "").strip()
        if not clean_text:
            return {}

        now_iso = created_at_iso or datetime.now(timezone.utc).isoformat()

        agent_turn: Dict[str, Any] = {
            "response": mask_sensitive(clean_text),
            "activeLanguage": active_language or "en-IN",
            "interrupted": interrupted,
            "timestamp": now_iso,
        }
        if ttft_ms is not None:
            agent_turn["ttftMs"] = round(ttft_ms, 1)
        if duration_ms is not None:
            agent_turn["durationMs"] = round(duration_ms, 1)

        if not self._current_turn:
            self._turn_counter += 1
            self._current_turn = {
                "turnId": self._turn_counter,
                "startTime": now_iso,
                "tools": [],
            }
            self._turns.append(self._current_turn)

        self._current_turn["agent"] = agent_turn
        self._current_turn["endTime"] = now_iso
        return self._current_turn

    def record_tool_call(
        self,
        tool_name: str,
        call_id: str,
        args: Any,
        success: bool = True,
        created_at_iso: Optional[str] = None,
    ) -> None:
        """Records an actual tool execution."""
        clean_name = (tool_name or "").strip()
        if clean_name and clean_name not in self._tools_used:
            self._tools_used.append(clean_name)

        now_iso = created_at_iso or datetime.now(timezone.utc).isoformat()
        tool_exec = {
            "toolName": clean_name or tool_name,
            "callId": call_id,
            "args": args if isinstance(args, dict) else {"raw": str(args)},
            "success": success,
            "executedAt": now_iso,
        }
        if self._current_turn:
            self._current_turn.setdefault("tools", []).append(tool_exec)

    def record_error(self, message: str, source: Optional[str] = None) -> None:
        """Records an error during session execution."""
        now_iso = datetime.now(timezone.utc).isoformat()
        err_item = {
            "timestamp": now_iso,
            "message": mask_sensitive(message),
            "source": source or "session",
        }
        self._errors.append(err_item)
        if self._current_turn:
            self._current_turn["error"] = err_item["message"]

    def end_call(self) -> Dict[str, Any]:
        """Ends call and produces summary."""
        self._end_time_iso = datetime.now(timezone.utc).isoformat()
        if self._current_turn and not self._current_turn.get("endTime"):
            self._current_turn["endTime"] = self._end_time_iso

        return {
            "startTime": self._start_time_iso,
            "endTime": self._end_time_iso,
            "totalTurns": len(self._turns),
            "turns": self._turns,
            "errors": self._errors,
        }
