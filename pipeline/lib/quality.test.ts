import { describe, expect, it } from "vitest";

import { MAX_CHECK_LINES, runChecks, type CheckInput } from "./checks";
import { allowedNumbers } from "./numbers";
import { researchMessages, researchRetryHint, type Target } from "./prompt";
import { queueSchema } from "./queue";
import { orderForPublish, waitsForRegion } from "./targets";
import { parseTemplate } from "./template";

const template = parseTemplate("x", "---\ntarget: articles\nwords: 1-800\n---\nBody");

function rules(body: string, faq: { question: string; answer: string }[] = []) {
  const input: CheckInput = {
    draft: { body_mdx: body, faq, tour_ids: [], hotel_ids: [] },
    template,
    bannedPhrases: [],
    allowedNumbers: allowedNumbers({ n: [1, 2, 3, 2026, 10, 18] }),
    usdRate: 1.08,
    tours: [],
    publishedTourIds: new Set(),
    hotelIds: new Set(),
  };
  return runChecks(input).findings.map((f) => f.rule);
}

describe("no_meta_language: research-note phrasing", () => {
  it.each([
    "One source says the shuttle must be booked ahead.",
    "Château Margaux reportedly takes cellar visits on weekdays.",
    "According to the tourist office, most houses open daily.",
    "Champagne Guy de Chassey also lists a tasting on the Reims Tourisme page for the lighthouse.",
    "The 2026 listing shows daily opening from April.",
    "Maison Champy is described as the oldest wine house in Burgundy.",
    "Several sources give different times for the train.",
    "The estate's website says visits last an hour.",
  ])("fails %j", (sentence) => {
    expect(rules(sentence)).toContain("no_meta_language");
  });

  it.each([
    "A label that names a Grand Cru village is pointing to the source of the grapes.",
    "The Marne is the main source of the valley's mists.",
    "The tourist office lists ten wineries open to visitors.",
    "Champagne Guy de Chassey runs a tasting visit in Verzenay.",
    "The village was listed by UNESCO in 1999.",
  ])("passes %j", (sentence) => {
    expect(rules(sentence)).not.toContain("no_meta_language");
  });
});

describe("check_lines", () => {
  const line = (i: number) => `Ask the estate about fees for visit ${i}.`;

  it(`allows ${MAX_CHECK_LINES} and fails more, counting the FAQ`, () => {
    expect(rules([line(1), line(2)].join(" "))).not.toContain("check_lines");
    expect(
      rules([line(1), line(2)].join(" "), [
        { question: "Fees?", answer: "Check with the tourist office before you go." },
      ]),
    ).toContain("check_lines");
  });

  it("ignores table cells", () => {
    const table =
      '<PracticalTable caption="c" columns="Estate|Fee" rows="A|Ask the estate; B|Ask the estate; C|Ask the estate" />';
    expect(rules(`${line(1)}\n\n${table}`)).not.toContain("check_lines");
  });

  it("matches the common phrasings", () => {
    const body = [
      "Contact the growers before you set out.",
      "Confirm with the château when you book.",
      "Check opening hours before you go.",
    ].join(" ");
    expect(rules(body)).toContain("check_lines");
  });
});

describe("no_trivia", () => {
  it.each([
    "Épernay lies on the RN 3, which links Paris to Strasbourg.",
    "The town has a population of 22,174.",
    "Sézanne is the seat of its canton.",
  ])("fails %j", (sentence) => {
    expect(rules(sentence)).toContain("no_trivia");
  });

  it("passes a driving direction", () => {
    expect(rules("From Margaux, take the D2 north to Pauillac.")).not.toContain("no_trivia");
  });
});

describe("research retry hint", () => {
  it("is appended to the research message only on a retry", () => {
    const target: Target = {
      row: queueSchema.parse({ id: "q", target: "subregions", slug: "cote-des-bar" }),
      name: "Côte des Bar",
      known: {},
    };
    const hint = researchRetryHint("Research kept 10 sourced facts; at least 12 are needed.");
    expect(researchMessages(target)[0].content).not.toContain("first research attempt");
    const retry = researchMessages(target, hint)[0].content;
    expect(retry).toContain("Research kept 10 sourced facts");
    expect(retry).toMatch(/tourist office's pages that list estates/);
  });
});

describe("publish order", () => {
  it("holds wine areas and towns for their region, and publishes regions first", () => {
    expect(waitsForRegion("subregions")).toBe(true);
    expect(waitsForRegion("towns")).toBe(true);
    expect(waitsForRegion("articles")).toBe(false);
    expect(waitsForRegion("regions")).toBe(false);
    const rows = [
      { id: "s", target: "subregions" as const },
      { id: "a", target: "articles" as const },
      { id: "r", target: "regions" as const },
      { id: "t", target: "towns" as const },
    ];
    expect(orderForPublish(rows).map((r) => r.id)).toEqual(["r", "s", "a", "t"]);
  });
});
