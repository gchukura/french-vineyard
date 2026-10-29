import { describe, expect, it } from "vitest";

import { categoryFor, placeTour, selectionProblems } from "./tour-details";
import {
  isoMinutes,
  parseViatorProduct,
  parseWinalistPage,
  viatorDestinations,
} from "./tour-sources";

// Shapes from Viator's Partner API v2 spec (ActiveProduct, schedules, destinations).
const destinations = viatorDestinations({
  destinations: [
    {
      destinationId: 479,
      name: "Paris",
      type: "CITY",
      center: { latitude: 48.8566, longitude: 2.3522 },
    },
    {
      destinationId: 5049,
      name: "Reims",
      type: "CITY",
      center: { latitude: 49.2583, longitude: 4.0317 },
    },
  ],
  totalCount: 2,
});

const viatorProduct = (over: Record<string, unknown> = {}) => ({
  status: "ACTIVE",
  productCode: "35428P1",
  title: "Champagne Day Trip from Paris with 8 Tastings & Lunch",
  description: "Small-group minivan tour to three champagne houses.",
  inclusions: [
    {
      category: "FOOD",
      type: "LUNCH",
      typeDescription: "Lunch",
      description: "Three-course lunch",
    },
    { category: "OTHER", type: "OTHER", otherDescription: "8 champagne tastings" },
  ],
  reviews: { combinedAverageRating: 4.86, totalReviews: 1312 },
  cancellationPolicy: { type: "STANDARD", description: "Full refund up to 24 hours ahead" },
  languageGuides: [
    { type: "GUIDE", language: "en", legacyGuide: "en/SERVICE_GUIDE" },
    { type: "AUDIO", language: "fr" },
  ],
  logistics: {
    start: [{ location: { ref: "LOC-123" }, description: "Meet at the Eiffel Tower bus stop" }],
    travelerPickup: { pickupOptionType: "MEET_EVERYONE_AT_START_POINT" },
  },
  itinerary: {
    itineraryType: "STANDARD",
    privateTour: false,
    maxTravelersInSharedTour: 8,
    duration: { fixedDurationInMinutes: 660 },
  },
  destinations: [
    { ref: "479", primary: true },
    { ref: "5049", primary: false },
  ],
  ...over,
});

const schedule = (over: Record<string, unknown> = {}) => ({
  productCode: "35428P1",
  currency: "EUR",
  summary: { fromPrice: 189 },
  bookableItems: [],
  ...over,
});

describe("parseViatorProduct", () => {
  it("reads the facts the rules need", () => {
    expect(parseViatorProduct(viatorProduct(), schedule(), destinations)).toMatchObject({
      title: "Champagne Day Trip from Paris with 8 Tastings & Lunch",
      highlights: ["Three-course lunch", "8 champagne tastings"],
      rating: 4.9,
      reviews: 1312,
      priceEur: 189,
      durations: [{ duration: 660, unit: "minute" }],
      languages: ["en"],
      guideType: "live_tour_guide",
      hasPickUp: false,
      cancellable: true,
      meetingPoint: "Meet at the Eiffel Tower bus stop",
      groupMax: 8,
      privateTour: false,
      locations: [
        { name: "Paris", lat: 48.8566, lng: 2.3522 },
        { name: "Reims", lat: 49.2583, lng: 4.0317 },
      ],
    });
  });

  it("reads cancellation, guides, pickup, private tours and non-EUR prices", () => {
    const final = parseViatorProduct(
      viatorProduct({ cancellationPolicy: { type: "ALL_SALES_FINAL" } }),
      schedule(),
      destinations,
    );
    expect(final.cancellable).toBe(false);
    const custom = parseViatorProduct(
      viatorProduct({
        cancellationPolicy: { type: "CUSTOM", refundEligibility: [{ percentageRefundable: 100 }] },
      }),
      schedule(),
      destinations,
    );
    expect(custom.cancellable).toBe(true);
    const audio = parseViatorProduct(
      viatorProduct({ languageGuides: [{ type: "AUDIO", language: "en" }] }),
      schedule(),
      destinations,
    );
    expect(audio).toMatchObject({ languages: [], guideType: "audio_guide" });
    const pickup = parseViatorProduct(
      viatorProduct({
        logistics: { travelerPickup: { pickupOptionType: "PICKUP_EVERYONE" } },
        itinerary: {
          privateTour: true,
          duration: { variableDurationFromMinutes: 240, variableDurationToMinutes: 300 },
        },
      }),
      schedule({ currency: "USD" }),
      destinations,
    );
    expect(pickup).toMatchObject({
      hasPickUp: true,
      meetingPoint: undefined,
      privateTour: true,
      activityType: "privateTour",
      priceEur: undefined,
      durations: [
        { duration: 240, unit: "minute" },
        { duration: 300, unit: "minute" },
      ],
    });
  });

  it("feeds placement, category and the rules: a Paris day trip lands in Champagne", () => {
    const facts = parseViatorProduct(viatorProduct(), schedule(), destinations);
    const towns = [{ slug: "reims", name: "Reims", region_slug: "champagne" }];
    const placed = placeTour(facts, towns, [{ slug: "champagne", name: "Champagne" }]);
    expect(placed).toMatchObject({ region_slug: "champagne", town_slug: "reims" });
    const category = categoryFor(facts);
    expect(category).toBe("Day trips from Paris");
    expect(selectionProblems(facts, placed, category, [])).toEqual([]);
  });
});

