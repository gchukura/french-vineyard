import { z } from "zod";

import type { TourFacts } from "./tour-details";

/**
 * TourFacts from Viator's Partner API (v2) and from a Winalist estate page's
 * schema.org data, for tours the owner imported. GetYourGuide's parser is in
 * tour-details.ts. Pure functions; fetching is in commands/tours-enrich.ts.
 */

// ---------------------------------------------------------------------------
// Viator: GET /products/{code}, GET /availability/schedules/{code}, GET /destinations
// ---------------------------------------------------------------------------

const text = z.string().nullish();

const viatorProductSchema = z.object({
  title: z.string(),
  description: text,
  inclusions: z
    .array(z.object({ description: text, otherDescription: text, typeDescription: text }))
    .nullish(),
  reviews: z
    .object({ combinedAverageRating: z.number().nullish(), totalReviews: z.number().nullish() })
    .nullish(),
  cancellationPolicy: z
    .object({
      type: text,
      refundEligibility: z
        .array(z.object({ percentageRefundable: z.number().nullish() }))
        .nullish(),
    })
    .nullish(),
  languageGuides: z.array(z.object({ type: text, language: text })).nullish(),
  logistics: z
    .object({
      start: z
        .array(z.object({ description: text, location: z.object({ ref: text }).nullish() }))
        .nullish(),
      travelerPickup: z.object({ pickupOptionType: text }).nullish(),
    })
    .nullish(),
  itinerary: z
    .object({
      privateTour: z.boolean().nullish(),
      maxTravelersInSharedTour: z.number().nullish(),
      duration: z
        .object({
          fixedDurationInMinutes: z.number().nullish(),
          variableDurationFromMinutes: z.number().nullish(),
          variableDurationToMinutes: z.number().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  destinations: z.array(z.object({ ref: z.string(), primary: z.boolean().nullish() })).nullish(),
});

const viatorScheduleSchema = z.object({
  currency: z.string().nullish(),
  summary: z.object({ fromPrice: z.number().nullish() }).nullish(),
});

export type ViatorDestination = { name: string; lat?: number; lng?: number };

const viatorDestinationsSchema = z.object({
  destinations: z.array(
    z.object({
      destinationId: z.union([z.number(), z.string()]),
      name: z.string(),
      center: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
    }),
  ),
});

/** Destination refs to names and centers, from GET /destinations. */
export function viatorDestinations(json: unknown): Map<string, ViatorDestination> {
  return new Map(
    viatorDestinationsSchema
      .parse(json)
      .destinations.map((d) => [
        String(d.destinationId),
        { name: d.name, lat: d.center?.latitude, lng: d.center?.longitude },
      ]),
  );
}

const PICKUP = new Set(["PICKUP_EVERYONE", "PICKUP_AND_MEET_AT_START_POINT"]);

/**
 * A Viator product's facts. The price counts only when the schedule is in
 * EUR (Viator prices in the supplier's currency). STANDARD cancellation is
 * free up to 24 hours ahead; CUSTOM counts as free when some window refunds
 * 100%; ALL_SALES_FINAL never does.
 */
export function parseViatorProduct(
  product: unknown,
  schedule: unknown,
  destinations: Map<string, ViatorDestination>,
): TourFacts {
  const p = viatorProductSchema.parse(product);
  const s = viatorScheduleSchema.parse(schedule);
  const d = p.itinerary?.duration;
  const durations: TourFacts["durations"] = d?.fixedDurationInMinutes
    ? [{ duration: d.fixedDurationInMinutes, unit: "minute" }]
    : [d?.variableDurationFromMinutes, d?.variableDurationToMinutes]
        .filter((m): m is number => m != null)
        .map((m) => ({ duration: m, unit: "minute" as const }));
  const guides = p.languageGuides ?? [];
  const human = guides.filter((g) => g.type === "GUIDE");
  const cancel = p.cancellationPolicy;
  const cancellable =
    cancel?.type === "STANDARD" ||
    (cancel?.type === "CUSTOM" &&
      (cancel.refundEligibility ?? []).some((r) => r.percentageRefundable === 100));
  const start = p.logistics?.start?.find((x) => x.description?.trim() || x.location?.ref);
  const places = (p.destinations ?? [])
    .map((x) => destinations.get(x.ref))
    .filter((x): x is ViatorDestination => Boolean(x));

  return {
    title: p.title.trim(),
    abstract: "",
    description: p.description ?? "",
    highlights: (p.inclusions ?? [])
      .map((i) => (i.description || i.otherDescription || i.typeDescription || "").trim())
      .filter(Boolean),
    rating:
      p.reviews?.combinedAverageRating != null
        ? Math.round(p.reviews.combinedAverageRating * 10) / 10
        : undefined,
    reviews: p.reviews?.totalReviews ?? undefined,
    priceEur:
      s.currency === "EUR" && s.summary?.fromPrice != null
        ? Math.round(s.summary.fromPrice * 100) / 100
        : undefined,
    durations,
    languages: human.map((g) => (g.language ?? "").toLowerCase()).filter(Boolean),
    guideType: human.length ? "live_tour_guide" : guides.length ? "audio_guide" : undefined,
    hasPickUp: PICKUP.has(p.logistics?.travelerPickup?.pickupOptionType ?? ""),
    cancellable,
    cancellationFee: cancellable ? 0 : undefined,
    activityType: p.itinerary?.privateTour ? "privateTour" : undefined,
    locations: places.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng })),
    meetingPoint: start ? start.description?.trim() || "start point given" : undefined,
    groupMax: p.itinerary?.maxTravelersInSharedTour ?? undefined,
    privateTour: p.itinerary?.privateTour ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Winalist: the estate page's schema.org JSON-LD (experience links redirect to it)
// ---------------------------------------------------------------------------

/** "PT1H15M" -> 75; "P1D" -> 1440. */
export function isoMinutes(iso?: string | null): number | undefined {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso ?? "");
  if (!m || !(m[1] || m[2] || m[3])) return undefined;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

type Node = Record<string, unknown>;

/**
 * The facts of one Winalist experience from its estate's page: the offer
 * for the experience id (name, description, price in EUR, duration, group
 * capacity), the estate's rating, address and coordinates, the FAQ's
 * cancellation answer and the languages the estate receives visitors in.
 * Throws if the page has no offer for that experience.
 */
export function parseWinalistPage(html: string, experienceId: string): TourFacts {
  const graphs = [
    ...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ].flatMap((m) => {
    try {
      const json = JSON.parse(m[1]) as Node;
      return (json["@graph"] as Node[] | undefined) ?? [json];
    } catch {
      return [];
    }
  });
  const estate = graphs.find((n) => Array.isArray(n.makesOffer));
  if (!estate) throw new Error("no Winalist estate data on the page");
  const offers = estate.makesOffer as Node[];
  const offer = offers.find((o) => {
    const trip = (o.itemOffered ?? {}) as Node;
    return [o["@id"], trip["@id"], trip.url].some((u) =>
      new RegExp(`/experiences/${experienceId}(?:/|#|$)`).test(String(u ?? "")),
    );
  });
  if (!offer) throw new Error(`the estate page has no experience ${experienceId}`);
  const trip = (offer.itemOffered ?? {}) as Node;
  const rating = (estate.aggregateRating ?? {}) as Node;
  const address = (estate.address ?? {}) as Node;
  const geo = (estate.geo ?? {}) as Node;
  const faq = graphs.find((n) => n["@type"] === "FAQPage");
  const answers = ((faq?.mainEntity as Node[] | undefined) ?? []).map((q) =>
    String(((q.acceptedAnswer ?? {}) as Node).text ?? ""),
  );
  const breadcrumb = graphs.find((n) => n["@type"] === "BreadcrumbList");
  const crumbs = ((breadcrumb?.itemListElement as Node[] | undefined) ?? []).map((i) =>
    String(i.name ?? ""),
  );
  const languages =
    /Preferred language:\s*([A-Za-z ,]{0,120}?)\s*(?:Suggest|Choose|$)/.exec(
      stripTags(html),
    )?.[1] ?? "";
  const minutes = isoMinutes(trip.duration as string | undefined);
  const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));

  return {
    title: `${String(estate.name ?? "").trim()}: ${String(offer.name ?? trip.name ?? "").trim()}`,
    abstract: "",
    description: String(offer.description ?? ""),
    highlights: [],
    rating: num(rating.ratingValue),
    reviews: num(rating.reviewCount ?? rating.ratingCount),
    priceEur: offer.priceCurrency === "EUR" ? num(offer.price) : undefined,
    durations: minutes ? [{ duration: minutes, unit: "minute" }] : [],
    languages: /\bEnglish\b/.test(languages) ? ["en"] : [],
    // Estate visits are led by the estate's own staff.
    guideType: "live_tour_guide",
    cancellable: answers.some((a) => /cancel[^.]{0,80}free of charge|free cancellation/i.test(a)),
    cancellationFee: 0,
    locations: [
      {
        name: String(address.addressLocality ?? ""),
        city: String(address.addressLocality ?? ""),
        lat: num(geo.latitude),
        lng: num(geo.longitude),
      },
      ...crumbs.slice(1, -1).map((name) => ({ name })),
    ].filter((l) => l.name),
    meetingPoint: String(address.streetAddress ?? "").trim() || undefined,
    groupMax: num(trip.maximumAttendeeCapacity),
  };
}
