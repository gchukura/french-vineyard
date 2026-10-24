import { describe, expect, it } from "vitest";

import {
  SheetRowError,
  articleSchema,
  estateSchema,
  hotelSchema,
  parseTab,
  regionSchema,
  rowsToRecords,
  sheetTag,
  subRegionSchema,
  tourSchema,
  townSchema,
} from "@/lib/sheet-schema";

// Fixture grids mirror what values:batchGet returns with UNFORMATTED_VALUE:
// a header row, then rows that may be short (trailing blanks are omitted).

const regions = [
  ["slug", "name", "name_fr", "lat", "lng", "best_months", "unesco", "hero_is_ai", "status"],
  [
    "champagne",
    "Champagne",
    "Champagne",
    49.04,
    "4.02",
    "may, june, september",
    "TRUE",
    "",
    "published",
  ],
  ["bordeaux", "Bordeaux", "Bordeaux", 44.84, -0.58, "", false, true, "Draft"],
  [],
  ["burgundy", "Burgundy", "Bourgogne", "47.32", 4.83, "october", "", "", " published "],
];

describe("sheetTag", () => {
  it("lowercases the tab name", () => {
    expect(sheetTag("SubRegions")).toBe("sheet-subregions");
  });
});

describe("rowsToRecords", () => {
  it("keys cells by header, skips blank rows and keeps sheet row numbers", () => {
    const rows = rowsToRecords(regions);
    expect(rows.map((r) => r.row)).toEqual([2, 3, 5]);
    expect(rows[0].record.slug).toBe("champagne");
  });

  it("returns nothing for an empty tab", () => {
    expect(rowsToRecords([])).toEqual([]);
  });
});

describe("parseTab", () => {
  it("returns only published rows by default", () => {
    const out = parseTab("Regions", regions, regionSchema);
    expect(out.map((r) => r.slug)).toEqual(["champagne", "burgundy"]);
  });

  it("includes drafts when asked", () => {
    const out = parseTab("Regions", regions, regionSchema, { includeDrafts: true });
    expect(out.map((r) => [r.slug, r.status])).toEqual([
      ["champagne", "published"],
      ["bordeaux", "draft"],
      ["burgundy", "published"],
    ]);
  });

  it("coerces numbers, booleans and lists", () => {
    const [champagne, , burgundy] = parseTab("Regions", regions, regionSchema, {
      includeDrafts: true,
    });
    expect(champagne.lat).toBe(49.04);
    expect(champagne.lng).toBe(4.02);
    expect(champagne.best_months).toEqual(["may", "june", "september"]);
    expect(champagne.unesco).toBe(true);
    expect(champagne.hero_is_ai).toBe(false);
    expect(champagne.tagline).toBeUndefined();
    expect(burgundy.lat).toBe(47.32);
  });

  it("rejects a decimal comma rather than guessing", () => {
    const grid = [
      ["slug", "name", "lat", "status"],
      ["burgundy", "Burgundy", "47,32", "published"],
    ];
    expect(() => parseTab("Regions", grid, regionSchema)).toThrow(/row 2[\s\S]*lat/);
  });

  it("throws with the sheet row number on a malformed row", () => {
    const bad = [
      ["slug", "name", "lat", "status"],
      ["champagne", "Champagne", 49, "published"],
      ["Côte-d'Or", "Côte-d'Or", "north", "published"],
    ];
    expect(() => parseTab("Regions", bad, regionSchema)).toThrowError(SheetRowError);
    try {
      parseTab("Regions", bad, regionSchema);
    } catch (e) {
      const err = e as SheetRowError;
      expect(err.tab).toBe("Regions");
      expect(err.row).toBe(3);
      expect(err.message).toContain('Sheet "Regions" row 3');
      expect(err.issues.some((i) => i.startsWith("slug:"))).toBe(true);
      expect(err.issues.some((i) => i.startsWith("lat:"))).toBe(true);
    }
  });

  it("does not validate drafts it will not return", () => {
    const grid = [
      ["slug", "name", "status"],
      ["half-done", "", "draft"],
    ];
    expect(parseTab("Regions", grid, regionSchema)).toEqual([]);
    expect(() => parseTab("Regions", grid, regionSchema, { includeDrafts: true })).toThrow(/row 2/);
  });

  it("treats a blank status as draft", () => {
    const grid = [
      ["slug", "name", "status"],
      ["champagne", "Champagne", ""],
    ];
    expect(parseTab("Regions", grid, regionSchema)).toEqual([]);
  });
});

