import { z } from "zod";

/**
 * Zod schemas and row parsing for the content Sheet. Pure functions only:
 * fetching lives in lib/sheets.ts, which is the only module allowed to read
 * the Sheet.
 */

export const TABS = [
  "Regions",
  "SubRegions",
  "Towns",
  "Articles",
  "Hotels",
  "Tours",
  "Estates",
  "Config",
  "Images",
] as const;

export type Tab = (typeof TABS)[number];

/** Cache tag for a tab, e.g. "sheet-subregions". Apps Script uses the same rule. */
export function sheetTag(tab: Tab): string {
  return `sheet-${tab.toLowerCase()}`;
}

export class SheetRowError extends Error {
  constructor(
    readonly tab: string,
    /** 1-based row number as shown in the Sheet (header is row 1). */
    readonly row: number,
    readonly issues: string[],
  ) {
    super(`Sheet "${tab}" row ${row} is malformed:\n  - ${issues.join("\n  - ")}`);
    this.name = "SheetRowError";
  }
}

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const toText = (v: unknown) => (isBlank(v) ? undefined : String(v).trim());

const toNumber = (v: unknown) => {
  if (isBlank(v)) return undefined;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[\s€]/g, "");
  // Strip thousands separators ("1,204") but not decimal commas ("47,32"),
  // which are ambiguous and should fail validation instead.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isNaN(n) ? v : n;
};

// Optional variants put .optional() inside the preprocess so that a blank
// cell ("" -> undefined) passes rather than failing the inner type.
const text = z.preprocess(toText, z.string());
const optionalText = z.preprocess(toText, z.string().optional());

const SLUG = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase ASCII slug");
const slug = z.preprocess(toText, SLUG);
const optionalSlug = z.preprocess(toText, SLUG.optional());

const optionalNumber = z.preprocess(toNumber, z.number().optional());

const toLowerText = (v: unknown) => toText(v)?.toLowerCase();

/** Enum cell, matched case-insensitively ("Mid" -> "mid"). */
const choice = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(toLowerText, z.enum(values));
const optionalChoice = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(toLowerText, z.enum(values).optional());

