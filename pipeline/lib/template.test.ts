import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { articleSchema } from "@/lib/sheet-schema";

import { parseTemplate, templateName } from "./template";

const dir = new URL("../../content/templates/", import.meta.url);

describe("content/templates", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  it("has a template for every Articles page_type plus towns", () => {
    const pageTypes = ["guide", "ranked_list", "hotel_roundup", "itinerary", "practical"];
    for (const p of pageTypes) {
      expect(articleSchema.safeParse({ slug: "a", page_type: p, title: "T" }).success).toBe(true);
    }
    expect(files.map((f) => f.replace(/\.md$/, "")).sort()).toEqual([...pageTypes, "town"].sort());
  });

  it.each(files)("%s parses", (file) => {
    const t = parseTemplate(file.replace(/\.md$/, ""), readFileSync(new URL(file, dir), "utf8"));
    expect(t.words.min).toBeLessThan(t.words.max);
    expect(t.body.length).toBeGreaterThan(100);
  });
});

describe("parseTemplate", () => {
  it("reads lists split on |, defaults and flags", () => {
    const t = parseTemplate(
      "x",
      "---\ntarget: towns\nwords: 600-1200\nrequired_headings: Why visit | When to go, and why\nh2_per_tour: true\n---\nBody",
    );
    expect(t).toMatchObject({
      target: "towns",
      words: { min: 600, max: 1200 },
      requiredHeadings: ["Why visit", "When to go, and why"],
      requiredComponents: [],
      maxTables: 1,
      h2PerTour: true,
      body: "Body",
    });
  });

  it("rejects templates without frontmatter or a valid target", () => {
    expect(() => parseTemplate("x", "Body")).toThrow(/frontmatter/);
    expect(() => parseTemplate("x", "---\ntarget: regions\nwords: 1-2\n---\n")).toThrow(/target/);
  });
});

describe("templateName", () => {
  it("uses the town template for Towns rows", () => {
    expect(templateName("towns", undefined)).toBe("town");
    expect(templateName("articles", "guide")).toBe("guide");
    expect(() => templateName("articles", undefined)).toThrow();
  });
});