describe("JSON columns", () => {
  const towns = [
    ["slug", "region_slug", "subregion_slug", "name", "estates_json", "faq_json", "status"],
    [
      "epernay",
      "champagne",
      "",
      "Épernay",
      '["moet-chandon","pol-roger"]',
      '[{"question":"Is it walkable?","answer":"Yes."}]',
      "published",
    ],
    ["reims", "champagne", "montagne-de-reims", "Reims", "", "", "published"],
  ];

  it("parses JSON and defaults blanks", () => {
    const [epernay, reims] = parseTab("Towns", towns, townSchema);
    expect(epernay.name).toBe("Épernay");
    expect(epernay.subregion_slug).toBeUndefined();
    expect(epernay.estates_json).toEqual(["moet-chandon", "pol-roger"]);
    expect(epernay.faq_json).toEqual([{ question: "Is it walkable?", answer: "Yes." }]);
    expect(reims.estates_json).toEqual([]);
    expect(reims.faq_json).toEqual([]);
  });

  it("reports invalid JSON", () => {
    const grid = [towns[0], ["epernay", "champagne", "", "Épernay", "[oops", "", "published"]];
    expect(() => parseTab("Towns", grid, townSchema)).toThrow(/estates_json: is not valid JSON/);
  });

  it("reports JSON of the wrong shape", () => {
    const grid = [towns[0], ["epernay", "champagne", "", "Épernay", "", '{"q":"x"}', "published"]];
    expect(() => parseTab("Towns", grid, townSchema)).toThrow(/faq_json/);
  });

  it("parses appellation facts as an object", () => {
    const grid = [
      ["slug", "region_slug", "name", "appellation_facts_json", "status"],
      ["cote-de-nuits", "burgundy", "Côte de Nuits", '{"grands_crus":24}', "published"],
    ];
    const [sub] = parseTab("SubRegions", grid, subRegionSchema);
    expect(sub.appellation_facts_json).toEqual({ grands_crus: 24 });
  });
});

describe("Articles", () => {
  const header = ["slug", "page_type", "region_slug", "title", "tour_ids", "tags", "status"];

  it("splits list columns and validates page_type", () => {
    const grid = [
      header,
      [
        "best-champagne-tours",
        "ranked_list",
        "champagne",
        "Best tours",
        "t1, t2",
        "tours",
        "published",
      ],
    ];
    const [a] = parseTab("Articles", grid, articleSchema);
    expect(a.page_type).toBe("ranked_list");
    expect(a.tour_ids).toEqual(["t1", "t2"]);
    expect(a.hotel_ids).toEqual([]);
  });

  it("rejects an unknown page_type", () => {
    const grid = [header, ["x", "listicle", "", "X", "", "", "published"]];
    expect(() => parseTab("Articles", grid, articleSchema)).toThrow(/page_type/);
  });
});

describe("Tours", () => {
  const header = [
    "id",
    "provider",
    "provider_id",
    "region_slug",
    "title",
    "price_from_eur",
    "rating",
    "review_count",
    "bullets_json",
    "featured",
    "status",
  ];

  it("parses a curated tour", () => {
    const grid = [
      header,
      [
        "t1",
        "gyg",
        "12345",
        "champagne",
        "Reims cellars",
        89,
        "4.8",
        "1,204",
        '["Two houses"]',
        "yes",
        "published",
      ],
    ];
    const [t] = parseTab("Tours", grid, tourSchema);
    expect(t).toMatchObject({
      provider: "gyg",
      provider_id: "12345",
      price_from_eur: 89,
      rating: 4.8,
      review_count: 1204,
      bullets_json: ["Two houses"],
      featured: true,
    });
  });

  it("coerces a numeric provider_id cell to a string", () => {
    const grid = [
      header,
      ["t2", "viator", 98765, "bordeaux", "Médoc day", "", "", "", "", "", "published"],
    ];
    expect(parseTab("Tours", grid, tourSchema)[0].provider_id).toBe("98765");
  });

  it("rejects an unknown provider", () => {
    const grid = [header, ["t3", "klook", "1", "champagne", "X", "", "", "", "", "", "published"]];
    expect(() => parseTab("Tours", grid, tourSchema)).toThrow(/provider/);
  });

  it("rejects a non-boolean featured cell", () => {
    const grid = [
      header,
      ["t4", "gyg", "1", "champagne", "X", "", "", "", "", "maybe", "published"],
    ];
    expect(() => parseTab("Tours", grid, tourSchema)).toThrow(/featured/);
  });
});

describe("tabs without a status column", () => {
  it("returns every Hotels row", () => {
    const grid = [
      ["id", "name", "town_slug", "tier", "price_from_eur"],
      ["h1", "Royal Champagne", "champillon", "luxury", "650"],
      ["h2", "Hôtel Jean Moët", "epernay", "Mid", ""],
    ];
    const out = parseTab("Hotels", grid, hotelSchema);
    expect(out.map((h) => [h.id, h.tier, h.price_from_eur])).toEqual([
      ["h1", "luxury", 650],
      ["h2", "mid", undefined],
    ]);
  });

  it("returns every Estates row and validates visits", () => {
    const grid = [
      ["id", "name", "town_slug", "visits", "tasting_fee_eur", "languages"],
      ["e1", "Pol Roger", "epernay", "appointment", 45, "en, fr"],
      ["e2", "Château X", "pauillac", "", "", ""],
    ];
    const out = parseTab("Estates", grid, estateSchema);
    expect(out[0]).toMatchObject({
      visits: "appointment",
      tasting_fee_eur: 45,
      languages: ["en", "fr"],
    });
    expect(out[1].visits).toBeUndefined();

    const bad = [grid[0], ["e3", "Y", "epernay", "drop-in", "", ""]];
    expect(() => parseTab("Estates", bad, estateSchema)).toThrow(/row 2[\s\S]*visits/);
  });
});
