import pytest
from app.dynamic_schedule_engine import (
    parse_slot_duration_minutes,
    parse_time_to_minutes,
    parse_business_shifts,
    is_time_within_shifts,
    generate_dynamic_slots,
)

CLINIC_SCHEDULE = (
    "Monday to Saturday: Morning 10:00 AM to 01:00 PM and Evening 06:00 PM to 09:00 PM. "
    "Afternoon Break (01:00 PM to 06:00 PM) is strictly closed. Sunday: Closed."
)


def test_parse_slot_duration_minutes():
    assert parse_slot_duration_minutes("30 min") == 30
    assert parse_slot_duration_minutes("30 mins") == 30
    assert parse_slot_duration_minutes("30") == 30
    assert parse_slot_duration_minutes("15 minutes") == 15
    assert parse_slot_duration_minutes("1 hour") == 60
    assert parse_slot_duration_minutes("45m") == 45
    assert parse_slot_duration_minutes("invalid") == 30
    assert parse_slot_duration_minutes(None) == 30


def test_parse_time_to_minutes():
    assert parse_time_to_minutes("10:00 AM") == 600
    assert parse_time_to_minutes("10:30 AM") == 630
    assert parse_time_to_minutes("12:00 PM") == 720
    assert parse_time_to_minutes("01:00 PM") == 780
    assert parse_time_to_minutes("03:00 PM") == 900
    assert parse_time_to_minutes("06:00 PM") == 1080
    assert parse_time_to_minutes("09:00 PM") == 1260
    assert parse_time_to_minutes("12:00 AM") == 0


def test_parse_business_shifts():
    shifts = parse_business_shifts(CLINIC_SCHEDULE)
    assert len(shifts) == 2
    # Shift 1: 10:00 AM (600) to 01:00 PM (780)
    assert shifts[0] == (600, 780)
    # Shift 2: 06:00 PM (1080) to 09:00 PM (1260)
    assert shifts[1] == (1080, 1260)


def test_is_time_within_shifts():
    # Morning shift open
    assert is_time_within_shifts("10:00 AM", CLINIC_SCHEDULE) is True
    assert is_time_within_shifts("11:30 AM", CLINIC_SCHEDULE) is True
    assert is_time_within_shifts("12:30 PM", CLINIC_SCHEDULE) is True

    # Afternoon break - strictly closed
    assert is_time_within_shifts("01:00 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("01:30 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("02:00 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("02:30 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("03:00 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("04:00 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("05:30 PM", CLINIC_SCHEDULE) is False

    # Evening shift open
    assert is_time_within_shifts("06:00 PM", CLINIC_SCHEDULE) is True
    assert is_time_within_shifts("07:30 PM", CLINIC_SCHEDULE) is True
    assert is_time_within_shifts("08:30 PM", CLINIC_SCHEDULE) is True

    # Night closed
    assert is_time_within_shifts("09:00 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("10:00 PM", CLINIC_SCHEDULE) is False
    assert is_time_within_shifts("08:00 AM", CLINIC_SCHEDULE) is False


def test_generate_dynamic_slots_30m():
    slots = generate_dynamic_slots(
        business_hours=CLINIC_SCHEDULE,
        slot_duration="30 min",
        booking_date="2099-12-31",
    )
    expected_slots = [
        "10:00 AM",
        "10:30 AM",
        "11:00 AM",
        "11:30 AM",
        "12:00 PM",
        "12:30 PM",
        "06:00 PM",
        "06:30 PM",
        "07:00 PM",
        "07:30 PM",
        "08:00 PM",
        "08:30 PM",
    ]
    assert slots == expected_slots

    # Explicitly check break hours are NEVER present
    for break_time in ["01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM", "03:00 PM", "04:00 PM", "05:00 PM", "05:30 PM"]:
        assert break_time not in slots


def test_generate_dynamic_slots_60m():
    slots = generate_dynamic_slots(
        business_hours=CLINIC_SCHEDULE,
        slot_duration="60 min",
        booking_date="2099-12-31",
    )
    expected_slots = [
        "10:00 AM",
        "11:00 AM",
        "12:00 PM",
        "06:00 PM",
        "07:00 PM",
        "08:00 PM",
    ]
    assert slots == expected_slots


def test_generate_dynamic_slots_single_shift():
    schedule_9_to_5 = "Monday to Friday: 09:00 AM to 05:00 PM"
    slots = generate_dynamic_slots(
        business_hours=schedule_9_to_5,
        slot_duration="60 min",
        booking_date="2099-12-31",
    )
    expected = [
        "09:00 AM",
        "10:00 AM",
        "11:00 AM",
        "12:00 PM",
        "01:00 PM",
        "02:00 PM",
        "03:00 PM",
        "04:00 PM",
    ]
    assert slots == expected


def test_extract_business_schedule_case_insensitive():
    from app.dynamic_schedule_engine import extract_business_schedule_from_version

    cfg = {
        "variables": {
            "inputVariables": [
                {"key": "businesshours", "defaultValue": "Monday to Saturday: 10:00 AM to 01:00 PM and 06:00 PM to 09:00 PM"},
                {"key": "slotduration", "defaultValue": "45 min"},
            ]
        }
    }
    hours, duration, _ = extract_business_schedule_from_version(cfg)
    assert hours == "Monday to Saturday: 10:00 AM to 01:00 PM and 06:00 PM to 09:00 PM"
    assert duration == "45 min"
