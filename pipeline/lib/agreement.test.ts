import { describe, expect, it } from "vitest";

import { agreedFindings, quotesOverlap, runChecks, type CheckInput, type Finding } from "./checks";
import { allowedNumbers } from "./numbers";
import { parseTemplate } from "./template";

const template = parseTemplate("x", "---\ntarget: articles\nwords: 1-500\n---\nBody");

function rules(body: string) {
  const input: CheckInput = {
    draft: { body_mdx: body, faq: [], tour_ids: [], hotel_ids: [] },
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

describe("first person with accented words", () => {
  it.each([
    "Le Cassissium makes crème de cassis.",
    "The même tasting runs daily.",
    "Trains run to Rome.",
    "Ask at the Maison des Vignerons.",
  ])("passes %j", (body) => {
    expect(rules(body)).not.toContain("no_first_person_reviews");
  });

  it.each(["Give me a call.", "My favorite cellar.", "We loved it.", "Join us there."])(
    "flags %j",
    (body) => {
      expect(rules(body)).toContain("no_first_person_reviews");
    },
  );
});

const finding = (
  rule: string,
  quote: string,
  severity: Finding["severity"] = "error",
): Finding => ({
  rule,
  severity,
  quote,
  fix: "Fix it.",
});

describe("quotesOverlap", () => {
  it("matches containment and shared words", () => {
    expect(quotesOverlap("Spit if you are driving.", "Spit if you are driving")).toBe(true);
    expect(
      quotesOverlap(
        "Joseph Perrier is open year-round, 7 days a week.",
        "Joseph Perrier is open year-round",
      ),
    ).toBe(true);
    expect(
      quotesOverlap("Château Climens is biodynamic.", "Château climens is biodynamic since 2010"),
    ).toBe(true);
  });

  it("does not match different sentences", () => {
    expect(quotesOverlap("Take the TER to Langon.", "Château Guiraud has 128 hectares.")).toBe(
      false,
    );
    expect(quotesOverlap("", "anything")).toBe(false);
  });
});

describe("agreedFindings", () => {
  it("blocks only on errors both passes report", () => {
    const a = [
      finding("facts_sourced", "Joseph Perrier is open year-round."),
      finding("no_trivia", "founded in 1825"),
    ];
    const b = [
      finding("facts_sourced", "Joseph Perrier is open year-round"),
      finding("style", "a sentence only pass b disliked"),
    ];
    const { agreed, single } = agreedFindings(a, b);
    expect(agreed.map((f) => f.rule)).toEqual(["facts_sourced"]);
    expect(single.map((f) => f.rule).sort()).toEqual(["no_trivia", "style"]);
    expect(single.every((f) => f.severity === "warning")).toBe(true);
    expect(single[0].fix).toMatch(/^\(Flagged by one of two checks\.\)/);
  });

  it("blocks only when both passes rate the shared finding an error", () => {
    const quote = "You do not need a car on arrival in Épernay.";
    const { agreed } = agreedFindings(
      [finding("facts_sourced", quote, "error")],
      [finding("facts_sourced", quote, "warning")],
    );
    expect(agreed).toHaveLength(1);
    expect(agreed[0].severity).toBe("warning");
    expect(agreed[0].fix).toMatch(/^\(Rated an error by at most one of two checks\.\)/);

    const both = agreedFindings(
      [finding("facts_sourced", quote, "error")],
      [finding("facts_sourced", quote, "error")],
    );
    expect(both.agreed[0].severity).toBe("error");
  });

  it("needs the same rule, and pairs each finding once", () => {
    const a = [
      finding("facts_sourced", "Spit if you are driving."),
      finding("facts_sourced", "Spit if you are driving."),
    ];
    const b = [
      finding("no_trivia", "Spit if you are driving."),
      finding("facts_sourced", "Spit if you are driving."),
    ];
    const { agreed, single } = agreedFindings(a, b);
    expect(agreed).toHaveLength(1);
    expect(single).toHaveLength(2);
  });
});
