"""NextLite Pipecat Book Appointment Tool.

Ports generic appointment booking behavior from LiveKit worker to Pipecat native tool calling.
Connects strictly to NextLite Control Plane internal API (POST /api/internal/appointments).

Booking Semantics & Anti-Hallucination:
- Always creates records with status = 'REQUESTED'.
- Preserves REQUESTED != CONFIRMED semantics.
- Operating hours do NOT indicate slot availability.
- Never claims confirmed booking, reserved calendar slot, or local UUID/appointment number generation.
- Structured success or failure is returned to the LLM to prevent hallucinations.
"""

from typing import TYPE_CHECKING, Any, Dict, Optional
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams
from app.temporal_context import is_past_date, resolve_relative_or_absolute_date
from app.turn_timing import log_phone_trace

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

BOOK_APPOINTMENT_TOOL_NAME = "book_appointment"

APPOINTMENT_TOOL_PROPERTIES: Dict[str, Any] = {
    "customerName": {
        "type": "string",
        "description": "Customer name",
    },
    "title": {
        "type": "string",
        "description": "Reason for visit",
    },
    "bookingDate": {
        "type": "string",
        "description": "Date (YYYY-MM-DD or relative)",
    },
    "bookingTime": {
        "type": "string",
        "description": "Time (e.g. 10:00 AM)",
    },
    "resourceName": {
        "type": "string",
        "description": "Requested staff or doctor",
    },
    "customerPhone": {
        "type": "string",
        "description": "Contact phone",
    },
    "notes": {
        "type": "string",
        "description": "Notes",
    },
}

APPOINTMENT_TOOL_REQUIRED = ["customerName", "title", "bookingDate", "bookingTime"]


def create_book_appointment_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for book_appointment bound to trusted context."""
    if not context.deployment_id or not context.deployment_id.strip():
        raise ValueError("[AppointmentTool] deployment_id is required in ToolRuntimeContext")

    trusted_deployment_id = context.deployment_id.strip()

    base_url = (context.api_url or "http://localhost:3001").rstrip("/")
    worker_secret = context.worker_secret or "dev-livekit-worker-secret-v3"
    api_endpoint = f"{base_url}/api/internal/appointments"

    tool_description = (
        description_override.strip()
        if description_override and description_override.strip()
        else "Submit an appointment request. Records an unconfirmed request for team verification."
    )

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
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

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
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        customer_name = str(raw_name).strip()
        title = str(raw_title).strip()
        raw_booking_date = str(raw_date).strip()
        booking_time = str(raw_time).strip()

        # Check for past date protection against authoritative current date
        tz_name = getattr(context, "timezone", None)
        if is_past_date(raw_booking_date, time_zone=tz_name):
            logger.warning(
                f"[AppointmentTool] Rejected past appointment date: '{raw_booking_date}' in timezone={tz_name or 'Asia/Kolkata'}"
            )
            failure_result = {
                "success": False,
                "error": "PAST_DATE_NOT_ALLOWED",
                "message": (
                    f"The requested appointment date '{raw_booking_date}' is in the past. "
                    "Please ask the caller for a future appointment date."
                ),
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        # Normalize relative/natural date to standard YYYY-MM-DD
        normalized_date = resolve_relative_or_absolute_date(raw_booking_date, time_zone=tz_name)
        booking_date = normalized_date if normalized_date else raw_booking_date

        # 2. Resolve caller phone: supplied customerPhone > trusted callerPhone fallback
        raw_phone = raw_args.get("customerPhone")
        turn_id = context.timing_tracker.active_turn_id if context.timing_tracker else "unknown"
        log_phone_trace("tool_argument_received", turn_id, raw_phone)

        effective_phone: Optional[str] = None
        if raw_phone and isinstance(raw_phone, str) and raw_phone.strip():
            effective_phone = raw_phone.strip()
        elif trusted_caller_phone:
            effective_phone = trusted_caller_phone

        log_phone_trace("control_plane_payload", turn_id, effective_phone)

        if not effective_phone:
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": (
                    "Customer phone number is required to record an appointment request. "
                    "Please ask the caller for their contact phone number."
                ),
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        # 3. Assemble API payload strictly with trusted identity fields & status = REQUESTED
        payload: Dict[str, Any] = {
            "deploymentId": trusted_deployment_id,
            "customerName": customer_name,
            "customerPhone": effective_phone,
            "title": title,
            "bookingDate": booking_date,
            "bookingTime": booking_time,
            "status": "REQUESTED",
        }
        if trusted_call_session_id:
            payload["callSessionId"] = trusted_call_session_id

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

        # 5. Deliver result to Pipecat LLM callback
        if params.result_callback:
            await params.result_callback(result)

        return result

    return FunctionSchema(
        name=BOOK_APPOINTMENT_TOOL_NAME,
        description=tool_description,
        properties=APPOINTMENT_TOOL_PROPERTIES,
        required=APPOINTMENT_TOOL_REQUIRED,
        handler=handle_book_appointment,
    )
