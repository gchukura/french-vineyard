import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isBlocked, withoutBlocked } from "./blocklist";
import { parseBannedPhrases, runChecks, type CheckInput } from "./checks";
import { factSheetSchema } from "./facts";
import { allowedNumbers } from "./numbers";
import { factsForWriter } from "./prompt";
import { parseTemplate } from "./template";

const template = parseTemplate("x", "---\ntarget: articles\nwords: 1-500\n---\nBody");

function findings(body: string, allowed: Record<string, unknown> = {}) {
  const input: CheckInput = {
    draft: { body_mdx: body, faq: [], tour_ids: [], hotel_ids: [] },
    template,
    bannedPhrases: [],
    allowedNumbers: allowedNumbers(allowed),
    usdRate: 1.08,
    tours: [],
    publishedTourIds: new Set(),
    hotelIds: new Set(),
  };
  return runChecks(input).findings;
}
const rules = (body: string, allowed?: Record<string, unknown>) =>
  findings(body, allowed).map((f) => f.rule);

describe("no_meta_language", () => {
  it.each([
    "The distance from the station was not sourced, so check a map.",
    "Visit terms are unconfirmed.",
    "The fact sheet gives no opening months.",
    "The sources for this page give no TGV time.",
    "No walking distance from the station was found.",
    "Hours after the auction were not confirmed.",
    "According to our research, it opens daily.",
  ])("fails %j", (sentence) => {
    expect(rules(sentence)).toContain("no_meta_language");
  });

  it.each([
    "Ask the estate about fees when you book.",
    "The tourist office lists ten wineries and can confirm opening hours.",
    "Book ahead; walk-ins are not always possible.",
  ])("passes %j", (sentence) => {
    expect(rules(sentence)).not.toContain("no_meta_language");
  });
});

describe("twelve_hour_times", () => {
  it("fails 24-hour and French-style times", () => {
    const f = findings("Open 9:00–12:30 and 14h30 to 19:30.", { hours: "9:00-12:30, 14:30-19:30" });
    expect(f.filter((x) => x.rule === "twelve_hour_times").map((x) => x.quote)).toEqual([
      "9:00",
      "12:30",
      "19:30",
      "14h30",
    ]);
  });

  it("passes 12-hour times and short durations like 1h30", () => {
    const body = "Open 9 a.m. to 12:30 p.m., then 2:30 p.m. to 7:30 p.m. The tour takes 1h30.";
    expect(rules(body, { hours: "9:00-12:30, 14:30-19:30", minutes: 90 })).toEqual([]);
  });
});

describe("allowedNumbers with clock times", () => {
  it("allows the 12-hour form of times in the data", () => {
    const allowed = allowedNumbers({ hours: "14:00 to 17:30", other: "9.30am" });
    for (const n of ["2", "5", "30", "9"]) expect(allowed.has(n)).toBe(true);
  });
});

describe("research blocklist", () => {
  const list = parseBannedPhrases(
    readFileSync(new URL("../../content/research-blocklist.txt", import.meta.url), "utf8"),
  );

  it("includes the named aggregators and fits the API's 64-domain limit", () => {
    for (const d of ["rome2rio.com", "tripadvisor.com", "wanderlog.com"]) expect(list).toContain(d);
    expect(list.length).toBeLessThanOrEqual(64);
  });

  it("blocks domains and their subdomains only", () => {
    expect(isBlocked("https://www.rome2rio.com/s/Paris/Beaune", list)).toBe(true);
    expect(isBlocked("https://fr.tripadvisor.com/x", list)).toBe(true);
    expect(isBlocked("https://notrome2rio.com/", list)).toBe(false);
    expect(isBlocked("https://www.beaune-tourism.com/", list)).toBe(false);
  });

  it("drops blocked URLs from what research saw", () => {
    const seen = new Map([
      ["https://www.rome2rio.com/a", "R2R"],
      ["https://www.sncf-connect.com/b", "SNCF"],
    ]);
    expect([...withoutBlocked(seen, list).keys()]).toEqual(["https://www.sncf-connect.com/b"]);
  });
});

describe("factsForWriter", () => {
  it("removes every sources field but keeps the facts", () => {
    const facts = {
      ...factSheetSchema.parse({
        subject: "X",
        warnings: [{ text: "Book ahead.", sources: ["https://a"] }],
      }),
      sources: [{ url: "https://a" }],
    };
    const out = JSON.stringify(factsForWriter(facts));
    expect(out).toContain("Book ahead.");
    expect(out).not.toContain("sources");
    expect(out).not.toContain("https://a");
  });
});
