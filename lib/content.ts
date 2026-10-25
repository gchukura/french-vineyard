import type { Hotel, Tour } from "@/lib/sheet-schema";

/** Pure helpers shared by the page templates. Nothing here reads the Sheet. */

// ---------------------------------------------------------------------------
// Tours: always the owner's rows in the owner's order
// ---------------------------------------------------------------------------

/** Owner rank ascending; unranked tours go last, then by title. */
export function byRank<T extends Pick<Tour, "rank" | "title">>(tours: T[]): T[] {
  return [...tours].sort(
    (a, b) =>
      (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title),
  );
}

/** Rows whose `id` is listed, in the listed order. Unknown ids are dropped. */
export function pickByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const index = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => index.get(id.trim()) ?? []);
}

/** Groups preserving first-seen order of keys. */
export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): [K, T[]][] {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups];
}

export const TIER_ORDER = ["budget", "mid", "luxury"] as const;

export function hotelsByTier<T extends Pick<Hotel, "tier">>(hotels: T[]): [Hotel["tier"], T[]][] {
  return TIER_ORDER.map(
    (tier) => [tier, hotels.filter((h) => h.tier === tier)] as [Hotel["tier"], T[]],
  ).filter(([, list]) => list.length > 0);
}

// ---------------------------------------------------------------------------
// Tour filters
// ---------------------------------------------------------------------------

/** Hours from free-text durations like "4 hours", "90 minutes", "2h30", "Full day". */
export function parseDurationHours(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const s = text.toLowerCase().replace(",", ".");
  if (/full[- ]day/.test(s)) return 8;
  if (/half[- ]day/.test(s)) return 4;
  const days = /(\d+(?:\.\d+)?)\s*days?\b/.exec(s);
  if (days) return Number(days[1]) * 24;
  // "3–4 hours": the lower bound.
  const range = /(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?\s*h/.exec(s);
  if (range) return Number(range[1]);
  // "4 hours", "2h30", "1 hour 30 minutes".
  const hm = /(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(\d{1,2})?/.exec(s);
  if (hm) return Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : 0);
  const mins = /(\d+)\s*min/.exec(s);
  if (mins) return Number(mins[1]) / 60;
  return undefined;
}

export const DURATION_BUCKETS = [
  { id: "short", label: "Under 3 hours", test: (h: number) => h < 3 },
  { id: "half", label: "3–6 hours", test: (h: number) => h >= 3 && h <= 6 },
  { id: "full", label: "Full day or longer", test: (h: number) => h > 6 },
] as const;

export const PRICE_BUCKETS = [
  { id: "under-50", label: "Under €50", test: (p: number) => p < 50 },
  { id: "50-100", label: "€50–100", test: (p: number) => p >= 50 && p <= 100 },
  { id: "over-100", label: "Over €100", test: (p: number) => p > 100 },
] as const;

export type DurationBucket = (typeof DURATION_BUCKETS)[number]["id"];
export type PriceBucket = (typeof PRICE_BUCKETS)[number]["id"];

export function durationBucket(text: string | undefined): DurationBucket | undefined {
  const h = parseDurationHours(text);
  return h == null ? undefined : DURATION_BUCKETS.find((b) => b.test(h))?.id;
}

export function priceBucket(eur: number | undefined): PriceBucket | undefined {
  return eur == null ? undefined : PRICE_BUCKETS.find((b) => b.test(eur))?.id;
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthIndex(word: string): number {
  const w = word.trim().toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(w));
}

/**
 * Month indexes (0–11) from a best_months list: ["may", "june"] or ranges
 * like ["may-september"]; wraps over the new year ("nov-feb").
 */
export function parseMonths(items: string[]): Set<number> {
  const out = new Set<number>();
  for (const item of items) {
    const [from, to] = item.split(/\s*[-–]\s*/);
    const a = monthIndex(from ?? "");
    if (a < 0) continue;
    const b = to ? monthIndex(to) : a;
    if (b < 0) continue;
    for (let i = a; ; i = (i + 1) % 12) {
      out.add(i);
      if (i === b) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dates and geometry
// ---------------------------------------------------------------------------

/** The latest YYYY-MM-DD date among the inputs, or undefined. */
export function latestDate(dates: (string | undefined)[]): string | undefined {
  const iso = dates.flatMap((d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? [d.slice(0, 10)] : []));
  return iso.sort().at(-1);
}

export function centroid(
  points: { lat?: number; lng?: number }[],
): { lat: number; lng: number } | undefined {
  const pts = points.filter(
    (p): p is { lat: number; lng: number } => p.lat != null && p.lng != null,
  );
  if (!pts.length) return undefined;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

// ---------------------------------------------------------------------------
// MDX text
// ---------------------------------------------------------------------------

/** Markdown inline syntax stripped to plain text. */
export function plainText(md: string): string {
  return md
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A description-length excerpt: whole words, at most `max` characters. */
export function excerpt(md: string | undefined, max = 155): string | undefined {
  if (!md) return undefined;
  const text = plainText(md);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** Headings at `depth` ("## " for 2), as plain text, outside code fences. */
export function extractHeadings(md: string | undefined, depth = 2): string[] {
  if (!md) return [];
  const marker = `${"#".repeat(depth)} `;
  let fenced = false;
  const out: string[] = [];
  for (const line of md.split("\n")) {
    if (line.trimStart().startsWith("```")) fenced = !fenced;
    else if (!fenced && line.startsWith(marker)) out.push(plainText(line.slice(marker.length)));
  }
  return out;
}

/** Strips a leading "1." / "1)" / "#1" rank from a ranked-list heading. */
export function stripRank(heading: string): string {
  return heading.replace(/^#?\d+[.)]?\s+/, "");
}

export type DaySection = { title: string; body: string };

/** Splits an itinerary body on "## Day …" headings; text before the first day is the intro. */
export function splitDays(md: string | undefined): { intro: string; days: DaySection[] } {
  const days: DaySection[] = [];
  const intro: string[] = [];
  let current: DaySection | null = null;
  for (const line of (md ?? "").split("\n")) {
    const m = /^##\s+(day\s+\d+.*)$/i.exec(line);
    if (m) {
      current = { title: plainText(m[1]!), body: "" };
      days.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    } else {
      intro.push(line);
    }
  }
  return { intro: intro.join("\n").trim(), days: days.map((d) => ({ ...d, body: d.body.trim() })) };
}

// ---------------------------------------------------------------------------
// Static params
// ---------------------------------------------------------------------------

/** Placeholder used when a tab has no published rows yet; pages notFound() on it. */
export const PLACEHOLDER = "__placeholder__";

/**
 * Cache Components needs at least one param per dynamic route. With nothing
 * published yet, return a placeholder that the page turns into a 404.
 */
export function paramsOrPlaceholder<K extends string>(
  key: K,
  values: string[],
): Record<K, string>[] {
  const list = values.length ? values : [PLACEHOLDER];
  return list.map((v) => ({ [key]: v }) as Record<K, string>);
}
