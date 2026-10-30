import { sheetTag } from "@/lib/sheet-schema";

import type { Context } from "../context";
import {
  categoryFor,
  formatDuration,
  meetingPointFrom,
  nextRank,
  parseGygDetails,
  placeTour,
  selectionProblems,
  type Peer,
  type TourFacts,
} from "../lib/tour-details";
import {
  parseViatorProduct,
  parseWinalistPage,
  viatorDestinations,
  type ViatorDestination,
} from "../lib/tour-sources";
import { revalidate } from "./publish";

/** Marks notes_flag text written by tours:enrich; rows carrying it are checked again on the next run. */
export const AUTO = "auto:";
const MAX_BULLETS = 5;

/** The provider has no such tour: the row is flagged so the owner can check the link. */
export class TourNotFound extends Error {
  name = "TourNotFound";
}

/** A link that can't be filled in as it is (a Winalist estate page instead of one experience). */
class NeedsOwner extends Error {
  name = "NeedsOwner";
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  what: string,
): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new TourNotFound(`${what} not found`);
  if (!res.ok) throw new Error(`${what} answered HTTP ${res.status}`);
  return res.json();
}

/** GET from the GetYourGuide Partner API in English, prices in EUR. */
export const gygApi = (path: string, key: string) =>
  getJson(
    `https://api.getyourguide.com${path}?cnt_language=en&currency=EUR`,
    { "X-ACCESS-TOKEN": key, accept: "application/json" },
    `GetYourGuide API ${path}`,
  );

/** GET from Viator's Partner API v2 in English. */
export const viatorApi = (path: string, key: string) =>
  getJson(
    `https://api.viator.com/partner${path}`,
    { "exp-api-key": key, accept: "application/json;version=2.0", "accept-language": "en-US" },
    `Viator API ${path}`,
  );

const PAGE_UA =
  "FrenchVineyardBot/1.0 (+https://frenchvineyard.com/; reads the schema.org data of tours the site lists)";

type Source = {
  name: string;
  /** Why rows from this provider can't be filled in yet, or undefined when ready. */
  waitingFor: () => string | undefined;
  facts: (row: Record<string, string>) => Promise<TourFacts>;
};

