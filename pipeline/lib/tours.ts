import { z } from "zod";

import {
  bannedPhraseHits,
  BRITISH_TERMS,
  EUR_AMOUNT,
  FIRST_PERSON,
  FIRST_PERSON_PLURAL,
  META_LANGUAGE,
  RAW_AFFILIATE,
  SELLING,
  TWENTY_FOUR_HOUR,
  type Finding,
} from "./checks";
import { unmatchedNumbers } from "./numbers";

/**
 * Pure helpers for the tours:* commands: provider URLs, link-check verdicts,
 * the GetYourGuide Partner API response, the rules for AI-written tour notes
 * and the ranked-list Queue rows. Tours are always the owner's: nothing here
 * chooses, adds or orders a tour.
 */

export type TourProvider = "gyg" | "viator" | "winalist";

export type ParsedTourUrl =
  | { kind: "product"; provider: TourProvider; providerId: string; url: string }
  | { kind: "listing"; provider: TourProvider; url: string; reason: string }
  | { kind: "unknown"; reason: string };

// A country domain (getyourguide.de, .co.uk, .com.au), never just a prefix: getyourguide.evil.example is refused.
const GYG_HOST = /(^|\.)getyourguide\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i;
const VIATOR_HOST = /(^|\.)viator\.com$/i;
const WINALIST_HOST = /(^|\.)winalist\.(?:com|fr)$/i;

export function providerOf(hostname: string): TourProvider | undefined {
  if (GYG_HOST.test(hostname)) return "gyg";
  if (VIATOR_HOST.test(hostname)) return "viator";
  if (WINALIST_HOST.test(hostname)) return "winalist";
  return undefined;
}

/**
 * Provider and product id of a tour URL pasted by the owner. Only the URL is
 * read; the page is never fetched. Listing, search and location pages are
 * recognized so they can be refused with a reason.
 *
 * - GetYourGuide: `/reims-l365/<slug>-t220971/` → product 220971.
 * - Viator: `/tours/Paris/<slug>/d479-35428P1` (any locale prefix or
 *   subdomain) → product 35428P1.
 * - Winalist: `/experiences/688/initiation` → product 688. A `/hosts/303/…`
 *   page is one estate's page; experiences redirect to it, so it counts as
 *   the product `host-303`.
 *
 * The stored URL drops the query string and fragment (the /go/ route adds
 * the affiliate parameters).
 */
export function parseTourUrl(raw: string): ParsedTourUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: "unknown", reason: "not a URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { kind: "unknown", reason: "not a web address" };
  const provider = providerOf(url.hostname);
  if (!provider)
    return { kind: "unknown", reason: `${url.hostname} is not GetYourGuide, Viator or Winalist` };

  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  const path = url.pathname;
  const clean = url.toString();
  const product = (providerId: string): ParsedTourUrl => ({
    kind: "product",
    provider,
    providerId,
    url: clean,
  });
  const listing = (reason: string): ParsedTourUrl => ({
    kind: "listing",
    provider,
    url: clean,
    reason,
  });

  if (provider === "gyg") {
    const m = /-t(\d+)\/?$/.exec(path);
    if (m) return product(m[1]);
    if (/-tc\d+\/?$/.test(path)) return listing("a GetYourGuide category page");
    if (/^\/s\/?$/.test(path) || /\/search/.test(path))
      return listing("a GetYourGuide search page");
    return listing("a GetYourGuide location or listing page");
  }
  if (provider === "viator") {
    const m = /^(?:\/[a-z]{2}-[A-Z]{2})?\/tours\/[^/]+\/[^/]+\/d\d+-([A-Za-z0-9]+)\/?$/.exec(path);
    if (m) return product(m[1]);
    if (/searchResults/i.test(path)) return listing("a Viator search page");
    return listing("a Viator destination or listing page");
  }
  const experience = /^(?:\/[a-z]{2})?\/experiences\/(\d+)(?:\/|$)/.exec(path);
  if (experience) return product(experience[1]);
  const host = /^(?:\/[a-z]{2})?\/hosts\/(\d+)(?:\/|$)/.exec(path);
  if (host) return product(`host-${host[1]}`);
  return listing("a Winalist city, region or search page");
}

