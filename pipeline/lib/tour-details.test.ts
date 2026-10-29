import { describe, expect, it } from "vitest";

import {
  categoryFor,
  formatDuration,
  groupSizeIn,
  meetingPointFrom,
  nextRank,
  parseGygDetails,
  placeTour,
  selectionProblems,
  tierOf,
  type Peer,
  type TourFacts,
} from "./tour-details";

/** A GET /1/tours/{id} reply in the shape of GetYourGuide's partner-api-spec (Tour schema). */
const gygReply = (tour: Record<string, unknown> = {}) => ({
  _metadata: { exchange: { rate: 1, currency: "EUR" } },
  data: {
    tours: [
      {
        tour_id: 220971,
        title: "From Reims: Morning Champagne Tour and Tastings",
        abstract: "Visit two family-run estates in a small group of up to 8 people.",
        description: "Tour the cellars and taste three cuvées at each house.",
        highlights: ["Visit 2 family-run champagne houses", " Taste 6 champagnes ", ""],
        overall_rating: 4.8234,
        number_of_ratings: 560,
        price: { values: { amount: 125 }, description: "individual" },
        durations: [{ duration: 4, unit: "hour" }],
        cond_language: ["en", "fr"],
        guide_type: "live_tour_guide",
        has_pick_up: true,
        cancellation_policy: {
          cancellable: true,
          cancellation_fee_value: null,
          cancellation_offset_minutes: 1440,
        },
        activity_type: "guidedTour",
        coordinates: { lat: 49.2583, long: 4.0317 },
        locations: [
          {
            location_id: 1,
            type: "city",
            name: "Reims",
            city: "Reims",
            coordinates: { lat: 49.2583, long: 4.0317 },
          },
        ],
        ...tour,
      },
    ],
  },
});

const towns = [
  { slug: "reims", name: "Reims", region_slug: "champagne", lat: 49.2583, lng: 4.0317 },
  { slug: "epernay", name: "Épernay", region_slug: "champagne", lat: 49.0403, lng: 3.9559 },
  {
    slug: "chalons-en-champagne",
    name: "Châlons-en-Champagne",
    region_slug: "champagne",
    lat: 48.9566,
    lng: 4.3631,
  },
  { slug: "beaune", name: "Beaune", region_slug: "burgundy", lat: 47.026, lng: 4.84 },
];
const regions = [
  { slug: "champagne", name: "Champagne" },
  { slug: "bordeaux", name: "Bordeaux" },
  { slug: "burgundy", name: "Burgundy" },
];

describe("parseGygDetails", () => {
  it("reads the facts a Tours row and the selection rules need", () => {
    expect(parseGygDetails(gygReply())).toMatchObject({
      title: "From Reims: Morning Champagne Tour and Tastings",
      highlights: ["Visit 2 family-run champagne houses", "Taste 6 champagnes"],
      rating: 4.8,
      reviews: 560,
      priceEur: 125,
      durations: [{ duration: 4, unit: "hour" }],
      languages: ["en", "fr"],
      guideType: "live_tour_guide",
      hasPickUp: true,
      cancellable: true,
      cancellationFee: undefined,
      locations: [{ name: "Reims", city: "Reims", lat: 49.2583, lng: 4.0317 }],
    });
  });

  it("tolerates missing optional fields and refuses a reply with no tour", () => {
    const facts = parseGygDetails({ data: { tours: [{ title: "Bare tour" }] } });
    expect(facts).toMatchObject({
      title: "Bare tour",
      highlights: [],
      languages: [],
      locations: [],
    });
    expect(facts.rating).toBeUndefined();
    expect(() => parseGygDetails({ data: { tours: [] } })).toThrow();
  });
});

