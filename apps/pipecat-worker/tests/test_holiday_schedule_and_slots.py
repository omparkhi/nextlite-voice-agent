"""Unit tests for Phase 2: Voice Worker & Slot Engine Holiday & Scheduled Closure Enforcement.

Tests prompt injection, dynamic schedule closures, slot generation, and tool hard-rejections.
"""

from datetime import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.temporal_context import build_holiday_instructions, get_temporal_context
from app.dynamic_schedule_engine import (
    get_holiday_closure_info,
    is_day_closed,
    is_time_within_shifts,
    generate_dynamic_slots,
)
from app.tools.tool_registry import ToolRuntimeContext, tool_registry
from app.tools.slot_tool import create_check_slots_tool_factory
from app.tools.appointment_tool import create_book_appointment_tool_factory, create_reschedule_appointment_tool_factory
from pipecat.services.llm_service import FunctionCallParams


def test_build_holiday_instructions_formatting():
    """Verify that holiday prompt instructions are constructed with clean, business-neutral wording."""
    holidays = [
        {
            "id": "h1",
            "name": "Diwali Festival Closure",
            "startDate": "2026-10-15",
            "endDate": "2026-10-17",
            "isEntireDay": True,
        },
        {
            "id": "h2",
            "name": "National Day",
            "startDate": "2026-11-01",
            "endDate": "2026-11-01",
            "isEntireDay": True,
        }
    ]
    now = datetime(2026, 10, 8, 10, 0)
    instructions = build_holiday_instructions(holidays, now=now, time_zone="Asia/Kolkata")

    assert "=== SCHEDULED CLOSURES & HOLIDAYS ===" in instructions
    assert "2026-10-15 to 2026-10-17: Diwali Festival Closure (Closed All Day). Reopens on: Sunday, 2026-10-18" in instructions
    assert "2026-11-01: National Day (Closed All Day). Reopens on: Monday, 2026-11-02" in instructions
    assert "FAST-PATH REJECTION" in instructions
    assert "REOPENING OFFERS" in instructions


def test_dynamic_schedule_engine_holiday_detection():
    """Verify is_day_closed and get_holiday_closure_info accurately identify holiday ranges."""
    holidays = [
        {
            "id": "h1",
            "name": "Renovation Days",
            "startDate": "2026-10-20",
            "endDate": "2026-10-22",
            "isEntireDay": True,
        }
    ]
    biz_hours = "Monday to Saturday: 09:00 AM - 05:00 PM"

    # Days inside holiday range
    assert is_day_closed("2026-10-20", biz_hours, holidays=holidays) is True
    assert is_day_closed("2026-10-21", biz_hours, holidays=holidays) is True
    assert is_day_closed("2026-10-22", biz_hours, holidays=holidays) is True

    # Day outside holiday range (Friday)
    assert is_day_closed("2026-10-23", biz_hours, holidays=holidays) is False

    # Info lookup
    info = get_holiday_closure_info("2026-10-21", holidays)
    assert info is not None
    assert info["is_closed"] is True
    assert info["name"] == "Renovation Days"
    assert info["reopening_date"] == "Friday, 2026-10-23"

    # Shift check
    assert is_time_within_shifts("10:00 AM", biz_hours, booking_date="2026-10-20", holidays=holidays) is False
    assert is_time_within_shifts("10:00 AM", biz_hours, booking_date="2026-10-23", holidays=holidays) is True

    # Dynamic slots generation
    slots_on_holiday = generate_dynamic_slots(
        business_hours=biz_hours,
        slot_duration="30 mins",
        booking_date="2026-10-20",
        holidays=holidays
    )
    assert slots_on_holiday == []

    slots_on_open_day = generate_dynamic_slots(
        business_hours=biz_hours,
        slot_duration="30 mins",
        booking_date="2026-10-23",
        holidays=holidays
    )
    assert len(slots_on_open_day) > 0


