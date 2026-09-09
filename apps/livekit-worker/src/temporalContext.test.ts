import { describe, it, expect } from 'vitest';
import {
  getTemporalContext,
  buildTemporalInstruction,
  DEFAULT_TIMEZONE,
} from './temporalContext.ts';

describe('TemporalContext Helper (Module 3.3)', () => {
  it('1. Default timezone is Asia/Kolkata', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Kolkata');
    const ctx = getTemporalContext();
    expect(ctx.timezone).toBe('Asia/Kolkata');
  });

  it('2. Formats date, day, and time accurately for a deterministic IST timestamp', () => {
    // 2026-09-04T17:30:00.000Z is 23:00 (11:00 PM) on Friday, September 4, 2026 in Asia/Kolkata
    const fixedDate = new Date('2026-09-04T17:30:00.000Z');
    const ctx = getTemporalContext(fixedDate);

    expect(ctx.currentDay).toBe('Friday');
    expect(ctx.currentDate).toBe('Friday, September 4, 2026');
    expect(ctx.currentTime).toMatch(/11:00\s*PM/i);
    expect(ctx.timezone).toBe('Asia/Kolkata');
  });

  it('3. buildTemporalInstruction formats runtime instruction section accurately', () => {
    const fixedDate = new Date('2026-09-04T17:30:00.000Z');
    const instruction = buildTemporalInstruction(fixedDate);

    expect(instruction).toContain('=== RUNTIME TEMPORAL CONTEXT ===');
    expect(instruction).toContain('Current Date: Friday, September 4, 2026');
    expect(instruction).toContain('Current Day of Week: Friday');
    expect(instruction).toMatch(/Current Local Time: 11:00\s*PM/i);
    expect(instruction).toContain('Timezone: Asia/Kolkata');
    expect(instruction).toContain('Use it to interpret "today", "tomorrow", and weekday/date relationships accurately.');
  });

  it('4. Handles timezone day boundaries correctly (e.g. UTC date vs IST date)', () => {
    // 2026-09-04T19:00:00.000Z is 00:30 (12:30 AM) on Saturday, September 5, 2026 in Asia/Kolkata
    const lateUtcDate = new Date('2026-09-04T19:00:00.000Z');
    const ctx = getTemporalContext(lateUtcDate);

    expect(ctx.currentDay).toBe('Saturday');
    expect(ctx.currentDate).toBe('Saturday, September 5, 2026');
    expect(ctx.currentTime).toMatch(/12:30\s*AM/i);
  });

  it('5. Allows calculating relative dates (today vs tomorrow)', () => {
    const today = new Date('2026-09-04T10:00:00.000Z'); // Friday Sep 4, 2026 in IST
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Saturday Sep 5, 2026 in IST

    const todayCtx = getTemporalContext(today);
    const tomorrowCtx = getTemporalContext(tomorrow);

    expect(todayCtx.currentDay).toBe('Friday');
    expect(tomorrowCtx.currentDay).toBe('Saturday');
    expect(todayCtx.currentDate).toContain('September 4, 2026');
    expect(tomorrowCtx.currentDate).toContain('September 5, 2026');
  });
});
