/**
 * Runtime Temporal Context Helper for LiveKit Voice Agent.
 * Uses native JavaScript Date and Intl.DateTimeFormat with configurable IANA timezone.
 */

export interface TemporalContext {
  currentDate: string;
  currentDay: string;
  currentTime: string;
  timezone: string;
  isoString: string;
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Validates whether an IANA timezone string is valid in the current environment.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns structured temporal context evaluated at runtime for the given timezone.
 * Optional `now` parameter allows deterministic unit testing.
 */
export function getTemporalContext(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): TemporalContext {
  const resolvedTimeZone = isValidTimeZone(timeZone) ? timeZone.trim() : DEFAULT_TIMEZONE;

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    weekday: 'long',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  });

  return {
    currentDate: dateFormatter.format(now),
    currentDay: dayFormatter.format(now),
    currentTime: timeFormatter.format(now),
    timezone: resolvedTimeZone,
    isoString: now.toISOString(),
  };
}

/**
 * Builds a clean instruction string to inject into the agent's runtime instructions.
 */
export function buildTemporalInstruction(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const ctx = getTemporalContext(now, timeZone);
  return (
    `\n\n=== RUNTIME TEMPORAL CONTEXT ===\n` +
    `- Current Date: ${ctx.currentDate}\n` +
    `- Current Day of Week: ${ctx.currentDay}\n` +
    `- Current Local Time: ${ctx.currentTime}\n` +
    `- Timezone: ${ctx.timezone}\n` +
    `IMPORTANT: This is the current session time reference. Use it to interpret "today", "tomorrow", and weekday/date relationships accurately. Do not expose internal technical timestamps to the caller.`
  );
}
