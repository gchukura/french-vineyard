/**
 * SITE_NOINDEX keeps search engines out until launch. It is on unless set to
 * "0", "false", "off" or "no", so a deployment without it stays hidden. No
 * imports: next.config.ts and client-reachable lib/site.ts both use it.
 */
export function isNoindex(raw: string | undefined): boolean {
  return !["0", "false", "off", "no"].includes((raw ?? "").trim().toLowerCase());
}
