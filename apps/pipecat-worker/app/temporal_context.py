"""Authoritative Runtime Temporal & Calendar Context Helper for NextLite Pipecat Voice Worker.

Provides dynamic, clock-derived temporal grounding and deterministic calendar references
for the conversational voice runtime, eliminating historical date hallucinations and grounding
relative date expressions ("today", "tomorrow", "कल", "आज", "परसों", "उद्या", "परवा").

Mirrors and extends the proven architecture from packages/shared and apps/livekit-worker.
"""

from dataclasses import dataclass
from datetime import datetime, date, time as dtime, timedelta, timezone
import re
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo
from loguru import logger

DEFAULT_TIMEZONE = "Asia/Kolkata"


def is_valid_timezone(time_zone: Optional[str]) -> bool:
    """Validates whether an IANA timezone string is valid."""
    if not time_zone or not isinstance(time_zone, str):
        return False
    try:
        ZoneInfo(time_zone.strip())
        return True
    except Exception:
        return False


@dataclass
class TemporalContext:
    current_date: str  # e.g., "Friday, September 11, 2026"
    current_day: str   # e.g., "Friday"
    current_time: str  # e.g., "12:22 PM"
    timezone: str      # e.g., "Asia/Kolkata"
    iso_date: str      # e.g., "2026-09-11"
    iso_string: str    # e.g., "2026-09-11T12:22:46+05:30"
    year: int
    month: int
    day: int


@dataclass
class CalendarDayInfo:
    weekday: str       # e.g., "Saturday"
    full_date: str     # e.g., "Saturday, September 12, 2026"
    iso_date: str      # e.g., "2026-09-12"
    day_offset: int    # 0 for today, 1 for tomorrow, etc.


@dataclass
class CalendarContext:
    today: CalendarDayInfo
    tomorrow: CalendarDayInfo
    day_after_tomorrow: CalendarDayInfo
    upcoming_days: List[CalendarDayInfo]
    timezone: str


def get_temporal_context(
    now: Optional[datetime] = None,
    time_zone: Optional[str] = DEFAULT_TIMEZONE,
) -> TemporalContext:
    """Returns structured authoritative temporal context evaluated at runtime for the given timezone."""
    resolved_tz_name = time_zone.strip() if (time_zone and is_valid_timezone(time_zone)) else DEFAULT_TIMEZONE
    tz = ZoneInfo(resolved_tz_name)

    if now is None:
        local_dt = datetime.now(tz)
    else:
        if now.tzinfo is None:
            local_dt = now.replace(tzinfo=timezone.utc).astimezone(tz)
        else:
            local_dt = now.astimezone(tz)

    current_date_str = local_dt.strftime("%A, %B %d, %Y")
    # Clean leading zeroes in day if any
    current_date_str = re.sub(r"\b0(\d)\b", r"\1", current_date_str)

    current_day_str = local_dt.strftime("%A")
    current_time_str = local_dt.strftime("%I:%M %p").lstrip("0")
    iso_date_str = local_dt.strftime("%Y-%m-%d")
    iso_string_str = local_dt.isoformat()

    return TemporalContext(
        current_date=current_date_str,
        current_day=current_day_str,
        current_time=current_time_str,
        timezone=resolved_tz_name,
        iso_date=iso_date_str,
        iso_string=iso_string_str,
        year=local_dt.year,
        month=local_dt.month,
        day=local_dt.day,
    )


def get_calendar_context(
    now: Optional[datetime] = None,
    time_zone: Optional[str] = DEFAULT_TIMEZONE,
) -> CalendarContext:
    """Returns structured deterministic calendar context calculated dynamically from the clock."""
    resolved_tz_name = time_zone.strip() if (time_zone and is_valid_timezone(time_zone)) else DEFAULT_TIMEZONE
    tz = ZoneInfo(resolved_tz_name)

    if now is None:
        local_dt = datetime.now(tz)
    else:
        if now.tzinfo is None:
            local_dt = now.replace(tzinfo=timezone.utc).astimezone(tz)
        else:
            local_dt = now.astimezone(tz)

    base_date = local_dt.date()
    upcoming_days: List[CalendarDayInfo] = []

    for i in range(8):
        target_date = base_date + timedelta(days=i)
        # Construct noon datetime on target calendar date in target timezone to ensure weekday name formatting
        target_dt = datetime.combine(target_date, dtime(12, 0), tzinfo=tz)

        weekday_str = target_dt.strftime("%A")
        full_date_str = target_dt.strftime("%A, %B %d, %Y")
        full_date_str = re.sub(r"\b0(\d)\b", r"\1", full_date_str)
        iso_date_str = target_date.strftime("%Y-%m-%d")

        upcoming_days.append(
            CalendarDayInfo(
                weekday=weekday_str,
                full_date=full_date_str,
                iso_date=iso_date_str,
                day_offset=i,
            )
        )

    today_info = upcoming_days[0]
    tomorrow_info = upcoming_days[1]
    day_after_tomorrow_info = upcoming_days[2]

    return CalendarContext(
        today=today_info,
        tomorrow=tomorrow_info,
        day_after_tomorrow=day_after_tomorrow_info,
        upcoming_days=upcoming_days,
        timezone=resolved_tz_name,
    )


