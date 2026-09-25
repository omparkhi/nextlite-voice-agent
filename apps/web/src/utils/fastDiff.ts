/**
 * Ultra-fast shallow and entity-level diffing utilities.
 * Prevents unnecessary React re-renders and eliminates screen flickering
 * when background polling receives unchanged data from the server.
 */

export function areEntitiesEqual<T extends { id?: string | number; updatedAt?: string; status?: string; createdAt?: string }>(
  prev: T[] | null | undefined,
  next: T[] | null | undefined
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    const p = prev[i] as any;
    const n = next[i] as any;

    if (!p || !n) return false;
    if (p.id !== n.id) return false;
    if (p.status !== n.status) return false;
    if (p.updatedAt !== n.updatedAt) return false;
    if (p.createdAt !== n.createdAt) return false;
    if (p.bookingDate !== n.bookingDate) return false;
    if (p.bookingTime !== n.bookingTime) return false;
    if (p.customerName !== n.customerName) return false;
    if (p.customerPhone !== n.customerPhone) return false;
    if (p.callerNumber !== n.callerNumber) return false;
    if (p.durationSeconds !== n.durationSeconds) return false;
    if (p.bookedBy !== n.bookedBy) return false;
    if (p.walkIn !== n.walkIn) return false;
  }

  return true;
}

export function areObjectsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) {
      if (typeof a[key] === 'object' && typeof b[key] === 'object') {
        if (!areObjectsEqual(a[key], b[key])) return false;
      } else {
        return false;
      }
    }
  }

  return true;
}
