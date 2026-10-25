import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";

import { textOf, type CallResult } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import type { Draft, Finding } from "../lib/checks";
import { BudgetExceeded } from "../lib/cost";
import { pool } from "../lib/pool";
import {
  draftOutputSchema,
  draftUserText,
  redraftText,
  sharedDraftSystem,
  templateSystem,
  type DraftBrief,
} from "../lib/prompt";
import type { QueueRow } from "../lib/queue";
import { contentPatch, researchGate, TARGET_TAB } from "../lib/targets";

/** Above this many rows, drafts go through the Message Batches API. */
export const BATCH_THRESHOLD = 20;

export type DraftJob = { row: QueueRow; findings?: Finding[]; previous?: Draft };

async function buildParams(
  ctx: Context,
  job: DraftJob,
  brief: DraftBrief,
): Promise<MessageCreateParamsNonStreaming> {
  const template = await ctx.template(job.row);
  const user = [{ type: "text" as const, text: draftUserText(brief) }];
  if (job.findings && job.previous) {
    user.push({ type: "text", text: redraftText(ctx.files, job.findings, job.previous) });
  }
  return {
    model: ctx.config.model,
    max_tokens: 32_000,
    // Shared prefix first (cached across every row), then the page-type template.
    system: [sharedDraftSystem(ctx.files), templateSystem(template, ctx.files)],
    output_config: { effort: "high", format: zodOutputFormat(draftOutputSchema) },
    messages: [{ role: "user", content: user }],
  };
}

function toDraft(result: CallResult, brief: DraftBrief): Draft {
  const out = draftOutputSchema.parse(JSON.parse(textOf(result.message.content)));
  return {
    title: out.title,
    standfirst: out.standfirst,
    meta_description: out.meta_description,
    body_mdx: out.body_mdx.trim(),
    faq: out.faq,
    tour_ids: brief.tours.map((t) => t.id),
    hotel_ids: brief.hotels.map((h) => h.id),
  };
}

/**
 * Stores the draft on the Queue row, and on the content row too unless that
 * row is already published (a refresh), so a live page never shows an
 * unchecked draft. Publish copies Queue.draft_json across.
 */
async function saveDraft(ctx: Context, job: DraftJob, draft: Draft) {
  const { row } = job;
  const template = await ctx.template(row);
  const tab = TARGET_TAB[row.target];
  const existing = (await ctx.store.rows(tab)).find((r) => r.slug === row.slug);
  const live = existing?.status?.trim().toLowerCase() === "published";
  if (!live) {
    const patch = contentPatch(row.target, draft, ctx.today, template.schemaType);
    if (existing) await ctx.store.update(tab, "slug", row.slug, patch);
    else if (tab === "Articles") {
      await ctx.store.append("Articles", {
        slug: row.slug,
        page_type: row.page_type ?? "",
        region_slug: row.region_slug ?? "",
        town_slug: row.town_slug ?? "",
        target_keyword: row.target_keyword ?? "",
        status: "draft",
        ...patch,
      });
    } else throw new Error(`${tab} has no row with slug ${row.slug}`);
  }
  await ctx.updateQueue(row, {
    stage: "drafted",
    draft_json: JSON.stringify(draft),
    attempts: String(job.findings ? Math.max(row.attempts, 1) : row.attempts),
    error: "",
  });
}

/**
 * Rows that can't be drafted as briefed go to needs_review with the reason,
 * before any tokens are spent: thin research, or a ranked list with no tours.
 */
async function precheck(
  ctx: Context,
  job: DraftJob,
  brief: DraftBrief,
): Promise<string | undefined> {
  const thin = researchGate(brief.facts, job.row);
  if (thin) return thin;
  const template = await ctx.template(job.row);
  if (template.h2PerTour && !brief.tours.length) {
    return `No published tours in the Tours tab match region=${job.row.region_slug ?? "-"} town=${job.row.town_slug ?? "-"} category=${job.row.category ?? "-"}`;
  }
  return undefined;
}

/** Drafts the jobs: single calls up to BATCH_THRESHOLD, a Message Batch above it. */
export async function draftJobs(ctx: Context, jobs: DraftJob[]): Promise<Map<string, Draft>> {
  const drafted = new Map<string, Draft>();
  const ready: { job: DraftJob; brief: DraftBrief; params: MessageCreateParamsNonStreaming }[] = [];
  for (const job of jobs) {
    try {
      const brief = await ctx.brief(job.row);
      const blocked = await precheck(ctx, job, brief);
      if (blocked) {
        ctx.log(`${job.row.id} needs review: ${blocked}`);
        await ctx.updateQueue(job.row, { stage: "needs_review", findings: blocked });
        continue;
      }
      ready.push({ job, brief, params: await buildParams(ctx, job, brief) });
    } catch (error) {
      await fail(ctx, job.row, error);
    }
  }

  const finish = async (item: (typeof ready)[number], result: CallResult, batch: boolean) => {
    await ctx.recordUsage(item.job.row, item.job.findings ? "redraft" : "draft", result, { batch });
    const draft = toDraft(result, item.brief);
    await saveDraft(ctx, item.job, draft);
    drafted.set(item.job.row.id, draft);
    ctx.log(`${item.job.row.id} drafted: "${draft.title}"`);
  };

  if (ready.length > BATCH_THRESHOLD) {
    const fit = Math.min(ready.length, ctx.budget.room(ESTIMATE_USD.draft));
    if (fit < ready.length) ctx.log(`draft: budget fits ${fit} of ${ready.length} drafts`);
    const items = ready.slice(0, fit);
    if (!items.length) return drafted;
    const results = await ctx.claude.batch(
      items.map((i) => ({ custom_id: i.job.row.id, params: i.params })),
      ESTIMATE_USD.draft,
      (m) => ctx.log(m),
    );
    for (const item of items) {
      const r = results.get(item.job.row.id);
      try {
        if (!r || "error" in r) throw new Error(r ? r.error : "missing from batch results");
        await finish(item, r, true);
      } catch (error) {
        await fail(ctx, item.job.row, error);
      }
    }
    return drafted;
  }

  let stopped = false;
  await pool(ready, 3, async (item) => {
    if (stopped) return;
    try {
      const { system, messages, ...rest } = item.params;
      const result = await ctx.claude.call({ ...rest, system, messages }, ESTIMATE_USD.draft);
      await finish(item, result, false);
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        stopped = true;
        ctx.log(error.message);
        return;
      }
      await fail(ctx, item.job.row, error);
    }
  });
  return drafted;
}

async function fail(ctx: Context, row: QueueRow, error: unknown) {
  const message = (error as Error).message;
  ctx.log(`${row.id} draft failed: ${message}`);
  await ctx.updateQueue(row, { stage: "error", error: `draft: ${message}`.slice(0, 1000) });
}

/** draft <n>: researched -> drafted. */
export async function draft(ctx: Context, max = ctx.args.max): Promise<number> {
  const rows = await ctx.rowsAt("researched", max);
  ctx.log(
    `draft: ${rows.length} researched row(s)${rows.length > BATCH_THRESHOLD ? " (batch)" : ""}`,
  );
  return (
    await draftJobs(
      ctx,
      rows.map((row) => ({ row })),
    )
  ).size;
}
