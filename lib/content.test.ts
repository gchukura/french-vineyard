import { describe, expect, it } from "vitest";

import {
  PLACEHOLDER,
  byRank,
  centroid,
  durationBucket,
  excerpt,
  extractHeadings,
  groupBy,
  hotelsByTier,
  latestDate,
  paramsOrPlaceholder,
  parseDurationHours,
  parseMonths,
  pickByIds,
  plainText,
  priceBucket,
  splitDays,
  stripRank,
} from "@/lib/content";
import { configJson, configText, faqSchema, toConfig } from "@/lib/config";

describe("byRank", () => {
  it("orders by owner rank, unranked last, ties by title", () => {
    const tours = [
      { title: "C", rank: undefined },
      { title: "B", rank: 2 },
      { title: "A", rank: 2 },
      { title: "D", rank: 1 },
    ];
    expect(byRank(tours).map((t) => t.title)).toEqual(["D", "A", "B", "C"]);
  });
});

describe("pickByIds", () => {
  it("keeps the listed order and drops unknown ids", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pickByIds(rows, ["c", " a", "zzz"]).map((r) => r.id)).toEqual(["c", "a"]);
  });
});

describe("groupBy and hotelsByTier", () => {
  it("groups in first-seen order", () => {
    expect(groupBy(["x1", "y1", "x2"], (s) => s[0] as "x" | "y")).toEqual([
      ["x", ["x1", "x2"]],
      ["y", ["y1"]],
    ]);
  });

  it("orders tiers budget, mid, luxury and skips empty ones", () => {
    const hotels = [{ tier: "luxury" as const }, { tier: "budget" as const }];
    expect(hotelsByTier(hotels).map(([t]) => t)).toEqual(["budget", "luxury"]);
  });
});

describe("parseDurationHours", () => {
  it.each([
    ["4 hours", 4],
    ["90 minutes", 1.5],
    ["2h30", 2.5],
    ["1 hour 30 minutes", 1.5],
    ["3–4 hours", 3],
    ["Half day", 4],
    ["Full-day", 8],
    ["2 days", 48],
  ])("%s -> %d", (text, hours) => {
    expect(parseDurationHours(text)).toBe(hours);
  });

  it("returns undefined for unknown text", () => {
    expect(parseDurationHours("flexible")).toBeUndefined();
    expect(parseDurationHours(undefined)).toBeUndefined();
  });

  it("buckets durations and prices", () => {
    expect(durationBucket("90 minutes")).toBe("short");
    expect(durationBucket("4 hours")).toBe("half");
    expect(durationBucket("Full day")).toBe("full");
    expect(priceBucket(35)).toBe("under-50");
    expect(priceBucket(100)).toBe("50-100");
    expect(priceBucket(145)).toBe("over-100");
    expect(priceBucket(undefined)).toBeUndefined();
  });
});

describe("parseMonths", () => {
  it("reads names, abbreviations and ranges, wrapping the year", () => {
    expect([...parseMonths(["may", "June", "sept"])].sort((a, b) => a - b)).toEqual([4, 5, 8]);
    expect([...parseMonths(["may-september"])].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]);
    expect([...parseMonths(["nov–feb"])].sort((a, b) => a - b)).toEqual([0, 1, 10, 11]);
    expect(parseMonths(["whenever"]).size).toBe(0);
  });
});

describe("config", () => {
  const config = toConfig([
    { key: "about_mdx", value: "Hello", status: "published" },
    { key: "home_faq_json", value: '[{"question":"Q","answer":"A"}]', status: "published" },
    { key: "broken_json", value: "[{", status: "published" },
  ]);

  it("reads text and validated JSON with fallbacks", () => {
    expect(configText(config, "about_mdx")).toBe("Hello");
    expect(configText(config, "missing")).toBeUndefined();
    expect(configJson(config, "home_faq_json", faqSchema, [])).toEqual([
      { question: "Q", answer: "A" },
    ]);
    expect(configJson(config, "broken_json", faqSchema, [])).toEqual([]);
    expect(configJson(config, "about_mdx", faqSchema, [])).toEqual([]);
  });
});

describe("dates and geometry", () => {
  it("finds the latest ISO date", () => {
    expect(latestDate(["2026-01-02", undefined, "2026-10-24 09:00", "soon"])).toBe("2026-10-24");
    expect(latestDate([undefined])).toBeUndefined();
  });

  it("averages points that have coordinates", () => {
    expect(centroid([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, {}])).toEqual({ lat: 2, lng: 3 });
    expect(centroid([{}])).toBeUndefined();
  });
});

describe("MDX text", () => {
  it("strips markdown and components", () => {
    expect(plainText("## A [link](/x/) and **bold** <Callout>hi</Callout>")).toBe(
      "A link and bold hi",
    );
  });

  it("cuts excerpts on a word boundary", () => {
    expect(excerpt("one two three four", 12)).toBe("one two…");
    expect(excerpt("short")).toBe("short");
    expect(excerpt(undefined)).toBeUndefined();
  });

  it("extracts headings outside code fences", () => {
    const md = "## 1. Moët\ntext\n```\n## not this\n```\n### sub\n## 2) [Ruinart](/x/)";
    expect(extractHeadings(md)).toEqual(["1. Moët", "2) Ruinart"]);
    expect(extractHeadings(md).map(stripRank)).toEqual(["Moët", "Ruinart"]);
  });

  it("splits itinerary days", () => {
    const md = "Intro line\n\n## Day 1: Reims\nCellars.\n## Day 2 – Épernay\nAvenue.";
    expect(splitDays(md)).toEqual({
      intro: "Intro line",
      days: [
        { title: "Day 1: Reims", body: "Cellars." },
        { title: "Day 2 – Épernay", body: "Avenue." },
      ],
    });
  });
});

describe("paramsOrPlaceholder", () => {
  it("returns real params, or one placeholder when empty", () => {
    expect(paramsOrPlaceholder("slug", ["a", "b"])).toEqual([{ slug: "a" }, { slug: "b" }]);
    expect(paramsOrPlaceholder("slug", [])).toEqual([{ slug: PLACEHOLDER }]);
  });
});