/** The providers tours:enrich can read, each with what it needs before it can run. */
function sources(): Record<string, Source> {
  let destinations: Promise<Map<string, ViatorDestination>> | undefined;
  return {
    gyg: {
      name: "GetYourGuide",
      waitingFor: () => (process.env.GYG_API_KEY ? undefined : "GYG_API_KEY"),
      facts: async (row) => {
        const key = process.env.GYG_API_KEY!;
        const facts = parseGygDetails(await gygApi(`/1/tours/${row.provider_id}`, key));
        facts.meetingPoint = await gygApi(`/1/tours/${row.provider_id}/options`, key)
          .then(meetingPointFrom)
          .catch(() => undefined);
        return facts;
      },
    },
    viator: {
      name: "Viator",
      waitingFor: () => (process.env.VIATOR_API_KEY ? undefined : "VIATOR_API_KEY"),
      facts: async (row) => {
        const key = process.env.VIATOR_API_KEY!;
        // The destination list is the same for every product: fetch it once per run.
        destinations ??= viatorApi("/destinations", key).then(viatorDestinations);
        const code = encodeURIComponent(row.provider_id);
        const [product, schedule] = await Promise.all([
          viatorApi(`/products/${code}`, key),
          viatorApi(`/availability/schedules/${code}`, key),
        ]);
        return parseViatorProduct(product, schedule, await destinations);
      },
    },
    winalist: {
      name: "Winalist",
      waitingFor: () =>
        process.env.WINALIST_READ_PAGES === "1" ? undefined : "WINALIST_READ_PAGES=1",
      facts: async (row) => {
        if (!/^\d+$/.test(row.provider_id))
          throw new NeedsOwner(
            "this is a Winalist estate page; paste the link of one experience (…/experiences/<number>/…)",
          );
        // Experience links redirect to the estate's page, which carries the schema.org data.
        const res = await fetch(row.provider_url, {
          headers: { "user-agent": PAGE_UA, "accept-language": "en" },
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 404) throw new TourNotFound("Winalist page not found");
        if (!res.ok) throw new Error(`Winalist answered HTTP ${res.status}`);
        return parseWinalistPage(await res.text(), row.provider_id);
      },
    },
  };
}

const num = (v?: string) => (v?.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

const toPeer = (r: Record<string, string>): Peer => ({
  id: r.id,
  region_slug: r.region_slug || undefined,
  category: r.category || undefined,
  price_from_eur: num(r.price_from_eur),
  status: r.status?.trim().toLowerCase() ?? "",
  rank: num(r.rank),
});

/**
 * tours:enrich: fills in draft tours the owner imported (no title yet) and
 * drafts it held back before (notes_flag "auto: …"): from the GetYourGuide
 * Partner API (GYG_API_KEY), Viator's Partner API (VIATOR_API_KEY), or a
 * Winalist estate page's schema.org data (WINALIST_READ_PAGES=1). It fills
 * the title, duration, price, rating, review count and highlights; town and
 * region from the tour's locations; a category; and, when the tour meets
 * every rule in content/selection-rules.md, the next rank in its region and
 * category and status=published. Otherwise the row stays a draft with the
 * reasons in notes_flag and is checked again next run. Only empty fields are
 * filled: whatever the owner typed is kept.
 */
export async function toursEnrich(ctx: Context): Promise<number> {
  await ctx.store.ensureColumns("Tours", ["link_flag", "notes_flag"]);
  const isOurs = (r: Record<string, string>) =>
    r.status?.trim().toLowerCase() === "draft" &&
    (!r.title?.trim() || r.notes_flag?.startsWith(AUTO));
  const all = sources();
  const todo: { row: Record<string, string>; source: Source }[] = [];
  const waiting = new Map<string, number>();
  for (const row of (await ctx.store.rows("Tours")).filter(isOurs)) {
    const source = all[row.provider];
    const missing = source?.waitingFor();
    if (source && !missing) todo.push({ row, source });
    else {
      const what = source ? `${source.name} (needs ${missing})` : `provider "${row.provider}"`;
      waiting.set(what, (waiting.get(what) ?? 0) + 1);
    }
  }
  for (const [what, n] of waiting) ctx.log(`tours:enrich: ${n} draft(s) from ${what} wait`);
  if (!todo.length) return 0;

  const { towns, regions } = await ctx.siteRows();
  let published = 0;
  let wrote = false;

  // One at a time: each publish takes a price tier and a rank the next row must see.
  for (const { row, source } of todo) {
    try {
      const facts = await source.facts(row);
      const placed = row.region_slug
        ? {
            region_slug: row.region_slug,
            town_slug: row.town_slug || undefined,
            how: "set by the owner",
          }
        : placeTour(facts, towns, regions);
      const category = row.category?.trim() || categoryFor(facts);
      const peers = (await ctx.store.rows("Tours")).filter((r) => r.id !== row.id).map(toPeer);
      const problems = selectionProblems(facts, placed, category, peers);

      const fill: Record<string, string | undefined> = {
        title: facts.title,
        duration: formatDuration(facts.durations),
        price_from_eur: facts.priceEur?.toString(),
        rating: facts.rating?.toString(),
        review_count: facts.reviews?.toString(),
        bullets_json: facts.highlights.length
          ? JSON.stringify(facts.highlights.slice(0, MAX_BULLETS))
          : undefined,
        region_slug: placed.region_slug,
        town_slug: placed.town_slug,
        category,
      };
      const patch: Record<string, string> = { last_checked: ctx.today };
      for (const [k, v] of Object.entries(fill)) if (v && !row[k]?.trim()) patch[k] = v;

      if (!problems.length) {
        patch.rank = row.rank?.trim() || String(nextRank(peers, placed.region_slug!, category));
        patch.status = "published";
        patch.notes_flag = "";
        published++;
        ctx.log(
          `${row.id}: published as ${category} #${patch.rank} in ${placed.region_slug} (${placed.how})`,
        );
      } else {
        patch.notes_flag = `${AUTO} held as draft: ${problems.join("; ")}`.slice(0, 480);
        ctx.log(`${row.id}: held as draft (${problems.join("; ")})`);
      }
      await ctx.store.update("Tours", "id", row.id, patch);
      wrote = true;
    } catch (error) {
      const flag =
        error instanceof TourNotFound
          ? `${AUTO} ${source.name} has no tour ${row.provider_id}; check the link`
          : error instanceof NeedsOwner
            ? `${AUTO} ${error.message}`
            : undefined;
      if (flag) {
        await ctx.store.update("Tours", "id", row.id, { notes_flag: flag });
        wrote = true;
      }
      ctx.log(`${row.id}: not filled in (${(error as Error).message})`);
    }
  }

  if (wrote) await revalidate(ctx, [sheetTag("Tours")]);
  ctx.log(
    `tours:enrich: ${published} published, ${todo.length - published} held as draft or failed`,
  );
  return published;
}