/** The Tours id for a provider product, e.g. gyg-220971, viator-35428p1, winalist-host-303. */
export function tourId(provider: TourProvider, providerId: string): string {
  return `${provider}-${providerId}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// tours:check
// ---------------------------------------------------------------------------

export type LinkVerdict =
  /** The provider served the product page: last_checked is set and the flag cleared. */
  | { status: "ok" }
  /** The link is broken or leads somewhere other than the product: the row is flagged. */
  | { status: "flag"; reason: string }
  /** The provider refused an automated request, so the page could not be seen: nothing changes. */
  | { status: "unverified"; reason: string };

/**
 * Verdict for a followed /go/ link: the HTTP status and URL it finally
 * landed on. GetYourGuide and Viator answer automated requests with 403
 * whatever the page, so a 403/429/503 on a product-shaped URL is
 * "unverified", not broken; where the redirects ended still counts.
 */
export function linkVerdict(provider: TourProvider, finalUrl: string, status: number): LinkVerdict {
  const landed = parseTourUrl(finalUrl);
  if (landed.kind === "unknown")
    return { status: "flag", reason: `ends off the provider's site: ${finalUrl}` };
  if (landed.provider !== provider)
    return { status: "flag", reason: `ends on another provider: ${finalUrl}` };
  if (landed.kind === "listing")
    return { status: "flag", reason: `lands on ${landed.reason}: ${finalUrl}` };
  if (status === 404 || status === 410) return { status: "flag", reason: `HTTP ${status}` };
  if (status === 403 || status === 429 || status === 503)
    return { status: "unverified", reason: `provider refused the check (HTTP ${status})` };
  if (status >= 400) return { status: "flag", reason: `HTTP ${status}` };
  return { status: "ok" };
}

/** GetYourGuide Partner API, GET /1/tours/{tour_id}: the fields tours:check refreshes. */
const gygTourSchema = z.object({
  data: z.object({
    tours: z
      .array(
        z.object({
          tour_id: z.number().optional(),
          overall_rating: z.number().nullish(),
          number_of_ratings: z.number().nullish(),
          price: z
            .object({ values: z.object({ amount: z.number().nullish() }).nullish() })
            .nullish(),
        }),
      )
      .min(1),
  }),
});

export type GygFacts = { price_from_eur?: number; rating?: number; review_count?: number };

/** Price (in the requested EUR), rating to one decimal and review count from a Partner API reply. */
export function parseGygTour(json: unknown): GygFacts {
  const tour = gygTourSchema.parse(json).data.tours[0];
  const out: GygFacts = {};
  const amount = tour.price?.values?.amount;
  if (amount != null) out.price_from_eur = Math.round(amount * 100) / 100;
  if (tour.overall_rating != null) out.rating = Math.round(tour.overall_rating * 10) / 10;
  if (tour.number_of_ratings != null) out.review_count = tour.number_of_ratings;
  return out;
}

// ---------------------------------------------------------------------------
// tours:describe
// ---------------------------------------------------------------------------

export const BEST_FOR_MAX = 60;
export const WHY_PICKED_MAX = 300;

export const tourNotesSchema = z.object({
  best_for: z.string(),
  why_picked: z.string(),
  sources: z.array(z.object({ url: z.string(), quote: z.string() })).default([]),
});
export type TourNotes = z.infer<typeof tourNotesSchema>;

/** Sentences in a short paragraph: ends of sentences, not decimal points or "a.m.". */
export function sentenceCount(text: string): number {
  return text
    .replace(/\b(?:a|p)\.m\./gi, "am")
    .replace(/(\d)\.(\d)/g, "$1$2")
    .split(/[.!?](?:\s+|$)/)
    .filter((s) => s.trim()).length;
}

export type CheckOptions = {
  bannedPhrases: string[];
  allowedNumbers: Set<string>;
  usdRate: number;
};

/** best_for and why_picked: why_picked is two or three sentences, at most 300 characters. */
export function checkTourNotes(
  notes: Pick<TourNotes, "best_for" | "why_picked">,
  opts: CheckOptions,
): Finding[] {
  return checkShortCopy(
    { best_for: notes.best_for, text: notes.why_picked },
    { field: "why_picked", sentences: [2, 3], maxChars: WHY_PICKED_MAX, subject: "tour" },
    opts,
  );
}

/**
 * The deterministic rules for a card's short copy (best_for plus a short
 * text: a tour's why_picked, a hotel's blurb): lengths, sentence count, and
 * the page checks that apply to a blurb (banned phrases, no first person at
 * all, no wine selling, no meta-language, American English, 12-hour times,
 * € with $, no raw provider links, and every number from the item's own
 * data or a quoted source).
 */
