/**
 * Affiliate links. CLAUDE.md: every affiliate link goes through
 * /go/[provider]/[id] and carries rel="sponsored nofollow".
 */

export const AFFILIATE_PROVIDERS = ["gyg", "viator", "winalist", "booking", "expedia"] as const;
export type AffiliateProvider = (typeof AFFILIATE_PROVIDERS)[number];

export const AFFILIATE_REL = "sponsored nofollow";

export function goHref(provider: AffiliateProvider, id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(`Affiliate link for ${provider} needs an id`);
  return `/go/${provider}/${encodeURIComponent(trimmed)}/`;
}

/** True for any path that goes through the /go/ redirector. */
export function isAffiliateHref(href: string): boolean {
  return href.startsWith("/go/");
}
