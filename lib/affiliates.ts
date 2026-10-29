import type { AffiliateProvider } from "@/lib/links";

/**
 * Outbound affiliate URLs for /go/[provider]/[id]/. Every URL carries
 * utm_source=frenchvineyard and the referring page slug, plus each network's
 * own sub-id parameter so the page shows up in partner dashboards too.
 *
 * Hotels: with STAY22_AID, Booking.com and Expedia links go through Stay22
 * Allez; otherwise Booking.com uses BOOKING_AID or Travelpayouts, and Expedia
 * uses Partnerize (EXPEDIA_CAMREF).
 *
 * Formats to re-check against a link generated in each dashboard before
 * launch: Travelpayouts (needs TRAVELPAYOUTS_TRS and
 * TRAVELPAYOUTS_BOOKING_PROGRAM), Winalist (referral parameter name) and
 * Stay22 (the Allez link from its dashboard).
 */

export type AffiliateEnv = {
  GYG_PARTNER_ID?: string;
  VIATOR_PID?: string;
  BOOKING_AID?: string;
  TRAVELPAYOUTS_MARKER?: string;
  TRAVELPAYOUTS_TRS?: string;
  TRAVELPAYOUTS_BOOKING_PROGRAM?: string;
  EXPEDIA_CAMREF?: string;
  WINALIST_REF?: string;
  STAY22_AID?: string;
};

export type Referral = {
  /** Referring page slug, e.g. "regions-champagne" or "home". */
  page: string;
};

/** Hosts each provider's target URL may point at. Anything else is refused. */
const HOSTS: Record<AffiliateProvider, RegExp> = {
  gyg: /(^|\.)getyourguide\.[a-z.]+$/,
  viator: /(^|\.)viator\.com$/,
  winalist: /(^|\.)winalist\.[a-z.]+$/,
  booking: /(^|\.)booking\.com$/,
  expedia: /(^|\.)expedia\.[a-z.]+$/,
};

export class AffiliateError extends Error {
  name = "AffiliateError";
}

/** Parses `target` and checks it is https on the provider's own domain. */
export function checkTarget(provider: AffiliateProvider, target: string): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new AffiliateError(`${provider}: target is not a URL: ${target}`);
  }
  if (url.protocol !== "https:" || !HOSTS[provider].test(url.hostname)) {
    throw new AffiliateError(`${provider}: target ${url.hostname} is not an allowed host`);
  }
  return url;
}

/** Page slugs as campaign codes: lowercase letters, digits and dashes only (Viator's rule). */
export function campaignCode(page: string): string {
  return (
    page
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "unknown"
  );
}

