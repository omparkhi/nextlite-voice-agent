"""NextLite Pipecat Book Appointment Tool.

Connects strictly to NextLite Control Plane internal API (POST /api/internal/appointments).

Booking Semantics:
- Registers active upcoming appointments directly in the clinic system.
- Structured success or failure is returned to the LLM to provide natural conversational confirmation.
"""

from typing import TYPE_CHECKING, Any, Dict, Optional
import re
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.frames.frames import FunctionCallResultProperties, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.llm_service import FunctionCallParams
from app.temporal_context import is_past_date, is_past_slot, resolve_relative_or_absolute_date
from app.turn_timing import log_phone_trace
from app.dynamic_schedule_engine import is_time_within_shifts
from app.tools.indic_normalizers import (
    normalize_indic_age,
    normalize_indic_time,
    sanitize_service_title,
)

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

BOOK_APPOINTMENT_TOOL_NAME = "book_appointment"

APPOINTMENT_TOOL_PROPERTIES: Dict[str, Any] = {
    "customerName": {
        "type": "string",
        "description": "Full name of the person",
    },
    "bookingDate": {
        "type": "string",
        "description": "Date of appointment (YYYY-MM-DD or relative like tomorrow)",
    },
    "bookingTime": {
        "type": "string",
        "description": "Time of appointment strictly in standard format (e.g. 10:00 AM, 01:30 PM, 06:00 PM)",
    },
    "title": {
        "type": "string",
        "description": "Reason for visit or service type (e.g. 'Dental Checkup', 'General Consultation')",
    },
    "age": {
        "type": "string",
        "description": "Age of the person as numeric digits (e.g. '22')",
    },
    # "place": {
    #     "type": "string",
    #     "description": "Place, city, or location (e.g. 'Nagpur')",
    # },
}

APPOINTMENT_TOOL_REQUIRED = ["customerName", "title", "bookingDate", "bookingTime"]


