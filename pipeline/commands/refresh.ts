import type { Context } from "../context";
import { BudgetExceeded } from "../lib/cost";
import { addMonths, isDue } from "../lib/dates";
import { sheetTag } from "@/lib/sheet-schema";

import { hasUpdatedAt, refreshMonths, TARGET_TAB } from "../lib/targets";
import { check } from "./check";
import { draft } from "./draft";
import { revalidate } from "./publish";
import { researchWithRetry, saveFacts } from "./research";

/**
 * refresh <n>: published rows past refresh_after are researched again. A
 * changed fact sheet goes back through draft and check (the next publish
 * puts it live); an unchanged one only bumps updated_at, and refresh_after
 * moves forward so the row isn't researched again tomorrow.
 */
export async function refresh(ctx: Context, max = ctx.args.max): Promise<number> {
  const due = (await ctx.queue())
    .filter((r) => r.stage === "published" && isDue(r.refresh_after, ctx.today))
    .filter((r) => !ctx.args.only || ctx.args.only.includes(r.id))
    .slice(0, max);
  ctx.log(`refresh: ${due.length} row(s) due`);

  const changed: string[] = [];
  const tags = new Set<string>();
  for (const row of due) {
    try {
      const r = await researchWithRetry(ctx, row);
      if (r.hash !== row.facts_hash) {
        await saveFacts(ctx, row, r);
        await ctx.updateQueue(row, {
          stage: "researched",
          facts_hash: r.hash,
          attempts: "0",
          error: "",
        });
        changed.push(row.id);
        ctx.log(`${row.id} facts changed (${row.facts_hash} -> ${r.hash}); redrafting`);
      } else {
        const tab = TARGET_TAB[row.target];
        const next = addMonths(ctx.today, refreshMonths(row));
        const patch: Record<string, string> = {};
        if (hasUpdatedAt(row.target)) patch.updated_at = ctx.today;
        if (row.target === "articles") patch.refresh_after = next;
        if (Object.keys(patch).length) {
          await ctx.store.update(tab, "slug", row.slug, patch);
          tags.add(sheetTag(tab));
        }
        await ctx.updateQueue(row, { refresh_after: next });
        ctx.log(`${row.id} facts unchanged; updated_at bumped, next refresh ${next}`);
      }
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        ctx.log(error.message);
        break;
      }
      ctx.log(`${row.id} refresh failed: ${(error as Error).message}`);
      await ctx.updateQueue(row, { error: `refresh: ${(error as Error).message}`.slice(0, 1000) });
    }
  }

  if (changed.length) {
    const only = ctx.args.only;
    ctx.args.only = changed;
    try {
      await draft(ctx, changed.length);
      await check(ctx, changed.length);
    } finally {
      ctx.args.only = only;
    }
  }
  await revalidate(ctx, [...tags]);
  return due.length;
}
