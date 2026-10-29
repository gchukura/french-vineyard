import { z } from "zod";

/**
 * Pure helpers for filling in a tour the owner imported: the GetYourGuide
 * Partner API reply, where the tour goes on the site (town, region,
 * category), the owner's selection rules (content/selection-rules.md) and
 * the next rank. Which tours exist is always the owner's choice: only rows
 * imported from links the owner pasted are ever filled in.
 */

/** The Tours category dropdown (docs/apps-script-tours.js). */
export const CATEGORIES = [
  "Cellar tours",
  "Vineyard tours",
  "Day trips from Paris",
  "Private tours",
  "Tastings and classes",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type TourFacts = {
  title: string;
  abstract: string;
  description: string;
  highlights: string[];
  rating?: number;
  reviews?: number;
  priceEur?: number;
  durations: { duration: number; unit: "day" | "hour" | "minute" }[];
  languages: string[];
  guideType?: string;
  hasPickUp?: boolean;
  cancellable?: boolean;
  cancellationFee?: number;
  activityType?: string;
  locations: { name: string; city?: string; lat?: number; lng?: number }[];
  lat?: number;
  lng?: number;
  /** Where to meet, or the pickup description. */
  meetingPoint?: string;
  /** Group size when the provider states it in a field (Viator, Winalist). */
  groupMax?: number;
  privateTour?: boolean;
};

const coords = z.object({ lat: z.number(), long: z.number() }).nullish();

const gygDetailsSchema = z.object({
  data: z.object({
    tours: z
      .array(
        z.object({
          title: z.string(),
          abstract: z.string().nullish(),
          description: z.string().nullish(),
          highlights: z.array(z.string()).nullish(),
          overall_rating: z.number().nullish(),
          number_of_ratings: z.number().nullish(),
          price: z
            .object({ values: z.object({ amount: z.number().nullish() }).nullish() })
            .nullish(),
          durations: z
            .array(z.object({ duration: z.number(), unit: z.enum(["day", "hour", "minute"]) }))
            .nullish(),
          cond_language: z.array(z.string()).nullish(),
          guide_type: z.string().nullish(),
          has_pick_up: z.boolean().nullish(),
          cancellation_policy: z
            .object({
              cancellable: z.boolean().nullish(),
              cancellation_fee_value: z.number().nullish(),
            })
            .nullish(),
          activity_type: z.string().nullish(),
          coordinates: coords,
          locations: z
            .array(
              z.object({
                name: z.string(),
                city: z.string().nullish(),
                coordinates: coords,
              }),
            )
            .nullish(),
        }),
      )
      .min(1),
  }),
});

/** The facts of one tour from GET /1/tours/{id} (cnt_language=en, currency=EUR). */
export function parseGygDetails(json: unknown): TourFacts {
  const t = gygDetailsSchema.parse(json).data.tours[0];
  return {
    title: t.title.trim(),
    abstract: t.abstract ?? "",
    description: t.description ?? "",
    highlights: (t.highlights ?? []).map((h) => h.trim()).filter(Boolean),
    rating: t.overall_rating != null ? Math.round(t.overall_rating * 10) / 10 : undefined,
    reviews: t.number_of_ratings ?? undefined,
    priceEur:
      t.price?.values?.amount != null ? Math.round(t.price.values.amount * 100) / 100 : undefined,
    durations: t.durations ?? [],
    languages: (t.cond_language ?? []).map((l) => l.toLowerCase()),
    guideType: t.guide_type ?? undefined,
    hasPickUp: t.has_pick_up ?? undefined,
    cancellable: t.cancellation_policy?.cancellable ?? undefined,
    cancellationFee: t.cancellation_policy?.cancellation_fee_value ?? undefined,
    activityType: t.activity_type ?? undefined,
    locations: (t.locations ?? []).map((l) => ({
      name: l.name,
      city: l.city ?? undefined,
      lat: l.coordinates?.lat,
      lng: l.coordinates?.long,
    })),
    lat: t.coordinates?.lat,
    lng: t.coordinates?.long,
  };
}

const gygOptionsSchema = z.object({
  data: z.object({
    tour_options: z
      .array(
        z.object({
          meeting_point: z.string().nullish(),
          meeting_point_address: z.string().nullish(),
          pick_up: z.string().nullish(),
        }),
      )
      .default([]),
  }),
});

/** The first meeting point, meeting address or pickup text among a tour's options (GET /1/tours/{id}/options). */
export function meetingPointFrom(json: unknown): string | undefined {
  for (const o of gygOptionsSchema.parse(json).data.tour_options) {
    const text = [o.meeting_point, o.meeting_point_address, o.pick_up].find((x) => x?.trim());
    if (text) return text.trim();
  }
  return undefined;
}

/** "4 hours", "1 hour 15 minutes", "45 minutes", "3–4 hours", "75–90 minutes", "1 day". */
export function formatDuration(durations: TourFacts["durations"]): string | undefined {
  if (!durations.length) return undefined;
  const minutes = (d: TourFacts["durations"][number]) =>
    Math.round(
      d.unit === "day" ? d.duration * 1440 : d.unit === "hour" ? d.duration * 60 : d.duration,
    );
  const values = durations.map(minutes).sort((a, b) => a - b);
  const [lo, hi] = [values[0], values[values.length - 1]];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (lo >= 1440) return plural(Math.round(lo / 1440), "day");
  if (lo === hi) {
    const [h, m] = [Math.floor(lo / 60), lo % 60];
    if (!h) return plural(m, "minute");
    return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
  }
  return lo % 60 === 0 && hi % 60 === 0 ? `${lo / 60}–${hi / 60} hours` : `${lo}–${hi} minutes`;
}

/** Accent- and case-insensitive words: "Épernay" -> " epernay ". */
const fold = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

/** Other names a region goes by in tour titles. */
const REGION_ALIASES: Record<string, string[]> = {
  burgundy: ["bourgogne", "cote d or", "cote de nuits", "cote de beaune"],
  bordeaux: ["saint emilion", "medoc", "gironde"],
  champagne: ["reims", "epernay"],
};

export type Placement = { region_slug?: string; town_slug?: string; how: string };

/**
 * Where a tour goes on the site: a town from the Towns tab named in its
 * locations or title, else a region named there, else the nearest town
 * within 30 km of its coordinates. Paris never counts as a place: day trips
 * from Paris belong to the wine region they visit.
 */
export function placeTour(
  facts: Pick<TourFacts, "title" | "locations" | "lat" | "lng">,
  towns: { slug: string; name: string; region_slug: string; lat?: number; lng?: number }[],
  regions: { slug: string; name: string }[],
): Placement {
  const places = facts.locations.flatMap((l) => [l.name, l.city ?? ""]).filter(Boolean);
  const haystacks = [...places.map(fold), fold(facts.title)];
  const named = (name: string) => haystacks.some((h) => h.includes(fold(name)));

  // Longer names first, so "Châlons-en-Champagne" wins over "Champagne".
  for (const t of [...towns].sort((a, b) => b.name.length - a.name.length)) {
    if (named(t.name))
      return { region_slug: t.region_slug, town_slug: t.slug, how: `names ${t.name}` };
  }
  for (const r of regions) {
    if ([r.name, ...(REGION_ALIASES[r.slug] ?? [])].some(named))
      return { region_slug: r.slug, how: `names ${r.name}` };
  }
  const points = [
    ...facts.locations.filter((l) => l.lat != null && l.lng != null && !/paris/i.test(l.name)),
    ...(facts.lat != null && facts.lng != null ? [{ lat: facts.lat, lng: facts.lng }] : []),
  ] as { lat: number; lng: number }[];
  let best: { town: (typeof towns)[number]; km: number } | undefined;
  for (const p of points)
    for (const t of towns) {
      if (t.lat == null || t.lng == null) continue;
      const km = distanceKm(p, { lat: t.lat, lng: t.lng });
      if (km <= 30 && (!best || km < best.km)) best = { town: t, km };
    }
  if (best)
    return {
      region_slug: best.town.region_slug,
      town_slug: best.town.slug,
      how: `${Math.round(best.km)} km from ${best.town.name}`,
    };
  return { how: "no known town or region in its locations, title or coordinates" };
}

/**
 * The category, from the API's activity type and the title, first match wins:
 * day trips from Paris, private tours, classes and tastings, bike and walking
 * tours in the vines, and cellar tours for everything else.
 */
export function categoryFor(
  facts: Pick<TourFacts, "title" | "activityType" | "locations">,
): Category {
  const title = facts.title.toLowerCase();
  const fromParis =
    /\bfrom paris\b/.test(title) ||
    (facts.activityType === "dayTrip" &&
      facts.locations.some((l) => /paris/i.test(l.city ?? l.name)));
  if (fromParis) return "Day trips from Paris";
  if (facts.activityType === "privateTour" || /\bprivate\b/.test(title)) return "Private tours";
  if (
    facts.activityType === "workshopOrClass" ||
    /\b(class|workshop|masterclass|course|lesson)\b/.test(title)
  )
    return "Tastings and classes";
  if (/\b(e-?bike|bike|bicycle|cycling|walk|walking|hike|hiking)\b/.test(title))
    return "Vineyard tours";
  if (
    /\btasting\b/.test(title) &&
    !/\b(tour|visit|cellars?|winer(y|ies)|estates?|houses?|maison)\b/.test(title)
  )
    return "Tastings and classes";
  return "Cellar tours";
}

/** Group size stated in the listing's text: a maximum, "small group" or "private". */
export function groupSizeIn(
  text: string,
): { max?: number; small?: boolean; private?: boolean } | undefined {
  const max =
    /(?:max(?:imum)?\.?|up to|limited to|no more than|groups? of(?: up to)?)\s*(\d{1,2})\s*(?:people|participants|guests|travel+ers|persons|pax)\b/i.exec(
      text,
    );
  if (max) return { max: Number(max[1]) };
  if (/\bprivate (?:tour|group|experience|visit)\b/i.test(text)) return { private: true };
  if (/\bsmall[- ]group\b/i.test(text)) return { small: true };
  return undefined;
}

const VISITS_WINE =
  /\b(winer(?:y|ies)|wine estates?|estates?|cellars?|caves?|vineyards?|vines|domaines?|ch[aâ]teaux?|champagne houses?|maisons?|growers?|winemakers?)\b/i;

/** Price tiers from the selection rules, with their labels. */
export const TIERS = ["under €60", "€60 to €150", "over €150"] as const;
/** 0: under €60, 1: €60 to €150 (both included), 2: over €150. */
export const tierOf = (price: number) => (price < 60 ? 0 : price <= 150 ? 1 : 2);

export type Peer = {
  id: string;
  region_slug?: string;
  category?: string;
  price_from_eur?: number;
  status: string;
  rank?: number;
};

/**
 * The owner's selection rules, checked against the API facts. Returns every
 * rule the tour misses; an empty list means it can be published. Peers are
 * the other Tours rows (for the one-tour-per-price-tier rule).
 */
export function selectionProblems(
  facts: TourFacts,
  placed: Placement,
  /** One of CATEGORIES, or whatever the owner typed in the row. */
  category: string,
  peers: Peer[],
): string[] {
  const problems: string[] = [];
  const text = [facts.title, facts.abstract, facts.description, ...facts.highlights].join("\n");
  const minReviews = category.trim().toLowerCase() === "day trips from paris" ? 100 : 50;

  if (!placed.region_slug) problems.push(`no region: ${placed.how}`);
  if (facts.rating == null || facts.rating < 4.5)
    problems.push(`rating ${facts.rating ?? "missing"} is below 4.5`);
  if (facts.reviews == null || facts.reviews < minReviews)
    problems.push(`${facts.reviews ?? 0} reviews; needs ${minReviews}+`);
  if (facts.cancellable !== true || (facts.cancellationFee ?? 0) > 0)
    problems.push("no free cancellation");
  const guided = !["self_guided", "audio_guide", "none"].includes(facts.guideType ?? "");
  if (!facts.languages.includes("en") || !guided) problems.push("no English-speaking guide");
  if (!facts.hasPickUp && !facts.meetingPoint) problems.push("no meeting point or pickup given");
  if (facts.groupMax == null && !facts.privateTour && !groupSizeIn(text))
    problems.push("group size not stated in the listing");
  if (!VISITS_WINE.test(text))
    problems.push("doesn't mention visiting an estate, cellar or vineyard");
  if (facts.priceEur == null) problems.push("no price");
  else if (placed.region_slug) {
    const tier = tierOf(facts.priceEur);
    const taken = peers.find(
      (p) =>
        p.status === "published" &&
        p.region_slug === placed.region_slug &&
        p.category?.trim().toLowerCase() === category.toLowerCase() &&
        p.price_from_eur != null &&
        tierOf(p.price_from_eur) === tier,
    );
    if (taken) problems.push(`the ${TIERS[tier]} tier of ${category} is taken by ${taken.id}`);
  }
  return problems;
}

/** The next rank in a region + category: one more than the highest among rows that aren't archived. */
export function nextRank(peers: Peer[], region: string, category: string): number {
  const ranks = peers
    .filter(
      (p) =>
        p.status !== "archived" &&
        p.region_slug === region &&
        p.category?.trim().toLowerCase() === category.toLowerCase() &&
        p.rank != null,
    )
    .map((p) => p.rank!);
  return (ranks.length ? Math.max(...ranks) : 0) + 1;
}
