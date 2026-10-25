import { describe, expect, it } from "vitest";

import { parseArgs } from "./args";
import { runChecks, type CheckInput } from "./checks";
import { allowedNumbers } from "./numbers";
import { afterCheck, MAX_REDRAFTS } from "./queue";
import { parseTemplate } from "./template";

const template = parseTemplate("x", "---\ntarget: articles\nwords: 1-500\n---\nBody");

function rules(body: string) {
  const input: CheckInput = {
    draft: { body_mdx: body, faq: [], tour_ids: [], hotel_ids: [] },
    template,
    bannedPhrases: [],
    allowedNumbers: allowedNumbers({ min: 15, max: 65 }),
    usdRate: 1.08,
    tours: [],
    publishedTourIds: new Set(),
    hotelIds: new Set(),
  };
  return runChecks(input).findings.map((f) => f.rule);
}

describe("euro ranges", () => {
  it.each(["Tastings cost €15 to €65 ($16–70).", "Tastings cost €15–65 ($16–70)."])(
    "accepts %j",
    (body) => {
      expect(rules(body)).toEqual([]);
    },
  );

  it("still fails a range without its conversion", () => {
    expect(rules("Tastings cost €15 to €65.")).toContain("style");
  });
});

describe("redrafts", () => {
  it(`allows ${MAX_REDRAFTS} redrafts before needs_review`, () => {
    expect(MAX_REDRAFTS).toBe(2);
    expect(afterCheck(false, MAX_REDRAFTS - 1).redraft).toBe(true);
    expect(afterCheck(false, MAX_REDRAFTS).stage).toBe("needs_review");
  });

  it("parses --no-redraft for grading hand-written drafts", () => {
    expect(parseArgs(["check", "--no-redraft", "--only", "r-champagne"])).toMatchObject({
      command: "check",
      noRedraft: true,
      only: ["r-champagne"],
    });
  });
});
