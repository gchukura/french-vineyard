import { z } from "zod";

/**
 * Pure helpers for the hotels:* commands: hotel links the owner pastes
 * (Booking.com and Expedia), tiers from official star ratings, the research
 * reply, the rules a hotel must meet to go live and the "where to stay"
 * Queue rows. Which hotels are on the site is the owner's choice: only links
 * the owner pasted are ever imported.
 */

export type ParsedHotelUrl =
  | { kind: "hotel"; provider: "booking"; bookingId: string; name: string; url: string }
  | {
      kind: "hotel";
      provider: "expedia";
      expediaId: string;
      name: string;
      city?: string;
      url: string;
    }
  | { kind: "listing"; reason: string }
  | { kind: "unknown"; reason: string };

const BOOKING_HOST = /(^|\.)booking\.com$/i;
const EXPEDIA_HOST = /(^|\.)expedia\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i;

/** "royal-champagne" or "Royal-Champagne-Hotel-Spa" -> "Royal Champagne" / "Royal Champagne Hotel Spa". */
export const nameFromSlug = (slug: string) =>
  slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

/**
 * A hotel page pasted by the owner. Only the URL is read.
 * - Booking.com: `/hotel/fr/royal-champagne.html` (or `.en-gb.html`) → booking_hotel_id `fr/royal-champagne`.
 * - Expedia: `/Epernay-Hotels-BB-Hotel-Epernay.h71589144.Hotel-Information` → expedia_id `71589144`.
 * City, region and search pages are refused with a reason.
 */
export function parseHotelUrl(raw: string): ParsedHotelUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: "unknown", reason: "not a URL" };
  }
  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  const path = url.pathname;

  if (BOOKING_HOST.test(url.hostname)) {
    const m = /^\/hotel\/([a-z]{2})\/([a-z0-9-]+?)(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.html$/i.exec(path);
    if (!m) return { kind: "listing", reason: "a Booking.com city, region or search page" };
    const [cc, slug] = [m[1].toLowerCase(), m[2].toLowerCase()];
    return {
      kind: "hotel",
      provider: "booking",
      bookingId: `${cc}/${slug}`,
      name: nameFromSlug(slug),
      url: `https://www.booking.com/hotel/${cc}/${slug}.html`,
    };
  }
  if (EXPEDIA_HOST.test(url.hostname)) {
    const m = /\/(?:(.+?)-Hotels-)?([^/]*?)\.?h(\d+)\.Hotel-Information$/.exec(path);
    if (!m) return { kind: "listing", reason: "an Expedia destination, filter or search page" };
    return {
      kind: "hotel",
      provider: "expedia",
      expediaId: m[3],
      name: m[2] ? nameFromSlug(m[2]) : "",
      city: m[1] ? nameFromSlug(m[1]) : undefined,
      url: url.toString(),
    };
  }
  return { kind: "unknown", reason: `${url.hostname} is not Booking.com or Expedia` };
}

/** booking-royal-champagne, expedia-71589144. */
export const hotelRowId = (p: Extract<ParsedHotelUrl, { kind: "hotel" }>) =>
  p.provider === "booking" ? `booking-${p.bookingId.split("/")[1]}` : `expedia-${p.expediaId}`;

export type Tier = "budget" | "mid" | "luxury";

/**
 * The tier from the official French classification: a Palace or 5 stars is
 * luxury, 4 stars mid-range, 1 to 3 stars budget. Unclassified hotels have
 * no tier and wait for the owner.
 */
export function tierFor(stars: number | null | undefined, palace = false): Tier | undefined {
  if (palace || (stars != null && stars >= 5)) return "luxury";
  if (stars === 4) return "mid";
  if (stars != null && stars >= 1 && stars <= 3) return "budget";
  return undefined;
}

export const BLURB_MAX = 220;

/** What the research call returns for one hotel. */
export const hotelResearchSchema = z.object({
  name: z.string(),
  /** One of the town names it was given, or null when the hotel is in none of them. */
  town: z.string().nullable(),
  address: z.string().nullish(),
  stars: z.number().int().min(1).max(5).nullish(),
  palace: z.boolean().nullish(),
  official_url: z.string().nullish(),
  best_for: z.string(),
  blurb: z.string(),
  sources: z.array(z.object({ url: z.string(), quote: z.string() })).default([]),
});
export type HotelResearch = z.infer<typeof hotelResearchSchema>;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The Towns row a research reply names, accents and case aside. */
export function matchTown<T extends { name: string; slug: string }>(
  name: string | null | undefined,
  towns: T[],
): T | undefined {
  if (!name) return undefined;
  return towns.find((t) => fold(t.name) === fold(name) || t.slug === fold(name).replace(/ /g, "-"));
}

/**
 * Why a researched hotel can't go live yet: not in one of the site's towns,
 * no official classification in a quoted source (so no tier), or no
 * bookable link. Copy problems are checked separately (checkShortCopy).
 */
export function hotelProblems(
  research: HotelResearch,
  town: unknown,
  sourcedQuotes: string[],
  links: { booking?: string; expedia?: string },
): string[] {
  const problems: string[] = [];
  if (!town)
    problems.push(
      research.town ? `${research.town} is not one of the site's towns` : "town not found",
    );
  const classified =
    research.palace ||
    (research.stars != null &&
      sourcedQuotes.some((q) =>
        new RegExp(`\\b${research.stars}[- ]?(?:star|étoile|\\*|★)`, "i").test(q),
      ));
  if (!classified) problems.push("no official star rating in a quoted source, so no tier");
  if (!links.booking && !links.expedia) problems.push("no Booking.com or Expedia link");
  return problems;
}

/** Distance in km between two points. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export type RoundupPlan = {
  slug: string;
  region_slug: string;
  town_slug?: string;
  place: string;
  hotels: number;
};

/**
 * "Where to stay" pages to queue: one per town with at least `min`
 * published hotels, and one per region whose published hotels reach `min`
 * across at least two towns. Skips any slug already in Articles or the
 * Queue, and any hotel_roundup Queue row for the same town or region.
 */
export function roundupsToQueue(
  hotels: { town_slug: string; status: string }[],
  towns: { slug: string; name: string; region_slug: string }[],
  regions: { slug: string; name: string }[],
  articles: { slug: string }[],
  queue: { slug: string; page_type?: string; region_slug?: string; town_slug?: string }[],
  min = 3,
): RoundupPlan[] {
  const live = hotels.filter((h) => h.status === "published");
  const plans: RoundupPlan[] = [];
  for (const t of towns) {
    const n = live.filter((h) => h.town_slug === t.slug).length;
    if (n >= min)
      plans.push({
        slug: `where-to-stay-in-${t.slug}`,
        region_slug: t.region_slug,
        town_slug: t.slug,
        place: t.name,
        hotels: n,
      });
  }
  for (const r of regions) {
    const inRegion = live.filter(
      (h) => towns.find((t) => t.slug === h.town_slug)?.region_slug === r.slug,
    );
    if (inRegion.length >= min && new Set(inRegion.map((h) => h.town_slug)).size >= 2)
      plans.push({
        slug: `where-to-stay-in-${r.slug}`,
        region_slug: r.slug,
        place: r.name,
        hotels: inRegion.length,
      });
  }
  const taken = new Set([...articles.map((a) => a.slug), ...queue.map((q) => q.slug)]);
  return plans.filter(
    (p) =>
      !taken.has(p.slug) &&
      !queue.some(
        (q) =>
          q.page_type === "hotel_roundup" &&
          q.region_slug === p.region_slug &&
          (q.town_slug || undefined) === p.town_slug,
      ),
  );
}