def create_book_appointment_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    http_client: Optional[httpx.AsyncClient] = None,
    direct_response_enabled: bool = False,
    direct_response_language: str = "en-IN",
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for book_appointment bound to trusted context."""
    if not context.deployment_id or not context.deployment_id.strip():
        raise ValueError("[AppointmentTool] deployment_id is required in ToolRuntimeContext")

    trusted_deployment_id = context.deployment_id.strip()

    base_url = (context.api_url or "http://localhost:3001").rstrip("/")
    worker_secret = context.worker_secret or "dev-worker-api-secret"
    api_endpoint = f"{base_url}/api/internal/appointments"

    tool_description = (
        description_override.strip()
        if description_override and description_override.strip()
        else "Book an appointment for a patient. Registers an active upcoming appointment in the clinic system."
    )

    def direct_success_message(result: Dict[str, Any]) -> Optional[str]:
        """Build a clean, warm conversational confirmation in the caller's active language."""
        if not result.get("success"):
            return None
        language = (direct_response_language or "en-IN").lower()
        if language.startswith("mr"):
            return "तुमची अपॉइंटमेंट बुक झाली आहे. काही अडचण असल्यास नक्की सांगा!"
        if language.startswith("hi"):
            return "आपकी अपॉइंटमेंट बुक हो गई है। कोई और सहायता चाहिए तो बताइए!"
        if language.startswith("gu"):
            return "તમારી appointment book થઈ ગઈ છે. આભાર!"
        if language.startswith("ta"):
            return "உங்கள் appointment பதிவு செய்யப்பட்டது. நன்றி!"
        if language.startswith("te"):
            return "మీ appointment book చేయబడింది. ధన్యవాదాలు!"
        if language.startswith("kn"):
            return "ನಿಮ್ಮ appointment ಬುಕ್ ಆಗಿದೆ. ಧನ್ಯವಾದಗಳು!"
        if language.startswith("bn"):
            return "আপনার appointment book হয়ে গেছে। ধন্যবাদ!"
        return "Your appointment has been booked. Let me know if you need any other help!"

    async def deliver_result(params: FunctionCallParams, result: Dict[str, Any]) -> Dict[str, Any]:
        """Return an authoritative result to the LLM to generate a single natural confirmation."""
        if params.result_callback:
            await params.result_callback(result, properties=FunctionCallResultProperties(run_llm=True))
        return result

    async def handle_book_appointment(params: FunctionCallParams) -> Dict[str, Any]:
        await context.ensure_call_session_id()
        trusted_call_session_id = context.call_session_id.strip() if context.call_session_id else None
        trusted_caller_phone = context.caller_phone.strip() if context.caller_phone else None

        raw_args = params.arguments or {}
        if not isinstance(raw_args, dict):
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": "Invalid appointment request details: arguments must be a JSON object.",
            }
            return await deliver_result(params, failure_result)

        # 1. Validate required fields
        raw_name = raw_args.get("customerName")
        raw_title = raw_args.get("title")
        raw_date = raw_args.get("bookingDate")
        raw_time = raw_args.get("bookingTime")

        missing_fields = []
        if not raw_name or not isinstance(raw_name, str) or not raw_name.strip():
            missing_fields.append("customerName")
        if not raw_title or not isinstance(raw_title, str) or not raw_title.strip():
            missing_fields.append("title")
        if not raw_date or not isinstance(raw_date, str) or not raw_date.strip():
            missing_fields.append("bookingDate")
        if not raw_time or not isinstance(raw_time, str) or not raw_time.strip():
            missing_fields.append("bookingTime")

        if missing_fields:
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": f"Missing required appointment details: {', '.join(missing_fields)}.",
            }
            return await deliver_result(params, failure_result)

        customer_name = str(raw_name).strip()
        title = sanitize_service_title(raw_title)
        raw_booking_date = str(raw_date).strip()
        booking_time = normalize_indic_time(raw_time)

        # Check for past date and time slot protection against authoritative real-time clock
        tz_name = getattr(context, "timezone", None)
        if is_past_slot(raw_booking_date, booking_time, time_zone=tz_name):
            logger.warning(
                f"[AppointmentTool] Rejected past appointment slot: date='{raw_booking_date}', time='{booking_time}' in timezone={tz_name or 'Asia/Kolkata'}"
            )
            failure_result = {
                "success": False,
                "error": "PAST_SLOT_NOT_ALLOWED",
                "message": (
                    f"The requested appointment slot '{booking_time}' on '{raw_booking_date}' has already passed. "
                    "Please offer the caller an upcoming future time slot today or tomorrow."
                ),
            }
            return await deliver_result(params, failure_result)

        # Check against shift boundaries / break hours
        biz_hours = getattr(context, "business_hours", None)
        if biz_hours and not is_time_within_shifts(booking_time, biz_hours):
            logger.warning(
                f"[AppointmentTool] Rejected appointment slot during break/closed hours: time='{booking_time}', business_hours='{biz_hours}'"
            )
            failure_result = {
                "success": False,
                "error": "SLOT_OUTSIDE_BUSINESS_HOURS",
                "message": (
                    f"The requested appointment slot '{booking_time}' falls during closed or afternoon break hours in configured clinic schedule. "
                    "Please offer the caller an open time slot during clinic operating hours."
                ),
            }
            return await deliver_result(params, failure_result)

        # Normalize relative/natural date to standard YYYY-MM-DD
        normalized_date = resolve_relative_or_absolute_date(raw_booking_date, time_zone=tz_name)
        booking_date = normalized_date if normalized_date else raw_booking_date

        # 2. Resolve caller phone: ALWAYS prioritize trusted telephony callerPhone metadata
        raw_phone = raw_args.get("customerPhone") or raw_args.get("phone")
        turn_id = context.timing_tracker.active_turn_id if context.timing_tracker else "unknown"
        log_phone_trace("tool_argument_received", turn_id, raw_phone)

        # Phone number comes from trusted telephony call metadata, never conversationally requested
        candidate_phone = None
        if trusted_caller_phone and isinstance(trusted_caller_phone, str) and trusted_caller_phone.strip():
            candidate_phone = trusted_caller_phone.strip()
        elif raw_phone and isinstance(raw_phone, str) and raw_phone.strip():
            candidate_phone = raw_phone.strip()

        if candidate_phone and candidate_phone != "+910000000000":
            clean_digits = re.sub(r"[^\d+]", "", candidate_phone)
            if clean_digits.startswith("+"):
                effective_phone = clean_digits
            elif len(clean_digits) == 10:
                effective_phone = f"+91{clean_digits}"
            elif len(clean_digits) == 12 and clean_digits.startswith("91"):
                effective_phone = f"+{clean_digits}"
            elif len(clean_digits) == 11 and clean_digits.startswith("0"):
                effective_phone = f"+91{clean_digits[1:]}"
            else:
                effective_phone = clean_digits
        else:
            effective_phone = candidate_phone or "+910000000000"

        log_phone_trace("control_plane_payload", turn_id, effective_phone)

        # 3. Assemble API payload strictly with trusted identity fields & status = REQUESTED
        payload: Dict[str, Any] = {
            "deploymentId": trusted_deployment_id,
            "customerName": customer_name,
            "customerPhone": effective_phone,
            "title": title,
            "bookingDate": booking_date,
            "bookingTime": booking_time,
            "status": "REQUESTED",
            "bookedBy": "AGENT",
            "bookedByName": "AI Voice Assistant",
        }
        if biz_hours:
            payload["businessHours"] = biz_hours
        if getattr(context, "slot_duration", None):
            payload["slotDuration"] = context.slot_duration
        if context.tenant_id:
            payload["tenantId"] = context.tenant_id
        if context.agent_id:
            payload["agentId"] = context.agent_id
        if trusted_call_session_id:
            payload["callSessionId"] = trusted_call_session_id

        raw_age = raw_args.get("age")
        normalized_age = normalize_indic_age(raw_age)
        if normalized_age:
            payload["age"] = normalized_age

        raw_place = raw_args.get("place") or raw_args.get("location")
        if raw_place and str(raw_place).strip():
            payload["place"] = str(raw_place).strip()

        raw_resource = raw_args.get("resourceName")
        if raw_resource and isinstance(raw_resource, str) and raw_resource.strip():
            payload["resourceName"] = raw_resource.strip()

        raw_notes = raw_args.get("notes")
        if raw_notes and isinstance(raw_notes, str) and raw_notes.strip():
            payload["notes"] = raw_notes.strip()

        raw_meta = raw_args.get("metadata")
        if raw_meta and isinstance(raw_meta, dict) and len(raw_meta) > 0:
            payload["metadata"] = raw_meta

        headers = {
            "x-worker-secret": worker_secret,
            "Authorization": f"Bearer {worker_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # 4. Perform authenticated HTTP call to NextLite Control Plane
        result: Dict[str, Any]
        try:
            if http_client:
                response = await http_client.post(
                    api_endpoint,
                    json=payload,
                    headers=headers,
                    timeout=4.0,
                )
            else:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    response = await client.post(
                        api_endpoint,
                        json=payload,
                        headers=headers,
                    )

            if response.status_code in (200, 201):
                resp_json = response.json() if response.content else {}
                appointment_id = resp_json.get("id", "appointment-created")
                appointment_number = resp_json.get("appointmentNumber", "A-001")
                result = {
                    "success": True,
                    "appointmentId": appointment_id,
                    "appointmentNumber": appointment_number,
                    "status": "REQUESTED",
                    "message": (
                        f"Your appointment request has been recorded with appointment number {appointment_number}. "
                        "The team will verify availability and confirm it."
                    ),
                }
            else:
                err_data: Dict[str, Any] = {}
                try:
                    err_data = response.json()
                except Exception:
                    pass

                status = response.status_code
                error_code = err_data.get("code") or (
                    "UNAUTHORIZED" if status == 401
                    else "DEPLOYMENT_NOT_FOUND" if status == 404
                    else "DEPLOYMENT_INACTIVE" if status == 409
                    else "APPOINTMENT_REQUEST_FAILED"
                )
                logger.warning(
                    f"[AppointmentTool] API returned status {status} for appointment creation: {err_data.get('error') or err_data.get('message')}"
                )
                result = {
                    "success": False,
                    "error": error_code,
                    "message": "Unable to record the appointment request at this time. Please try again later.",
                }
        except httpx.TimeoutException:
            logger.warning("[AppointmentTool] Timeout connecting to appointments API")
            result = {
                "success": False,
                "error": "SERVICE_UNAVAILABLE",
                "message": "Unable to record the appointment request due to a temporary network timeout. Please try again later.",
            }
        except Exception as err:
            logger.warning(f"[AppointmentTool] Failed to connect to appointments API: {err}")
            result = {
                "success": False,
                "error": "CONNECTION_ERROR",
                "message": "Unable to record the appointment request due to a temporary network issue. Please try again later.",
            }

        # 5. Deliver result to Pipecat. A configured safe direct response
        # avoids a second LLM request; otherwise this preserves the standard
        # tool-result -> LLM response flow.
        return await deliver_result(params, result)

    return FunctionSchema(
        name=BOOK_APPOINTMENT_TOOL_NAME,
        description=tool_description,
        properties=APPOINTMENT_TOOL_PROPERTIES,
        required=APPOINTMENT_TOOL_REQUIRED,
        handler=handle_book_appointment,
    )


RESCHEDULE_APPOINTMENT_TOOL_NAME = "reschedule_appointment"

RESCHEDULE_TOOL_PROPERTIES: Dict[str, Any] = {
    "newBookingDate": {
        "type": "string",
        "description": "New date for the appointment (e.g. 'tomorrow', '2026-09-17', 'Friday')",
    },
    "newBookingTime": {
        "type": "string",
        "description": "New time for the appointment (e.g. '03:00 PM', '11:00 AM')",
    },
    "reason": {
        "type": "string",
        "description": "Optional reason for rescheduling",
    },
}

RESCHEDULE_TOOL_REQUIRED = ["newBookingDate", "newBookingTime"]


def create_reschedule_appointment_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for reschedule_appointment bound to trusted context."""
    if not context.deployment_id or not context.deployment_id.strip():
        raise ValueError("[RescheduleTool] deployment_id is required in ToolRuntimeContext")

    trusted_deployment_id = context.deployment_id.strip()
    base_url = (context.api_url or "http://localhost:3001").rstrip("/")
    worker_secret = context.worker_secret or "dev-worker-api-secret"
    api_endpoint = f"{base_url}/api/internal/appointments/reschedule"

    tool_description = (
        description_override.strip()
        if description_override and description_override.strip()
        else "Reschedule an existing clinic appointment to a new date and time when requested by the caller."
    )

    async def execute_reschedule(params: FunctionCallParams):
        raw_args = params.arguments or {}
        raw_date = str(raw_args.get("newBookingDate") or "").strip()
        raw_time = str(raw_args.get("newBookingTime") or "").strip()
        normalized_time = normalize_indic_time(raw_time)
        reason = str(raw_args.get("reason") or "").strip() or None

        tz_name = getattr(context, "timezone", None)
        normalized_date = resolve_relative_or_absolute_date(raw_date, time_zone=tz_name)

        if is_past_slot(normalized_date or raw_date, normalized_time, time_zone=tz_name):
            result = {
                "success": False,
                "error": "PAST_SLOT_NOT_ALLOWED",
                "message": f"The requested reschedule time slot '{normalized_time}' on '{normalized_date or raw_date}' is in the past. Please suggest an upcoming time slot.",
            }
            await params.result_callback(result, properties=FunctionCallResultProperties(run_llm=True))
            return

        payload = {
            "deploymentId": trusted_deployment_id,
            "newBookingDate": normalized_date,
            "newBookingTime": normalized_time,
            "phone": context.caller_phone,
            "reason": reason,
        }
        headers = {
            "Authorization": f"Bearer {worker_secret}",
            "Content-Type": "application/json",
        }

        try:
            if http_client:
                resp = await http_client.post(api_endpoint, json=payload, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.post(api_endpoint, json=payload, headers=headers)

            if resp.status_code == 200:
                result = {
                    "success": True,
                    "newDate": normalized_date,
                    "newTime": raw_time,
                    "message": f"Appointment successfully rescheduled to {normalized_date} at {raw_time}.",
                }
            else:
                result = {
                    "success": False,
                    "message": "Unable to reschedule the appointment. Please check if you have an active booking or try again.",
                }
        except Exception as e:
            logger.error(f"[RescheduleTool] Failed to reschedule: {e}")
            result = {
                "success": False,
                "message": "Temporary network issue while rescheduling. Please try again.",
            }

        await params.result_callback(result, properties=FunctionCallResultProperties(run_llm=True))

    return FunctionSchema(
        name=RESCHEDULE_APPOINTMENT_TOOL_NAME,
        description=tool_description,
        properties=RESCHEDULE_TOOL_PROPERTIES,
        required=RESCHEDULE_TOOL_REQUIRED,
        handler=execute_reschedule,
    )

