import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  bannedPhraseHits,
  parseBannedPhrases,
  phraseRegex,
  runChecks,
  type CheckInput,
  type Draft,
} from "./checks";
import { allowedNumbers } from "./numbers";
import { parseTemplate } from "./template";

const banned = parseBannedPhrases(
  readFileSync(new URL("../../content/banned-phrases.txt", import.meta.url), "utf8"),
);

describe("banned phrases", () => {
  it("has the required phrases plus at least 40 more", () => {
    for (const p of ["hidden gem", "nestled", "delve", "tapestry", "whether you're ... or ..."]) {
      expect(banned).toContain(p);
    }
    expect(banned.length).toBeGreaterThanOrEqual(48);
  });

  it("matches on word boundaries, case-insensitively", () => {
    expect(phraseRegex("delve").test("Let's Delve in")).toBe(true);
    expect(phraseRegex("delve").test("delved")).toBe(false);
    expect(phraseRegex("must-see").test("a must-see cellar")).toBe(true);
  });

  it('treats "..." as a short gap and accepts curly apostrophes', () => {
    const hits = bannedPhraseHits("Whether you’re a beginner or an expert, come.", banned);
    expect(hits.map((h) => h.phrase)).toEqual(["whether you're ... or ..."]);
  });
});

const guide = parseTemplate(
  "practical",
  `---
target: articles
words: 5-200
required_headings: The short answer | Before you go
required_components: PracticalTable
---
Body`,
);

const ranked = parseTemplate(
  "ranked_list",
  `---
target: articles
words: 5-400
required_headings:
required_components: PracticalTable | MethodologyBox
h2_per_tour: true
---
Body`,
);

const baseDraft: Draft = {
  title: "Paris to Reims by train",
  standfirst: "How to get there.",
  meta_description: "Trains take 46 minutes.",
  body_mdx: [
    "Trains are quick.",
    "## The short answer",
    "The train takes 46 minutes and costs from €25 ($27).",
    '<PracticalTable caption="Options" columns="Option|Time" rows="Train|46 min" />',
    "## Before you go",
    "Book ahead in summer.",
  ].join("\n\n"),
  faq: [{ question: "How long is the train?", answer: "About 46 minutes." }],
  tour_ids: [],
  hotel_ids: [],
};

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    draft: baseDraft,
    template: guide,
    bannedPhrases: banned,
    allowedNumbers: allowedNumbers({ minutes: 46, fee: 25 }),
    usdRate: 1.08,
    tours: [],
    publishedTourIds: new Set(["t1", "t2"]),
    hotelIds: new Set(["h1"]),
    ...overrides,
  };
}

const rules = (i: CheckInput) => runChecks(i).findings.map((f) => f.rule);

describe("runChecks", () => {
  it("passes a clean draft", () => {
    expect(runChecks(input()).findings).toEqual([]);
  });

  it("flags unsourced numbers, banned phrases and missing headings", () => {
    const draft = {
      ...baseDraft,
      body_mdx: "Nestled in vines since 1843.\n\n## The short answer\n\nYes.",
    };
    expect(rules(input({ draft }))).toEqual(
      expect.arrayContaining([
        "numbers_sourced",
        "no_banned_phrases",
        "required_headings",
        "required_components",
      ]),
    );
  });

  it("flags word counts outside the template range", () => {
    const template = { ...guide, words: { min: 500, max: 900 } };
    expect(rules(input({ template }))).toContain("word_count");
  });

  it("flags unknown or uncurated tour ids and unknown hotel ids", () => {
    const draft = {
      ...baseDraft,
      body_mdx: `${baseDraft.body_mdx}\n\n<TourCards ids="t1, t9" />\n\n<HotelCards ids="h2" />`,
    };
    const findings = runChecks(input({ draft })).findings.filter((f) => f.rule === "cards_valid");
    expect(findings.map((f) => f.quote)).toEqual(["t9", "t1", "h2"]);
  });

  it("flags first-person reviews but allows we inside the MethodologyBox", () => {
    const ok = {
      ...baseDraft,
      body_mdx: `${baseDraft.body_mdx}\n\n<MethodologyBox title="How we ranked these">We rank by fit.</MethodologyBox>`,
    };
    expect(rules(input({ draft: ok }))).not.toContain("no_first_person_reviews");
    const bad = { ...baseDraft, body_mdx: `${baseDraft.body_mdx}\n\nI loved our visit.` };
    expect(rules(input({ draft: bad }))).toContain("no_first_person_reviews");
  });

  it("does not read US$ as first person", () => {
    const draft = { ...baseDraft, body_mdx: baseDraft.body_mdx.replace("($27)", "(US$27)") };
    expect(rules(input({ draft }))).not.toContain("no_first_person_reviews");
  });

  it("flags wine-selling language and raw provider links", () => {
    const draft = {
      ...baseDraft,
      body_mdx: `${baseDraft.body_mdx}\n\nStock up on bottles and ship them home. See https://www.getyourguide.com/x.`,
    };
    expect(rules(input({ draft }))).toEqual(
      expect.arrayContaining(["no_alcohol_selling", "cards_valid"]),
    );
  });

  it("flags euro amounts without a USD conversion", () => {
    const draft = {
      ...baseDraft,
      body_mdx: `${baseDraft.body_mdx}\n\nAdmission is €25, or €25–25 ($27–27) for groups.`,
    };
    const style = runChecks(input({ draft })).findings.filter((f) => f.rule === "style");
    expect(style.map((f) => f.quote)).toEqual(["€25,"]);
  });

  it("flags Markdown tables and more tables than the template allows", () => {
    const draft = {
      ...baseDraft,
      body_mdx: `${baseDraft.body_mdx}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |`,
    };
    expect(rules(input({ draft }))).toContain("style");
  });

  it("requires one H2 per curated tour in rank order on ranked lists", () => {
    const tours = [
      { id: "t1", title: "Reims cellars" },
      { id: "t2", title: "Montagne by bike" },
    ];
    const body = (h: string[]) =>
      [
        "Intro.",
        '<PracticalTable caption="c" columns="Tour|From" rows="a|b" />',
        '<MethodologyBox title="How we ranked these">Fit first.</MethodologyBox>',
        ...h,
        '<TourCards ids="t1" />',
      ].join("\n\n");
    const good = {
      ...baseDraft,
      body_mdx: body(["## 1. Reims cellars", "## 2. Montagne by bike"]),
    };
    expect(rules(input({ draft: good, template: ranked, tours }))).toEqual([]);
    const swapped = {
      ...baseDraft,
      body_mdx: body(["## 1. Montagne by bike", "## 2. Reims cellars"]),
    };
    expect(rules(input({ draft: swapped, template: ranked, tours }))).toContain(
      "required_headings",
    );
  });
});
