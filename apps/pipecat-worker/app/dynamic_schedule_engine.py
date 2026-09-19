"""Dynamic multi-tenant schedule and slot generation engine for Pipecat Voice Worker.

Zero hardcoded slots. Automatically parses operational shifts, breaks,
closed hours, and slot durations from tenant-configured business variables.
"""

import re
from datetime import datetime
from typing import List, Tuple, Optional, Any
import zoneinfo

DEFAULT_TIMEZONE = "Asia/Kolkata"


def parse_slot_duration_minutes(duration_str: Optional[Any], default_minutes: int = 30) -> int:
    """Parses slot duration strings into integer minutes."""
    if duration_str is None:
        return default_minutes
    if isinstance(duration_str, (int, float)):
        return max(5, int(duration_str))

    s = str(duration_str).strip().lower()
    if not s:
        return default_minutes

    if "1/2" in s or "half" in s:
        return 30

    hr_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hour|hr|h)\b", s)
    if hr_match:
        try:
            return max(5, int(float(hr_match.group(1)) * 60))
        except (ValueError, TypeError):
            pass

    min_match = re.search(r"(\d+)\s*(?:min|m)\b", s)
    if min_match:
        try:
            return max(5, int(min_match.group(1)))
        except (ValueError, TypeError):
            pass

    digit_match = re.search(r"\b(\d+)\b", s)
    if digit_match:
        try:
            val = int(digit_match.group(1))
            return max(5, val)
        except (ValueError, TypeError):
            pass

    return default_minutes


def parse_time_to_minutes(time_str: str) -> Optional[int]:
    """Parses 12h or 24h time string into minutes from midnight (0..1439)."""
    if not time_str:
        return None
    s = str(time_str).strip().upper()
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?", s)
    if not match:
        return None

    hour = int(match.group(1))
    minute = int(match.group(2)) if match.group(2) else 0
    period = match.group(3)

    if period == "PM" and hour < 12:
        hour += 12
    elif period == "AM" and hour == 12:
        hour = 0

    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return hour * 60 + minute
    return None


def format_minutes_to_12h(total_minutes: int) -> str:
    """Formats minutes from midnight into canonical 'hh:mm AM/PM'."""
    hour_24 = (total_minutes // 60) % 24
    minute = total_minutes % 60
    period = "AM" if hour_24 < 12 else "PM"
    hour_12 = hour_24 % 12
    if hour_12 == 0:
        hour_12 = 12
    return f"{hour_12:02d}:{minute:02d} {period}"


def parse_business_shifts(business_hours: Optional[str]) -> List[Tuple[int, int]]:
    """Parses businessHours text into open shift minute ranges [(start_min, end_min), ...]."""
    default_shifts = [(600, 780), (1080, 1260)]  # 10:00 AM - 1:00 PM and 6:00 PM - 9:00 PM

    if not business_hours or not str(business_hours).strip():
        return default_shifts

    text = str(business_hours).strip()
    range_pattern = re.compile(
        r"(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*(?:to|-|–|until)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))",
        re.IGNORECASE
    )

    found_shifts: List[Tuple[int, int]] = []
    for match in range_pattern.finditer(text):
        start_raw, end_raw = match.group(1), match.group(2)
        start_min = parse_time_to_minutes(start_raw)
        end_min = parse_time_to_minutes(end_raw)

        if start_min is not None and end_min is not None and start_min < end_min:
            # Find the clause bounding this match
            clause_delims = [".", ";", "\n", "|", "(", ")"]
            clause_start = 0
            for d in clause_delims:
                pos = text.rfind(d, 0, match.start())
                if pos != -1 and pos + 1 > clause_start:
                    clause_start = pos + 1

            clause_end = len(text)
            for d in clause_delims:
                pos = text.find(d, match.end())
                if pos != -1 and pos < clause_end:
                    clause_end = pos

            clause_text = text[clause_start:clause_end].lower()

            # Also check if text right before the opening paren (e.g. "Afternoon Break (1:00 PM to 6:00 PM)") indicates break
            leading_context = text[max(0, clause_start - 30):clause_start].lower()
            combined_context = f"{leading_context} {clause_text}"

            negative_keywords = ["break", "closed", "lunch", "off", "holiday", "बंद", "सुट्टी", "non-working"]
            if any(kw in combined_context for kw in negative_keywords):
                # Check if this clause explicitly says "open" or "shift" to avoid false negatives
                if not any(pos_kw in clause_text for pos_kw in ["morning", "evening", "shift", "open"]):
                    continue

            found_shifts.append((start_min, end_min))

    if found_shifts:
        found_shifts.sort(key=lambda s: s[0])
        merged: List[Tuple[int, int]] = []
        for s in found_shifts:
            if not merged:
                merged.append(s)
            else:
                prev_start, prev_end = merged[-1]
                if s[0] <= prev_end:
                    merged[-1] = (prev_start, max(prev_end, s[1]))
                else:
                    merged.append(s)
        return merged

    return default_shifts


def is_time_within_shifts(time_str: str, business_hours: Optional[str]) -> bool:
    """Checks if a given time slot falls within any of the configured open shift windows."""
    t_min = parse_time_to_minutes(time_str)
    if t_min is None:
        return False
    shifts = parse_business_shifts(business_hours)
    for start_min, end_min in shifts:
        if start_min <= t_min < end_min:
            return True
    return False


def generate_dynamic_slots(
    business_hours: Optional[str] = None,
    slot_duration: Optional[Any] = "30 mins",
    booking_date: Optional[str] = None,
    time_zone: str = DEFAULT_TIMEZONE,
    filter_past: bool = True,
    buffer_minutes: int = 0,
    now_override: Optional[datetime] = None,
) -> List[str]:
    """Generates canonical appointment slot strings on-the-fly from business hours & slot duration."""
    shifts = parse_business_shifts(business_hours)
    step = parse_slot_duration_minutes(slot_duration, default_minutes=30)

    try:
        tz = zoneinfo.ZoneInfo(time_zone)
    except Exception:
        tz = zoneinfo.ZoneInfo(DEFAULT_TIMEZONE)

    current_now = now_override if now_override else datetime.now(tz)
    today_iso = current_now.strftime("%Y-%m-%d")
    current_time_min = current_now.hour * 60 + current_now.minute

    is_today = False
    if booking_date:
        b_clean = str(booking_date).strip().lower()
        if b_clean in ("today", "aaj", "आज") or b_clean == today_iso:
            is_today = True

    generated_slots: List[str] = []

    for start_min, end_min in shifts:
        cursor = start_min
        while cursor < end_min:
            if filter_past and is_today:
                if cursor <= (current_time_min + buffer_minutes):
                    cursor += step
                    continue

            formatted = format_minutes_to_12h(cursor)
            generated_slots.append(formatted)
            cursor += step

    return generated_slots
