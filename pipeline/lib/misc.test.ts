import { describe, expect, it } from "vitest";

import { hotelSchema, tourSchema } from "@/lib/sheet-schema";

import { parseArgs } from "./args";
import { Budget, BudgetExceeded, costUsd, usageEntry } from "./cost";
import { addMonths, isDue } from "./dates";
import { componentIds, mdxToText, tableCount, wordCount } from "./mdx";
import { sharedDraftSystem, templateSystem, type ContentFiles } from "./prompt";
import { afterCheck, appendUsage, queueSchema, refreshMonths } from "./queue";
import { selectHotels, selectTours } from "./selection";
import { parseTemplate } from "./template";

const tour = (o: Record<string, unknown>) =>
  tourSchema.parse({
    provider: "gyg",
    provider_id: "1",
    region_slug: "champagne",
    status: "published",
    ...o,
  });

describe("selectTours", () => {
  const tours = [
    tour({ id: "c", title: "C", rank: 3, town_slug: "reims", category: "Cellars" }),
    tour({ id: "a", title: "A", rank: 1, town_slug: "reims", category: "cellars" }),
    tour({
      id: "d",
      title: "D",
      rank: 2,
      town_slug: "reims",
      category: "cellars",
      status: "draft",
    }),
    tour({ id: "b", title: "B", rank: 2, town_slug: "epernay", category: "cellars" }),
    tour({ id: "e", title: "E", region_slug: "bordeaux" }),
  ];

  it("keeps published rows matching region, town and category, in rank order", () => {
    expect(
      selectTours(tours, { region: "champagne", town: "reims", category: "CELLARS" }).map(
        (t) => t.id,
      ),
    ).toEqual(["a", "c"]);
  });

  it("matches every town when the page has none", () => {
    expect(selectTours(tours, { region: "champagne" }).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

describe("selectHotels", () => {
  const hotel = (id: string, town_slug: string, tier: string) =>
    hotelSchema.parse({ id, name: id, town_slug, tier });
  const hotels = [
    hotel("lux", "reims", "luxury"),
    hotel("bud", "reims", "budget"),
    hotel("far", "beaune", "mid"),
  ];
  const towns = [
    { slug: "reims", region_slug: "champagne" },
    { slug: "beaune", region_slug: "burgundy" },
  ];

  it("filters by town, else region, budget first", () => {
    expect(selectHotels(hotels, towns, { region: "champagne" }).map((h) => h.id)).toEqual([
      "bud",
      "lux",
    ]);
    expect(
      selectHotels(hotels, towns, { region: "burgundy", town: "beaune" }).map((h) => h.id),
    ).toEqual(["far"]);
    expect(selectHotels(hotels, towns, {})).toEqual([]);
  });
});

describe("cost", () => {
  it("prices tokens, cache and searches; batches at half price", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      server_tool_use: { web_search_requests: 10 },
    };
    expect(costUsd("claude-sonnet-5-5", usage)).toBeCloseTo(2 + 1 + 0.2 + 0.1);
    expect(
      costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 }, { batch: true }),
    ).toBeCloseTo(1);
    expect(() => costUsd("claude-unknown", usage)).toThrow(/PRICES/);
    expect(usageEntry("draft", "claude-haiku-5-5", usage, "t")).toMatchObject({
      in: 1_000_000,
      searches: 10,
    });
  });

  it("stops before a call would cross the cap", () => {
    const b = new Budget(1);
    b.charge(0.8);
    expect(() => b.reserve(0.3)).toThrow(BudgetExceeded);
    expect(() => b.reserve(0.1)).not.toThrow();
    expect(b.room(0.1)).toBe(2);
  });
});

describe("dates", () => {
  it("adds months and clamps to the month's end", () => {
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2026-10-25", 12)).toBe("2027-10-25");
  });

  it("is due on or after the date, never when blank", () => {
    expect(isDue("2026-10-25", "2026-10-25")).toBe(true);
    expect(isDue("2026-10-26", "2026-10-25")).toBe(false);
    expect(isDue(undefined, "2026-10-25")).toBe(false);
  });
});

describe("queue", () => {
  it("parses a row with defaults", () => {
    const row = queueSchema.parse({ id: "q1", target: "Towns", slug: "epernay", stage: "" });
    expect(row).toMatchObject({ target: "towns", stage: "queued", attempts: 0, cost_usd: 0 });
    expect(queueSchema.safeParse({ id: "q1", target: "towns", slug: "Épernay" }).success).toBe(
      false,
    );
  });

  it("redrafts twice, then sends to review", () => {
    expect(afterCheck(true, 0)).toEqual({ stage: "checked", attempts: 0, redraft: false });
    expect(afterCheck(false, 0)).toEqual({ stage: "drafted", attempts: 1, redraft: true });
    expect(afterCheck(false, 1)).toEqual({ stage: "drafted", attempts: 2, redraft: true });
    expect(afterCheck(false, 2)).toEqual({ stage: "needs_review", attempts: 3, redraft: false });
  });

  it("refreshes guides at 6 months and towns at 12", () => {
    expect(refreshMonths({ target: "articles" })).toBe(6);
    expect(refreshMonths({ target: "towns" })).toBe(12);
  });

  it("keeps the last 40 usage entries and survives a corrupt cell", () => {
    const e = usageEntry("draft", "claude-haiku-5-5", { input_tokens: 1, output_tokens: 1 }, "t");
    const many = appendUsage(undefined, Array(45).fill(e));
    expect(JSON.parse(many)).toHaveLength(40);
    expect(JSON.parse(appendUsage("not json", [e]))).toHaveLength(1);
  });
});

describe("mdx", () => {
  const body = [
    "Intro with [a link](/towns/reims/).",
    '<TourCards ids="t1, t2" />',
    '<TourCards ids="t2,t3" />',
    '<PracticalTable caption="Getting there" columns="Option|Time" rows="Train|46 min; Car|2h" />',
    '<Callout title="Tip">Book ahead.</Callout>',
  ].join("\n\n");

  it("lists component ids in order without duplicates", () => {
    expect(componentIds(body, "TourCards")).toEqual(["t1", "t2", "t3"]);
  });

  it("keeps table cells and callout titles as text, drops card tags", () => {
    const text = mdxToText(body);
    expect(text).toContain("Train 46 min");
    expect(text).toContain("Tip");
    expect(text).not.toContain("TourCards");
    expect(wordCount('One two, three.\n\n<TourCards ids="x" />')).toBe(3);
  });

  it("counts component and Markdown tables", () => {
    expect(tableCount(body)).toBe(1);
    expect(tableCount("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(1);
  });
});

describe("prompt caching", () => {
  const files: ContentFiles = {
    research: "r",
    draft: "Draft rules",
    redraft: "{{findings}} {{previous_draft}}",
    check: "c",
    styleGuide: "Style",
    bannedPhrases: ["delve"],
    selectionRules: "Rules",
    researchBlocklist: [],
  };

  it("builds the shared system block identically for every row, marked for caching", () => {
    expect(sharedDraftSystem(files)).toEqual(sharedDraftSystem(files));
    expect(sharedDraftSystem(files).cache_control).toEqual({ type: "ephemeral" });
  });

  it("adds selection rules to the ranked-list template block only", () => {
    const t = (h2: boolean) =>
      parseTemplate("x", `---\ntarget: articles\nwords: 1-2\nh2_per_tour: ${h2}\n---\nBody`);
    expect(templateSystem(t(true), files).text).toContain("Rules");
    expect(templateSystem(t(false), files).text).not.toContain("Rules");
  });
});

describe("parseArgs", () => {
  it("reads the command, positional n and flags", () => {
    expect(parseArgs(["research", "5", "--dry-run", "--queue-file", "q.json"])).toMatchObject({
      command: "research",
      max: 5,
      dryRun: true,
      queueFile: "q.json",
    });
    expect(parseArgs(["run", "--max", "30", "--only", "a, b", "--budget", "2.5"])).toMatchObject({
      max: 30,
      only: ["a", "b"],
      budget: 2.5,
    });
  });

  it("rejects unknown commands and a queue file without --dry-run", () => {
    expect(() => parseArgs(["deploy"])).toThrow(/Usage/);
    expect(() => parseArgs(["run", "--queue-file", "q.json"])).toThrow(/dry-run/);
    expect(() => parseArgs(["run", "--max", "0"])).toThrow();
  });

  it("allows --redo only for images with named slugs", () => {
    expect(parseArgs(["images", "--redo", "--only", "reims,troyes"])).toMatchObject({
      redo: true,
      only: ["reims", "troyes"],
    });
    expect(() => parseArgs(["images", "--redo"])).toThrow(/--only/);
    expect(() => parseArgs(["run", "--redo", "--only", "a"])).toThrow(/images/);
    expect(parseArgs(["images", "--from", "p.json", "--only", "Towns/a"])).toMatchObject({
      from: "p.json",
      only: ["Towns/a"],
    });
    expect(() => parseArgs(["images", "--from", "p.json"])).toThrow(/--only/);
  });
});
