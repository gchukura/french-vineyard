import { describe, expect, it } from "vitest";

import { bookTourHref, regionForPath, regionPathMap } from "@/lib/tour-cta";

const regions = ["champagne", "burgundy"];
const paths = regionPathMap(
  [
    { slug: "reims", region_slug: "champagne" },
    { slug: "beaune", region_slug: "burgundy" },
  ],
  [
    { slug: "best-champagne-houses", page_type: "ranked_list", region_slug: "champagne" },
    { slug: "where-to-stay-in-beaune", page_type: "hotel_roundup", town_slug: "beaune" },
    { slug: "champagne-by-train", page_type: "practical", region_slug: "champagne" },
    { slug: "france-wine-calendar", page_type: "guide" },
  ],
);

describe("regionPathMap", () => {
  it("maps towns and articles to their region, via the town when needed", () => {
    expect(paths).toEqual({
      "/towns/reims/": "champagne",
      "/towns/beaune/": "burgundy",
      "/best-champagne-houses/": "champagne",
      "/where-to-stay/where-to-stay-in-beaune/": "burgundy",
      "/plan/champagne-by-train/": "champagne",
    });
  });
});

describe("regionForPath", () => {
  it("reads region and tours URLs directly", () => {
    expect(regionForPath("/regions/champagne/", regions, paths)).toBe("champagne");
    expect(regionForPath("/regions/burgundy/cote-de-beaune/", regions, paths)).toBe("burgundy");
    expect(regionForPath("/tours/burgundy/", regions, paths)).toBe("burgundy");
  });

  it("looks up towns and articles, with or without the trailing slash", () => {
    expect(regionForPath("/towns/reims/", regions, paths)).toBe("champagne");
    expect(regionForPath("/towns/beaune", regions, paths)).toBe("burgundy");
    expect(regionForPath("/plan/champagne-by-train/", regions, paths)).toBe("champagne");
  });

  it("has no region for site-wide pages or unpublished regions", () => {
    for (const p of ["/", "/tours/", "/regions/", "/about/", "/france-wine-calendar/"])
      expect(regionForPath(p, regions, paths)).toBeUndefined();
    expect(regionForPath("/regions/bordeaux/", regions, paths)).toBeUndefined();
  });

  it("treats fixed routes as site-wide even when an article shares the path", () => {
    const shared = regionPathMap(
      [],
      [{ slug: "getting-there", page_type: "practical", region_slug: "champagne" }],
    );
    expect(shared).toEqual({ "/plan/getting-there/": "champagne" });
    expect(regionForPath("/plan/getting-there/", regions, shared)).toBeUndefined();
  });
});

describe("bookTourHref", () => {
  it("goes to the region's tours page, else all tours", () => {
    expect(bookTourHref("/towns/reims/", regions, paths)).toBe("/tours/champagne/");
    expect(bookTourHref("/about/", regions, paths)).toBe("/tours/");
  });
});
