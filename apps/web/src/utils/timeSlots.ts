/**
 * Utility functions for dynamic clinic business hours, shift parsing, 
 * time normalization, and grouped 2-column shift slot generation.
 */

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const s = timeStr.trim().toUpperCase();

  // Try 12-hour format with AM/PM (e.g. "09:30 AM", "8:15PM", "8 PM", "12:00 PM")
  const ampmMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3].toUpperCase();

    if (hours === 12) {
      hours = period === 'AM' ? 0 : 12;
    } else if (period === 'PM') {
      hours += 12;
    }
    return hours * 60 + minutes;
  }

  // Try 24-hour format (e.g. "09:30", "14:00", "20:30")
  const h24Match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const minutes = parseInt(h24Match[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  return null;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const normMins = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normMins / 60);
  const minutes = normMins % 60;

  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;

  const padH = String(hours12).padStart(2, '0');
  const padM = String(minutes).padStart(2, '0');
  return `${padH}:${padM} ${period}`;
}

export function normalizeTimeString(input: string): string {
  if (!input || !input.trim()) return '';
  const parsed = parseTimeToMinutes(input);
  if (parsed !== null) {
    return formatMinutesToTime(parsed);
  }
  return input.trim();
}

export function parseSlotDurationMinutes(slotDuration?: any): number {
  if (!slotDuration) return 30;
  const s = String(slotDuration).toLowerCase();
  const match = s.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (s.includes('hour') || s.includes('hr')) {
      return num * 60;
    }
    if (num > 0 && num <= 240) {
      return num;
    }
  }
  return 30;
}

export interface ShiftGroup {
  id: string;
  timeRange: string;
  isMorning: boolean;
  slots: string[];
}

/**
 * Intelligent NLP parser for clinic business hours text.
 * Automatically extracts valid morning/evening shifts while discarding break/lunch/closed clauses.
 * 
 * Example:
 * "Monday to Saturday: Morning 10:00 AM to 01:00 PM and Evening 06:00 PM to 09:00 PM. Afternoon Break (01:00 PM to 06:00 PM) is strictly closed. Sunday: Closed."
 * -> [[600, 780], [1080, 1260]] (10 AM - 1 PM & 6 PM - 9 PM)
 */
export function parseBusinessShifts(businessHours?: string): Array<[number, number]> {
  const defaultShifts: Array<[number, number]> = [[10 * 60, 13 * 60], [18 * 60, 21 * 60]]; // 10:00 AM - 1:00 PM & 6:00 PM - 9:00 PM

  if (!businessHours || !businessHours.trim()) {
    return defaultShifts;
  }

  const text = businessHours.trim();
  const rangePattern = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*(?:to|-|–|—|until)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi;

  const foundShifts: Array<[number, number]> = [];
  let match: RegExpExecArray | null;

  while ((match = rangePattern.exec(text)) !== null) {
    const startRaw = match[1].trim();
    const endRaw = match[2].trim();
    const matchIndex = match.index;
    const matchLength = match[0].length;

    let startMin = parseTimeToMinutes(startRaw);
    let endMin = parseTimeToMinutes(endRaw);

    // If start is missing AM/PM, infer from context or endMin
    if (startMin === null && !/(?:am|pm)/i.test(startRaw) && endMin !== null) {
      const parsedNum = parseInt(startRaw, 10);
      if (!isNaN(parsedNum)) {
        if (endMin >= 12 * 60 && parsedNum < 12 && parsedNum >= (endMin / 60) - 6) {
          startMin = parsedNum >= 8 ? parsedNum * 60 : (parsedNum + 12) * 60;
        } else {
          startMin = parsedNum * 60;
        }
      }
    }

    if (startMin !== null && endMin !== null && startMin < endMin) {
      // Find surrounding sentence/clause context
      const clauseDelims = ['.', ';', '\n', '|', '(', ')'];
      let clauseStart = 0;
      for (const d of clauseDelims) {
        const pos = text.lastIndexOf(d, matchIndex);
        if (pos !== -1 && pos + 1 > clauseStart) {
          clauseStart = pos + 1;
        }
      }

      let clauseEnd = text.length;
      for (const d of clauseDelims) {
        const pos = text.indexOf(d, matchIndex + matchLength);
        if (pos !== -1 && pos < clauseEnd) {
          clauseEnd = pos;
        }
      }

      const clauseText = text.substring(clauseStart, clauseEnd).toLowerCase();
      const leadingContext = text.substring(Math.max(0, clauseStart - 35), clauseStart).toLowerCase();
      const combinedContext = `${leadingContext} ${clauseText}`;

      const negativeKeywords = ['break', 'closed', 'lunch', 'off', 'holiday', 'strictly closed', 'बंद', 'सुट्टी'];
      const isNegative = negativeKeywords.some((kw) => combinedContext.includes(kw));

      if (isNegative) {
        // If it's a break clause, check if it explicitly mentions "open" or "shift"
        const isExplicitOpen = ['morning', 'evening', 'shift', 'open'].some((pw) => clauseText.includes(pw));
        if (!isExplicitOpen) {
          continue; // Discard break/closed range
        }
      }

      foundShifts.push([startMin, endMin]);
    }
  }

  if (foundShifts.length > 0) {
    foundShifts.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const s of foundShifts) {
      if (merged.length === 0) {
        merged.push(s);
      } else {
        const prev = merged[merged.length - 1];
        if (s[0] <= prev[1]) {
          prev[1] = Math.max(prev[1], s[1]);
        } else {
          merged.push(s);
        }
      }
    }
    return merged;
  }

  return defaultShifts;
}

/**
 * Generates categorized 2-column shift groups based dynamically on clinic business hours and slot duration.
 */
export function generateGroupedTimeSlots(
  businessHours?: string,
  slotDuration?: any
): ShiftGroup[] {
  const intervalMinutes = parseSlotDurationMinutes(slotDuration);
  const shifts = parseBusinessShifts(businessHours);
  const groups: ShiftGroup[] = [];

  shifts.forEach(([startMin, endMin], index) => {
    const slots: string[] = [];
    for (let m = startMin; m < endMin; m += intervalMinutes) {
      slots.push(formatMinutesToTime(m));
    }

    if (slots.length > 0) {
      const isMorning = startMin < 14 * 60; // Starts before 2:00 PM
      const timeRange = `${formatMinutesToTime(startMin)} – ${formatMinutesToTime(endMin)}`;

      groups.push({
        id: `shift-${index}`,
        timeRange,
        isMorning,
        slots,
      });
    }
  });

  return groups;
}

/**
 * Returns a flat array of all valid selectable slot intervals from active shifts.
 */
export function generateTimeSlots(businessHours?: string, slotDuration?: any): string[] {
  const groups = generateGroupedTimeSlots(businessHours, slotDuration);
  const allSlots: string[] = [];
  for (const group of groups) {
    allSlots.push(...group.slots);
  }
  return allSlots.length > 0 ? allSlots : [
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
    '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM'
  ];
}

/**
 * Select the next upcoming slot relative to the current local time.
 */
export function getNearestUpcomingSlot(slots: string[], defaultSlot: string = '10:00 AM'): string {
  if (!slots || slots.length === 0) return defaultSlot;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Find the first slot strictly after current time
  for (const slot of slots) {
    const slotMin = parseTimeToMinutes(slot);
    if (slotMin !== null && slotMin >= currentMinutes) {
      return slot;
    }
  }

  // If past all slots for today, return the first slot of the day
  return slots[0];
}