describe("meetingPointFrom", () => {
  it("takes the first meeting point, address or pickup among the options", () => {
    expect(
      meetingPointFrom({
        data: {
          tour_options: [
            { option_id: 1, meeting_point: " " },
            { option_id: 2, meeting_point_address: "Place du Forum, 51100 Reims" },
          ],
        },
      }),
    ).toBe("Place du Forum, 51100 Reims");
    expect(meetingPointFrom({ data: { tour_options: [{ option_id: 1 }] } })).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("writes hours, ranges, minutes and days", () => {
    expect(formatDuration([{ duration: 4, unit: "hour" }])).toBe("4 hours");
    expect(formatDuration([{ duration: 1, unit: "hour" }])).toBe("1 hour");
    expect(
      formatDuration([
        { duration: 4, unit: "hour" },
        { duration: 3, unit: "hour" },
      ]),
    ).toBe("3–4 hours");
    expect(formatDuration([{ duration: 90, unit: "minute" }])).toBe("1.5 hours");
    expect(formatDuration([{ duration: 45, unit: "minute" }])).toBe("45 minutes");
    expect(formatDuration([{ duration: 1, unit: "day" }])).toBe("1 day");
    expect(formatDuration([])).toBeUndefined();
  });
});

describe("placeTour", () => {
  const facts = (over: Partial<TourFacts>) => ({ ...parseGygDetails(gygReply()), ...over });

  it("uses a town named in the locations, accents aside", () => {
    expect(placeTour(facts({ locations: [{ name: "Epernay" }] }), towns, regions)).toMatchObject({
      region_slug: "champagne",
      town_slug: "epernay",
    });
  });

  it("prefers the longer town name over the region inside it", () => {
    expect(
      placeTour(
        facts({ title: "Châlons-en-Champagne: Canal and Cellar Walk", locations: [] }),
        towns,
        regions,
      ),
    ).toMatchObject({ town_slug: "chalons-en-champagne" });
  });

  it("places a day trip from Paris by the region it visits, not by Paris", () => {
    expect(
      placeTour(
        facts({
          title: "From Paris: Champagne Region Day Trip with Tastings",
          locations: [{ name: "Paris", city: "Paris", lat: 48.85, lng: 2.35 }],
          lat: 48.85,
          lng: 2.35,
        }),
        towns,
        regions,
      ),
    ).toEqual({ region_slug: "champagne", how: "names Champagne" });
    expect(
      placeTour(facts({ title: "Côte de Beaune Grands Crus Morning", locations: [] }), [], regions),
    ).toMatchObject({ region_slug: "burgundy" });
  });

  it("falls back to the nearest town within 30 km, and gives up beyond", () => {
    const near = facts({ title: "Wine morning", locations: [], lat: 49.05, lng: 3.95 });
    expect(placeTour(near, towns, regions)).toMatchObject({ town_slug: "epernay" });
    const far = facts({ title: "Wine morning", locations: [], lat: 45.76, lng: 4.83 });
    expect(placeTour(far, towns, regions).region_slug).toBeUndefined();
  });
});

describe("categoryFor", () => {
  const c = (title: string, activityType?: string, city?: string) =>
    categoryFor({ title, activityType, locations: city ? [{ name: city, city }] : [] });
  it.each([
    [
      "From Paris: Reims and Épernay Champagne Day Trip",
      undefined,
      undefined,
      "Day trips from Paris",
    ],
    ["Champagne Region Day Tour", "dayTrip", "Paris", "Day trips from Paris"],
    ["Reims: Private Champagne Tour with a Sommelier", undefined, undefined, "Private tours"],
    ["Épernay: Champagne Blending Workshop", undefined, undefined, "Tastings and classes"],
    ["Reims City Center Champagne Tasting", undefined, undefined, "Tastings and classes"],
    ["From Reims: Champagne Afternoon E-Bike Tour", undefined, undefined, "Vineyard tours"],
    [
      "Reims: Maison de Champagne and Wineries Tour with Tastings",
      undefined,
      undefined,
      "Cellar tours",
    ],
  ])("%s -> %s", (title, activityType, city, want) => {
    expect(c(title, activityType, city)).toBe(want);
  });
});

describe("groupSizeIn", () => {
  it("finds a stated maximum, a small group or a private tour", () => {
    expect(groupSizeIn("Small group limited to 8 participants")).toEqual({ max: 8 });
    expect(groupSizeIn("Join a group of up to 12 people")).toEqual({ max: 12 });
    expect(groupSizeIn("This is a private tour for your party")).toEqual({ private: true });
    expect(groupSizeIn("A small-group visit")).toEqual({ small: true });
    expect(groupSizeIn("Visit the cellars")).toBeUndefined();
  });
});

describe("selectionProblems", () => {
  const facts = { ...parseGygDetails(gygReply()), meetingPoint: "Place du Forum" };
  const placed = { region_slug: "champagne", town_slug: "reims", how: "names Reims" };

  it("passes a tour that meets every rule", () => {
    expect(selectionProblems(facts, placed, "Cellar tours", [])).toEqual([]);
  });

  it("names each rule a tour misses", () => {
    const weak: TourFacts = {
      ...facts,
      rating: 4.3,
      reviews: 40,
      cancellable: false,
      languages: ["fr"],
      hasPickUp: false,
      meetingPoint: undefined,
      abstract: "",
      description: "",
      highlights: ["Taste champagne in town"],
      title: "Reims: Champagne Tasting",
    };
    expect(selectionProblems(weak, { how: "no known town" }, "Cellar tours", [])).toEqual([
      "no region: no known town",
      "rating 4.3 is below 4.5",
      "40 reviews; needs 50+",
      "no free cancellation",
      "no English-speaking guide",
      "no meeting point or pickup given",
      "group size not stated in the listing",
      "doesn't mention visiting an estate, cellar or vineyard",
    ]);
  });

  it("needs 100 reviews for day trips from Paris, and no fee for free cancellation", () => {
    expect(
      selectionProblems({ ...facts, reviews: 80 }, placed, "Day trips from Paris", []),
    ).toEqual(["80 reviews; needs 100+"]);
    expect(
      selectionProblems({ ...facts, cancellationFee: 10 }, placed, "Cellar tours", []),
    ).toEqual(["no free cancellation"]);
    expect(
      selectionProblems({ ...facts, guideType: "audio_guide" }, placed, "Cellar tours", []),
    ).toEqual(["no English-speaking guide"]);
  });

  it("keeps one published tour per price tier in each region and category", () => {
    const peers: Peer[] = [
      {
        id: "gyg-1",
        region_slug: "champagne",
        category: "Cellar tours",
        price_from_eur: 99,
        status: "published",
      },
      {
        id: "gyg-2",
        region_slug: "champagne",
        category: "Cellar tours",
        price_from_eur: 45,
        status: "draft",
      },
      {
        id: "gyg-3",
        region_slug: "bordeaux",
        category: "Cellar tours",
        price_from_eur: 120,
        status: "published",
      },
    ];
    expect(selectionProblems(facts, placed, "Cellar tours", peers)).toEqual([
      "the €60 to €150 tier of Cellar tours is taken by gyg-1",
    ]);
    expect(selectionProblems({ ...facts, priceEur: 55 }, placed, "Cellar tours", peers)).toEqual(
      [],
    );
  });
});

describe("tiers and ranks", () => {
  it("puts €60 and €150 in the middle tier", () => {
    expect([59.99, 60, 150, 150.01].map(tierOf)).toEqual([0, 1, 1, 2]);
  });

  it("ranks after the last tour in the region and category, archived rows aside", () => {
    const peers: Peer[] = [
      { id: "a", region_slug: "champagne", category: "Cellar tours", status: "published", rank: 1 },
      { id: "b", region_slug: "champagne", category: "cellar tours", status: "draft", rank: 2 },
      { id: "c", region_slug: "champagne", category: "Cellar tours", status: "archived", rank: 7 },
      { id: "d", region_slug: "bordeaux", category: "Cellar tours", status: "published", rank: 5 },
    ];
    expect(nextRank(peers, "champagne", "Cellar tours")).toBe(3);
    expect(nextRank(peers, "burgundy", "Cellar tours")).toBe(1);
  });
});
