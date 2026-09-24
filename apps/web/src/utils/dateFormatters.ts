/**
 * Utility functions for standard DD/MM/YYYY date presentation in CRM UI.
 */

export function parseUtcDate(dateStr?: string | number | null): Date | null {
  if (dateStr === undefined || dateStr === null || dateStr === '') return null;
  if (typeof dateStr === 'number') {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;

  // If ISO string without timezone indicator (no 'Z' and no '+00:00'/'-05:00'), append 'Z' to treat as UTC from DB
  const isIsoFormat = trimmed.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(trimmed);
  const hasTimezone = trimmed.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(trimmed);

  const normalized = (isIsoFormat && !hasTimezone) ? `${trimmed}Z` : trimmed;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateDDMMYYYY(dateStr?: string | number | null): string {
  if (!dateStr) return '-';
  const trimmed = typeof dateStr === 'string' ? dateStr.trim() : String(dateStr);
  if (!trimmed) return '-';

  // If already in DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle YYYY-MM-DD
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  // Handle Date parse
  const parsed = parseUtcDate(trimmed);
  if (parsed && !isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return trimmed;
}

export function formatDateTimeDDMMYYYY(dateStr?: string | number | null): string {
  if (!dateStr) return '-';
  const parsed = parseUtcDate(dateStr);
  if (!parsed || isNaN(parsed.getTime())) return String(dateStr);

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  const time = parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `${day}/${month}/${year} ${time}`;
}

export function formatTimeOnly(dateStr?: string | number | null): string {
  if (!dateStr) return '-';
  const parsed = parseUtcDate(dateStr);
  if (!parsed || isNaN(parsed.getTime())) return String(dateStr);
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

