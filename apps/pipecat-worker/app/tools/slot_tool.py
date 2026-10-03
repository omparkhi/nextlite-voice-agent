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
from app.dynamic_schedule_engine import generate_dynamic_slots, is_time_within_shifts, is_day_closed

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
        if getattr(context, "patients_per_slot", None):
            query_params["patientsPerSlot"] = str(context.patients_per_slot)

        headers = {
            "Authorization": f"Bearer {worker_secret}",
            "Content-Type": "application/json",
        }

        biz_hours = getattr(context, "business_hours", None)
        slot_dur = getattr(context, "slot_duration", "30 mins")
        capacity_val = max(1, int(getattr(context, "patients_per_slot", 1) or 1))

        # ⚡ 1. Query Authoritative DB Check-Slots Endpoint (5-10ms)
        try:
            if http_client:
                resp = await http_client.get(api_endpoint, params=query_params, headers=headers, timeout=2.5)
            else:
                async with httpx.AsyncClient(timeout=2.5) as client:
                    resp = await client.get(api_endpoint, params=query_params, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                open_slots = data.get("availableSlots", [])
                capacity_val = data.get("capacity", capacity_val)
                pref_count = data.get("bookedCount", 0)
                is_pref_available = data.get("slotAvailable", True) if pref_time else True

                logger.info(
                    f"[SlotTool DB Authoritative] date={resolved_date} | prefTime={pref_time} | "
                    f"available={is_pref_available} | capacity={capacity_val} | "
                    f"bookedCount={pref_count} | totalOpenSlots={len(open_slots)}"
                )

                result_data = {
                    "success": True,
                    "status": "SLOT_AVAILABLE" if is_pref_available else "SLOT_UNAVAILABLE",
                    "available": is_pref_available,
                    "slotAvailable": is_pref_available,
                    "date": resolved_date,
                    "preferredTime": pref_time,
                    "capacity": capacity_val,
                    "bookedCount": pref_count,
                    "remainingCapacity": max(0, capacity_val - pref_count),
                    "availableSlots": open_slots,
                    "hasExistingBooking": data.get("hasExistingBooking", False),
                    "existingBooking": data.get("existingBooking"),
                }

                if is_day_closed(resolved_date, biz_hours):
                    result_data["status"] = "SLOT_UNAVAILABLE"
                    result_data["available"] = False
                    result_data["slotAvailable"] = False
                    result_data["availableSlots"] = []
                    result_data["guidance"] = (
                        f"The clinic is CLOSED on {resolved_date} as per the operating schedule. "
                        f"Politely and clearly inform the caller immediately in the active conversation language that the clinic is closed on this day, and suggest checking slots for the next open business day."
                    )
                elif not is_pref_available and pref_time:
                    if open_slots:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is already booked on {resolved_date} and has reached maximum capacity ({capacity_val}/{capacity_val} patients) or is outside open operational shifts. "
                            f"Politely inform the caller immediately in the active conversation language that {pref_time} is full/unavailable and suggest alternative open slots like {', '.join(open_slots[:3])}."
                        )
                    else:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is not available on {resolved_date}, and no further open slots remain for this date. "
                            f"Politely inform the caller immediately in the active conversation language and suggest booking for the next business day."
                        )
                elif not pref_time:
                    result_data["guidance"] = (
                        f"The following time slots on {resolved_date} are OPEN and ready for booking (clinic accommodates up to {capacity_val} patients per slot): "
                        f"{', '.join(open_slots[:6])}. "
                        f"Every slot in availableSlots has open capacity. Inform the caller about available times and let them choose."
                    )
                else:
                    result_data["guidance"] = (
                        f"Slot {pref_time} on {resolved_date} is available and open for booking (capacity: {capacity_val} patients/slot). "
                        f"Confirm {pref_time} is available and ask for their details (Name, age) to finalize the booking."
                    )

                await params.result_callback(
                    result_data,
                    properties=FunctionCallResultProperties(run_llm=True),
                )
                return
        except Exception as http_err:
            logger.debug(f"[SlotTool] HTTP check notice, falling back to In-Worker Engine: {http_err}")

        # ⚡ 2. FAST PATH 2 FALLBACK: In-Worker Dynamic Schedule Engine + Redis (<2ms)
        if biz_hours:
            try:
                from app.redis_client import get_booked_slots_for_date
                booked_counts = await get_booked_slots_for_date(trusted_deployment_id, resolved_date)
                available_slots = generate_dynamic_slots(
                    business_hours=biz_hours,
                    slot_duration=slot_dur,
                    booking_date=resolved_date,
                    time_zone=target_tz,
                )

                def _norm_t(t_val: Optional[str]) -> str:
                    if not t_val:
                        return ""
                    return str(t_val).strip().upper().lstrip("0")

                norm_pref = _norm_t(pref_time) if pref_time else None

                open_slots = [
                    s for s in available_slots
                    if booked_counts.get(s, 0) < capacity_val
                    and booked_counts.get(s.lstrip("0"), 0) < capacity_val
                    and booked_counts.get(f"0{s}" if not s.startswith("0") else s, 0) < capacity_val
                ]
                is_open = is_time_within_shifts(pref_time, biz_hours, booking_date=resolved_date) if pref_time else not is_day_closed(resolved_date, biz_hours)
                is_pref_available = is_open and (
                    any(_norm_t(s) == norm_pref for s in open_slots) if norm_pref else True
                )

                pref_count = 0
                if pref_time:
                    pref_count = max(
                        booked_counts.get(pref_time, 0),
                        booked_counts.get(pref_time.lstrip("0"), 0),
                        booked_counts.get(f"0{pref_time}" if not pref_time.startswith("0") else pref_time, 0),
                    )

                logger.info(
                    f"[SlotTool FastPath Fallback] date={resolved_date} | prefTime={pref_time} | "
                    f"available={is_pref_available} | adminCapacity={capacity_val} | "
                    f"bookedCount={pref_count} | totalOpenSlots={len(open_slots)}"
                )

                result_data = {
                    "success": True,
                    "status": "SLOT_AVAILABLE" if is_pref_available else "SLOT_UNAVAILABLE",
                    "available": is_pref_available,
                    "slotAvailable": is_pref_available,
                    "date": resolved_date,
                    "preferredTime": pref_time,
                    "capacity": capacity_val,
                    "bookedCount": pref_count,
                    "remainingCapacity": max(0, capacity_val - pref_count),
                    "availableSlots": open_slots,
                    "hasExistingBooking": False,
                    "existingBooking": None,
                }

                if is_day_closed(resolved_date, biz_hours):
                    result_data["status"] = "SLOT_UNAVAILABLE"
                    result_data["available"] = False
                    result_data["slotAvailable"] = False
                    result_data["availableSlots"] = []
                    result_data["guidance"] = (
                        f"The clinic is CLOSED on {resolved_date} as per the operating schedule. "
                        f"Politely and clearly inform the caller immediately in the active conversation language that the clinic is closed on this day, and suggest checking slots for the next open business day."
                    )
                elif not is_pref_available and pref_time:
                    if open_slots:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is already booked on {resolved_date} and has reached maximum capacity ({capacity_val}/{capacity_val} patients) or is outside open operational shifts. "
                            f"Politely inform the caller immediately in the active conversation language that {pref_time} is full/unavailable and suggest alternative open slots like {', '.join(open_slots[:3])}."
                        )
                    else:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is not available on {resolved_date}, and no further open slots remain for this date. "
                            f"Politely inform the caller immediately in the active conversation language and suggest booking for the next business day."
                        )
                elif not pref_time:
                    result_data["guidance"] = (
                        f"The following time slots on {resolved_date} are OPEN and ready for booking (clinic accommodates up to {capacity_val} patients per slot): "
                        f"{', '.join(open_slots[:6])}. "
                        f"Every slot in availableSlots has open capacity. Inform the caller about available times and let them choose."
                    )
                else:
                    result_data["guidance"] = (
                        f"Slot {pref_time} on {resolved_date} is available and open for booking (capacity: {capacity_val} patients/slot). "
                        f"Confirm {pref_time} is available and ask for their details (Name, age) to finalize the booking."
                    )

                await params.result_callback(
                    result_data,
                    properties=FunctionCallResultProperties(run_llm=True),
                )
                return
            except Exception as fast_path_err:
                logger.debug(f"[SlotTool] FastPath notice: {fast_path_err}")

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

                avail = data.get("availableSlots", [])
                capacity_val = data.get("capacity", 1)
                result_data = {
                    "success": True,
                    "date": resolved_date,
                    "slotAvailable": data.get("slotAvailable", True),
                    "preferredTime": pref_time,
                    "capacity": capacity_val,
                    "bookedCount": data.get("bookedCount", 0),
                    "remainingCapacity": data.get("remainingCapacity"),
                    "availableSlots": avail,
                    "hasExistingBooking": data.get("hasExistingBooking", False),
                    "existingBooking": data.get("existingBooking"),
                }

                if not data.get("slotAvailable") and pref_time:
                    if avail:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is already booked on {resolved_date} and has reached maximum capacity ({capacity_val}/{capacity_val} patients) or is outside open operational shifts. "
                            f"Politely inform the caller that {pref_time} is full/unavailable and offer available open slots such as {', '.join(avail[:3])}."
                        )
                    else:
                        result_data["guidance"] = (
                            f"The requested slot {pref_time} is not available on {resolved_date}, and no further open slots remain for this date. "
                            f"Politely suggest booking for the next business day."
                        )
                elif data.get("hasExistingBooking") and data.get("existingBooking"):
                    eb = data.get("existingBooking") or {}
                    eb_date = eb.get("bookingDate")
                    eb_time = eb.get("bookingTime")
                    result_data["guidance"] = (
                        f"Slot {pref_time or 'requested time'} on {resolved_date} is available for booking (capacity: {capacity_val} patients/slot). "
                        f"Note: The caller currently has an existing appointment on {eb_date} at {eb_time}. "
                        f"Confirm that {pref_time or 'the requested slot'} is open. Ask the caller if they would like to reschedule their existing {eb_time} appointment to {pref_time or resolved_date} or book a new appointment. "
                        f"Never tell the caller that the slot is taken by another person."
                    )
                elif not pref_time:
                    result_data["guidance"] = (
                        f"The following time slots on {resolved_date} are OPEN and ready for booking (clinic accommodates up to {capacity_val} patients per slot): "
                        f"{', '.join(avail[:6])}. "
                        f"Every slot in availableSlots has open capacity. If the caller asks for available times, mention these open times and let them choose."
                    )
                else:
                    result_data["guidance"] = (
                        f"Slot {pref_time} on {resolved_date} is 100% available and open for booking (capacity: {capacity_val} patients/slot). "
                        f"Confidently tell the caller that {pref_time} is available and proceed to confirm their details (Name, reason, age) and book the appointment. "
                        f"Do NOT say the slot is booked by someone else."
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
