import { describe, it, expect } from 'vitest';
import {
  getCalendarContext,
  buildCalendarInstruction,
  DEFAULT_TIMEZONE,
} from './calendarContext.ts';

describe('CalendarContext Helper (Module 3.3.1)', () => {
  it('1. Default timezone is Asia/Kolkata', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Kolkata');
    const ctx = getCalendarContext();
    expect(ctx.timezone).toBe('Asia/Kolkata');
  });

  it('2. Fixed Friday, September 4, 2026 maps Monday to September 7, 2026 and Tuesday to September 8, 2026', () => {
    // 2026-09-04T12:00:00.000Z is 17:30 IST on Friday, September 4, 2026
    const fixedFriday = new Date('2026-09-04T12:00:00.000Z');
    const ctx = getCalendarContext(fixedFriday);

    // Today & Tomorrow checks
    expect(ctx.today.weekday).toBe('Friday');
    expect(ctx.today.fullDate).toBe('Friday, September 4, 2026');
    expect(ctx.tomorrow.weekday).toBe('Saturday');
    expect(ctx.tomorrow.fullDate).toBe('Saturday, September 5, 2026');

    // Upcoming Days checks
    expect(ctx.upcomingDays).toHaveLength(8);
    expect(ctx.upcomingDays[0].fullDate).toBe('Friday, September 4, 2026');
    expect(ctx.upcomingDays[1].fullDate).toBe('Saturday, September 5, 2026');
    expect(ctx.upcomingDays[2].weekday).toBe('Sunday');
    expect(ctx.upcomingDays[2].fullDate).toBe('Sunday, September 6, 2026');
    expect(ctx.upcomingDays[3].weekday).toBe('Monday');
    expect(ctx.upcomingDays[3].fullDate).toBe('Monday, September 7, 2026');
    expect(ctx.upcomingDays[4].weekday).toBe('Tuesday');
    expect(ctx.upcomingDays[4].fullDate).toBe('Tuesday, September 8, 2026');
    expect(ctx.upcomingDays[5].weekday).toBe('Wednesday');
    expect(ctx.upcomingDays[5].fullDate).toBe('Wednesday, September 9, 2026');
    expect(ctx.upcomingDays[6].weekday).toBe('Thursday');
    expect(ctx.upcomingDays[6].fullDate).toBe('Thursday, September 10, 2026');
    expect(ctx.upcomingDays[7].weekday).toBe('Friday');
    expect(ctx.upcomingDays[7].fullDate).toBe('Friday, September 11, 2026');
  });

  it('3. Generates internally consistent weekday and date pairs across the 7-day window', () => {
    const testDate = new Date('2027-05-10T06:00:00.000Z'); // Monday, May 10, 2027
    const ctx = getCalendarContext(testDate);

    expect(ctx.today.weekday).toBe('Monday');
    expect(ctx.today.fullDate).toBe('Monday, May 10, 2027');
    expect(ctx.tomorrow.weekday).toBe('Tuesday');
    expect(ctx.tomorrow.fullDate).toBe('Tuesday, May 11, 2027');

    for (let i = 0; i < ctx.upcomingDays.length; i++) {
      expect(ctx.upcomingDays[i].dayOffset).toBe(i);
      expect(ctx.upcomingDays[i].fullDate).toContain(ctx.upcomingDays[i].weekday);
    }
  });

  it('4. Handles year boundary rollovers seamlessly (e.g. Dec 30, 2027 -> Jan 2028)', () => {
    // 2027-12-30T10:00:00.000Z is Thursday, December 30, 2027
    const yearEndDate = new Date('2027-12-30T10:00:00.000Z');
    const ctx = getCalendarContext(yearEndDate);

    expect(ctx.today.fullDate).toBe('Thursday, December 30, 2027');
    expect(ctx.tomorrow.fullDate).toBe('Friday, December 31, 2027');

    // Check roll-over into 2028
    expect(ctx.upcomingDays[2].weekday).toBe('Saturday');
    expect(ctx.upcomingDays[2].fullDate).toBe('Saturday, January 1, 2028');

    expect(ctx.upcomingDays[3].weekday).toBe('Sunday');
    expect(ctx.upcomingDays[3].fullDate).toBe('Sunday, January 2, 2028');

    expect(ctx.upcomingDays[4].weekday).toBe('Monday');
    expect(ctx.upcomingDays[4].fullDate).toBe('Monday, January 3, 2028');
  });

  it('5. Dynamic calculation contains no stale hardcoded production dates when tested with future years', () => {
    // Testing in year 2029
    const futureDate = new Date('2029-03-15T10:00:00.000Z'); // Thursday, March 15, 2029
    const instruction = buildCalendarInstruction(futureDate);

    expect(instruction).toContain('2029');
    expect(instruction).not.toContain('2026');
    expect(instruction).toContain('Thursday, March 15, 2029');
    expect(instruction).toContain('Friday, March 16, 2029');
    expect(instruction).toContain('Use the provided calendar reference for weekday/date interpretation');
    expect(instruction).toContain('If the caller provides a weekday and date that conflict with the calendar reference');
  });

  it('6. buildCalendarInstruction formats a comprehensive reference with rules', () => {
    const fixedFriday = new Date('2026-09-04T12:00:00.000Z');
    const instruction = buildCalendarInstruction(fixedFriday);

    expect(instruction).toContain('=== RUNTIME CALENDAR REFERENCE (Asia/Kolkata) ===');
    expect(instruction).toContain('- Today: Friday, September 4, 2026');
    expect(instruction).toContain('- Tomorrow: Saturday, September 5, 2026');
    expect(instruction).toContain('- Next 7 Days Reference:');
    expect(instruction).toContain('* Friday, September 4, 2026 (Today)');
    expect(instruction).toContain('* Saturday, September 5, 2026 (Tomorrow)');
    expect(instruction).toContain('* Monday, September 7, 2026');
    expect(instruction).toContain('Do not independently calculate weekday/date relationships.');
    expect(instruction).toContain('If the caller provides a weekday and date that conflict with the calendar reference, ask the caller to clarify instead of guessing.');
  });
});
