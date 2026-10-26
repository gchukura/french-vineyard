import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isWithdrawn, runChecks, type CheckInput, type Finding } from "./checks";
import { allowedNumbers } from "./numbers";
import { parseTemplate } from "./template";

const template = parseTemplate("x", "---\ntarget: articles\nwords: 1-500\n---\nBody");

function rules(body: string, faq: { question: string; answer: string }[] = []) {
  const input: CheckInput = {
    draft: { body_mdx: body, faq, tour_ids: [], hotel_ids: [] },
    template,
    bannedPhrases: [],
    allowedNumbers: allowedNumbers({}),
    usdRate: 1.08,
    tours: [],
    publishedTourIds: new Set(),
    hotelIds: new Set(),
  };
  return runChecks(input).findings.map((f) => f.rule);
}

describe("first person in FAQ questions", () => {
  it("lets a question use I but not an answer", () => {
    expect(
      rules("Book ahead.", [{ question: "Do I need to book?", answer: "Yes, book ahead." }]),
    ).toEqual([]);
    expect(
      rules("Book ahead.", [{ question: "Do you need to book?", answer: "I always book ahead." }]),
    ).toContain("no_first_person_reviews");
  });
});

describe("american_english", () => {
  it.each([
    ["You need a taxi or a hire car.", "hire car"],
    ["Leave the car in the car park.", "car park"],
    ["Take the A4 motorway.", "motorway"],
    ["It is in the town centre.", "centre"],
    ["The tower is 66 metres high.", "metres"],
    ["Closed on bank holidays.", "bank holidays"],
    ["Travelling by train is easy.", "Travelling"],
  ])("flags %j", (body, quote) => {
    const input = rules(body);
    expect(input).toContain("american_english");
    expect(body).toContain(quote);
  });

  it.each([
    "Closed on public holidays.",
    "Rent a car in Bordeaux.",
    "The Centre Pompidou is in Paris.",
    "Traveling by train is easy.",
  ])("passes %j", (body) => {
    expect(rules(body)).not.toContain("american_english");
  });
});

describe("isWithdrawn, wider", () => {
  const f = (fix: string): Finding => ({ rule: "x", severity: "error", quote: "q", fix });

  it.each([
    "This is not a number problem; see check_lines. Otherwise numbers are sourced, so no change here.",
    "Keep the range; this is sourced.",
  ])("treats %j as withdrawn", (fix) => {
    expect(isWithdrawn(f(fix))).toBe(true);
  });
});

describe("town template", () => {
  it("allows short village pages down to 450 words", () => {
    const t = parseTemplate(
      "town",
      readFileSync(new URL("../../content/templates/town.md", import.meta.url), "utf8"),
    );
    expect(t.words).toEqual({ min: 450, max: 1200 });
  });
});
