import { describe, expect, it } from "vitest";

import {
  countFacts,
  extractJsonBlock,
  factSheetSchema,
  factsHash,
  keepSourced,
  normalizeUrl,
} from "./facts";

const sheet = factSheetSchema.parse({
  subject: "Épernay",
  coordinates: {
    lat: 49.04,
    lng: 3.96,
    sources: ["https://www.epernay-tourisme.com/?utm_source=x"],
  },
  from_paris: [
    {
      mode: "train",
      route: "Gare de l'Est to Épernay",
      duration_minutes: 75,
      sources: ["https://www.sncf-connect.com/a/"],
    },
    { mode: "car", route: "A4 motorway", duration_minutes: 100, sources: [] },
  ],
  opening_months: null,
  tasting_price_eur: { min: 20, max: 45, sources: ["https://made-up.example/"] },
  estates: [{ name: "Maison A", visits: "booking", sources: ["https://maison-a.fr/visits#top"] }],
  nearest_station: null,
  warnings: [{ text: "Book ahead.", sources: [] }],
  other_facts: [],
});

const seen = new Map<string, string | undefined>([
  ["https://epernay-tourisme.com/", "Office de tourisme"],
  ["https://www.sncf-connect.com/a", "SNCF"],
  ["https://maison-a.fr/visits", undefined],
]);

describe("normalizeUrl", () => {
  it("drops www, fragments, tracking params and trailing slashes", () => {
    expect(normalizeUrl("http://www.Example.com/path/?utm_medium=a&id=2#x")).toBe(
      "https://example.com/path?id=2",
    );
  });

  it("rejects non-http URLs and garbage", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeUrl("not a url")).toBeUndefined();
  });
});

describe("keepSourced", () => {
  const { facts, dropped } = keepSourced(sheet, seen);

  it("keeps facts whose sources research actually saw", () => {
    expect(facts.coordinates?.lat).toBe(49.04);
    expect(facts.from_paris.map((f) => f.mode)).toEqual(["train"]);
    expect(facts.estates).toHaveLength(1);
  });

  it("drops facts with no source or only unseen sources", () => {
    expect(facts.tasting_price_eur).toBeNull();
    expect(facts.warnings).toEqual([]);
    expect(dropped).toEqual([
      "from_paris: A4 motorway",
      "tasting_price_eur",
      "warning: Book ahead.",
    ]);
  });

  it("lists each used source once, with its title", () => {
    expect(facts.sources).toHaveLength(3);
    expect(facts.sources[0]).toEqual({
      url: "https://epernay-tourisme.com/",
      title: "Office de tourisme",
    });
  });

  it("counts kept facts", () => {
    expect(countFacts(facts)).toBe(3);
  });
});

describe("factSheetSchema", () => {
  it("accepts a route without a sourced journey time", () => {
    const parsed = factSheetSchema.parse({
      subject: "Saint-Émilion",
      from_paris: [{ mode: "car", route: "A10", duration_minutes: null, sources: ["https://a"] }],
      tasting_price_eur: { min: 15, max: null, sources: ["https://a"] },
    });
    expect(parsed.from_paris[0].duration_minutes).toBeNull();
  });
});

describe("factsHash", () => {
  it("ignores sources, notes and list order", () => {
    const a = factSheetSchema.parse({
      subject: "X",
      warnings: [
        { text: "One", sources: ["https://a"] },
        { text: "Two", sources: ["https://b"] },
      ],
    });
    const b = factSheetSchema.parse({
      subject: "X",
      warnings: [
        { text: "Two", sources: ["https://c"] },
        { text: "One", sources: ["https://d"] },
      ],
    });
    expect(factsHash(a)).toBe(factsHash(b));
  });

  it("changes when a fact changes", () => {
    const a = factSheetSchema.parse({ subject: "X", tasting_price_eur: { min: 20, max: 40 } });
    const b = factSheetSchema.parse({ subject: "X", tasting_price_eur: { min: 25, max: 40 } });
    expect(factsHash(a)).not.toBe(factsHash(b));
  });
});

describe("extractJsonBlock", () => {
  it("reads the last fenced json block", () => {
    expect(extractJsonBlock('Notes\n```json\n{"a":1}\n```\nmore\n```json\n{"a":2}\n```')).toEqual({
      a: 2,
    });
  });

  it("accepts bare JSON", () => {
    expect(extractJsonBlock(' {"a":3} ')).toEqual({ a: 3 });
  });
});
