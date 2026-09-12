"""Unit tests for authoritative temporal & calendar grounding and appointment date safety."""

from datetime import datetime, timezone
import pytest
from zoneinfo import ZoneInfo
from unittest.mock import AsyncMock, patch

from app.temporal_context import (
    DEFAULT_TIMEZONE,
    build_temporal_and_calendar_instructions,
    get_calendar_context,
    get_temporal_context,
    is_past_date,
    is_valid_timezone,
    resolve_relative_or_absolute_date,
)
from app.tools.appointment_tool import create_book_appointment_tool_factory
from app.tools.tool_registry import ToolRuntimeContext
from pipecat.services.llm_service import FunctionCallParams


# 1. Authoritative Clock Tests
def test_temporal_context_with_known_datetime():
    # 2026-09-11 12:22:46 IST (UTC: 2026-09-11 06:52:46)
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    ctx = get_temporal_context(now=fixed_utc, time_zone="Asia/Kolkata")

    assert ctx.iso_date == "2026-09-11"
    assert ctx.current_day == "Friday"
    assert ctx.year == 2026
    assert ctx.month == 9
    assert ctx.day == 11
    assert "September 11, 2026" in ctx.current_date
    assert ctx.timezone == "Asia/Kolkata"
    assert "12:22 PM" in ctx.current_time


def test_temporal_context_different_timezone():
    # 2026-09-11 06:52:46 UTC in America/New_York is 2026-09-11 02:52:46 EDT (UTC-4)
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    ctx = get_temporal_context(now=fixed_utc, time_zone="America/New_York")

    assert ctx.iso_date == "2026-09-11"
    assert ctx.current_day == "Friday"
    assert ctx.timezone == "America/New_York"
    assert "2:52 AM" in ctx.current_time


def test_temporal_context_invalid_timezone_fallback():
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    ctx = get_temporal_context(now=fixed_utc, time_zone="Invalid/Timezone_Name")

    assert ctx.timezone == DEFAULT_TIMEZONE
    assert ctx.iso_date == "2026-09-11"


# 2. Calendar Context Progression Tests
def test_calendar_context_progression():
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    cal = get_calendar_context(now=fixed_utc, time_zone="Asia/Kolkata")

    assert cal.today.iso_date == "2026-09-11"
    assert cal.today.weekday == "Friday"

    assert cal.tomorrow.iso_date == "2026-09-12"
    assert cal.tomorrow.weekday == "Saturday"

    assert cal.day_after_tomorrow.iso_date == "2026-09-13"
    assert cal.day_after_tomorrow.weekday == "Sunday"

    assert len(cal.upcoming_days) == 8
    assert cal.upcoming_days[7].iso_date == "2026-09-18"
    assert cal.upcoming_days[7].weekday == "Friday"


# 3. Prompt Instruction Building
def test_build_temporal_and_calendar_instructions():
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    instructions = build_temporal_and_calendar_instructions(now=fixed_utc, time_zone="Asia/Kolkata")

    assert "=== RUNTIME TEMPORAL CONTEXT ===" in instructions
    assert "Current Date: Friday, September 11, 2026 (YYYY-MM-DD: 2026-09-11)" in instructions
    assert "Current Day of Week: Friday" in instructions
    assert "Timezone: Asia/Kolkata" in instructions
    assert "=== RUNTIME CALENDAR REFERENCE (Asia/Kolkata) ===" in instructions
    assert "Today / आज: Friday, September 11, 2026 (Date: 2026-09-11)" in instructions
    assert "Tomorrow / कल / उद्या: Saturday, September 12, 2026 (Date: 2026-09-12)" in instructions
    assert "Day After Tomorrow / परसों / परवा: Sunday, September 13, 2026 (Date: 2026-09-13)" in instructions
    assert "CRITICAL DATE & TIME GROUNDING RULES:" in instructions
    assert "Today is strictly Friday, September 11, 2026" in instructions


