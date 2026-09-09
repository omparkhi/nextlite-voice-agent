import { describe, it, expect } from 'vitest';
import {
  getTemporalContext,
  buildTemporalInstruction,
  isValidTimeZone,
  DEFAULT_TIMEZONE,
} from '../temporalContext.ts';
import {
  getCalendarContext,
  buildCalendarInstruction,
} from '../calendarContext.ts';

describe('Generic Multi-Timezone & DST Temporal Engine', () => {
  describe('1. Timezone Validation & Fallback', () => {
    it('validates legitimate IANA timezone identifiers', () => {
      expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
      expect(isValidTimeZone('Europe/London')).toBe(true);
      expect(isValidTimeZone('Europe/Paris')).toBe(true);
      expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
      expect(isValidTimeZone('Asia/Dubai')).toBe(true);
      expect(isValidTimeZone('UTC')).toBe(true);
    });

    it('rejects invalid or malformed timezone identifiers', () => {
      expect(isValidTimeZone('Invalid/Timezone')).toBe(false);
      expect(isValidTimeZone('Mars/Phobos')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone(null as any)).toBe(false);
      expect(isValidTimeZone(undefined as any)).toBe(false);
    });

    it('falls back safely to Asia/Kolkata when timezone is invalid or omitted', () => {
      const defaultCtx = getTemporalContext(new Date('2026-09-08T12:00:00.000Z'));
      expect(defaultCtx.timezone).toBe(DEFAULT_TIMEZONE);
      expect(defaultCtx.timezone).toBe('Asia/Kolkata');

      const invalidCtx = getTemporalContext(new Date('2026-09-08T12:00:00.000Z'), 'Mars/Phobos');
      expect(invalidCtx.timezone).toBe('Asia/Kolkata');
    });
  });

  describe('2. Multi-Timezone Formatting for Single UTC Instant', () => {
    // 2026-09-08T22:30:00.000Z
    // In UTC: Tuesday, September 8, 2026, 10:30 PM
    // In America/New_York (EDT, UTC-4): Tuesday, September 8, 2026, 6:30 PM
    // In America/Los_Angeles (PDT, UTC-7): Tuesday, September 8, 2026, 3:30 PM
    // In Asia/Kolkata (IST, UTC+5:30): Wednesday, September 9, 2026, 4:00 AM
    // In Asia/Tokyo (JST, UTC+9): Wednesday, September 9, 2026, 7:30 AM
    const fixedInstant = new Date('2026-09-08T22:30:00.000Z');

    it('formats accurately for America/New_York (US Eastern)', () => {
      const ctx = getTemporalContext(fixedInstant, 'America/New_York');
      expect(ctx.timezone).toBe('America/New_York');
      expect(ctx.currentDay).toBe('Tuesday');
      expect(ctx.currentDate).toBe('Tuesday, September 8, 2026');
      expect(ctx.currentTime).toMatch(/6:30\s*PM/i);
    });

    it('formats accurately for America/Los_Angeles (US Pacific)', () => {
      const ctx = getTemporalContext(fixedInstant, 'America/Los_Angeles');
      expect(ctx.timezone).toBe('America/Los_Angeles');
      expect(ctx.currentDay).toBe('Tuesday');
      expect(ctx.currentDate).toBe('Tuesday, September 8, 2026');
      expect(ctx.currentTime).toMatch(/3:30\s*PM/i);
    });

    it('formats accurately for Asia/Kolkata (IST, next calendar day)', () => {
      const ctx = getTemporalContext(fixedInstant, 'Asia/Kolkata');
      expect(ctx.timezone).toBe('Asia/Kolkata');
      expect(ctx.currentDay).toBe('Wednesday');
      expect(ctx.currentDate).toBe('Wednesday, September 9, 2026');
      expect(ctx.currentTime).toMatch(/4:00\s*AM/i);
    });

    it('formats accurately for Asia/Tokyo (JST, next calendar day)', () => {
      const ctx = getTemporalContext(fixedInstant, 'Asia/Tokyo');
      expect(ctx.timezone).toBe('Asia/Tokyo');
      expect(ctx.currentDay).toBe('Wednesday');
      expect(ctx.currentDate).toBe('Wednesday, September 9, 2026');
      expect(ctx.currentTime).toMatch(/7:30\s*AM/i);
    });
  });

  describe('3. Daylight Saving Time (DST) Transitions in America/New_York', () => {
    // 3.1 Fall Back Transition (2026-11-01): Clocks move back 1 hour from 2:00 AM EDT to 1:00 AM EST (25-hour day)
    it('handles Fall Back (25-hour day) in America/New_York with strictly consecutive calendar days', () => {
      // 2026-11-01 at 05:00 UTC is 01:00 EDT in America/New_York
      const fallBackDate = new Date('2026-11-01T05:00:00.000Z');
      const cal = getCalendarContext(fallBackDate, 'America/New_York');

      expect(cal.timezone).toBe('America/New_York');
      expect(cal.today.fullDate).toBe('Sunday, November 1, 2026');
      expect(cal.tomorrow.fullDate).toBe('Monday, November 2, 2026');

      expect(cal.upcomingDays).toHaveLength(8);
      expect(cal.upcomingDays[0].fullDate).toBe('Sunday, November 1, 2026');
      expect(cal.upcomingDays[1].fullDate).toBe('Monday, November 2, 2026');
      expect(cal.upcomingDays[2].fullDate).toBe('Tuesday, November 3, 2026');
      expect(cal.upcomingDays[3].fullDate).toBe('Wednesday, November 4, 2026');
      expect(cal.upcomingDays[4].fullDate).toBe('Thursday, November 5, 2026');
      expect(cal.upcomingDays[5].fullDate).toBe('Friday, November 6, 2026');
      expect(cal.upcomingDays[6].fullDate).toBe('Saturday, November 7, 2026');
      expect(cal.upcomingDays[7].fullDate).toBe('Sunday, November 8, 2026');

      // Check offset invariants
      for (let i = 0; i < cal.upcomingDays.length; i++) {
        expect(cal.upcomingDays[i].dayOffset).toBe(i);
      }
    });

    // 3.2 Spring Forward Transition (2026-03-08): Clocks move forward 1 hour from 2:00 AM EST to 3:00 AM EDT (23-hour day)
    it('handles Spring Forward (23-hour day) in America/New_York with strictly consecutive calendar days', () => {
      // 2026-03-08 at 06:00 UTC is 01:00 EST in America/New_York
      const springForwardDate = new Date('2026-03-08T06:00:00.000Z');
      const cal = getCalendarContext(springForwardDate, 'America/New_York');

      expect(cal.timezone).toBe('America/New_York');
      expect(cal.today.fullDate).toBe('Sunday, March 8, 2026');
      expect(cal.tomorrow.fullDate).toBe('Monday, March 9, 2026');

      expect(cal.upcomingDays).toHaveLength(8);
      expect(cal.upcomingDays[0].fullDate).toBe('Sunday, March 8, 2026');
      expect(cal.upcomingDays[1].fullDate).toBe('Monday, March 9, 2026');
      expect(cal.upcomingDays[2].fullDate).toBe('Tuesday, March 10, 2026');
      expect(cal.upcomingDays[3].fullDate).toBe('Wednesday, March 11, 2026');
      expect(cal.upcomingDays[4].fullDate).toBe('Thursday, March 12, 2026');
      expect(cal.upcomingDays[5].fullDate).toBe('Friday, March 13, 2026');
      expect(cal.upcomingDays[6].fullDate).toBe('Saturday, March 14, 2026');
      expect(cal.upcomingDays[7].fullDate).toBe('Sunday, March 15, 2026');

      for (let i = 0; i < cal.upcomingDays.length; i++) {
        expect(cal.upcomingDays[i].dayOffset).toBe(i);
      }
    });
  });

  describe('4. Instruction Injection Strings with Dynamic Timezones', () => {
    it('buildTemporalInstruction reflects configured timezone', () => {
      const fixedDate = new Date('2026-09-08T18:00:00.000Z');
      const instructionNY = buildTemporalInstruction(fixedDate, 'America/New_York');
      expect(instructionNY).toContain('Timezone: America/New_York');
      expect(instructionNY).toContain('Current Date: Tuesday, September 8, 2026');
      expect(instructionNY).toMatch(/Current Local Time: 2:00\s*PM/i);

      const instructionTokyo = buildTemporalInstruction(fixedDate, 'Asia/Tokyo');
      expect(instructionTokyo).toContain('Timezone: Asia/Tokyo');
      expect(instructionTokyo).toContain('Current Date: Wednesday, September 9, 2026');
      expect(instructionTokyo).toMatch(/Current Local Time: 3:00\s*AM/i);
    });

    it('buildCalendarInstruction reflects configured timezone header', () => {
      const fixedDate = new Date('2026-09-08T18:00:00.000Z');
      const instruction = buildCalendarInstruction(fixedDate, 'Europe/London');
      expect(instruction).toContain('=== RUNTIME CALENDAR REFERENCE (Europe/London) ===');
      expect(instruction).toContain('- Today: Tuesday, September 8, 2026');
      expect(instruction).toContain('- Tomorrow: Wednesday, September 9, 2026');
      expect(instruction).toContain('CALENDAR RULES:');
    });
  });
});
