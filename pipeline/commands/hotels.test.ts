import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { SheetStore } from "../sheet";
import { HOTEL_COLUMNS, hotelsEnrich, hotelsImport, hotelsQueue } from "./hotels";

const HEADERS: Record<string, string[]> = {
  Hotels: [
    "id",
    "name",
    "town_slug",
    "tier",
    "booking_hotel_id",
    "expedia_id",
    "lat",
    "lng",
    "price_from_eur",
    "blurb",
    "best_for",
    "image",
    "image_credit",
  ],
  Hotels_Inbox: ["url", "added_at", "processed"],
  Towns: ["slug", "name", "region_slug", "status"],
  Regions: ["slug", "name", "status"],
  Articles: ["slug", "page_type"],
  Queue: [
    "id",
    "target",
    "slug",
    "page_type",
    "region_slug",
    "town_slug",
    "target_keyword",
    "notes",
    "stage",
  ],
};

const towns = [
  {
    slug: "epernay",
    name: "Épernay",
    region_slug: "champagne",
    status: "published",
    lat: 49.0403,
    lng: 3.9559,
  },
  {
    slug: "reims",
    name: "Reims",
    region_slug: "champagne",
    status: "published",
    lat: 49.2583,
    lng: 4.0317,
  },
];

/** A dry-run store filled in memory and a Claude stub that answers with `reply` and "saw" `seen`. */
function ctxWith(
  tabs: Record<string, Record<string, string>[]>,
  research?: { reply: unknown; seen: string[] },
) {
  const store = new SheetStore(true);
  const cache = (store as unknown as { tabs: Map<string, unknown> }).tabs;
  for (const [tab, rows] of Object.entries(tabs)) {
    // Hotels rows with a status are from after hotels:import added its columns.
    const imported = tab === "Hotels" && rows.some((r) => "status" in r);
    const headers = imported ? [...HEADERS.Hotels, ...HOTEL_COLUMNS] : HEADERS[tab];
    cache.set(tab, {
      headers,
      exists: true,
      rows: rows.map((r) => ({ data: Object.fromEntries(headers.map((h) => [h, r[h] ?? ""])) })),
    });
  }
  const call = vi.fn(async () => ({
    message: {
      content: [{ type: "text", text: "```json\n" + JSON.stringify(research?.reply) + "\n```" }],
    },
    turns: [
      {
        content: [
          {
            type: "web_search_tool_result",
            content: (research?.seen ?? []).map((url) => ({ url, title: "" })),
          },
        ],
      },
    ],
    usd: 0.05,
  }));
  const ctx = {
    store,
    today: "2026-10-29",
    now: () => "2026-10-29T12:00:00.000Z",
    log: () => {},
    args: { dryRun: true, max: 10 },
    config: { model: "claude-sonnet-5-5", usdRate: 1.08, siteUrl: "https://example.test" },
    files: {
      styleGuide: "",
      bannedPhrases: ["hidden gem"],
      researchBlocklist: ["booking.com", "expedia.com"],
    },
    budget: { spent: 0 },
    claude: { call },
    siteRows: async () => ({
      towns,
      regions: [{ slug: "champagne", name: "Champagne", status: "published" }],
    }),
  } as unknown as Context;
  return { ctx, store, call };
}

describe("hotels:import", () => {
  it("turns pasted hotel pages into draft rows and refuses a city page", async () => {
    const { ctx, store } = ctxWith({
      Hotels: [
        { id: "booking-les-berceaux", name: "Les Berceaux", booking_hotel_id: "fr/les-berceaux" },
      ],
      Hotels_Inbox: [
        { url: "https://www.booking.com/hotel/fr/royal-champagne.en-gb.html?aid=1" },
        {
          url: "https://www.expedia.co.uk/Epernay-Hotels-BB-Hotel-Epernay.h71589144.Hotel-Information",
        },
        { url: "https://www.booking.com/city/fr/epernay.html" },
        { url: "https://booking.com/hotel/fr/les-berceaux.html" },
      ],
    });
    expect(await hotelsImport(ctx)).toBe(2);
    const hotels = await store.rows("Hotels");
    expect(hotels.slice(1)).toEqual([
      expect.objectContaining({
        id: "booking-royal-champagne",
        name: "Royal Champagne",
        booking_hotel_id: "fr/royal-champagne",
        listing_url: "https://www.booking.com/hotel/fr/royal-champagne.html",
        status: "draft",
      }),
      expect.objectContaining({
        id: "expedia-71589144",
        name: "BB Hotel Epernay",
        expedia_id: "71589144",
        status: "draft",
      }),
    ]);
    expect((await store.rows("Hotels_Inbox")).map((r) => [r.processed, r.note])).toEqual([
      ["TRUE", "Added to Hotels as booking-royal-champagne (draft)"],
      ["TRUE", "Added to Hotels as expedia-71589144 (draft)"],
      ["", expect.stringContaining("city, region or search page")],
      ["TRUE", "Already in Hotels as booking-les-berceaux"],
    ]);
  });
});

