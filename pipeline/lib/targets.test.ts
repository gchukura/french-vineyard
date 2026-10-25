import { describe, expect, it } from "vitest";

import type { Draft } from "./checks";
import { factSheetSchema } from "./facts";
import { queueSchema } from "./queue";
import {
  contentPatch,
  embedsCards,
  hasUpdatedAt,
  MIN_FACTS,
  refreshMonths,
  researchGate,
  TARGET_TAB,
  templateName,
} from "./targets";

const draft: Draft = {
  title: "T",
  standfirst: "S.",
  meta_description: "M",
  body_mdx: "## The wine\n\nBody.",
  faq: [{ question: "Q?", answer: "A." }],
  tour_ids: ["t1"],
  hotel_ids: ["h1", "h2"],
};

describe("targets", () => {
  it("accepts every target on a Queue row", () => {
    for (const target of ["articles", "towns", "regions", "subregions"]) {
      expect(queueSchema.parse({ id: "q", target, slug: "x" }).target).toBe(target);
    }
    expect(queueSchema.safeParse({ id: "q", target: "hotels", slug: "x" }).success).toBe(false);
  });

  it("maps targets to tabs, templates and refresh periods", () => {
    expect(TARGET_TAB.subregions).toBe("SubRegions");
    expect(templateName("regions", undefined)).toBe("region");
    expect(templateName("subregions", undefined)).toBe("subregion");
    expect(refreshMonths({ target: "regions" })).toBe(12);
    expect(refreshMonths({ target: "articles" })).toBe(6);
    expect(embedsCards("articles")).toBe(true);
    expect(embedsCards("subregions")).toBe(false);
    expect(hasUpdatedAt("subregions")).toBe(false);
  });

  it("fills each tab's own columns", () => {
    expect(contentPatch("regions", draft, "2026-10-25")).toEqual({
      tagline: "S.",
      intro_mdx: "## The wine\n\nBody.",
      updated_at: "2026-10-25",
    });
    expect(contentPatch("subregions", draft, "2026-10-25")).toEqual({
      intro_mdx: "S.\n\n## The wine\n\nBody.",
    });
    expect(contentPatch("towns", draft, "2026-10-25")).toMatchObject({ intro_mdx: "S." });
    expect(contentPatch("articles", draft, "2026-10-25", "Article")).toMatchObject({
      hotel_ids: "h1, h2",
      schema_type: "Article",
    });
  });
});

describe("researchGate", () => {
  const facts = (n: number, paris: boolean) =>
    factSheetSchema.parse({
      subject: "X",
      from_paris: paris
        ? [{ mode: "train", route: "Paris to X", duration_minutes: 60, sources: ["https://a"] }]
        : [],
      other_facts: Array.from({ length: n - (paris ? 1 : 0) }, (_, i) => ({
        claim: `Fact ${i}`,
        sources: ["https://a"],
      })),
    });

  it(`stops sheets with fewer than ${MIN_FACTS} facts`, () => {
    expect(researchGate(facts(MIN_FACTS - 1, true), { target: "towns" })).toMatch(/at least 12/);
    expect(researchGate(facts(MIN_FACTS, true), { target: "towns" })).toBeUndefined();
  });

  it("needs a Paris route on town pages and guides only", () => {
    const noParis = facts(15, false);
    expect(researchGate(noParis, { target: "towns" })).toMatch(/Paris/);
    expect(researchGate(noParis, { target: "articles", page_type: "guide" })).toMatch(/Paris/);
    expect(researchGate(noParis, { target: "articles", page_type: "practical" })).toBeUndefined();
    expect(researchGate(noParis, { target: "regions" })).toBeUndefined();
  });
});