def build_temporal_and_calendar_instructions(
    now: Optional[datetime] = None,
    time_zone: Optional[str] = DEFAULT_TIMEZONE,
) -> str:
    """Builds authoritative temporal and calendar instructions to inject into LLM system prompt."""
    temporal_ctx = get_temporal_context(now, time_zone)
    cal_ctx = get_calendar_context(now, time_zone)

    lines = [
        f"\n\n=== RUNTIME TEMPORAL CONTEXT ===",
        f"- Current Date: {temporal_ctx.current_date} (YYYY-MM-DD: {temporal_ctx.iso_date})",
        f"- Current Day of Week: {temporal_ctx.current_day}",
        f"- Current Local Time: {temporal_ctx.current_time}",
        f"- Timezone: {temporal_ctx.timezone}",
        f"- ISO Reference: {temporal_ctx.iso_string}",
        f"",
        f"=== RUNTIME CALENDAR REFERENCE ({cal_ctx.timezone}) ===",
        f"- Today / आज: {cal_ctx.today.full_date} (Date: {cal_ctx.today.iso_date})",
        f"- Tomorrow / कल / उद्या: {cal_ctx.tomorrow.full_date} (Date: {cal_ctx.tomorrow.iso_date})",
        f"- Day After Tomorrow / परसों / परवा: {cal_ctx.day_after_tomorrow.full_date} (Date: {cal_ctx.day_after_tomorrow.iso_date})",
        f"- Next 7 Days Reference Table:",
    ]

    for day in cal_ctx.upcoming_days:
        tag = " (Today / आज)" if day.day_offset == 0 else " (Tomorrow / कल)" if day.day_offset == 1 else " (Day After Tomorrow / परसों)" if day.day_offset == 2 else ""
        lines.append(f"  * {day.full_date} -> {day.iso_date}{tag}")

    lines.extend([
        f"",
        f"CRITICAL DATE & TIME GROUNDING RULES:",
        f"1. AUTHORITATIVE CURRENT DATE: Today is strictly {temporal_ctx.current_date} ({temporal_ctx.iso_date}). You MUST state this date when asked 'आज की डेट क्या है?', 'what is today's date?', or similar.",
        f"2. NO HISTORICAL DATES: Never use past years (such as 2024 or 2025) from model memory or training data. Always use the current year {temporal_ctx.year}.",
        f"3. RELATIVE DATE RESOLUTION:",
        f"   - 'today' / 'आज' -> strictly {cal_ctx.today.iso_date}",
        f"   - 'tomorrow' / 'कल' / 'उद्या' -> strictly {cal_ctx.tomorrow.iso_date}",
        f"   - 'day after tomorrow' / 'परसों' / 'परवा' -> strictly {cal_ctx.day_after_tomorrow.iso_date}",
        f"4. APPOINTMENT BOOKING: When invoking `book_appointment`, you MUST provide `bookingDate` formatted as YYYY-MM-DD using the calendar above. Never submit a past date.",
        f"5. CLARIFICATION: If the user provides an ambiguous date or an invalid weekday/date combination, ask politely for clarification.",
    ])

    return "\n".join(lines)


# Month name to number mapping for natural language parsing
MONTH_MAP: Dict[str, int] = {
    "jan": 1, "january": 1, "जनवरी": 1,
    "feb": 2, "february": 2, "फ़रवरी": 2, "फरवरी": 2,
    "mar": 3, "march": 3, "मार्च": 3,
    "apr": 4, "april": 4, "अप्रैल": 4,
    "may": 5, "मई": 5,
    "jun": 6, "june": 6, "जून": 6,
    "jul": 7, "july": 7, "जुलाई": 7,
    "aug": 8, "august": 8, "अगस्त": 8,
    "sep": 9, "sept": 9, "september": 9, "सितंबर": 9, "सप्टेंबर": 9,
    "oct": 10, "october": 10, "अक्टूबर": 10,
    "nov": 11, "november": 11, "नवंबर": 11,
    "dec": 12, "december": 12, "दिसंबर": 12,
}

