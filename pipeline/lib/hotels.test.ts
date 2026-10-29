import { describe, expect, it } from "vitest";

import {
  hotelProblems,
  hotelRowId,
  matchTown,
  nameFromSlug,
  parseHotelUrl,
  roundupsToQueue,
  tierFor,
  type HotelResearch,
} from "./hotels";

describe("parseHotelUrl: Booking.com", () => {
  it.each([
    [
      "https://www.booking.com/hotel/fr/royal-champagne.html",
      "fr/royal-champagne",
      "Royal Champagne",
    ],
    // A language suffix, tracking parameters and a fragment are dropped.
    [
      "https://www.booking.com/hotel/fr/royal-champagne.en-gb.html?aid=304142&label=x#availability",
      "fr/royal-champagne",
      "Royal Champagne",
    ],
    ["https://booking.com/hotel/fr/les-berceaux.fr.html", "fr/les-berceaux", "Les Berceaux"],
  ])("%s -> %s", (url, id, name) => {
    const p = parseHotelUrl(url);
    expect(p).toMatchObject({ kind: "hotel", provider: "booking", bookingId: id, name });
    if (p.kind === "hotel") expect(p.url).toBe(`https://www.booking.com/hotel/${id}.html`);
  });

  // Real Booking.com listing pages from search results.
  it.each([
    "https://www.booking.com/city/fr/epernay.html",
    "https://www.booking.com/region/fr/champagne.html",
    "https://www.booking.com/luxury/region/fr/champagne.html",
  ])("refuses listing page %s", (url) => {
    expect(parseHotelUrl(url)).toMatchObject({ kind: "listing" });
  });
});

// Real Expedia pages from search results (October 2026).
describe("parseHotelUrl: Expedia", () => {
  it.each([
    [
      "https://www.expedia.co.uk/Epernay-Hotels-BB-Hotel-Epernay.h71589144.Hotel-Information",
      "71589144",
      "BB Hotel Epernay",
      "Epernay",
    ],
    [
      "https://www.expedia.co.uk/Reims-Marne-Hotels-Ibis-Epernay-Centre-Ville.h23517.Hotel-Information",
      "23517",
      "Ibis Epernay Centre Ville",
      "Reims Marne",
    ],
    [
      "https://www.expedia.com/Beaune-Hotels-Beaune-Hotel.h1084139.Hotel-Information",
      "1084139",
      "Beaune Hotel",
      "Beaune",
    ],
  ])("%s -> %s", (url, id, name, city) => {
    expect(parseHotelUrl(url)).toMatchObject({
      kind: "hotel",
      provider: "expedia",
      expediaId: id,
      name,
      city,
    });
  });

  it("reads a bare /h<id>.Hotel-Information link", () => {
    expect(parseHotelUrl("https://www.expedia.com/h123456.Hotel-Information")).toMatchObject({
      provider: "expedia",
      expediaId: "123456",
      name: "",
    });
  });

  it.each([
    "https://www.expedia.com/Epernay-Hotels.d4799.Travel-Guide-Hotels",
    "https://www.expedia.co.uk/Epernay-Reims-Marne-Hotels.0-n6051106-0.Travel-Guide-Filter-Hotels",
  ])("refuses listing page %s", (url) => {
    expect(parseHotelUrl(url)).toMatchObject({ kind: "listing" });
  });
});

describe("parseHotelUrl: anything else", () => {
  it("refuses other sites and non-URLs, including look-alike hosts", () => {
    expect(parseHotelUrl("https://www.hotels.com/ho123/")).toMatchObject({ kind: "unknown" });
    expect(parseHotelUrl("not a url")).toMatchObject({ kind: "unknown", reason: "not a URL" });
    expect(parseHotelUrl("https://booking.com.evil.example/hotel/fr/x.html")).toMatchObject({
      kind: "unknown",
    });
  });

  it("makes stable row ids and readable names", () => {
    const b = parseHotelUrl("https://www.booking.com/hotel/fr/royal-champagne.html");
    const e = parseHotelUrl("https://www.expedia.com/h123456.Hotel-Information");
    if (b.kind !== "hotel" || e.kind !== "hotel") throw new Error("expected hotels");
    expect([hotelRowId(b), hotelRowId(e)]).toEqual(["booking-royal-champagne", "expedia-123456"]);
    expect(nameFromSlug("hotel-de-la-paix")).toBe("Hotel De La Paix");
  });
});