describe("hotels:enrich", () => {
  beforeEach(() => {
    // Nominatim: a point in Épernay.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([{ lat: "49.0441", lon: "3.9590" }])),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const draft = {
    id: "booking-x",
    // As hotels:import names it from the link; the hotel's own spelling replaces it.
    name: "X",
    booking_hotel_id: "fr/x",
    listing_url: "https://www.booking.com/hotel/fr/x.html",
    status: "draft",
  };
  const reply = {
    name: "Hôtel X Épernay",
    town: "Epernay",
    address: "12 Avenue de Champagne, 51200 Épernay",
    stars: 4,
    palace: false,
    official_url: "https://hotelx.example/",
    best_for: "Couples walking the Avenue de Champagne",
    blurb: "A townhouse hotel on the Avenue de Champagne, a few minutes on foot from the station.",
    sources: [
      { url: "https://hotelx.example/", quote: "Hôtel X, 4-star hotel on the Avenue de Champagne" },
    ],
  };

  it("publishes a hotel in a known town with a sourced classification", async () => {
    const { ctx, store, call } = ctxWith(
      { Hotels: [draft] },
      { reply, seen: ["https://hotelx.example/"] },
    );
    expect(await hotelsEnrich(ctx)).toBe(1);
    expect(call).toHaveBeenCalledOnce();
    expect((await store.rows("Hotels"))[0]).toMatchObject({
      name: "Hôtel X Épernay",
      town_slug: "epernay",
      tier: "mid",
      stars: "4",
      address: "12 Avenue de Champagne, 51200 Épernay",
      lat: "49.0441",
      lng: "3.959",
      best_for: "Couples walking the Avenue de Champagne",
      status: "published",
      notes_flag: "",
    });
  });

  it("holds a hotel whose star rating isn't in a source search returned", async () => {
    const { ctx, store } = ctxWith({ Hotels: [draft] }, { reply, seen: [] });
    expect(await hotelsEnrich(ctx)).toBe(0);
    const row = (await store.rows("Hotels"))[0];
    expect(row.status).toBe("draft");
    expect(row.notes_flag).toBe(
      "auto: held as draft: no official star rating in a quoted source, so no tier",
    );
  });

  it("keeps what research found when it leaves the name or copy null, and holds the hotel", async () => {
    // As for Hôtel de la Poste in Beaune: no best_for or blurb, everything else found.
    const { ctx, store } = ctxWith(
      { Hotels: [draft] },
      {
        reply: { ...reply, name: null, best_for: null, blurb: null },
        seen: ["https://hotelx.example/"],
      },
    );
    expect(await hotelsEnrich(ctx)).toBe(0);
    const row = (await store.rows("Hotels"))[0];
    expect(row).toMatchObject({
      name: "X",
      town_slug: "epernay",
      tier: "mid",
      stars: "4",
      address: "12 Avenue de Champagne, 51200 Épernay",
      best_for: "",
      blurb: "",
      status: "draft",
    });
    expect(row.notes_flag).toMatch(/^auto: held as draft: copy: .*Write best_for/);
  });
});

describe("hotels:queue", () => {
  it("queues a where-to-stay page for a town with three published hotels", async () => {
    const hotel = (id: string, status = "published") => ({ id, town_slug: "reims", status });
    const { ctx, store } = ctxWith({
      Hotels: [hotel("a"), hotel("b"), hotel("c"), hotel("d", "draft")],
      Towns: towns.map(({ slug, name, region_slug, status }) => ({
        slug,
        name,
        region_slug,
        status,
      })),
      Regions: [{ slug: "champagne", name: "Champagne", status: "published" }],
      Articles: [],
      Queue: [],
    });
    expect(await hotelsQueue(ctx)).toBe(1);
    expect(await store.rows("Queue")).toEqual([
      {
        id: "q-where-to-stay-in-reims",
        target: "articles",
        slug: "where-to-stay-in-reims",
        page_type: "hotel_roundup",
        region_slug: "champagne",
        town_slug: "reims",
        target_keyword: "where to stay in reims",
        notes: "Where to stay in Reims: the owner's 3 published hotels.",
        stage: "queued",
      },
    ]);
  });
});