WEEKDAY_MAP: Dict[str, int] = {
    "monday": 0, "mon": 0, "सोमवार": 0,
    "tuesday": 1, "tue": 1, "मंगलवार": 1,
    "wednesday": 2, "wed": 2, "बुधवार": 2,
    "thursday": 3, "thu": 3, "गुरुवार": 3, "बृहस्पतिवार": 3,
    "friday": 4, "fri": 4, "शुक्रवार": 4,
    "saturday": 5, "sat": 5, "शनिवार": 5,
    "sunday": 6, "sun": 6, "रविवार": 6,
}


def resolve_relative_or_absolute_date(
    expression: str,
    now: Optional[datetime] = None,
    time_zone: Optional[str] = DEFAULT_TIMEZONE,
) -> Optional[str]:
    """Resolves relative date expressions or parses natural absolute date expressions to YYYY-MM-DD.
    
    Supports:
    - "today", "आज", "aaj" -> YYYY-MM-DD
    - "tomorrow", "कल", "kal", "उद्या", "udya" -> YYYY-MM-DD
    - "day after tomorrow", "परसों", "parso", "parson", "परवा", "parva" -> YYYY-MM-DD
    - "yesterday", "बीता हुआ कल", "काल" -> YYYY-MM-DD
    - Standard ISO: "2026-09-15"
    - Slash/Hyphen: "15/09/2026", "15-09-2026", "15/9/2026", "15-9-2026"
    - Word dates: "15 September", "September 15", "15 September 2026", "15th September"
    - "next Monday", "next Friday"
    """
    if not expression or not isinstance(expression, str) or not expression.strip():
        return None

    expr = expression.strip().lower()
    temporal_ctx = get_temporal_context(now, time_zone)
    base_date = date(temporal_ctx.year, temporal_ctx.month, temporal_ctx.day)

    # 1. Direct Relative Keywords
    if expr in ("today", "आज", "aaj"):
        return base_date.strftime("%Y-%m-%d")
    if expr in ("tomorrow", "कल", "kal", "उद्या", "udya"):
        return (base_date + timedelta(days=1)).strftime("%Y-%m-%d")
    if expr in ("day after tomorrow", "day-after-tomorrow", "परसों", "parso", "parson", "परवा", "parva"):
        return (base_date + timedelta(days=2)).strftime("%Y-%m-%d")
    if expr in ("yesterday", "काल", "beeta hua kal", "beeta kal"):
        return (base_date + timedelta(days=-1)).strftime("%Y-%m-%d")

    # 2. ISO Date: YYYY-MM-DD
    iso_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", expr)
    if iso_match:
        try:
            y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
            return date(y, m, d).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # 3. Numeric Date: DD/MM/YYYY or DD-MM-YYYY
    dmy_match = re.match(r"^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$", expr)
    if dmy_match:
        try:
            d, m, y = int(dmy_match.group(1)), int(dmy_match.group(2)), int(dmy_match.group(3))
            return date(y, m, d).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # 4. Numeric Date without year: DD/MM or DD-MM -> current year
    dm_match = re.match(r"^(\d{1,2})[/\-\.](\d{1,2})$", expr)
    if dm_match:
        try:
            d, m = int(dm_match.group(1)), int(dm_match.group(2))
            return date(temporal_ctx.year, m, d).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # 5. Natural date with month name (e.g. "15 September", "September 15", "15th September 2026")
    cleaned = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", expr)
    # Pattern: DD Month [YYYY]
    d_month_match = re.match(r"^(\d{1,2})\s+([a-zA-Z\u0900-\u097F]+)(?:\s+(\d{4}))?$", cleaned)
    if d_month_match:
        d_val = int(d_month_match.group(1))
        m_str = d_month_match.group(2).lower()
        y_val = int(d_month_match.group(3)) if d_month_match.group(3) else temporal_ctx.year
        if m_str in MONTH_MAP:
            try:
                return date(y_val, MONTH_MAP[m_str], d_val).strftime("%Y-%m-%d")
            except ValueError:
                return None

    # Pattern: Month DD [YYYY]
    month_d_match = re.match(r"^([a-zA-Z\u0900-\u097F]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$", cleaned)
    if month_d_match:
        m_str = month_d_match.group(1).lower()
        d_val = int(month_d_match.group(2))
        y_val = int(month_d_match.group(3)) if month_d_match.group(3) else temporal_ctx.year
        if m_str in MONTH_MAP:
            try:
                return date(y_val, MONTH_MAP[m_str], d_val).strftime("%Y-%m-%d")
            except ValueError:
                return None

    # 6. Next <Weekday> (e.g. "next monday", "अगले सोमवार")
    next_weekday_match = re.match(r"^(?:next|अगले|पुढील)\s+([a-zA-Z\u0900-\u097F]+)$", expr)
    if next_weekday_match:
        w_str = next_weekday_match.group(1).lower()
        if w_str in WEEKDAY_MAP:
            target_weekday = WEEKDAY_MAP[w_str]
            current_weekday = base_date.weekday()
            days_ahead = target_weekday - current_weekday
            if days_ahead <= 0:
                days_ahead += 7
            return (base_date + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    return None


def is_past_date(
    date_str: str,
    now: Optional[datetime] = None,
    time_zone: Optional[str] = DEFAULT_TIMEZONE,
) -> bool:
    """Returns True if the given date string is strictly before the current local date."""
    resolved_iso = resolve_relative_or_absolute_date(date_str, now=now, time_zone=time_zone)
    if not resolved_iso:
        # If unable to parse, check simple YYYY-MM-DD
        if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str.strip()):
            resolved_iso = date_str.strip()
        else:
            return False

    try:
        y, m, d = [int(p) for p in resolved_iso.split("-")]
        target_date = date(y, m, d)
        temporal_ctx = get_temporal_context(now, time_zone)
        current_date = date(temporal_ctx.year, temporal_ctx.month, temporal_ctx.day)
        return target_date < current_date
    except Exception:
        return False


