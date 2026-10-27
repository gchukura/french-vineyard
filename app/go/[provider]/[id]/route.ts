import { after } from "next/server";

import {
  AffiliateError,
  GYG_HOME_URL,
  affiliateEnv,
  bookingHotelPage,
  buildOutboundUrl,
  checkTarget,
  expediaHotelPage,
  isAffiliateProvider,
  pageSlugFromPath,
} from "@/lib/affiliates";
import { buildClick, logClick } from "@/lib/clicks";
import type { AffiliateProvider } from "@/lib/links";
import { getHotels, getTours } from "@/lib/sheets";

/** The provider page an id points at, from the owner's Tours and Hotels rows. */
async function targetFor(provider: AffiliateProvider, id: string): Promise<string | undefined> {
  if (provider === "booking" || provider === "expedia") {
    const hotel = (await getHotels()).find((h) => h.id === id);
    if (provider === "booking" && hotel?.booking_hotel_id)
      return bookingHotelPage(hotel.booking_hotel_id);
    if (provider === "expedia" && hotel?.expedia_id) return expediaHotelPage(hotel.expedia_id);
    return undefined;
  }
  if (provider === "gyg" && id === "home") return GYG_HOME_URL;
  return (await getTours()).find((t) => t.id === id && t.provider === provider)?.provider_url;
}

/** Referring page slug from a same-origin Referer header. */
function referringPage(request: Request): string {
  const referer = request.headers.get("referer");
  if (!referer) return "unknown";
  try {
    const ref = new URL(referer);
    return ref.host === new URL(request.url).host ? pageSlugFromPath(ref.pathname) : "external";
  } catch {
    return "unknown";
  }
}

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

export async function GET(request: Request, { params }: RouteContext<"/go/[provider]/[id]">) {
  const { provider, id } = await params;
  if (!isAffiliateProvider(provider))
    return new Response("Unknown provider", { status: 404, headers });

  const target = await targetFor(provider, decodeURIComponent(id));
  if (!target) return new Response("Unknown link", { status: 404, headers });

  const page = referringPage(request);
  const slot = new URL(request.url).searchParams.get("slot");

  let location: string;
  try {
    location = buildOutboundUrl(provider, target, affiliateEnv(), { page });
  } catch (error) {
    if (!(error instanceof AffiliateError)) throw error;
    console.error(`/go/${provider}/${id}/: ${error.message}`);
    // Missing partner config: still send the visitor on, untagged, if the target is safe.
    try {
      location = checkTarget(provider, target).toString();
    } catch {
      return new Response("Unknown link", { status: 404, headers });
    }
  }

  // Fire-and-forget: the log runs after the redirect has been sent. The weekly
  // link check (npm run tours:check) marks itself so it isn't counted as a click.
  if (request.headers.get("x-link-check") !== "1")
    after(() => logClick(buildClick({ provider, id, page, slot })));

  return new Response(null, { status: 302, headers: { ...headers, location } });
}