// The structure of a real Winalist estate page (champagne-g-h-martel-c), trimmed.
const winalistPage = (
  over: { faq?: string; languages?: string } = {},
) => `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["LocalBusiness", "TouristAttraction", "Winery"],
      "@id": "https://www.winalist.com/hosts/303/champagne-g-h-martel-c#business",
      name: "Champagne G.H. Martel & C°",
      makesOffer: [
        {
          "@type": "Offer",
          "@id": "https://www.winalist.com/experiences/693/prestige-tour-and-tasting#offer",
          name: "Prestige Tour and Tasting",
          description:
            "Guided tour of our cellar-museum and chalk quarries, then a tasting of 2 Champagnes.",
          price: "30.00",
          priceCurrency: "EUR",
          itemOffered: {
            "@type": "TouristTrip",
            url: "https://www.winalist.com/experiences/693/prestige-tour-and-tasting",
            duration: "PT1H15M",
            maximumAttendeeCapacity: 4,
          },
        },
        {
          "@type": "Offer",
          "@id": "https://www.winalist.com/experiences/694/visit-and-tasting-victory#offer",
          name: "Visit and tasting - Victory",
          price: "40.00",
          priceCurrency: "EUR",
          itemOffered: {
            "@type": "TouristTrip",
            url: "https://www.winalist.com/experiences/694/visit-and-tasting-victory",
            duration: "PT1H30M",
          },
        },
      ],
      address: {
        "@type": "PostalAddress",
        streetAddress: "Champagne G.H. Martel & Co., Rue des Créneaux, Reims, France",
        addressLocality: "Reims",
      },
      geo: { "@type": "GeoCoordinates", latitude: 49.244581, longitude: 4.043387 },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.7", reviewCount: "4860" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home" },
        { "@type": "ListItem", position: 2, name: "France" },
        { "@type": "ListItem", position: 3, name: "Champagne" },
        { "@type": "ListItem", position: 4, name: "Champagne G.H. Martel & C°" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What's the cancellation policy?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              over.faq ??
              "You can cancel your booking free of charge up to 24 hours before your experience starts.",
          },
        },
      ],
    },
  ],
})}</script></head><body>
<div>Preferred language: <span>${over.languages ?? "French English"}</span></div><div>Suggest up to 3 time slot choices</div>
</body></html>`;

describe("parseWinalistPage", () => {
  it("reads the experience's offer and the estate's facts", () => {
    expect(parseWinalistPage(winalistPage(), "693")).toMatchObject({
      title: "Champagne G.H. Martel & C°: Prestige Tour and Tasting",
      priceEur: 30,
      durations: [{ duration: 75, unit: "minute" }],
      groupMax: 4,
      rating: 4.7,
      reviews: 4860,
      languages: ["en"],
      cancellable: true,
      meetingPoint: "Champagne G.H. Martel & Co., Rue des Créneaux, Reims, France",
      locations: [
        { name: "Reims", city: "Reims", lat: 49.244581, lng: 4.043387 },
        { name: "France" },
        { name: "Champagne" },
      ],
    });
    expect(parseWinalistPage(winalistPage(), "694")).toMatchObject({
      priceEur: 40,
      groupMax: undefined,
    });
  });

  it("notices no English and no free cancellation, and refuses an unknown experience", () => {
    const facts = parseWinalistPage(
      winalistPage({ languages: "French", faq: "Bookings are non-refundable." }),
      "693",
    );
    expect(facts).toMatchObject({ languages: [], cancellable: false });
    expect(() => parseWinalistPage(winalistPage(), "999")).toThrow(/no experience 999/);
    expect(() => parseWinalistPage("<html></html>", "693")).toThrow(/no Winalist estate data/);
  });

  it("passes the rules for a good estate visit", () => {
    const facts = parseWinalistPage(winalistPage(), "693");
    const placed = placeTour(
      facts,
      [{ slug: "reims", name: "Reims", region_slug: "champagne" }],
      [],
    );
    expect(selectionProblems(facts, placed, categoryFor(facts), [])).toEqual([]);
  });
});

describe("isoMinutes", () => {
  it("reads ISO 8601 durations", () => {
    expect([
      isoMinutes("PT1H15M"),
      isoMinutes("PT45M"),
      isoMinutes("PT2H"),
      isoMinutes("P1D"),
    ]).toEqual([75, 45, 120, 1440]);
    expect([isoMinutes("P"), isoMinutes("1 hour"), isoMinutes(undefined)]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
