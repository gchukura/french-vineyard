import { seenUrls, textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { BudgetExceeded } from "../lib/cost";
import {
  countFacts,
  extractJsonBlock,
  factSheetSchema,
  factsHash,
  keepSourced,
  type StoredFactSheet,
} from "../lib/facts";
import { pool } from "../lib/pool";
import { researchMessages } from "../lib/prompt";
import type { QueueRow } from "../lib/queue";

export type Research = { facts: StoredFactSheet; dropped: string[]; hash: string };

/** Researches one row and returns the sourced fact sheet. Writes nothing. */
export async function researchRow(ctx: Context, row: QueueRow): Promise<Research> {
  const target = await ctx.target(row);
  const result = await ctx.claude.call(
    {
      model: ctx.config.model,
      max_tokens: 32_000,
      system: ctx.files.research,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 15 }],
      output_config: { effort: "medium" },
      messages: researchMessages(target),
    },
    ESTIMATE_USD.research,
  );
  await ctx.recordUsage(row, "research", result);

  const reply = textOf(result.message.content);
  let parsed;
  try {
    parsed = factSheetSchema.parse(extractJsonBlock(reply));
  } catch (error) {
    throw new Error(
      `Research reply was not a valid fact sheet: ${(error as Error).message.slice(0, 300)}`,
    );
  }
  const { facts, dropped } = keepSourced(parsed, seenUrls(result.turns));
  if (!countFacts(facts)) throw new Error("No facts survived source checking");
  return { facts, dropped, hash: factsHash(facts) };
}

export async function saveFacts(ctx: Context, row: QueueRow, r: Research) {
  await ctx.store.upsert("Facts", "queue_id", row.id, {
    slug: row.slug,
    researched_at: ctx.now(),
    model: ctx.config.model,
    facts_hash: r.hash,
    fact_count: String(countFacts(r.facts)),
    dropped_json: JSON.stringify(r.dropped),
    facts_json: JSON.stringify(r.facts),
  });
}

/** research <n>: queued -> researched. */
export async function research(ctx: Context, max = ctx.args.max): Promise<number> {
  const rows = await ctx.rowsAt("queued", max);
  ctx.log(`research: ${rows.length} queued row(s)`);
  let done = 0;
  let stopped = false;
  await pool(rows, 3, async (row) => {
    if (stopped) return;
    try {
      const r = await researchRow(ctx, row);
      await saveFacts(ctx, row, r);
      await ctx.updateQueue(row, { stage: "researched", facts_hash: r.hash, error: "" });
      ctx.log(
        `${row.id} researched: ${countFacts(r.facts)} facts kept, ${r.dropped.length} dropped for missing sources`,
      );
      done++;
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        stopped = true;
        ctx.log(error.message);
        return;
      }
      ctx.log(`${row.id} research failed: ${(error as Error).message}`);
      await ctx.updateQueue(row, {
        stage: "error",
        error: `research: ${(error as Error).message}`.slice(0, 1000),
      });
    }
  });
  return done;
}
