import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { SheetStore } from "../sheet";
import { toursEnrich } from "./tours-enrich";

const HEADERS = [
  "id",
  "provider",
  "provider_id",
  "provider_url",
  "region_slug",
  "town_slug",
  "category",
  "rank",
  "badge",
  "title",
  "price_from_eur",
  "duration",
  "rating",
  "review_count",
  "bullets_json",
  "status",
  "last_checked",
  "link_flag",
  "notes_flag",
];

/** GetYourGuide Partner API replies, keyed by tour id, in the spec's shape. */
const TOURS: Record<string, Record<string, unknown>> = {
  "1001": {
    title: "From Reims: Morning Champagne Tour and Tastings",
    abstract: "Visit two family-run estates in a small group of up to 8 people.",
    highlights: ["Visit 2 family-run champagne houses", "Taste 6 champagnes"],
    overall_rating: 4.8,
    number_of_ratings: 560,
    price: { values: { amount: 125 } },
    durations: [{ duration: 4, unit: "hour" }],
    cond_language: ["en", "fr"],
    guide_type: "live_tour_guide",
    has_pick_up: false,
    cancellation_policy: { cancellable: true },
    locations: [{ name: "Reims", city: "Reims" }],
  },
  "1002": {
    title: "Reims City Center Champagne Tasting",
    abstract: "Taste three champagnes with a sommelier.",
    overall_rating: 4.4,
    number_of_ratings: 30,
    price: { values: { amount: 45 } },
    durations: [{ duration: 1, unit: "hour" }],
    cond_language: ["en"],
    guide_type: "live_tour_guide",
    cancellation_policy: { cancellable: true },
    locations: [{ name: "Reims", city: "Reims" }],
  },
};

function fakeFetch(url: string) {
  const m = /\/1\/tours\/(\d+)(\/options)?\?/.exec(url);
  const tour = m && TOURS[m[1]];
  if (!tour) return new Response("{}", { status: 404 });
  const body = m[2]
    ? { data: { tour_options: [{ meeting_point: "Place du Forum, Reims" }] } }
    : { data: { tours: [tour] } };
  return new Response(JSON.stringify(body), { status: 200 });
}

function ctxWith(rows: Record<string, string>[]) {
  const store = new SheetStore(true);
  (store as unknown as { tabs: Map<string, unknown> }).tabs.set("Tours", {
    headers: HEADERS,
    exists: true,
    rows: rows.map((r) => ({ data: Object.fromEntries(HEADERS.map((h) => [h, r[h] ?? ""])) })),
  });
  const ctx = {
    store,
    today: "2026-10-29",
    log: () => {},
    args: { dryRun: true, max: 10 },
    config: { siteUrl: "https://example.test" },
    siteRows: async () => ({
      towns: [{ slug: "reims", name: "Reims", region_slug: "champagne" }],
      regions: [{ slug: "champagne", name: "Champagne" }],
    }),
  } as unknown as Context;
  return { ctx, store };
}

const draft = (id: string, extra: Record<string, string> = {}) => ({
  id: `gyg-${id}`,
  provider: "gyg",
  provider_id: id,
  status: "draft",
  ...extra,
});

describe("tours:enrich", () => {
  beforeEach(() => {
    vi.stubEnv("GYG_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => fakeFetch(url)),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fills in and publishes a tour that meets the rules, and holds one that doesn't", async () => {
    const { ctx, store } = ctxWith([
      {
        id: "gyg-0",
        provider: "gyg",
        region_slug: "champagne",
        category: "Cellar tours",
        rank: "1",
        status: "published",
        title: "Owner's tour",
        price_from_eur: "200",
      },
      draft("1001"),
      draft("1002"),
    ]);

    expect(await toursEnrich(ctx)).toBe(1);
    const [, good, weak] = await store.rows("Tours");

    expect(good).toMatchObject({
      title: "From Reims: Morning Champagne Tour and Tastings",
      duration: "4 hours",
      price_from_eur: "125",
      rating: "4.8",
      review_count: "560",
      bullets_json: '["Visit 2 family-run champagne houses","Taste 6 champagnes"]',
      region_slug: "champagne",
      town_slug: "reims",
      category: "Cellar tours",
      rank: "2",
      status: "published",
      last_checked: "2026-10-29",
      notes_flag: "",
    });

    expect(weak).toMatchObject({
      title: "Reims City Center Champagne Tasting",
      status: "draft",
      rank: "",
    });
    expect(weak.notes_flag).toMatch(/^auto: held as draft: /);
    expect(weak.notes_flag).toContain("rating 4.4 is below 4.5");
    expect(weak.notes_flag).toContain("30 reviews; needs 50+");
  });

  it("keeps what the owner typed and leaves the owner's own drafts alone", async () => {
    const { ctx, store } = ctxWith([
      draft("1001", {
        title: "My own title",
        category: "Vineyard tours",
        region_slug: "champagne",
      }),
      draft("1001", {
        id: "gyg-held",
        notes_flag: "auto: held as draft: rating 4.4 is below 4.5",
        title: "Old",
      }),
    ]);
    // The first row has a title and no auto flag: it's the owner's draft and isn't touched.
    expect(await toursEnrich(ctx)).toBe(1);
    const [own, held] = await store.rows("Tours");
    expect(own).toMatchObject({ title: "My own title", status: "draft", last_checked: "" });
    expect(held).toMatchObject({
      id: "gyg-held",
      title: "Old",
      category: "Cellar tours",
      status: "published",
    });
  });

  it("waits without a key, and flags a tour GetYourGuide doesn't know", async () => {
    vi.stubEnv("GYG_API_KEY", "");
    const waiting = ctxWith([draft("1001")]);
    expect(await toursEnrich(waiting.ctx)).toBe(0);
    expect((await waiting.store.rows("Tours"))[0].status).toBe("draft");

    vi.stubEnv("GYG_API_KEY", "test-key");
    const missing = ctxWith([draft("9999")]);
    expect(await toursEnrich(missing.ctx)).toBe(0);
    expect((await missing.store.rows("Tours"))[0].notes_flag).toBe(
      "auto: GetYourGuide has no tour 9999; check the link",
    );
  });
});