export function checkShortCopy(
  copy: { best_for: string; text: string },
  rules: { field: string; sentences: [number, number]; maxChars: number; subject: string },
  opts: CheckOptions,
): Finding[] {
  const findings: Finding[] = [];
  const err = (rule: string, quote: string, fix: string) =>
    findings.push({ rule, severity: "error", quote: quote.slice(0, 200), fix });
  const best = copy.best_for.trim();
  const text = copy.text.trim();
  const both = `${best}\n${text}`;
  const [min, max] = rules.sentences;

  if (!best) err("best_for", "(empty)", "Write best_for.");
  if (best.length > BEST_FOR_MAX)
    err("best_for", best, `best_for is ${best.length} characters; the limit is ${BEST_FOR_MAX}.`);
  if (text.length > rules.maxChars)
    err(
      rules.field,
      `${text.length} characters`,
      `${rules.field} must be at most ${rules.maxChars} characters.`,
    );
  const sentences = sentenceCount(text);
  if (sentences < min || sentences > max)
    err(
      rules.field,
      `${sentences} sentence(s)`,
      `${rules.field} must be ${min === max ? min : `${min} to ${max}`} sentence(s).`,
    );

  for (const n of unmatchedNumbers(both, opts.allowedNumbers, { usdRate: opts.usdRate }))
    err(
      "numbers_sourced",
      n.context,
      `${n.number} is not in the ${rules.subject}'s data or a cited source.`,
    );
  for (const hit of bannedPhraseHits(both, opts.bannedPhrases))
    err("no_banned_phrases", hit.quote, `Rewrite without "${hit.phrase}".`);
  for (const re of [FIRST_PERSON, FIRST_PERSON_PLURAL]) {
    const m = both.match(re);
    if (m)
      err("no_first_person", m[0], 'Never write in the first person; address the reader as "you".');
  }
  for (const re of SELLING) {
    const m = both.match(re);
    if (m)
      err("no_alcohol_selling", m[0], "Remove language that encourages buying or shipping wine.");
  }
  for (const re of META_LANGUAGE) {
    const m = both.match(re);
    if (m) err("no_meta_language", m[0], "Don't mention sources, listings or research.");
  }
  for (const [re, us] of BRITISH_TERMS) {
    const m = both.match(re);
    if (m) err("american_english", m[0], `Write "${us}".`);
  }
  for (const re of TWENTY_FOUR_HOUR)
    for (const m of both.matchAll(re)) err("twelve_hour_times", m[0], "Use a 12-hour time.");
  for (const m of both.matchAll(EUR_AMOUNT))
    if (!/^\s*\((?:US)?\$/.test(both.slice(m.index! + m[0].length)))
      err("style", m[0], `Add the USD conversion after ${m[0]}, e.g. "€25 ($27)".`);
  const raw = both.match(RAW_AFFILIATE);
  if (raw) err("no_links", raw[0], "No provider links in tour notes.");
  return findings;
}

/** A finding list as one short Sheet cell. */
export function flagText(findings: Finding[]): string {
  return findings
    .map((f) => `${f.rule}: ${f.fix}`)
    .join(" | ")
    .slice(0, 480);
}

// ---------------------------------------------------------------------------
// tours:queue
// ---------------------------------------------------------------------------

/** Lowercase ASCII slug: "Day trips from Paris" -> "day-trips-from-paris", "Côte" -> "cote". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The ranked-list slug for a region and category, e.g. best-champagne-cellar-tours. */
export const rankedListSlug = (regionSlug: string, category: string) =>
  `best-${regionSlug}-${slugify(category)}`;

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

export type RankedListPlan = {
  region_slug: string;
  category: string;
  slug: string;
  tours: number;
};

/**
 * Region + category pairs with at least `min` published tours and no ranked
 * list yet, either as an Articles row with the same slug or a ranked_list
 * Queue row for the same region and category.
 */
export function rankedListsToQueue(
  tours: { region_slug: string; category?: string; status: string }[],
  articles: { slug: string; page_type?: string }[],
  queue: { slug: string; page_type?: string; region_slug?: string; category?: string }[],
  min = 3,
): RankedListPlan[] {
  const groups = new Map<string, RankedListPlan>();
  for (const t of tours) {
    if (t.status !== "published" || !t.category?.trim()) continue;
    const key = `${t.region_slug}|${norm(t.category)}`;
    const g = groups.get(key) ?? {
      region_slug: t.region_slug,
      category: t.category.trim(),
      slug: rankedListSlug(t.region_slug, t.category),
      tours: 0,
    };
    g.tours++;
    groups.set(key, g);
  }
  const articleSlugs = new Set(articles.map((a) => a.slug));
  return [...groups.values()].filter(
    (g) =>
      g.tours >= min &&
      !articleSlugs.has(g.slug) &&
      !queue.some(
        (q) =>
          q.slug === g.slug ||
          (q.page_type === "ranked_list" &&
            q.region_slug === g.region_slug &&
            norm(q.category) === norm(g.category)),
      ),
  );
}
