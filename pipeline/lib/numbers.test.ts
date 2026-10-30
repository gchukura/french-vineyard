import { describe, expect, it } from "vitest";

import { allowedNumbers, normalizeNumber, numbersIn, unmatchedNumbers } from "./numbers";

describe("normalizeNumber", () => {
  it("handles thousands separators, decimal commas and trailing zeros", () => {
    expect(normalizeNumber("1,204")).toBe("1204");
    expect(normalizeNumber("4,5")).toBe("4.5");
    expect(normalizeNumber("30.0")).toBe("30");
  });
});

describe("numbersIn", () => {
  it("finds standalone numbers but not identifiers like A4", () => {
    expect(numbersIn("The A4 takes 100 minutes; tastings cost €20–35, rated 4.8.")).toEqual([
      "100",
      "20",
      "35",
      "4.8",
    ]);
  });
});

describe("allowedNumbers", () => {
  it("collects numbers from values and strings, skipping URLs", () => {
    const allowed = allowedNumbers({
      price: 25,
      note: "Closed 25 December to 2 January",
      url: "https://x.fr/page/9999",
    });
    expect([...allowed].sort()).toEqual(["2", "25"]);
  });

  it("adds hours and minutes for durations in minutes", () => {
    const allowed = allowedNumbers({ duration_minutes: 75 });
    expect(allowed.has("1")).toBe(true);
    expect(allowed.has("15")).toBe(true);
    expect(allowed.has("1.3")).toBe(true);
  });

  it("allows whole-euro roundings of prices, but not of ratings", () => {
    // Sheet rows hold numbers as strings.
    const allowed = allowedNumbers({
      price_from_eur: "87.19",
      tasting_fee_eur: 12.5,
      rating: "4.5",
    });
    expect(allowed.has("87.19")).toBe(true);
    expect(allowed.has("87")).toBe(true);
    expect(allowed.has("13")).toBe(true);
    expect(allowed.has("4.5")).toBe(true);
    expect(allowed.has("5")).toBe(false);
    expect(allowed.has("88")).toBe(false);
  });
});

describe("unmatchedNumbers", () => {
  const allowed = allowedNumbers({ fee: 25, duration_minutes: 75, rating: 4.8 });

  it("passes sourced numbers and USD conversions at the rate", () => {
    const text = "Tastings cost €25 ($27). The train takes 1 hour 15 minutes. Rated 4.8.";
    expect(unmatchedNumbers(text, allowed, { usdRate: 1.08 })).toEqual([]);
  });

  it("flags numbers not in the data, and USD amounts that don't convert", () => {
    const found = unmatchedNumbers("Founded in 1843, entry is €25 ($40).", allowed, {
      usdRate: 1.08,
    });
    expect(found.map((f) => f.number)).toEqual(["$40", "1843"]);
  });

  it("ignores ranked headings, Day labels, ids and link targets", () => {
    const text = [
      "## 3. Tour title",
      "## Day 2: Côte de Nuits",
      '<TourCards ids="t-99" />',
      "[Reims](/towns/reims-51/)",
    ].join("\n");
    expect(unmatchedNumbers(text, allowed, { usdRate: 1.08 })).toEqual([]);
  });
});
