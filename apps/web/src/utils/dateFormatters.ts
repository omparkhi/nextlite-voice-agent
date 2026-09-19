/**
 * Utility functions for standard DD/MM/YYYY date presentation in CRM UI.
 */

export function formatDateDDMMYYYY(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const trimmed = dateStr.trim();
  if (!trimmed) return '-';

  // If already in DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle YYYY-MM-DD
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  // Handle Date parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return trimmed;
}

export function formatDateTimeDDMMYYYY(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return dateStr;

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  const time = parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `${day}/${month}/${year} ${time}`;
}
