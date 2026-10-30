import { sheetTag } from "@/lib/sheet-schema";
import { areaHref, articleHref, regionHref, townHref, type ArticlePageType } from "@/lib/site";

import type { Context } from "../context";
import type { Draft } from "../lib/checks";
import { addMonths } from "../lib/dates";
import type { QueueRow } from "../lib/queue";
import {
  contentPatch,
  orderForPublish,
  refreshMonths,
  TARGET_TAB,
  waitsForRegion,
} from "../lib/targets";
import { notifyIndexNow } from "./indexnow";

/** POSTs the tags to /api/revalidate. In a dry run, only logs them. */
export async function revalidate(ctx: Context, tags: string[]): Promise<void> {
  if (!tags.length) return;
  // Trailing slash: the site redirects /api/revalidate to /api/revalidate/ (308).
  const url = `${ctx.config.siteUrl}/api/revalidate/`;
  if (ctx.args.dryRun) {
    ctx.log(`dry run: would POST ${url} {"tags":${JSON.stringify(tags)}}`);
    return;
  }
  if (!ctx.config.revalidateSecret)
    throw new Error(
      "REVALIDATE_SECRET is not set; pages were published but the cache was not revalidated",
    );
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-revalidate-secret": ctx.config.revalidateSecret,
    },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`Revalidate failed: ${res.status} ${await res.text()}`);
  ctx.log(`revalidated ${tags.join(", ")}`);
}

/** The site path of a published content row. */
function pagePath(tab: string, row: Record<string, string>): string {
  switch (tab) {
    case "Articles":
      return articleHref({ slug: row.slug, page_type: row.page_type as ArticlePageType });
    case "Towns":
      return townHref(row.slug);
    case "Regions":
      return regionHref(row.slug);
    default:
      return areaHref(row.region_slug, row.slug);
  }
}

async function publishRow(ctx: Context, row: QueueRow): Promise<{ tag: string; path: string }> {
  if (!row.draft_json) throw new Error("No draft_json to publish");
  const draft = JSON.parse(row.draft_json) as Draft;
  const template = await ctx.template(row);
  const tab = TARGET_TAB[row.target];
  const existing = (await ctx.store.rows(tab)).find((r) => r.slug === row.slug);
  if (!existing) throw new Error(`${tab} has no row with slug ${row.slug}`);

  const refreshAfter = addMonths(ctx.today, refreshMonths(row));
  const publishedAt = existing.published_at || row.published_at || ctx.today;
  const patch: Record<string, string> = {
    ...contentPatch(row.target, draft, ctx.today, template.schemaType),
    status: "published",
  };
  if (tab === "Articles")
    Object.assign(patch, { published_at: publishedAt, refresh_after: refreshAfter });

  await ctx.store.update(tab, "slug", row.slug, patch);
  await ctx.updateQueue(row, {
    stage: "published",
    published_at: publishedAt,
    refresh_after: refreshAfter,
  });
  ctx.log(`${row.id} published to ${tab}/${row.slug}; refresh after ${refreshAfter}`);
  return { tag: sheetTag(tab), path: pagePath(tab, { ...existing, ...patch }) };
}

/** Whether the row's region is published (always true for rows that don't wait on one). */
async function regionLive(ctx: Context, row: QueueRow): Promise<boolean> {
  if (!waitsForRegion(row.target)) return true;
  const region = (await ctx.target(row)).regionSlug;
  const hit = (await ctx.store.rows("Regions")).find((r) => r.slug === region);
  return hit?.status?.trim().toLowerCase() === "published";
}

/**
 * publish <n>: checked -> published, regions first, then one revalidate call
 * for every touched tab. Wine areas and towns whose region isn't published
 * stay checked and are picked up by a later publish; held rows don't count
 * toward n.
 */
export async function publish(ctx: Context, max = ctx.args.max): Promise<number> {
  const rows = orderForPublish(
    (await ctx.queue()).filter(
      (r) => r.stage === "checked" && (!ctx.args.only || ctx.args.only.includes(r.id)),
    ),
  );
  ctx.log(`publish: ${rows.length} checked row(s)`);
  const tags = new Set<string>();
  const paths: string[] = [];
  const held: string[] = [];
  let published = 0;
  for (const row of rows) {
    if (published >= max) break;
    try {
      if (!(await regionLive(ctx, row))) {
        held.push(row.id);
        continue;
      }
      const done = await publishRow(ctx, row);
      tags.add(done.tag);
      paths.push(done.path);
      published++;
    } catch (error) {
      ctx.log(`${row.id} publish failed: ${(error as Error).message}`);
      await ctx.updateQueue(row, {
        stage: "error",
        error: `publish: ${(error as Error).message}`.slice(0, 1000),
      });
    }
  }
  if (held.length) {
    ctx.log(
      `publish: ${held.length} held in checked until their region is published: ${held.join(", ")}`,
    );
  }
  await revalidate(ctx, [...tags]);
  // After the revalidate, so search engines fetch the new version.
  await notifyIndexNow(ctx, paths);
  return published;
}
