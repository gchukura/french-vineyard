/** Display formatting. Fixed locale and time zone so server and client agree. */

const eur = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEur(amount: number): string {
  return eur.format(amount);
}

const count = new Intl.NumberFormat("en-GB");

export function formatCount(n: number): string {
  return count.format(n);
}

const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Parses a Sheet date ("2026-10-24", optionally with a time) into the
 * machine and human forms used by <time>. Returns null if unparseable.
 */
export function parseSheetDate(value: string): { iso: string; label: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1) return null;
  return { iso: `${y}-${mo}-${d}`, label: longDate.format(date) };
}
