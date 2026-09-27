"""Deterministic Application Workflow State Tracker for NextLite Pipecat Voice Worker.

Maintains authoritative application state across appointment booking, availability checking,
emergency escalations, and call lifecycle to eliminate prompt-based guessing, prevent duplicate questions,
and ensure tool truth authority.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from loguru import logger


@dataclass
class WorkflowState:
    """Authoritative deterministic workflow state for a single call session."""
    caller_phone: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    patient_name: Optional[str] = None
    patient_age: Optional[str] = None
    service_type: Optional[str] = None
    availability_checked: bool = False
    availability_result: Optional[str] = None
    booking_confirmed: bool = False
    booking_id: Optional[str] = None
    active_language: str = "en-IN"
    transfer_pending: bool = False
    end_call_pending: bool = False
    captured_fields: Dict[str, Any] = field(default_factory=dict)

    def update_from_tool(self, tool_name: str, args: Optional[Dict[str, Any]], result: Optional[Dict[str, Any]]) -> None:
        """Updates deterministic state from authoritative tool execution results."""
        args = args or {}
        result = result or {}

        if tool_name in ("check_available_slots", "check_slots"):
            if "date" in args and args["date"]:
                self.appointment_date = str(args["date"]).strip()
            if "time" in args and args["time"]:
                self.appointment_time = str(args["time"]).strip()
            self.availability_checked = True
            is_avail = bool(
                result.get("available")
                or result.get("isAvailable")
                or result.get("status") in ("available", "success")
            )
            self.availability_result = "AVAILABLE" if is_avail else "UNAVAILABLE"
            logger.info(
                f"[WorkflowState] Updated availability: date={self.appointment_date}, "
                f"time={self.appointment_time}, status={self.availability_result}"
            )

        elif tool_name in ("book_appointment", "book"):
            if "bookingDate" in args and args["bookingDate"]:
                self.appointment_date = str(args["bookingDate"]).strip()
            elif "date" in args and args["date"]:
                self.appointment_date = str(args["date"]).strip()

            if "bookingTime" in args and args["bookingTime"]:
                self.appointment_time = str(args["bookingTime"]).strip()
            elif "time" in args and args["time"]:
                self.appointment_time = str(args["time"]).strip()

            if "patientName" in args and args["patientName"]:
                self.patient_name = str(args["patientName"]).strip()
            if "patientAge" in args and args["patientAge"] is not None:
                self.patient_age = str(args["patientAge"]).strip()
            if "reasonForVisit" in args and args["reasonForVisit"]:
                self.service_type = str(args["reasonForVisit"]).strip()

            is_success = bool(
                result.get("success")
                or result.get("status") in ("success", "confirmed", "created")
                or result.get("appointmentNumber")
                or result.get("appointmentId")
                or result.get("id")
            )
            if is_success:
                self.booking_confirmed = True
                self.booking_id = (
                    result.get("appointmentNumber")
                    or result.get("appointmentId")
                    or result.get("id")
                    or result.get("bookingId")
                )
            logger.info(
                f"[WorkflowState] Updated booking: patient={self.patient_name}, "
                f"age={self.patient_age}, date={self.appointment_date}, time={self.appointment_time}, "
                f"confirmed={self.booking_confirmed}, id={self.booking_id}"
            )

        elif tool_name in ("transfer_call", "transfer_emergency_call"):
            self.transfer_pending = True
            logger.info("[WorkflowState] Updated call state: transfer_pending=True")

        elif tool_name in ("end_call", "hangup"):
            self.end_call_pending = True
            logger.info("[WorkflowState] Updated call state: end_call_pending=True")

    def update_language(self, language_code: str) -> None:
        """Updates active language tracking."""
        if language_code:
            self.active_language = language_code

    def to_compact_prompt_summary(self, lean_mode: bool = True) -> Optional[str]:
        """Renders a compact, high-density structured state summary for prompt injection."""
        if not lean_mode:
            return None

        has_state = bool(
            self.appointment_date
            or self.appointment_time
            or self.patient_name
            or self.patient_age
            or self.availability_checked
            or self.booking_confirmed
            or self.transfer_pending
        )
        if not has_state:
            return None

        lines = ["=== DETERMINISTIC WORKFLOW STATE ==="]
        patient_parts = []
        if self.patient_name:
            patient_parts.append(f"Name: {self.patient_name}")
        if self.patient_age:
            patient_parts.append(f"Age: {self.patient_age}")
        if patient_parts:
            lines.append(f"- Patient: {', '.join(patient_parts)}")

        appt_parts = []
        if self.appointment_date:
            appt_parts.append(f"Date: {self.appointment_date}")
        if self.appointment_time:
            appt_parts.append(f"Time: {self.appointment_time}")
        if self.availability_checked:
            appt_parts.append(f"Slot: {self.availability_result or 'Checked'}")
        if self.booking_confirmed:
            appt_parts.append(f"Booked: YES (ID: {self.booking_id or 'Confirmed'})")
        if appt_parts:
            lines.append(f"- Appointment: {', '.join(appt_parts)}")

        if self.transfer_pending:
            lines.append("- Call Transfer: In Progress (Live Doctor Bridge Active)")

        return "\n".join(lines)

    def get_missing_fields(self) -> List[str]:
        """Returns list of required booking fields still missing."""
        missing = []
        if not self.patient_name:
            missing.append("patient_name")
        if not self.appointment_date:
            missing.append("appointment_date")
        if not self.appointment_time:
            missing.append("appointment_time")
        return missing
