/** ISO dates (yyyy-mm-dd) in UTC, matching the Sheet's updated_at columns. */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds calendar months, clamping to the month's last day (Aug 31 + 6 -> Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return isoDate(target);
}

/** True when `date` is on or before `today`. Blank dates are never due. */
export function isDue(date: string | undefined, today: string): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return false;
  return date.slice(0, 10) <= today;
}