@pytest.mark.asyncio
async def test_slot_tool_date_closed_holiday():
    """Verify check_available_slots returns DATE_CLOSED_HOLIDAY status and guidance."""
    holidays = [
        {
            "id": "h1",
            "name": "Annual Maintenance",
            "startDate": "2026-10-25",
            "endDate": "2026-10-26",
            "isEntireDay": True,
        }
    ]
    ctx = ToolRuntimeContext(
        deployment_id="dep-test-123",
        holidays=holidays,
        business_hours="10:00 AM - 06:00 PM",
        timezone="Asia/Kolkata",
    )
    schema = create_check_slots_tool_factory(ctx)

    result_holder = {}
    async def mock_callback(result_data, **kwargs):
        result_holder.update(result_data)

    params = FunctionCallParams(
        llm=MagicMock(),
        pipeline_worker=MagicMock(),
        context=MagicMock(),
        function_name="check_available_slots",
        tool_call_id="call-1",
        arguments={"bookingDate": "2026-10-25"},
        result_callback=mock_callback,
    )

    await schema.handler(params)

    assert result_holder.get("status") == "DATE_CLOSED_HOLIDAY"
    assert result_holder.get("available") is False
    assert result_holder.get("holidayName") == "Annual Maintenance"
    assert "reopeningDate" in result_holder
    assert result_holder.get("availableSlots") == []


@pytest.mark.asyncio
async def test_appointment_tool_holiday_rejection():
    """Verify book_appointment hard-rejects attempts to book on a holiday date."""
    holidays = [
        {
            "id": "h1",
            "name": "Holiday Break",
            "startDate": "2026-10-30",
            "endDate": "2026-10-30",
            "isEntireDay": True,
        }
    ]
    ctx = ToolRuntimeContext(
        deployment_id="dep-test-123",
        holidays=holidays,
        business_hours="10:00 AM - 06:00 PM",
        timezone="Asia/Kolkata",
        caller_phone="+919876543210",
    )
    schema = create_book_appointment_tool_factory(ctx)

    result_holder = {}
    async def mock_callback(result_data, **kwargs):
        result_holder.update(result_data)

    params = FunctionCallParams(
        llm=MagicMock(),
        pipeline_worker=MagicMock(),
        context=MagicMock(),
        function_name="book_appointment",
        tool_call_id="call-2",
        arguments={
            "customerName": "John Doe",
            "bookingDate": "2026-10-30",
            "bookingTime": "11:00 AM",
        },
        result_callback=mock_callback,
    )

    await schema.handler(params)

    assert result_holder.get("success") is False
    assert result_holder.get("error") == "DATE_CLOSED_HOLIDAY"
    assert result_holder.get("holidayName") == "Holiday Break"
    assert "reopeningDate" in result_holder


@pytest.mark.asyncio
async def test_reschedule_tool_holiday_rejection():
    """Verify reschedule_appointment hard-rejects attempts to reschedule onto a holiday date."""
    holidays = [
        {
            "id": "h1",
            "name": "Holiday Break",
            "startDate": "2026-10-30",
            "endDate": "2026-10-30",
            "isEntireDay": True,
        }
    ]
    ctx = ToolRuntimeContext(
        deployment_id="dep-test-123",
        holidays=holidays,
        business_hours="10:00 AM - 06:00 PM",
        timezone="Asia/Kolkata",
        caller_phone="+919876543210",
    )
    schema = create_reschedule_appointment_tool_factory(ctx)

    result_holder = {}
    async def mock_callback(result_data, **kwargs):
        result_holder.update(result_data)

    params = FunctionCallParams(
        llm=MagicMock(),
        pipeline_worker=MagicMock(),
        context=MagicMock(),
        function_name="reschedule_appointment",
        tool_call_id="call-3",
        arguments={
            "newBookingDate": "2026-10-30",
            "newBookingTime": "11:00 AM",
        },
        result_callback=mock_callback,
    )

    await schema.handler(params)

    assert result_holder.get("success") is False
    assert result_holder.get("error") == "DATE_CLOSED_HOLIDAY"
    assert result_holder.get("holidayName") == "Holiday Break"
    assert "reopeningDate" in result_holder
