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
import { withoutBlocked } from "../lib/blocklist";
import { pool } from "../lib/pool";
import { researchMessages, researchRetryHint } from "../lib/prompt";
import type { QueueRow } from "../lib/queue";
import { researchGate } from "../lib/targets";

/** Web searches allowed per row; each one adds its results to the call's input tokens. */
export const MAX_SEARCHES = 8;

export type Research = { facts: StoredFactSheet; dropped: string[]; hash: string };

/** Research that produced nothing usable: an unparseable reply or no sourced facts. */
export class ResearchUnusable extends Error {
  name = "ResearchUnusable";
}

/** Researches one row and returns the sourced fact sheet. Writes nothing but the usage log. */
export async function researchRow(ctx: Context, row: QueueRow, hint?: string): Promise<Research> {
  const target = await ctx.target(row);
  const result = await ctx.claude.call(
    {
      model: ctx.config.model,
      max_tokens: 32_000,
      system: ctx.files.research,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: MAX_SEARCHES,
          blocked_domains: ctx.files.researchBlocklist,
        },
      ],
      output_config: { effort: "medium" },
      messages: researchMessages(target, hint),
    },
    ESTIMATE_USD.research,
  );
  await ctx.recordUsage(row, hint ? "research-retry" : "research", result);

  const reply = textOf(result.message.content);
  let parsed;
  try {
    parsed = factSheetSchema.parse(extractJsonBlock(reply));
  } catch (error) {
    throw new ResearchUnusable(
      `Research reply was not a valid fact sheet: ${(error as Error).message.slice(0, 300)}`,
    );
  }
  const { facts, dropped } = keepSourced(
    parsed,
    withoutBlocked(seenUrls(result.turns), ctx.files.researchBlocklist),
  );
  if (!countFacts(facts)) throw new ResearchUnusable("No facts survived source checking");
  return { facts, dropped, hash: factsHash(facts) };
}

/**
 * Research with one automatic retry: when the fact sheet is too thin to draft
 * (the fact gate) or nothing usable came back, research again with a hint to
 * start from the tourist office's estate and visit listings. Keeps whichever
 * attempt kept more facts; the draft step's gate still has the final say.
 */
export async function researchWithRetry(ctx: Context, row: QueueRow): Promise<Research> {
  let first: Research | undefined;
  let reason: string;
  try {
    first = await researchRow(ctx, row);
    const thin = researchGate(first.facts, row);
    if (!thin) return first;
    reason = thin;
  } catch (error) {
    if (!(error instanceof ResearchUnusable)) throw error;
    reason = error.message;
  }
  ctx.log(`${row.id} retrying research once: ${reason}`);
  try {
    const second = await researchRow(ctx, row, researchRetryHint(reason));
    return !first || countFacts(second.facts) >= countFacts(first.facts) ? second : first;
  } catch (error) {
    if (first && error instanceof ResearchUnusable) return first;
    throw error;
  }
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
      const r = await researchWithRetry(ctx, row);
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
