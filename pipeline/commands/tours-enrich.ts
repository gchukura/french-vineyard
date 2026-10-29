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
} from "../lib/tour-details";
import { revalidate } from "./publish";

/** Marks notes_flag text written by tours:enrich; rows carrying it are checked again on the next run. */
export const AUTO = "auto:";
const MAX_BULLETS = 5;

export class GygNotFound extends Error {
  name = "GygNotFound";
}

/** GET from the GetYourGuide Partner API in English, prices in EUR. */
export async function gygApi(path: string, key: string): Promise<unknown> {
  const res = await fetch(`https://api.getyourguide.com${path}?cnt_language=en&currency=EUR`, {
    headers: { "X-ACCESS-TOKEN": key, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) throw new GygNotFound(`GetYourGuide API has no ${path}`);
  if (!res.ok) throw new Error(`GetYourGuide API answered HTTP ${res.status} for ${path}`);
  return res.json();
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
 * drafts it held back before (notes_flag "auto: …"), from the GetYourGuide
 * Partner API: title, duration, price, rating, review count and highlights;
 * town and region from the tour's locations; a category; and, when the tour
 * meets every rule in content/selection-rules.md, the next rank in its
 * region and category and status=published. Otherwise the row stays a draft
 * with the reasons in notes_flag and is checked again next run. Only empty
 * fields are filled: whatever the owner typed is kept.
 */
export async function toursEnrich(ctx: Context): Promise<number> {
  await ctx.store.ensureColumns("Tours", ["link_flag", "notes_flag"]);
  const isOurs = (r: Record<string, string>) =>
    r.status?.trim().toLowerCase() === "draft" &&
    (!r.title?.trim() || r.notes_flag?.startsWith(AUTO));
  const todo = (await ctx.store.rows("Tours")).filter(isOurs);
  const gyg = todo.filter((r) => r.provider === "gyg");
  const others = todo.filter((r) => r.provider !== "gyg" && !r.title?.trim());
  if (others.length)
    ctx.log(
      `tours:enrich: ${others.length} draft(s) from other providers need their details by hand: ${others.map((r) => r.id).join(", ")}`,
    );

  const key = process.env.GYG_API_KEY;
  if (!key) {
    if (gyg.length)
      ctx.log(
        `tours:enrich: GYG_API_KEY is not set; ${gyg.length} GetYourGuide draft(s) wait for it`,
      );
    return 0;
  }

  const { towns, regions } = await ctx.siteRows();
  let published = 0;
  let wrote = false;

  // One at a time: each publish takes a price tier and a rank the next row must see.
  for (const row of gyg) {
    try {
      const facts = parseGygDetails(await gygApi(`/1/tours/${row.provider_id}`, key));
      facts.meetingPoint = await gygApi(`/1/tours/${row.provider_id}/options`, key)
        .then(meetingPointFrom)
        .catch(() => undefined);

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
      if (error instanceof GygNotFound) {
        await ctx.store.update("Tours", "id", row.id, {
          notes_flag: `${AUTO} GetYourGuide has no tour ${row.provider_id}; check the link`,
        });
        wrote = true;
      }
      ctx.log(`${row.id}: not filled in (${(error as Error).message})`);
    }
  }

  if (wrote) await revalidate(ctx, [sheetTag("Tours")]);
  ctx.log(
    `tours:enrich: ${published} published, ${gyg.length - published} held as draft or failed`,
  );
  return published;
}