describe("tierFor", () => {
  it("maps the official classification to the site's tiers", () => {
    expect([1, 2, 3, 4, 5].map((s) => tierFor(s))).toEqual([
      "budget",
      "budget",
      "budget",
      "mid",
      "luxury",
    ]);
    expect(tierFor(null, true)).toBe("luxury");
    expect(tierFor(undefined)).toBeUndefined();
  });
});

describe("hotelProblems", () => {
  const research: HotelResearch = {
    name: "Royal Champagne Hotel & Spa",
    town: "Épernay",
    address: "9 Rue de la République, 51160 Champillon",
    stars: 5,
    palace: false,
    official_url: "https://royalchampagne.com/",
    best_for: "Couples with a car",
    blurb: "A hillside hotel above the vines.",
    sources: [],
  };
  const quotes = ["Royal Champagne Hotel & Spa, a 5-star hotel above Épernay"];

  it("passes a hotel in a known town with a sourced classification and a link", () => {
    expect(
      hotelProblems(research, { slug: "epernay" }, quotes, { booking: "fr/royal-champagne" }),
    ).toEqual([]);
  });

  it("names what's missing", () => {
    expect(hotelProblems({ ...research, town: "Lyon" }, undefined, [], {})).toEqual([
      "Lyon is not one of the site's towns",
      "no official star rating in a quoted source, so no tier",
      "no Booking.com or Expedia link",
    ]);
    // A star rating the quotes don't state doesn't count; a Palace needs no stars.
    expect(hotelProblems({ ...research, stars: 4 }, {}, quotes, { expedia: "1" })).toEqual([
      "no official star rating in a quoted source, so no tier",
    ]);
    expect(
      hotelProblems({ ...research, stars: null, palace: true }, {}, [], { expedia: "1" }),
    ).toEqual([]);
    expect(hotelProblems(research, {}, ["un hôtel 5 étoiles"], { expedia: "1" })).toEqual([]);
  });
});

describe("matchTown", () => {
  const towns = [
    { slug: "epernay", name: "Épernay" },
    { slug: "nuits-saint-georges", name: "Nuits-Saint-Georges" },
  ];
  it("matches names accents and case aside", () => {
    expect(matchTown("Epernay", towns)?.slug).toBe("epernay");
    expect(matchTown("nuits saint georges", towns)?.slug).toBe("nuits-saint-georges");
    expect(matchTown("Lyon", towns)).toBeUndefined();
    expect(matchTown(null, towns)).toBeUndefined();
  });
});

describe("roundupsToQueue", () => {
  const towns = [
    { slug: "reims", name: "Reims", region_slug: "champagne" },
    { slug: "epernay", name: "Épernay", region_slug: "champagne" },
    { slug: "beaune", name: "Beaune", region_slug: "burgundy" },
  ];
  const regions = [
    { slug: "champagne", name: "Champagne" },
    { slug: "burgundy", name: "Burgundy" },
  ];
  const h = (town_slug: string, status = "published") => ({ town_slug, status });

  it("queues towns with 3+ hotels and regions with 3+ across two towns", () => {
    const hotels = [
      h("reims"),
      h("reims"),
      h("reims"),
      h("epernay"),
      h("beaune"),
      h("beaune"),
      h("beaune", "draft"),
    ];
    expect(roundupsToQueue(hotels, towns, regions, [], [])).toEqual([
      {
        slug: "where-to-stay-in-reims",
        region_slug: "champagne",
        town_slug: "reims",
        place: "Reims",
        hotels: 3,
      },
      {
        slug: "where-to-stay-in-champagne",
        region_slug: "champagne",
        place: "Champagne",
        hotels: 4,
      },
    ]);
  });

  it("skips pages that already exist or are queued", () => {
    const hotels = [h("reims"), h("reims"), h("reims"), h("epernay")];
    expect(
      roundupsToQueue(
        hotels,
        towns,
        regions,
        [{ slug: "where-to-stay-in-reims" }],
        [{ slug: "best-places-champagne", page_type: "hotel_roundup", region_slug: "champagne" }],
      ),
    ).toEqual([]);
  });
});
