/**
 * Deterministic Runtime Calendar Context Helper for LiveKit Voice Agent.
 * Uses native JavaScript Date and Intl.DateTimeFormat with configurable IANA timezone.
 * Generates dynamic weekday/date mappings for today, tomorrow, and the next 7 days,
 * using calendar-aware date progression that is 100% resilient across Daylight Saving Time (DST) shifts.
 */

export { DEFAULT_TIMEZONE, isValidTimeZone } from './temporalContext.ts';
import { DEFAULT_TIMEZONE, isValidTimeZone } from './temporalContext.ts';

export interface CalendarDayInfo {
  weekday: string;
  fullDate: string;
  dateString: string;
  dayOffset: number;
}

export interface CalendarContext {
  today: CalendarDayInfo;
  tomorrow: CalendarDayInfo;
  upcomingDays: CalendarDayInfo[];
  timezone: string;
}

/**
 * Returns structured deterministic calendar context calculated dynamically from the clock.
 * Optional `now` parameter allows deterministic unit testing without hardcoded dates.
 * 
 * Uses calendar-aware progression: extracts base local date in the target timezone,
 * then advances calendar days deterministically using UTC noon reference timestamps.
 */
export function getCalendarContext(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): CalendarContext {
  const resolvedTimeZone = isValidTimeZone(timeZone) ? timeZone.trim() : DEFAULT_TIMEZONE;

  // 1. Extract local year, month, and day in the target timezone
  const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const parts = partsFormatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const baseYear = parseInt(partMap.year!, 10);
  const baseMonth = parseInt(partMap.month!, 10) - 1; // 0-indexed for Date.UTC
  const baseDay = parseInt(partMap.day!, 10);

  // Formatters for target calendar days
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  });

  const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const upcomingDays: CalendarDayInfo[] = [];

  // 2. Advance calendar days deterministically (0 through 7)
  for (let i = 0; i <= 7; i++) {
    // UTC noon reference timestamp for (baseYear, baseMonth, baseDay + i)
    // Completely immune to local 23-hour or 25-hour DST shifts.
    const targetCalendarDate = new Date(Date.UTC(baseYear, baseMonth, baseDay + i, 12, 0, 0));

    upcomingDays.push({
      weekday: weekdayFormatter.format(targetCalendarDate),
      fullDate: dateFormatter.format(targetCalendarDate),
      dateString: shortDateFormatter.format(targetCalendarDate),
      dayOffset: i,
    });
  }

  const todayInfo = upcomingDays[0]!;
  const tomorrowInfo = upcomingDays[1]!;

  return {
    today: todayInfo,
    tomorrow: tomorrowInfo,
    upcomingDays,
    timezone: resolvedTimeZone,
  };
}

/**
 * Builds deterministic calendar reference instructions to inject into the voice agent runtime.
 */
export function buildCalendarInstruction(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const ctx = getCalendarContext(now, timeZone);

  let text = `\n\n=== RUNTIME CALENDAR REFERENCE (${ctx.timezone}) ===\n`;
  text += `- Today: ${ctx.today.fullDate}\n`;
  text += `- Tomorrow: ${ctx.tomorrow.fullDate}\n`;
  text += `- Next 7 Days Reference:\n`;

  for (const day of ctx.upcomingDays) {
    const tag = day.dayOffset === 0 ? ' (Today)' : day.dayOffset === 1 ? ' (Tomorrow)' : '';
    text += `  * ${day.fullDate}${tag}\n`;
  }

  text += `CALENDAR RULES:\n`;
  text += `- Use the provided calendar reference for weekday/date interpretation. Do not independently calculate weekday/date relationships.\n`;
  text += `- If the caller provides a weekday and date that conflict with the calendar reference, ask the caller to clarify instead of guessing.\n`;

  return text;
}
