import { sheetTag } from "@/lib/sheet-schema";

import type { Context } from "../context";
import type { Draft } from "../lib/checks";
import { addMonths } from "../lib/dates";
import type { QueueRow } from "../lib/queue";
import { contentPatch, refreshMonths, TARGET_TAB } from "../lib/targets";

/** POSTs the tags to /api/revalidate. In a dry run, only logs them. */
export async function revalidate(ctx: Context, tags: string[]): Promise<void> {
  if (!tags.length) return;
  const url = `${ctx.config.siteUrl}/api/revalidate`;
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

async function publishRow(ctx: Context, row: QueueRow): Promise<string> {
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
  return sheetTag(tab);
}

/** publish <n>: checked -> published, then one revalidate call for every touched tab. */
export async function publish(ctx: Context, max = ctx.args.max): Promise<number> {
  const rows = await ctx.rowsAt("checked", max);
  ctx.log(`publish: ${rows.length} checked row(s)`);
  const tags = new Set<string>();
  let published = 0;
  for (const row of rows) {
    try {
      tags.add(await publishRow(ctx, row));
      published++;
    } catch (error) {
      ctx.log(`${row.id} publish failed: ${(error as Error).message}`);
      await ctx.updateQueue(row, {
        stage: "error",
        error: `publish: ${(error as Error).message}`.slice(0, 1000),
      });
    }
  }
  await revalidate(ctx, [...tags]);
  return published;
}
