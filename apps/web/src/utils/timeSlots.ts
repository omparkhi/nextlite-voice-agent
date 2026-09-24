/**
 * Utility functions for dynamic clinic business hours, shift parsing, 
 * time normalization, and time slot generation.
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

export function parseBusinessShifts(businessHours?: string): Array<[number, number]> {
  if (!businessHours || !businessHours.trim()) {
    // Default standard operating range: 8:00 AM (480) to 9:30 PM (1290)
    return [[8 * 60, 21 * 60 + 30]];
  }

  const shifts: Array<[number, number]> = [];
  // Split by comma, semicolon, or slash to support multi-shift clinics (e.g., "9am-1pm, 5pm-9pm")
  const parts = businessHours.split(/[,;/]+/);

  for (const part of parts) {
    const range = part.split(/[-–—to]+/i);
    if (range.length === 2) {
      const startMin = parseTimeToMinutes(range[0].trim());
      const endMin = parseTimeToMinutes(range[1].trim());
      if (startMin !== null && endMin !== null && endMin > startMin) {
        shifts.push([startMin, endMin]);
      }
    }
  }

  if (shifts.length === 0) {
    return [[8 * 60, 21 * 60 + 30]];
  }

  return shifts;
}

/**
 * Generate standard selectable slot intervals across the day (06:00 AM to 11:30 PM)
 * with zero restrictions so doctors and staff can book any time slot freely.
 */
export function generateTimeSlots(_businessHours?: string, intervalMinutes: number = 30): string[] {
  const slots: string[] = [];
  // Full operating range from 06:00 AM (360) to 11:30 PM (1410)
  for (let m = 6 * 60; m <= 23 * 60 + 30; m += intervalMinutes) {
    slots.push(formatMinutesToTime(m));
  }
  return slots;
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
