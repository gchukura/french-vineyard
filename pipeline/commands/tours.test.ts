import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { SheetStore } from "../sheet";
import { toursImport, toursQueue } from "./tours";

const TOURS = [
  "id",
  "provider",
  "provider_id",
  "provider_url",
  "region_slug",
  "category",
  "title",
  "status",
];
const HEADERS: Record<string, string[]> = {
  Tours: TOURS,
  Tours_Inbox: ["url", "added_at", "processed"],
  Articles: ["slug", "page_type", "region_slug"],
  Queue: [
    "id",
    "target",
    "slug",
    "page_type",
    "region_slug",
    "category",
    "target_keyword",
    "notes",
    "stage",
  ],
  Regions: ["slug", "name"],
};

/** A dry-run store whose tabs are filled in memory, so nothing reaches the Sheet. */
function ctxWith(tabs: Record<string, Record<string, string>[]>) {
  const store = new SheetStore(true);
  const cache = (store as unknown as { tabs: Map<string, unknown> }).tabs;
  for (const [tab, rows] of Object.entries(tabs)) {
    const headers = HEADERS[tab];
    cache.set(tab, {
      headers,
      exists: true,
      rows: rows.map((r) => ({ data: Object.fromEntries(headers.map((h) => [h, r[h] ?? ""])) })),
    });
  }
  const ctx = {
    store,
    today: "2026-10-26",
    now: () => "2026-10-26T12:00:00.000Z",
    log: () => {},
    args: { dryRun: true, max: 10 },
  } as unknown as Context;
  return { ctx, store };
}

describe("tours:import", () => {
  it("turns pasted product URLs into draft rows and marks them processed", async () => {
    const { ctx, store } = ctxWith({
      Tours: [{ id: "gyg-220971", provider: "gyg", provider_id: "220971", status: "published" }],
      Tours_Inbox: [
        {
          url: "https://www.viator.com/tours/Paris/Champagne-WineDay-Tour/d479-35428P1?pid=X",
        },
        {
          url: "https://www.getyourguide.com/reims-l365/from-reims-taittinger-champagne-morning-tour-tastings-t220971/",
        },
        { url: "https://www.getyourguide.com/reims-l365/" },
        { url: "https://www.winalist.com/experiences/688/initiation", processed: "TRUE" },
      ],
    });

    expect(await toursImport(ctx)).toBe(1);

    const tours = await store.rows("Tours");
    expect(tours).toHaveLength(2);
    expect(tours[1]).toMatchObject({
      id: "viator-35428p1",
      provider: "viator",
      provider_id: "35428P1",
      provider_url: "https://www.viator.com/tours/Paris/Champagne-WineDay-Tour/d479-35428P1",
      status: "draft",
      title: "",
    });

    const inbox = await store.rows("Tours_Inbox");
    expect(inbox.map((r) => [r.processed, r.note])).toEqual([
      ["TRUE", "Added to Tours as viator-35428p1 (draft)"],
      ["TRUE", "Already in Tours as gyg-220971"],
      ["", expect.stringContaining("location or listing page")],
      // Already processed rows are left alone.
      ["TRUE", ""],
    ]);
    expect(inbox[0].added_at).toBe("2026-10-26T12:00:00.000Z");
  });

  it("marks every copy of a link pasted twice", async () => {
    const url = "https://www.viator.com/tours/Paris/Champagne-WineDay-Tour/d479-35428P1";
    const { ctx, store } = ctxWith({ Tours: [], Tours_Inbox: [{ url }, { url }] });

    expect(await toursImport(ctx)).toBe(1);

    const inbox = await store.rows("Tours_Inbox");
    expect(inbox.map((r) => [r.processed, r.note])).toEqual([
      ["TRUE", "Added to Tours as viator-35428p1 (draft)"],
      ["TRUE", "Already in Tours as viator-35428p1"],
    ]);
  });
});

describe("tours:queue", () => {
  const tour = (n: number, category: string, status = "published") => ({
    id: `t${n}`,
    region_slug: "champagne",
    category,
    status,
  });

  it("queues one ranked list per region + category with 3+ published tours", async () => {
    const { ctx, store } = ctxWith({
      Tours: [
        tour(1, "Cellar tours"),
        tour(2, "Cellar tours"),
        tour(3, "Cellar tours"),
        tour(4, "Day trips from Paris"),
        tour(5, "Day trips from Paris"),
        tour(6, "Day trips from Paris", "draft"),
      ],
      Articles: [],
      Queue: [],
      Regions: [{ slug: "champagne", name: "Champagne" }],
    });

    expect(await toursQueue(ctx)).toBe(1);
    expect(await store.rows("Queue")).toEqual([
      {
        id: "q-best-champagne-cellar-tours",
        target: "articles",
        slug: "best-champagne-cellar-tours",
        page_type: "ranked_list",
        region_slug: "champagne",
        category: "Cellar tours",
        target_keyword: "best champagne cellar tours",
        notes:
          "Ranked list of the owner's 3 published \"Cellar tours\" tours in Champagne, in the owner's rank order.",
        stage: "queued",
      },
    ]);

    // A second run finds the Queue row and adds nothing.
    expect(await toursQueue(ctx)).toBe(0);
  });
});
