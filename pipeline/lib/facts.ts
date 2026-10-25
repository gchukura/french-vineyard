import { createHash } from "node:crypto";

import { z } from "zod";

/**
 * The research fact sheet. Every fact carries its own `sources`; a fact whose
 * sources don't survive `keepSourced` is dropped before the sheet is stored.
 */

const sources = z.array(z.string()).default([]);
const note = z.string().nullable().optional();

export const factSheetSchema = z.object({
  subject: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number(), sources }).nullable().default(null),
  from_paris: z
    .array(
      z.object({
        mode: z.enum(["train", "car", "bus", "plane"]),
        route: z.string(),
        // Null when no source gives a time; the route itself is still a fact.
        duration_minutes: z.number().nullable(),
        changes: z.number().nullable().optional(),
        notes: note,
        sources,
      }),
    )
    .default([]),
  opening_months: z
    .object({ months: z.array(z.string()), notes: note, sources })
    .nullable()
    .default(null),
  tasting_price_eur: z
    .object({ min: z.number().nullable(), max: z.number().nullable(), notes: note, sources })
    .nullable()
    .default(null),
  estates: z
    .array(
      z.object({
        name: z.string(),
        town: z.string().nullable().optional(),
        visits: z.enum(["walk-in", "booking", "appointment"]).nullable().optional(),
        tasting_fee_eur: z.number().nullable().optional(),
        website: z.string().nullable().optional(),
        notes: note,
        sources,
      }),
    )
    .default([]),
  nearest_station: z
    .object({
      name: z.string(),
      distance_km: z.number().nullable().optional(),
      notes: note,
      sources,
    })
    .nullable()
    .default(null),
  warnings: z.array(z.object({ text: z.string(), sources })).default([]),
  other_facts: z.array(z.object({ claim: z.string(), sources })).default([]),
});

export type FactSheet = z.infer<typeof factSheetSchema>;

/** A stored fact sheet: the facts plus the deduplicated source list. */
export type StoredFactSheet = FactSheet & { sources: { url: string; title?: string }[] };

/** Canonical form for comparing URLs: no fragment, tracking params or trailing slash. */
export function normalizeUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.replace(/^www\./, "");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  const s = url.toString().replace(/\/$/, "");
  return s.replace(/^http:/, "https:");
}

/** The last fenced ```json block in a reply, or the whole reply if it is bare JSON. */
export function extractJsonBlock(text: string): unknown {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  const raw = blocks.length ? blocks[blocks.length - 1][1] : text.trim();
  return JSON.parse(raw);
}

/**
 * Drops every fact without at least one source URL that research actually
 * saw (search results and citations). Returns the kept sheet, with only the
 * seen sources on each fact, and a description of every dropped fact.
 */
export function keepSourced(
  sheet: FactSheet,
  seen: Map<string, string | undefined>,
): { facts: StoredFactSheet; dropped: string[] } {
  const known = new Map<string, { url: string; title?: string }>();
  for (const [url, title] of seen) {
    const key = normalizeUrl(url);
    if (key) known.set(key, { url, title });
  }
  const used = new Map<string, { url: string; title?: string }>();
  const dropped: string[] = [];

  const filter = (list: string[]) =>
    list.flatMap((u) => {
      const key = normalizeUrl(u);
      const hit = key ? known.get(key) : undefined;
      if (!hit) return [];
      used.set(key!, hit);
      return [hit.url];
    });

  function one<T extends { sources: string[] }>(fact: T | null, label: string): T | null {
    if (!fact) return null;
    const kept = filter(fact.sources);
    if (!kept.length) {
      dropped.push(label);
      return null;
    }
    return { ...fact, sources: kept };
  }
  function many<T extends { sources: string[] }>(list: T[], label: (f: T) => string): T[] {
    return list.flatMap((f) => {
      const kept = one(f, label(f));
      return kept ? [kept] : [];
    });
  }

  const facts: FactSheet = {
    subject: sheet.subject,
    coordinates: one(sheet.coordinates, "coordinates"),
    from_paris: many(sheet.from_paris, (f) => `from_paris: ${f.route}`),
    opening_months: one(sheet.opening_months, "opening_months"),
    tasting_price_eur: one(sheet.tasting_price_eur, "tasting_price_eur"),
    estates: many(sheet.estates, (f) => `estate: ${f.name}`),
    nearest_station: one(sheet.nearest_station, "nearest_station"),
    warnings: many(sheet.warnings, (f) => `warning: ${f.text}`),
    other_facts: many(sheet.other_facts, (f) => `fact: ${f.claim}`),
  };
  return { facts: { ...facts, sources: [...used.values()] }, dropped };
}

/** JSON.stringify with sorted keys, so equal sheets serialize identically. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Hash of what the sheet says, ignoring which URLs said it and list order, so
 * a refresh that finds the same facts on different pages counts as unchanged.
 */
export function factsHash(sheet: FactSheet): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip).map(stableStringify).sort();
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== "sources" && k !== "notes")
          .map(([k, x]) => [k, typeof x === "string" ? x.trim().toLowerCase() : strip(x)]),
      );
    }
    return v;
  };
  return createHash("sha256")
    .update(stableStringify(strip({ ...sheet, sources: undefined })))
    .digest("hex")
    .slice(0, 16);
}

/** How many facts the sheet holds (each list entry and each non-null object). */
export function countFacts(sheet: FactSheet): number {
  return (
    [
      sheet.coordinates,
      sheet.opening_months,
      sheet.tasting_price_eur,
      sheet.nearest_station,
    ].filter(Boolean).length +
    sheet.from_paris.length +
    sheet.estates.length +
    sheet.warnings.length +
    sheet.other_facts.length
  );
}
