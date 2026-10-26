import { describe, expect, it } from "vitest";

import { allowedNumbers } from "./numbers";
import {
  checkTourNotes,
  linkVerdict,
  parseGygTour,
  parseTourUrl,
  rankedListSlug,
  rankedListsToQueue,
  sentenceCount,
  slugify,
  tourId,
} from "./tours";

// Real listings found on each provider's site (October 2026).
describe("parseTourUrl: GetYourGuide", () => {
  it.each([
    [
      "https://www.getyourguide.com/reims-l365/from-reims-taittinger-champagne-morning-tour-tastings-t220971/",
      "220971",
    ],
    [
      "https://www.getyourguide.com/reims-l365/from-paris-reims-cathedral-champagne-cellar-and-tasting-t943032/",
      "943032",
    ],
    // No www, no trailing slash, as some search results show it.
    ["https://getyourguide.com/reims-l365/reims-veuve-clicquot-champagner-tour-t396037", "396037"],
    [
      "https://www.getyourguide.com/paris-l16/paris-two-reims-champagne-vineyards-with-tastings-and-lunch-t407749/?partner_id=ABC&utm_medium=online_publisher#reviews",
      "407749",
    ],
  ])("%s -> %s", (url, id) => {
    const parsed = parseTourUrl(url);
    expect(parsed).toMatchObject({ kind: "product", provider: "gyg", providerId: id });
    // Tracking parameters and fragments are dropped.
    if (parsed.kind === "product") expect(parsed.url).not.toMatch(/[?#]/);
  });

  it.each([
    "https://www.getyourguide.com/reims-l365/",
    "https://www.getyourguide.com/champagne-l32243/wine-tasting-winery-tours-tc104/",
    "https://www.getyourguide.com/s/?q=champagne",
    "https://www.getyourguide.com/destinations/reims-l365/",
  ])("refuses listing page %s", (url) => {
    expect(parseTourUrl(url)).toMatchObject({ kind: "listing", provider: "gyg" });
  });
});

describe("parseTourUrl: Viator", () => {
  it.each([
    [
      "https://www.viator.com/tours/Paris/Champagne-private-tour-from-Paris/d479-29942P2",
      "29942P2",
    ],
    [
      "https://www.viator.com/tours/Paris/Champagne-Region-Day-Trip-from-Paris-including-Two-Champagne-Tastings/d479-2050RC",
      "2050RC",
    ],
    // Country subdomain and locale prefix.
    ["https://ca.viator.com/tours/Paris/Champagne-WineDay-Tour/d479-35428P1", "35428P1"],
    [
      "https://www.viator.com/en-AU/tours/Paris/Champagne-private-tour-from-Paris/d479-29942P2",
      "29942P2",
    ],
    [
      "https://www.viator.com/tours/Paris/Small-Group-Champagne-Tour-from-Paris-Including-4-course-Lunch/d479-19014P14?pid=P00012&mcid=42383",
      "19014P14",
    ],
  ])("%s -> %s", (url, id) => {
    expect(parseTourUrl(url)).toMatchObject({
      kind: "product",
      provider: "viator",
      providerId: id,
    });
  });

  it.each([
    "https://www.viator.com/Paris/Reims/day-trips-d479-d5049",
    "https://www.viator.com/Champagne-tours/Day-Trips-and-Excursions/d813-g5",
    "https://www.viator.com/Champagne-attractions/Moet-and-Chandon-Cellars/d813-a14397",
    "https://www.viator.com/searchResults/all?text=champagne",
  ])("refuses listing page %s", (url) => {
    expect(parseTourUrl(url)).toMatchObject({ kind: "listing", provider: "viator" });
  });
});

describe("parseTourUrl: Winalist", () => {
  it.each([
    ["https://www.winalist.com/experiences/688/initiation", "688"],
    ["https://winalist.com/experiences/984/visit-and-tasting", "984"],
    // An estate's page; Winalist experience links redirect to it.
    ["https://www.winalist.com/hosts/101/champagne-veuve-clicquot", "host-101"],
    ["https://www.winalist.com/hosts/303/champagne-g-h-martel-c", "host-303"],
  ])("%s -> %s", (url, id) => {
    expect(parseTourUrl(url)).toMatchObject({
      kind: "product",
      provider: "winalist",
      providerId: id,
    });
  });

  it("refuses a city page", () => {
    expect(parseTourUrl("https://www.winalist.com/cities/hautvillers")).toMatchObject({
      kind: "listing",
      provider: "winalist",
    });
  });
});

describe("parseTourUrl: anything else", () => {
  it.each([
    ["not a url", "not a URL"],
    ["https://www.tripadvisor.com/Attraction_Review-g187135", "not GetYourGuide"],
    ["ftp://www.viator.com/tours/x/y/d1-2P1", "not a web address"],
    ["https://getyourguide.evil.example/reims-l365/x-t1/", "not GetYourGuide"],
  ])("%s", (url, reason) => {
    const parsed = parseTourUrl(url);
    expect(parsed.kind).toBe("unknown");
    if (parsed.kind === "unknown") expect(parsed.reason).toContain(reason);
  });

  it("builds stable lowercase ids", () => {
    expect(tourId("viator", "35428P1")).toBe("viator-35428p1");
    expect(tourId("winalist", "host-303")).toBe("winalist-host-303");
  });
});

describe("linkVerdict", () => {
  const product = "https://www.getyourguide.com/reims-l365/x-t220971/";
  it("passes a product page and flags dead ends", () => {
    expect(linkVerdict("gyg", product, 200)).toEqual({ status: "ok" });
    expect(linkVerdict("gyg", product, 404)).toMatchObject({ status: "flag" });
    expect(linkVerdict("gyg", product, 500)).toMatchObject({ status: "flag" });
    expect(linkVerdict("gyg", "https://www.getyourguide.com/reims-l365/", 200)).toMatchObject({
      status: "flag",
      reason: expect.stringContaining("location or listing page"),
    });
    expect(linkVerdict("viator", product, 200)).toMatchObject({ status: "flag" });
    expect(linkVerdict("gyg", "https://example.com/", 200)).toMatchObject({ status: "flag" });
  });

  it("treats a bot block on a product URL as unverified, not broken", () => {
    expect(linkVerdict("gyg", product, 403)).toMatchObject({ status: "unverified" });
    expect(
      linkVerdict("viator", "https://www.viator.com/tours/Paris/x/d479-35428P1", 429),
    ).toMatchObject({ status: "unverified" });
    // A block that lands on a listing is still a wrong landing.
    expect(linkVerdict("gyg", "https://www.getyourguide.com/reims-l365/", 403)).toMatchObject({
      status: "flag",
    });
  });

  it("accepts a Winalist experience that redirected to its estate page", () => {
    expect(
      linkVerdict("winalist", "https://www.winalist.com/hosts/303/champagne-g-h-martel-c", 200),
    ).toEqual({ status: "ok" });
  });
});

describe("parseGygTour", () => {
  it("reads price, rating and review count from the Partner API reply", () => {
    expect(
      parseGygTour({
        _metadata: {},
        data: {
          tours: [
            {
              tour_id: 220971,
              overall_rating: 4.8234,
              number_of_ratings: 560,
              price: { values: { amount: 125 }, description: "individual" },
            },
          ],
        },
      }),
    ).toEqual({ price_from_eur: 125, rating: 4.8, review_count: 560 });
  });

  it("leaves out missing fields and rejects a reply with no tour", () => {
    expect(parseGygTour({ data: { tours: [{ overall_rating: null }] } })).toEqual({});
    expect(() => parseGygTour({ data: { tours: [] } })).toThrow();
  });
});

describe("checkTourNotes", () => {
  const inputs = { price_from_eur: 125, rating: 4.8, review_count: 560, duration: "4 hours" };
  const opts = {
    bannedPhrases: ["hidden gem"],
    allowedNumbers: allowedNumbers(inputs),
    usdRate: 1.08,
  };
  const ok = {
    best_for: "First visit to Champagne, small groups",
    why_picked:
      "Two family estates in one morning, with a cellar tour and tasting at each. At €125 ($135) it costs less than most half-day tours with transport, and 560 reviews average 4.8.",
  };

  it("passes notes that keep to the rules", () => {
    expect(checkTourNotes(ok, opts)).toEqual([]);
  });

  it("enforces lengths and two or three sentences", () => {
    const rules = (n: Partial<typeof ok>) =>
      checkTourNotes({ ...ok, ...n }, opts).map((f) => f.rule);
    expect(rules({ best_for: "x".repeat(61) })).toContain("best_for");
    expect(rules({ why_picked: "One sentence only." })).toContain("why_picked");
    expect(rules({ why_picked: "One. Two. Three. Four." })).toContain("why_picked");
    expect(rules({ why_picked: `${"Long sentence here. ".repeat(20)}` })).toContain("why_picked");
  });

  it("catches first person, unsourced numbers, selling, meta-language and banned phrases", () => {
    const rules = (why_picked: string) =>
      checkTourNotes({ ...ok, why_picked }, opts).map((f) => f.rule);
    expect(rules("I loved the cellars. It runs daily.")).toContain("no_first_person");
    expect(rules("Our favorite tour. It runs daily.")).toContain("no_first_person");
    expect(rules("It visits 7 estates. It runs daily.")).toContain("numbers_sourced");
    expect(rules("A hidden gem in Reims. It runs daily.")).toContain("no_banned_phrases");
    expect(rules("Buy bottles at the end. It runs daily.")).toContain("no_alcohol_selling");
    expect(rules("According to the operator it is small. It runs daily.")).toContain(
      "no_meta_language",
    );
    expect(rules("It costs €125 for the morning. It runs daily.")).toContain("style");
  });
});

describe("sentenceCount", () => {
  it("ignores decimals and a.m./p.m.", () => {
    expect(sentenceCount("Rated 4.8 by guests. Starts at 9 a.m. in Reims.")).toBe(2);
    expect(sentenceCount("One! Two? Three.")).toBe(3);
  });
});

describe("rankedListsToQueue", () => {
  const t = (region_slug: string, category: string, status = "published") => ({
    region_slug,
    category,
    status,
  });
  const tours = [
    t("champagne", "Cellar tours"),
    t("champagne", "cellar tours "),
    t("champagne", "Cellar tours"),
    t("champagne", "Day trips from Paris"),
    t("champagne", "Day trips from Paris"),
    t("champagne", "Day trips from Paris", "draft"),
    t("bordeaux", "Cellar tours"),
    t("bordeaux", "Cellar tours"),
    t("bordeaux", "Cellar tours"),
  ];

  it("queues region + category pairs with 3+ published tours and no ranked list", () => {
    expect(rankedListsToQueue(tours, [], [])).toEqual([
      {
        region_slug: "champagne",
        category: "Cellar tours",
        slug: "best-champagne-cellar-tours",
        tours: 3,
      },
      {
        region_slug: "bordeaux",
        category: "Cellar tours",
        slug: "best-bordeaux-cellar-tours",
        tours: 3,
      },
    ]);
  });

  it("skips pairs that already have an article or a ranked-list Queue row", () => {
    const plans = rankedListsToQueue(
      tours,
      [{ slug: "best-champagne-cellar-tours", page_type: "ranked_list" }],
      [
        {
          slug: "bordeaux-cellars",
          page_type: "ranked_list",
          region_slug: "bordeaux",
          category: "cellar tours",
        },
      ],
    );
    expect(plans).toEqual([]);
  });

  it("makes ASCII slugs", () => {
    expect(slugify("Tastings & classes")).toBe("tastings-and-classes");
    expect(rankedListSlug("burgundy", "Côte de Nuits walks")).toBe(
      "best-burgundy-cote-de-nuits-walks",
    );
  });
});