/** "/regions/champagne/" -> "regions-champagne"; "/" -> "home". */
export function pageSlugFromPath(path: string | null | undefined): string {
  if (!path) return "unknown";
  const clean = path.split(/[?#]/)[0]!.replace(/^\/+|\/+$/g, "");
  return clean ? campaignCode(clean) : "home";
}

function withUtm(url: URL, page: string): URL {
  url.searchParams.set("utm_source", "frenchvineyard");
  url.searchParams.set("utm_medium", "affiliate");
  url.searchParams.set("utm_campaign", page);
  return url;
}

function need(env: AffiliateEnv, key: keyof AffiliateEnv): string {
  const v = env[key]?.trim();
  if (!v) throw new AffiliateError(`Missing ${key}`);
  return v;
}

export function gygUrl(target: string, env: AffiliateEnv, { page }: Referral): string {
  const url = checkTarget("gyg", target);
  const code = campaignCode(page);
  url.searchParams.set("partner_id", need(env, "GYG_PARTNER_ID"));
  url.searchParams.set("cmp", code);
  return withUtm(url, code).toString();
}

export function viatorUrl(target: string, env: AffiliateEnv, { page }: Referral): string {
  const url = checkTarget("viator", target);
  const code = campaignCode(page);
  url.searchParams.set("pid", need(env, "VIATOR_PID"));
  // Viator's fixed MCID for text links; must match the dashboard's link generator.
  url.searchParams.set("mcid", "42383");
  url.searchParams.set("medium", "link");
  url.searchParams.set("campaign", code);
  return withUtm(url, code).toString();
}

export function winalistUrl(target: string, env: AffiliateEnv, { page }: Referral): string {
  const url = checkTarget("winalist", target);
  const code = campaignCode(page);
  url.searchParams.set("ref", need(env, "WINALIST_REF"));
  return withUtm(url, code).toString();
}

/**
 * Stay22 Allez for one hotel: the hotel's own Booking.com or Expedia page,
 * URL-encoded in `link`. Stay22 reports split campaign values on "-", so the
 * page code uses "_" there.
 */
export function stay22Url(
  provider: "booking" | "expedia",
  hotelPage: URL,
  aid: string,
  code: string,
): string {
  const url = new URL(`https://www.stay22.com/allez/${provider}`);
  url.searchParams.set("aid", aid);
  url.searchParams.set("link", hotelPage.toString());
  url.searchParams.set("campaign", code.replace(/-/g, "_"));
  return url.toString();
}

/** Stay22 (STAY22_AID), Booking.com direct (BOOKING_AID) or Travelpayouts (TRAVELPAYOUTS_MARKER). */
export function bookingUrl(target: string, env: AffiliateEnv, { page }: Referral): string {
  const url = checkTarget("booking", target);
  const code = campaignCode(page);
  withUtm(url, code);
  if (env.STAY22_AID?.trim()) return stay22Url("booking", url, env.STAY22_AID.trim(), code);
  if (env.BOOKING_AID?.trim()) {
    url.searchParams.set("aid", env.BOOKING_AID.trim());
    url.searchParams.set("label", code);
    return url.toString();
  }
  const tp = new URL("https://tp.media/r");
  tp.searchParams.set("marker", need(env, "TRAVELPAYOUTS_MARKER"));
  tp.searchParams.set("trs", need(env, "TRAVELPAYOUTS_TRS"));
  tp.searchParams.set("p", need(env, "TRAVELPAYOUTS_BOOKING_PROGRAM"));
  tp.searchParams.set("u", url.toString());
  tp.searchParams.set("sub_id", code);
  return tp.toString();
}

/** Expedia via Stay22 (STAY22_AID), or Partnerize: camref, then pubref, then the encoded destination. */
export function expediaUrl(target: string, env: AffiliateEnv, { page }: Referral): string {
  const url = checkTarget("expedia", target);
  const code = campaignCode(page);
  if (env.STAY22_AID?.trim())
    return stay22Url("expedia", withUtm(url, code), env.STAY22_AID.trim(), code);
  const camref = encodeURIComponent(need(env, "EXPEDIA_CAMREF"));
  const destination = encodeURIComponent(withUtm(url, code).toString());
  return `https://prf.hn/click/camref:${camref}/pubref:${code}/destination:${destination}`;
}

export const BUILDERS: Record<
  AffiliateProvider,
  (target: string, env: AffiliateEnv, ref: Referral) => string
> = {
  gyg: gygUrl,
  viator: viatorUrl,
  winalist: winalistUrl,
  booking: bookingUrl,
  expedia: expediaUrl,
};

export function buildOutboundUrl(
  provider: AffiliateProvider,
  target: string,
  env: AffiliateEnv,
  ref: Referral,
): string {
  return BUILDERS[provider](target, env, ref);
}

// ---------------------------------------------------------------------------
// Targets: which provider page an id points at
// ---------------------------------------------------------------------------

export const GYG_HOME_URL = "https://www.getyourguide.com/";

/** Booking.com hotel page from a booking_hotel_id ("fr/royal-champagne") or full URL. */
export function bookingHotelPage(bookingHotelId: string): string {
  const id = bookingHotelId.trim();
  if (/^https?:\/\//.test(id)) return id;
  return `https://www.booking.com/hotel/${id.replace(/^\/+|\.html$/g, "")}.html`;
}

/** Expedia hotel page from an expedia_id (numeric) or full URL. */
export function expediaHotelPage(expediaId: string): string {
  const id = expediaId.trim();
  if (/^https?:\/\//.test(id)) return id;
  return `https://www.expedia.com/h${encodeURIComponent(id)}.Hotel-Information`;
}

export function isAffiliateProvider(p: string): p is AffiliateProvider {
  return p in HOSTS;
}

export function affiliateEnv(
  source: Record<string, string | undefined> = process.env,
): AffiliateEnv {
  return {
    GYG_PARTNER_ID: source.GYG_PARTNER_ID,
    VIATOR_PID: source.VIATOR_PID,
    BOOKING_AID: source.BOOKING_AID,
    TRAVELPAYOUTS_MARKER: source.TRAVELPAYOUTS_MARKER,
    TRAVELPAYOUTS_TRS: source.TRAVELPAYOUTS_TRS,
    TRAVELPAYOUTS_BOOKING_PROGRAM: source.TRAVELPAYOUTS_BOOKING_PROGRAM,
    EXPEDIA_CAMREF: source.EXPEDIA_CAMREF,
    WINALIST_REF: source.WINALIST_REF,
    STAY22_AID: source.STAY22_AID,
  };
}