def parse_time_to_24h(time_str: str) -> Optional[tuple[int, int]]:
    """Parses standard or Indic time strings into (hour_24, minute).
    
    Examples:
        - "10:00 AM" -> (10, 0)
        - "01:30 PM" -> (13, 30)
        - "12:00 PM" -> (12, 0)
        - "12:30 AM" -> (0, 30)
        - "17:00" -> (17, 0)
    """
    if not time_str or not isinstance(time_str, str):
        return None
    s = time_str.strip().upper()
    # Normalize Devanagari numerals if any
    dev_map = {"०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"}
    for k, v in dev_map.items():
        s = s.replace(k, v)

    match = re.search(r"(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?", s)
    if not match:
        return None

    hour = int(match.group(1))
    minute = int(match.group(2)) if match.group(2) else 0
    tag = match.group(3)

    if tag == "PM":
        if hour < 12:
            hour += 12
    elif tag == "AM":
        if hour == 12:
            hour = 0
    elif hour <= 12 and not tag:
        # Default heuristics if untagged: 9-11 -> AM, 1-8 -> PM, 12 -> PM
        if hour < 9:
            hour += 12

    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return (hour, minute)
    return None


def is_past_slot(
    date_str: str,
    time_str: str,
    now: Optional[datetime] = None,
    time_zone: Optional[str] = DEFAULT_TIMEZONE,
    buffer_minutes: int = 0,
) -> bool:
    """Returns True if the combined appointment date and time slot is in the past relative to the local clock.
    
    Checks:
    1. If date is strictly before today -> True (past date)
    2. If date is in the future -> False (future date)
    3. If date is TODAY -> evaluates whether slot time is <= current local time.
    """
    if is_past_date(date_str, now=now, time_zone=time_zone):
        return True

    resolved_iso = resolve_relative_or_absolute_date(date_str, now=now, time_zone=time_zone)
    if not resolved_iso:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str.strip()):
            resolved_iso = date_str.strip()
        else:
            return False

    try:
        y, m, d = [int(p) for p in resolved_iso.split("-")]
        target_date = date(y, m, d)
        temporal_ctx = get_temporal_context(now, time_zone)
        current_date = date(temporal_ctx.year, temporal_ctx.month, temporal_ctx.day)

        # If strictly in the future, it is not in the past
        if target_date > current_date:
            return False

        # If today, compare the slot time with current local time
        parsed_time = parse_time_to_24h(time_str)
        if not parsed_time:
            return False

        slot_h, slot_m = parsed_time
        resolved_tz_name = time_zone.strip() if (time_zone and is_valid_timezone(time_zone)) else DEFAULT_TIMEZONE
        tz = ZoneInfo(resolved_tz_name)

        if now is None:
            local_now = datetime.now(tz)
        else:
            if now.tzinfo is None:
                local_now = now.replace(tzinfo=timezone.utc).astimezone(tz)
            else:
                local_now = now.astimezone(tz)

        slot_dt = datetime.combine(target_date, dtime(slot_h, slot_m), tzinfo=tz)
        # Check if slot datetime is at or before current time (accounting for optional buffer)
        cutoff_dt = local_now - timedelta(minutes=buffer_minutes)
        return slot_dt <= cutoff_dt
    except Exception as e:
        logger.warning(f"[TemporalContext] Error evaluating is_past_slot for {date_str} {time_str}: {e}")
        return False