# 4. Relative & Absolute Date Parsing Tests
def test_resolve_relative_and_hindi_dates():
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    tz = "Asia/Kolkata"

    # English relative
    assert resolve_relative_or_absolute_date("today", now=fixed_utc, time_zone=tz) == "2026-09-11"
    assert resolve_relative_or_absolute_date("tomorrow", now=fixed_utc, time_zone=tz) == "2026-09-12"
    assert resolve_relative_or_absolute_date("day after tomorrow", now=fixed_utc, time_zone=tz) == "2026-09-13"
    assert resolve_relative_or_absolute_date("yesterday", now=fixed_utc, time_zone=tz) == "2026-09-10"

    # Hindi relative
    assert resolve_relative_or_absolute_date("आज", now=fixed_utc, time_zone=tz) == "2026-09-11"
    assert resolve_relative_or_absolute_date("aaj", now=fixed_utc, time_zone=tz) == "2026-09-11"
    assert resolve_relative_or_absolute_date("कल", now=fixed_utc, time_zone=tz) == "2026-09-12"
    assert resolve_relative_or_absolute_date("kal", now=fixed_utc, time_zone=tz) == "2026-09-12"
    assert resolve_relative_or_absolute_date("परसों", now=fixed_utc, time_zone=tz) == "2026-09-13"
    assert resolve_relative_or_absolute_date("parso", now=fixed_utc, time_zone=tz) == "2026-09-13"

    # Marathi relative
    assert resolve_relative_or_absolute_date("उद्या", now=fixed_utc, time_zone=tz) == "2026-09-12"
    assert resolve_relative_or_absolute_date("udya", now=fixed_utc, time_zone=tz) == "2026-09-12"
    assert resolve_relative_or_absolute_date("परवा", now=fixed_utc, time_zone=tz) == "2026-09-13"
    assert resolve_relative_or_absolute_date("parva", now=fixed_utc, time_zone=tz) == "2026-09-13"

    # Absolute dates
    assert resolve_relative_or_absolute_date("15 September", now=fixed_utc, time_zone=tz) == "2026-09-15"
    assert resolve_relative_or_absolute_date("September 15", now=fixed_utc, time_zone=tz) == "2026-09-15"
    assert resolve_relative_or_absolute_date("15th September 2026", now=fixed_utc, time_zone=tz) == "2026-09-15"
    assert resolve_relative_or_absolute_date("15/09/2026", now=fixed_utc, time_zone=tz) == "2026-09-15"
    assert resolve_relative_or_absolute_date("15-09-2026", now=fixed_utc, time_zone=tz) == "2026-09-15"
    assert resolve_relative_or_absolute_date("2026-09-15", now=fixed_utc, time_zone=tz) == "2026-09-15"

    # Next weekday (Current is Friday Sep 11 -> next Monday is Sep 14)
    assert resolve_relative_or_absolute_date("next monday", now=fixed_utc, time_zone=tz) == "2026-09-14"


# 5. Past Date Detection Tests
def test_is_past_date():
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    tz = "Asia/Kolkata"

    # Past dates
    assert is_past_date("2025-09-11", now=fixed_utc, time_zone=tz) is True
    assert is_past_date("2026-09-10", now=fixed_utc, time_zone=tz) is True
    assert is_past_date("yesterday", now=fixed_utc, time_zone=tz) is True
    assert is_past_date("10 September 2026", now=fixed_utc, time_zone=tz) is True

    # Today and future dates
    assert is_past_date("2026-09-11", now=fixed_utc, time_zone=tz) is False
    assert is_past_date("today", now=fixed_utc, time_zone=tz) is False
    assert is_past_date("tomorrow", now=fixed_utc, time_zone=tz) is False
    assert is_past_date("2026-09-12", now=fixed_utc, time_zone=tz) is False
    assert is_past_date("15 September 2026", now=fixed_utc, time_zone=tz) is False


class MockFunctionCallParams:
    def __init__(self, arguments: dict, function_name: str = "test_func", tool_call_id: str = "call_123"):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments
        self.result = None
        self.callback_called = False

    async def result_callback(self, result, *args, **kwargs):
        self.result = result
        self.callback_called = True


# 6. Appointment Tool Past Date Rejection & Future Date Acceptance
@pytest.mark.asyncio
async def test_appointment_tool_past_date_rejection():
    # Context with current date = 2026-09-11
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    context = ToolRuntimeContext(
        deployment_id="dep-123",
        caller_phone="+919876543210",
        timezone="Asia/Kolkata",
    )

    with patch("app.tools.appointment_tool.is_past_date", side_effect=lambda d, time_zone=None: is_past_date(d, now=fixed_utc, time_zone=time_zone)):
        schema = create_book_appointment_tool_factory(context=context)

        # Call with 2025 date
        params = MockFunctionCallParams(
            function_name="book_appointment",
            tool_call_id="call-past-1",
            arguments={
                "customerName": "Rahul Sharma",
                "title": "Doctor Consultation",
                "bookingDate": "2025-09-11",
                "bookingTime": "12:00 PM",
            },
        )

        result = await schema.handler(params)
        assert result["success"] is False
        assert result["error"] == "PAST_DATE_NOT_ALLOWED"
        assert "is in the past" in result["message"]


@pytest.mark.asyncio
async def test_appointment_tool_future_date_normalization_and_success():
    import json
    import httpx
    fixed_utc = datetime(2026, 9, 11, 6, 52, 46, tzinfo=timezone.utc)
    context = ToolRuntimeContext(
        deployment_id="dep-123",
        caller_phone="+919876543210",
        timezone="Asia/Kolkata",
    )

    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            201,
            json={
                "id": "apt-999",
                "appointmentNumber": "A-101",
                "status": "REQUESTED",
            },
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        with patch("app.tools.appointment_tool.is_past_date", side_effect=lambda d, time_zone=None: is_past_date(d, now=fixed_utc, time_zone=time_zone)), \
             patch("app.tools.appointment_tool.resolve_relative_or_absolute_date", side_effect=lambda d, time_zone=None: resolve_relative_or_absolute_date(d, now=fixed_utc, time_zone=time_zone)):
            
            schema = create_book_appointment_tool_factory(context=context, http_client=mock_client)

            # Call with relative "tomorrow"
            params = MockFunctionCallParams(
                function_name="book_appointment",
                tool_call_id="call-future-1",
                arguments={
                    "customerName": "Rahul Sharma",
                    "title": "Doctor Consultation",
                    "bookingDate": "tomorrow",
                    "bookingTime": "12:00 PM",
                },
            )

            result = await schema.handler(params)
            assert result["success"] is True
            assert result["appointmentNumber"] == "A-101"
            assert result["status"] == "REQUESTED"
            assert posted_payload["bookingDate"] == "2026-09-12"
