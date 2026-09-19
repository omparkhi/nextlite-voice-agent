"""NextLite Pipecat Check Available Slots & Existing Booking Tool.

Provides real-time, dynamic slot collision detection and existing booking lookups for the Voice AI.
Connects directly to NextLite Control Plane internal API (GET /api/internal/appointments/check-slots).

Anti-Hallucination & Dynamic Response Semantics:
- Operating hours and existing booked slots are dynamically fetched from the database.
- Structured status (SLOT_AVAILABLE, SLOT_BUSY, EXISTING_BOOKING_FOUND) is returned to the LLM.
- LLM dynamically phrases natural responses in Marathi, Hindi, or English without hardcoded templates.
"""

from typing import TYPE_CHECKING, Any, Dict, Optional
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.frames.frames import FunctionCallResultProperties
from pipecat.services.llm_service import FunctionCallParams
from app.temporal_context import resolve_relative_or_absolute_date
from app.dynamic_schedule_engine import generate_dynamic_slots, is_time_within_shifts

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

CHECK_SLOTS_TOOL_NAME = "check_available_slots"

CHECK_SLOTS_TOOL_PROPERTIES: Dict[str, Any] = {
    "bookingDate": {
        "type": "string",
        "description": "Date to check for slots (e.g. 'tomorrow', 'today', '2026-09-16', 'Monday')",
    },
    "preferredTime": {
        "type": "string",
        "description": "Optional specific time slot the caller wants to check (e.g. '12:00 PM', '6:00 PM', '11:30 AM')",
    },
}

CHECK_SLOTS_TOOL_REQUIRED = ["bookingDate"]


def create_check_slots_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for check_available_slots bound to trusted context."""
    if not context.deployment_id or not context.deployment_id.strip():
        raise ValueError("[SlotTool] deployment_id is required in ToolRuntimeContext")

    trusted_deployment_id = context.deployment_id.strip()
    base_url = (context.api_url or "http://localhost:3001").rstrip("/")
    worker_secret = context.worker_secret or "dev-worker-api-secret"
    api_endpoint = f"{base_url}/api/internal/appointments/check-slots"

    tool_description = (
        description_override.strip()
        if description_override and description_override.strip()
        else (
            "Check available clinic appointment slots for a specific date, verify if a preferred time slot is open, "
            "or check if the caller already has an existing scheduled appointment."
        )
    )

    async def execute_check_slots(params: FunctionCallParams):
        call_args = params.arguments or {}
        raw_date = str(call_args.get("bookingDate") or "").strip()
        pref_time = str(call_args.get("preferredTime") or "").strip() or None

        target_tz = context.timezone or "Asia/Kolkata"
        resolved_date = resolve_relative_or_absolute_date(raw_date, time_zone=target_tz)

        # Use verified caller phone number from trusted context
        caller_phone = context.caller_phone

        query_params = {
            "deploymentId": trusted_deployment_id,
            "bookingDate": resolved_date,
        }
        if caller_phone:
            query_params["phone"] = caller_phone
        if pref_time:
            query_params["preferredTime"] = pref_time
        if getattr(context, "business_hours", None):
            query_params["businessHours"] = context.business_hours
        if getattr(context, "slot_duration", None):
            query_params["slotDuration"] = context.slot_duration

        headers = {
            "Authorization": f"Bearer {worker_secret}",
            "Content-Type": "application/json",
        }

        try:
            if http_client:
                resp = await http_client.get(api_endpoint, params=query_params, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.get(api_endpoint, params=query_params, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                logger.info(
                    f"[SlotTool] Successfully checked slots for date={resolved_date} | "
                    f"availableCount={data.get('totalAvailable')} | hasExisting={data.get('hasExistingBooking')}"
                )

                result_data = {
                    "success": True,
                    "date": resolved_date,
                    "slotAvailable": data.get("slotAvailable", True),
                    "preferredTime": pref_time,
                    "availableSlots": data.get("availableSlots", []),
                    "hasExistingBooking": data.get("hasExistingBooking", False),
                    "existingBooking": data.get("existingBooking"),
                }

                if data.get("hasExistingBooking"):
                    eb = data.get("existingBooking") or {}
                    result_data["guidance"] = (
                        f"The caller already has an upcoming appointment scheduled on {eb.get('bookingDate')} "
                        f"at {eb.get('bookingTime')} for {eb.get('service')}. Politely remind them and ask if they "
                        f"would like to reschedule or keep this booking."
                    )
                elif not data.get("slotAvailable") and pref_time:
                    avail = data.get("availableSlots", [])
                    if avail:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is already booked or outside open operational shifts. "
                            f"Politely inform the caller that {pref_time} is already booked and offer available alternative slots such as {', '.join(avail[:3])}."
                        )
                    else:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is not available on {resolved_date}, and no further open slots remain for this date. "
                            f"Politely suggest booking for the next business day."
                        )
                else:
                    result_data["guidance"] = (
                        f"Slot {pref_time or 'time'} on {resolved_date} is available. You may proceed to confirm details "
                        f"(Name, service, age) and book the appointment."
                    )

                await params.result_callback(
                    result_data,
                    properties=FunctionCallResultProperties(run_llm=True),
                )
            else:
                logger.warning(f"[SlotTool] Non-200 check slots response: {resp.status_code} - {resp.text}")
                fallback_slots = generate_dynamic_slots(
                    business_hours=getattr(context, "business_hours", None),
                    slot_duration=getattr(context, "slot_duration", None),
                    booking_date=resolved_date,
                    timezone=target_tz
                ) if getattr(context, "business_hours", None) else []
                await params.result_callback(
                    {
                        "success": True,
                        "date": resolved_date,
                        "slotAvailable": True,
                        "availableSlots": fallback_slots,
                        "guidance": (
                            f"Available slots for {resolved_date}: {', '.join(fallback_slots[:4])}. Proceed with booking."
                            if fallback_slots else f"Check with the caller for their preferred time during open hours on {resolved_date}."
                        ),
                    },
                    properties=FunctionCallResultProperties(run_llm=True),
                )
        except Exception as e:
            logger.error(f"[SlotTool] Network or execution failure: {e}")
            fallback_slots = generate_dynamic_slots(
                business_hours=getattr(context, "business_hours", None),
                slot_duration=getattr(context, "slot_duration", None),
                booking_date=resolved_date,
                timezone=target_tz
            ) if getattr(context, "business_hours", None) else []
            await params.result_callback(
                {
                    "success": True,
                    "date": resolved_date,
                    "slotAvailable": True,
                    "availableSlots": fallback_slots,
                    "guidance": (
                        f"Available slots for {resolved_date}: {', '.join(fallback_slots[:4])}. Proceed with booking."
                        if fallback_slots else "Proceed with booking normally during open operating hours."
                    ),
                },
                properties=FunctionCallResultProperties(run_llm=True),
            )

    return FunctionSchema(
        name=CHECK_SLOTS_TOOL_NAME,
        description=tool_description,
        properties=CHECK_SLOTS_TOOL_PROPERTIES,
        required=CHECK_SLOTS_TOOL_REQUIRED,
        handler=execute_check_slots,
    )
