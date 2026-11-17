import { describe, expect, it } from "vitest";

import {
  aggregateByQuery,
  gscWindow,
  metricCells,
  normalizeQuery,
  planQueryWrites,
  scopeFromPath,
  type GscApiRow,
  type QueryStats,
} from "./gsc";

const row = (
  query: string,
  page: string,
  impressions: number,
  clicks: number,
  position: number,
): GscApiRow => ({
  keys: [query, `https://frenchvineyard.com${page}`],
  impressions,
  clicks,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

const TOWNS = new Map([["reims", "champagne"]]);

describe("gscWindow", () => {
  it("ends three days before today and spans 28 days", () => {
    expect(gscWindow("2026-11-17")).toEqual({ startDate: "2026-10-18", endDate: "2026-11-14" });
  });

  it("crosses month and year boundaries", () => {
    expect(gscWindow("2027-01-02", 7, 3)).toEqual({
      startDate: "2026-12-24",
      endDate: "2026-12-30",
    });
  });
});

describe("normalizeQuery", () => {
  it("lowercases, trims and collapses spaces", () => {
    expect(normalizeQuery("  Reims   Champagne Tours ")).toBe("reims champagne tours");
  });
});

describe("aggregateByQuery", () => {
  it("sums across pages, weights position by impressions and picks the top page", () => {
    const stats = aggregateByQuery([
      row("Reims tours", "/towns/reims/", 30, 3, 4),
      row("reims tours", "/tours/champagne/", 10, 1, 8),
      row("beaune", "/towns/beaune/", 50, 0, 12),
    ]);
    expect(stats).toEqual([
      { query: "beaune", topPage: "/towns/beaune/", impressions: 50, clicks: 0, position: 12 },
      { query: "reims tours", topPage: "/towns/reims/", impressions: 40, clicks: 4, position: 5 },
    ]);
  });

  it("skips rows without a query", () => {
    expect(
      aggregateByQuery([{ keys: [""], impressions: 1, clicks: 0, ctr: 0, position: 1 }]),
    ).toEqual([]);
  });
});

describe("metricCells", () => {
  it("formats CTR as a percentage and position to one decimal", () => {
    expect(
      metricCells({ query: "q", topPage: "/a/", impressions: 300, clicks: 7, position: 4.04 }),
    ).toEqual({
      top_page: "/a/",
      impressions: "300",
      clicks: "7",
      ctr_pct: "2.3",
      position: "4.0",
    });
  });

  it("zeroes a query Search Console no longer reports", () => {
    expect(metricCells(undefined)).toEqual({
      top_page: "",
      impressions: "0",
      clicks: "0",
      ctr_pct: "",
      position: "",
    });
  });
});

describe("scopeFromPath", () => {
  it("reads the town and its region", () => {
    expect(scopeFromPath("/towns/reims/", TOWNS)).toEqual({
      town_slug: "reims",
      region_slug: "champagne",
    });
  });

  it("reads the region from region and tour pages", () => {
    expect(scopeFromPath("/regions/burgundy/cote-de-nuits/", TOWNS)).toEqual({
      region_slug: "burgundy",
      town_slug: "",
    });
    expect(scopeFromPath("/tours/bordeaux/", TOWNS).region_slug).toBe("bordeaux");
  });

  it("leaves other pages unscoped", () => {
    expect(scopeFromPath("/best-champagne-tours/", TOWNS)).toEqual({
      region_slug: "",
      town_slug: "",
    });
  });
});

describe("planQueryWrites", () => {
  const stats: QueryStats[] = [
    { query: "reims tours", topPage: "/towns/reims/", impressions: 40, clicks: 4, position: 5 },
    { query: "beaune", topPage: "/regions/burgundy/", impressions: 20, clicks: 0, position: 12 },
    { query: "rare query", topPage: "/", impressions: 2, clicks: 0, position: 30 },
  ];
  const opts = { max: 10, today: "2026-11-17", townRegions: TOWNS };

  it("refreshes existing rows by normalized query and never touches the owner's columns", () => {
    const existing = [
      { query: "Reims Tours", region_slug: "x", notes: "mine", volume: "900", impressions: "" },
    ];
    const plan = planQueryWrites(existing, stats, opts);
    expect(plan.updates).toEqual([
      {
        index: 0,
        query: "reims tours",
        values: {
          top_page: "/towns/reims/",
          impressions: "40",
          clicks: "4",
          ctr_pct: "10.0",
          position: "5.0",
          gsc_updated: "2026-11-17",
        },
      },
    ]);
    for (const key of ["region_slug", "notes", "volume", "query"])
      expect(plan.updates[0].values).not.toHaveProperty(key);
    expect(plan.appends.map((a) => a.query)).toEqual(["beaune"]);
  });

  it("skips unchanged rows", () => {
    const existing = [{ query: "reims tours", ...metricCells(stats[0]) }];
    expect(planQueryWrites(existing, stats, opts).updates).toEqual([]);
  });

  it("zeroes rows that dropped out, and leaves never-seen manual rows alone", () => {
    const existing = [
      { query: "old query", ...metricCells(stats[1]) },
      { query: "planned keyword", impressions: "" },
    ];
    const plan = planQueryWrites(existing, [], opts);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ index: 0, values: { impressions: "0", clicks: "0" } });
  });

  it("appends new queries over the threshold with their scope, up to max", () => {
    const plan = planQueryWrites([], stats, { ...opts, max: 1 });
    expect(plan.appends).toEqual([
      {
        query: "reims tours",
        region_slug: "champagne",
        town_slug: "reims",
        source: "gsc",
        top_page: "/towns/reims/",
        impressions: "40",
        clicks: "4",
        ctr_pct: "10.0",
        position: "5.0",
        gsc_updated: "2026-11-17",
      },
    ]);
    expect(plan.skipped).toBe(1);
  });

  it("only the first of duplicate rows carries the figures", () => {
    const plan = planQueryWrites([{ query: "beaune" }, { query: "Beaune" }], stats, opts);
    expect(plan.updates.map((u) => u.index)).toEqual([0]);
    expect(plan.appends.map((a) => a.query)).toEqual(["reims tours"]);
  });
});
