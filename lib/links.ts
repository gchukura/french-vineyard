/**
 * Affiliate links. CLAUDE.md: every affiliate link goes through
 * /go/[provider]/[id] and carries rel="sponsored nofollow".
 */

export const AFFILIATE_PROVIDERS = ["gyg", "viator", "winalist", "booking", "expedia"] as const;
export type AffiliateProvider = (typeof AFFILIATE_PROVIDERS)[number];

export const AFFILIATE_REL = "sponsored nofollow";

/**
 * `slot` names where on the page the link sits ("tour-card", "header"), so
 * the Clicks log can tell placements apart. Lowercase letters, digits, dashes.
 */
export function goHref(provider: AffiliateProvider, id: string, slot?: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(`Affiliate link for ${provider} needs an id`);
  const path = `/go/${provider}/${encodeURIComponent(trimmed)}/`;
  return slot ? `${path}?slot=${encodeURIComponent(slot)}` : path;
}

/** True for any path that goes through the /go/ redirector. */
export function isAffiliateHref(href: string): boolean {
  return href.startsWith("/go/");
}