const TRUE_VALUES = new Set(["true", "yes", "y", "1"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0"]);

const bool = z.preprocess((v) => {
  if (isBlank(v)) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (TRUE_VALUES.has(s)) return true;
  if (FALSE_VALUES.has(s)) return false;
  return v;
}, z.boolean());

/** Comma-separated list cell, e.g. "may, june, september". */
const list = z.preprocess(
  (v) =>
    isBlank(v)
      ? []
      : String(v)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
  z.array(z.string()),
);

/** JSON cell. Blank cells fall back to `empty` before validation. */
function json<T extends z.ZodType>(schema: T, empty: unknown) {
  return z.preprocess((v, ctx) => {
    if (isBlank(v)) return empty;
    try {
      return JSON.parse(String(v));
    } catch {
      ctx.addIssue({ code: "custom", message: "is not valid JSON" });
      return z.NEVER;
    }
  }, schema);
}

const status = z.preprocess(
  (v) => toLowerText(v) ?? "draft",
  z.enum(["draft", "published", "archived"]),
);

const faq = json(z.array(z.object({ question: z.string(), answer: z.string() })), []);

const heroImage = {
  hero_image: optionalText,
  hero_credit: optionalText,
  hero_license: optionalText,
  hero_source_url: optionalText,
  hero_is_ai: bool,
};

// ---------------------------------------------------------------------------
// Tab schemas
// ---------------------------------------------------------------------------

export const regionSchema = z.object({
  slug,
  name: text,
  name_fr: optionalText,
  tagline: optionalText,
  intro_mdx: optionalText,
  ...heroImage,
  lat: optionalNumber,
  lng: optionalNumber,
  airport: optionalText,
  tgv_from_paris: optionalText,
  best_months: list,
  signature_grape: optionalText,
  unesco: bool,
  gyg_location_id: optionalText,
  status,
  updated_at: optionalText,
});

export const subRegionSchema = z.object({
  slug,
  region_slug: slug,
  name: text,
  appellation_facts_json: json(z.record(z.string(), z.unknown()), {}),
  intro_mdx: optionalText,
  ...heroImage,
  status,
});

export const townSchema = z.object({
  slug,
  region_slug: slug,
  subregion_slug: optionalSlug,
  name: text,
  intro_mdx: optionalText,
  body_mdx: optionalText,
  lat: optionalNumber,
  lng: optionalNumber,
  station: optionalText,
  estates_json: json(z.array(z.string()), []),
  faq_json: faq,
  ...heroImage,
  status,
  updated_at: optionalText,
});

export const articleSchema = z.object({
  slug,
  page_type: choice(["guide", "ranked_list", "hotel_roundup", "itinerary", "practical"]),
  region_slug: optionalSlug,
  town_slug: optionalSlug,
  title: text,
  standfirst: optionalText,
  meta_description: optionalText,
  body_mdx: optionalText,
  faq_json: faq,
  schema_type: optionalText,
  tour_ids: list,
  hotel_ids: list,
  tags: list,
  cluster: optionalText,
  target_keyword: optionalText,
  secondary_keywords: list,
  search_intent: optionalText,
  ...heroImage,
  status,
  published_at: optionalText,
  updated_at: optionalText,
  refresh_after: optionalText,
});

export const hotelSchema = z.object({
  id: text,
  name: text,
  town_slug: slug,
  tier: choice(["budget", "mid", "luxury"]),
  booking_hotel_id: optionalText,
  expedia_id: optionalText,
  lat: optionalNumber,
  lng: optionalNumber,
  price_from_eur: optionalNumber,
  blurb: optionalText,
  best_for: optionalText,
  image: optionalText,
  image_credit: optionalText,
  // Hotels has no status column; every row is live.
  status: status.default("published"),
});

export const tourSchema = z.object({
  id: text,
  provider: choice(["gyg", "viator", "winalist"]),
  provider_id: text,
  provider_url: optionalText,
  region_slug: slug,
  town_slug: optionalSlug,
  category: optionalText,
  rank: optionalNumber,
  badge: optionalText,
  best_for: optionalText,
  why_picked: optionalText,
  title: text,
  price_from_eur: optionalNumber,
  duration: optionalText,
  rating: optionalNumber,
  review_count: optionalNumber,
  bullets_json: json(z.array(z.string()), []),
  image: optionalText,
  featured: bool,
  status,
  last_checked: optionalText,
});

export const estateSchema = z.object({
  id: text,
  name: text,
  town_slug: slug,
  appellation: optionalText,
  visits: optionalChoice(["walk-in", "booking", "appointment"]),
  tasting_fee_eur: optionalNumber,
  languages: list,
  website: optionalText,
  winalist_id: optionalText,
  // Estates has no status column; every row is live.
  status: status.default("published"),
});

/**
 * Config: key/value rows for site copy that is not tied to a region or town,
 * e.g. home_stats_json, home_faq_json, about_mdx, privacy_policy_mdx.
 */
export const configSchema = z.object({
  key: text,
  value: optionalText,
  updated_at: optionalText,
  // Rows go live only with status=published (like every tab with a status column).
  status: status.default("published"),
});

/** Images: one row per image used on the site, for /image-credits/. */
export const imageSchema = z.object({
  url: text,
  alt: optionalText,
  credit: optionalText,
  license: optionalText,
  source_url: optionalText,
  is_ai: bool,
  used_on: optionalText,
  status: status.default("published"),
});

export type Region = z.infer<typeof regionSchema>;
export type SubRegion = z.infer<typeof subRegionSchema>;
export type Town = z.infer<typeof townSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Hotel = z.infer<typeof hotelSchema>;
export type Tour = z.infer<typeof tourSchema>;
export type Estate = z.infer<typeof estateSchema>;
export type ConfigRow = z.infer<typeof configSchema>;
export type ImageRow = z.infer<typeof imageSchema>;
export type Faq = Town["faq_json"];

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

export type LoadOptions = { includeDrafts?: boolean };

type RawRow = { row: number; record: Record<string, unknown> };

/**
 * Turns the raw values grid (first row = headers) into records keyed by
 * header. Wholly blank rows are skipped; row numbers match the Sheet.
 */
export function rowsToRecords(values: unknown[][]): RawRow[] {
  const [header = [], ...rows] = values;
  const keys = header.map((h) => String(h ?? "").trim());
  const out: RawRow[] = [];
  rows.forEach((cells, i) => {
    if (cells.every(isBlank)) return;
    const record: Record<string, unknown> = {};
    keys.forEach((key, col) => {
      if (key) record[key] = cells[col];
    });
    out.push({ row: i + 2, record });
  });
  return out;
}

/**
 * Validates every row that will be returned and throws SheetRowError on the
 * first malformed one. Drafts are skipped before validation unless
 * includeDrafts is set, so half-written drafts never break the site.
 */
export function parseTab<T extends z.ZodType<{ status: string }>>(
  tab: string,
  values: unknown[][],
  schema: T,
  { includeDrafts = false }: LoadOptions = {},
): z.infer<T>[] {
  const result: z.infer<T>[] = [];
  for (const { row, record } of rowsToRecords(values)) {
    if (!includeDrafts && "status" in record) {
      const s = String(record.status ?? "")
        .trim()
        .toLowerCase();
      if (s !== "published") continue;
    }
    const parsed = schema.safeParse(record);
    if (!parsed.success) {
      throw new SheetRowError(
        tab,
        row,
        parsed.error.issues.map((i) => `${i.path.join(".") || "(row)"}: ${i.message}`),
      );
    }
    if (includeDrafts || parsed.data.status === "published") result.push(parsed.data);
  }
  return result;
}
