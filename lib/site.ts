/** Site-wide constants and URL builders. Every internal path ends in "/". */

export const SITE_NAME = "FrenchVineyard.com";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://frenchvineyard.com").replace(
  /\/+$/,
  "",
);

export type NavItem = { label: string; href: string };

export const NAV: NavItem[] = [
  { label: "Tours & Tastings", href: "/tours/" },
  { label: "Where to Stay", href: "/where-to-stay/" },
  { label: "Plan Your Trip", href: "/plan-your-trip/" },
  { label: "Getting There", href: "/getting-there/" },
];

export const REGIONS_INDEX_HREF = "/regions/";

export function regionHref(slug: string): string {
  return `/${slug}/`;
}

/** Absolute URL for a site path, for JSON-LD and canonical links. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
