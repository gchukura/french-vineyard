import { isNoindex } from "@/lib/noindex";

/** Site-wide constants and URL builders. Every internal path ends in "/". */

export const SITE_NAME = "FrenchVineyard.com";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://frenchvineyard.com").replace(
  /\/+$/,
  "",
);
export const DEFAULT_OG_IMAGE = "/og-default.jpg";

/** Pre-launch: robots.txt disallows everything and every response carries X-Robots-Tag: noindex. */
export const SITE_NOINDEX = isNoindex(process.env.SITE_NOINDEX);

export type NavItem = { label: string; href: string };

export const REGIONS_INDEX_HREF = "/regions/";
export const TOURS_INDEX_HREF = "/tours/";
export const STAY_INDEX_HREF = "/where-to-stay/";
export const PLAN_INDEX_HREF = "/plan/";

export const NAV: NavItem[] = [
  { label: "Tours & Tastings", href: TOURS_INDEX_HREF },
  { label: "Where to Stay", href: STAY_INDEX_HREF },
  { label: "Plan Your Trip", href: PLAN_INDEX_HREF },
  { label: "Getting There", href: "/plan/getting-there/" },
];

export const LEGAL_LINKS: NavItem[] = [
  { label: "About us", href: "/about/" },
  { label: "Contact", href: "/contact/" },
  { label: "Privacy policy", href: "/privacy-policy/" },
  { label: "Legal notice", href: "/legal-notice/" },
  { label: "Image credits", href: "/image-credits/" },
];

export function regionHref(slug: string): string {
  return `/regions/${slug}/`;
}

export function areaHref(regionSlug: string, areaSlug: string): string {
  return `/regions/${regionSlug}/${areaSlug}/`;
}

export function townHref(slug: string): string {
  return `/towns/${slug}/`;
}

export function toursHref(regionSlug?: string): string {
  return regionSlug ? `/tours/${regionSlug}/` : TOURS_INDEX_HREF;
}

export type ArticlePageType = "guide" | "ranked_list" | "hotel_roundup" | "itinerary" | "practical";

/**
 * Each article has exactly one URL: hotel roundups live under
 * /where-to-stay/, practical articles under /plan/, the rest at the root.
 */
export function articleHref(article: { slug: string; page_type: ArticlePageType }): string {
  switch (article.page_type) {
    case "hotel_roundup":
      return `/where-to-stay/${article.slug}/`;
    case "practical":
      return `/plan/${article.slug}/`;
    default:
      return `/${article.slug}/`;
  }
}

/** First path segments owned by routes, so a root article slug can't shadow them. */
export const RESERVED_ROOT_SLUGS = new Set([
  "regions",
  "towns",
  "tours",
  "where-to-stay",
  "plan",
  "go",
  "api",
  "about",
  "contact",
  "privacy-policy",
  "legal-notice",
  "image-credits",
  "styleguide",
  "sitemaps",
]);

/** Absolute URL for a site path, for JSON-LD and canonical links. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
