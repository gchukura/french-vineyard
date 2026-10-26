import { describe, expect, it } from "vitest";

import type { ImageTarget } from "../lib/images";
import { SheetStore } from "../sheet";
import { detach, isAccountLimit, named, reviewedPicks, shareParent, type Choice } from "./images";

describe("reviewedPicks", () => {
  const pick = (tab: ImageTarget["tab"], slug: string, outcome: Choice["outcome"]) =>
    ({
      target: { tab, slug, name: slug, path: `/${slug}/`, parents: [] },
      outcome,
      candidates: 8,
      ...(outcome === "picked" ? { chosen: { sourceUrl: `https://src/${slug}` } } : {}),
    }) as Choice;
  const picks = [
    pick("SubRegions", "chablis", "picked"),
    pick("Towns", "chablis", "picked"),
    pick("Articles", "a", "picked"),
    pick("Articles", "b", "parent"),
  ];

  it("keeps only the named picks, telling apart rows that share a slug", () => {
    expect([...reviewedPicks(picks, ["SubRegions/chablis", "Articles/a"]).keys()]).toEqual([
      "SubRegions/chablis",
      "Articles/a",
    ]);
  });

  it("refuses a name with no reviewed pick, including pages that kept sharing", () => {
    expect(() => reviewedPicks(picks, ["Articles/a", "Articles/b"])).toThrow(/Articles\/b/);
    expect(() => reviewedPicks(picks, ["Articles/typo"])).toThrow(/typo/);
  });
});

describe("isAccountLimit", () => {
  it("recognizes a used-up spend limit or credit balance, not other errors", () => {
    const limit = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."}}',
    );
    expect(isAccountLimit(limit)).toBe(true);
    expect(isAccountLimit(new Error("Your credit balance is too low to access the API"))).toBe(
      true,
    );
    expect(isAccountLimit(new Error("429 rate_limit_error"))).toBe(false);
    expect(isAccountLimit(undefined)).toBe(false);
  });
});

describe("named", () => {
  it("matches --only by slug or by Tab/slug", () => {
    const area = { tab: "SubRegions" as const, slug: "chablis" };
    const town = { tab: "Towns" as const, slug: "chablis" };
    expect(named(["chablis"], area) && named(["chablis"], town)).toBe(true);
    expect(named(["SubRegions/chablis"], area)).toBe(true);
    expect(named(["SubRegions/chablis"], town)).toBe(false);
    expect(named(undefined, town)).toBe(false);
  });
});

const HERO = [
  "slug",
  "status",
  "hero_image",
  "hero_credit",
  "hero_license",
  "hero_source_url",
  "hero_is_ai",
];
const IMAGES = ["url", "alt", "credit", "license", "source_url", "is_ai", "used_on"];

/** A dry-run store whose tabs are filled in memory, so nothing reaches the Sheet. */
function storeWith(tabs: Record<string, Record<string, string>[]>) {
  const store = new SheetStore(true);
  const cache = (store as unknown as { tabs: Map<string, unknown> }).tabs;
  for (const [tab, rows] of Object.entries(tabs)) {
    const headers = tab === "Images" ? IMAGES : HERO;
    cache.set(tab, {
      headers,
      exists: true,
      rows: rows.map((r) => ({ data: Object.fromEntries(headers.map((h) => [h, r[h] ?? ""])) })),
    });
  }
  return store;
}

const troyes: ImageTarget = {
  tab: "Towns",
  slug: "troyes",
  name: "Troyes",
  path: "/towns/troyes/",
  parents: [
    { tab: "SubRegions", slug: "cote-des-bar" },
    { tab: "Regions", slug: "champagne" },
  ],
};

describe("shareParent", () => {
  it("takes the nearest published parent with a hero and adds the page to its Images line", async () => {
    const store = storeWith({
      Towns: [{ slug: "troyes", status: "published" }],
      // The wine area has no hero yet, so the region's is used.
      SubRegions: [{ slug: "cote-des-bar", status: "published" }],
      Regions: [
        {
          slug: "champagne",
          status: "published",
          hero_image: "https://blob/champagne.webp",
          hero_credit: "FrDr / Wikimedia Commons",
          hero_license: "CC BY-SA 4.0",
          hero_source_url: "https://commons/c",
          hero_is_ai: "FALSE",
        },
      ],
      Images: [{ url: "https://blob/champagne.webp", used_on: "/regions/champagne/" }],
    });

    expect(await shareParent({ store }, troyes)).toEqual({
      parent: { tab: "Regions", slug: "champagne" },
      heroUrl: "https://blob/champagne.webp",
    });
    expect((await store.rows("Towns"))[0]).toMatchObject({
      hero_image: "https://blob/champagne.webp",
      hero_credit: "FrDr / Wikimedia Commons",
      hero_license: "CC BY-SA 4.0",
      hero_source_url: "https://commons/c",
      hero_is_ai: "FALSE",
    });
    expect((await store.rows("Images"))[0].used_on).toBe("/regions/champagne/, /towns/troyes/");
  });

  it("skips unpublished parents and returns nothing when no parent has a hero", async () => {
    const store = storeWith({
      Towns: [{ slug: "troyes", status: "published" }],
      SubRegions: [{ slug: "cote-des-bar", status: "draft", hero_image: "https://blob/bar.webp" }],
      Regions: [{ slug: "champagne", status: "published" }],
      Images: [],
    });
    expect(await shareParent({ store }, troyes)).toBeUndefined();
    expect((await store.rows("Towns"))[0].hero_image).toBe("");
  });
});

describe("detach", () => {
  const shared = () =>
    storeWith({
      Towns: [{ slug: "troyes", status: "published", hero_image: "https://blob/champagne.webp" }],
      Images: [
        { url: "https://blob/champagne.webp", used_on: "/regions/champagne/, /towns/troyes/" },
      ],
    });

  it("takes a redone page off the Images line of the hero it had", async () => {
    const store = shared();
    await detach({ store }, troyes, "https://blob/troyes.webp");
    expect((await store.rows("Images"))[0].used_on).toBe("/regions/champagne/");
  });

  it("leaves the line alone when the hero doesn't change", async () => {
    const store = shared();
    await detach({ store }, troyes, "https://blob/champagne.webp");
    expect((await store.rows("Images"))[0].used_on).toBe("/regions/champagne/, /towns/troyes/");
    expect(store.writes).toEqual([]);
  });
});
