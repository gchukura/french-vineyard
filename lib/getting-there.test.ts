import { describe, expect, it } from "vitest";

import { gettingThereGroups, travelRows } from "@/lib/getting-there";
import { articleSchema, regionSchema, type Article, type Region } from "@/lib/sheet-schema";

const region = (slug: string, name: string, extra: Record<string, string> = {}): Region =>
  regionSchema.parse({ slug, name, status: "published", ...extra });

const article = (slug: string, extra: Record<string, string> = {}): Article =>
  articleSchema.parse({
    slug,
    page_type: "practical",
    title: slug,
    status: "published",
    cluster: "getting-there",
    ...extra,
  });

const regions = [
  region("champagne", "Champagne", {
    tgv_from_paris: "45 min (Paris Est to Reims)",
    airport: "Paris-Charles de Gaulle (CDG)",
  }),
  region("bordeaux", "Bordeaux", { airport: "Bordeaux-Mérignac (BOD)" }),
  region("burgundy", "Burgundy"),
];

describe("gettingThereGroups", () => {
  it("groups tagged practical articles by region, in the Regions tab's order", () => {
    const groups = gettingThereGroups(regions, [
      article("paris-to-bordeaux-by-train", { region_slug: "bordeaux" }),
      article("paris-to-reims-by-train", { region_slug: "champagne" }),
      article("cdg-airport-to-champagne", { region_slug: "champagne", cluster: " Getting-There " }),
    ]);
    expect(groups.map((g) => [g.region?.slug, g.articles.map((a) => a.slug)])).toEqual([
      ["champagne", ["paris-to-reims-by-train", "cdg-airport-to-champagne"]],
      ["bordeaux", ["paris-to-bordeaux-by-train"]],
    ]);
  });

  it("leaves out untagged and non-practical articles, and keeps region-less ones last", () => {
    const groups = gettingThereGroups(regions, [
      article("booking-champagne-house-visits", { region_slug: "champagne", cluster: "" }),
      article("reims-or-epernay", { region_slug: "champagne", page_type: "guide" }),
      article("france-by-train"),
      article("paris-to-reims-by-train", { region_slug: "champagne" }),
    ]);
    expect(groups.map((g) => [g.region?.slug, g.articles.map((a) => a.slug)])).toEqual([
      ["champagne", ["paris-to-reims-by-train"]],
      [undefined, ["france-by-train"]],
    ]);
    expect(gettingThereGroups(regions, [])).toEqual([]);
  });
});

describe("travelRows", () => {
  it("lists regions with a train or airport fact, with a dash for the missing one", () => {
    expect(travelRows(regions)).toEqual([
      ["Champagne", "45 min (Paris Est to Reims)", "Paris-Charles de Gaulle (CDG)"],
      ["Bordeaux", "—", "Bordeaux-Mérignac (BOD)"],
    ]);
  });
});
