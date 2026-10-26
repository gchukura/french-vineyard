import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { agreedFindings, isWithdrawn, runChecks, type Draft, type Finding } from "../lib/checks";
import { BudgetExceeded } from "../lib/cost";
import { allowedNumbers } from "../lib/numbers";
import { pool } from "../lib/pool";
import { checkSystem, checkUserText, gradeSchema, type DraftBrief } from "../lib/prompt";
import { afterCheck, type QueueRow } from "../lib/queue";
import { draftJobs } from "./draft";

export type CheckResult = {
  passed: boolean;
  score: number;
  findings: Finding[];
  words: number;
};

/** Numbers a draft may use: the fact sheet, tours, hotels and (ranked lists) the selection rules. */
function numbersFor(ctx: Context, brief: DraftBrief, h2PerTour: boolean): Set<string> {
  return allowedNumbers(
    brief.facts,
    brief.tours,
    brief.hotels,
    brief.tours.length,
    brief.hotels.length,
    brief.facts.estates.length,
    h2PerTour ? ctx.files.selectionRules : "",
  );
}

/** Rules runChecks measures exactly; the model's opinion on them is ignored. */
const AUTOMATED_RULES = new Set(["twelve_hour_times", "word_count", "check_lines"]);

/** Grades one draft: deterministic checks, then the model's grade. */
export async function gradeDraft(ctx: Context, row: QueueRow, draft: Draft): Promise<CheckResult> {
  const brief = await ctx.brief(row);
  const template = await ctx.template(row);
  const { tours, hotels } = await ctx.siteRows();
  const automated = runChecks({
    draft,
    template,
    bannedPhrases: ctx.files.bannedPhrases,
    allowedNumbers: numbersFor(ctx, brief, template.h2PerTour),
    usdRate: ctx.config.usdRate,
    tours: brief.tours,
    publishedTourIds: new Set(tours.filter((t) => t.status === "published").map((t) => t.id)),
    hotelIds: new Set(hotels.map((h) => h.id)),
  });

  // Two independent passes; only errors both agree on block the draft.
  const params = {
    model: ctx.config.checkModel,
    max_tokens: 8_000,
    system: [checkSystem(ctx.files)],
    output_config: { effort: "medium" as const, format: zodOutputFormat(gradeSchema) },
    messages: [
      {
        role: "user" as const,
        content: checkUserText(
          brief,
          template,
          ctx.files,
          draft,
          automated.findings,
          automated.wordCount,
        ),
      },
    ],
  };
  const results = await Promise.all([
    ctx.claude.call(params, ESTIMATE_USD.check),
    ctx.claude.call(params, ESTIMATE_USD.check),
  ]);
  for (const r of results) await ctx.recordUsage(row, "check", r);
  const grades = results.map((r) => gradeSchema.parse(JSON.parse(textOf(r.message.content))));

  // The model sometimes lists a finding and withdraws it in its own fix text
  // ("no change is needed"); those aren't problems, so they don't count.
  // Rules the deterministic checks measure exactly are theirs alone.
  const usable = (g: (typeof grades)[number]) =>
    g.findings.filter((f) => !isWithdrawn(f) && !AUTOMATED_RULES.has(f.rule));
  const { agreed, single } = agreedFindings(usable(grades[0]), usable(grades[1]));
  const modelFindings = [...agreed, ...single];
  const errors = automated.findings.filter((f) => f.severity === "error").length;
  const modelErrors = agreed.filter((f) => f.severity === "error").length;
  const modelScore = (grades[0].score + grades[1].score) / 2;
  const score = Math.max(0, Math.min(100, Math.round(modelScore) - 10 * errors));
  // Pass is decided by the error findings themselves, not the model's own verdict.
  const passed = errors === 0 && modelErrors === 0;
  return {
    passed,
    score: passed ? Math.max(score, ctx.config.passScore) : score,
    findings: [...automated.findings, ...modelFindings],
    words: automated.wordCount,
  };
}

function findingsCell(findings: Finding[]): string {
  let json = JSON.stringify(findings);
  // Keep the cell readable and under the Sheets limit.
  for (let n = findings.length; json.length > 20_000 && n > 0; n--)
    json = JSON.stringify(findings.slice(0, n));
  return json;
}

/** Checks one row; on a first fail redrafts with the findings and checks again. */
async function checkRow(
  ctx: Context,
  start: QueueRow,
): Promise<"checked" | "needs_review" | "error"> {
  let row = start;
  for (;;) {
    if (!row.draft_json) throw new Error("No draft_json on the Queue row; run draft first");
    const draft = JSON.parse(row.draft_json) as Draft;
    const result = await gradeDraft(ctx, row, draft);
    // --no-redraft grades only: a fail stays drafted with its findings.
    const outcome =
      ctx.args.noRedraft && !result.passed
        ? { stage: "drafted" as const, attempts: row.attempts, redraft: false }
        : afterCheck(result.passed, row.attempts);
    await ctx.updateQueue(row, {
      score: String(result.score),
      findings: findingsCell(result.findings),
      attempts: String(outcome.attempts),
      stage: outcome.stage,
    });
    ctx.log(
      `${row.id} check: score ${result.score}, ${result.words} words, ${result.findings.length} finding(s) -> ${outcome.stage}`,
    );
    if (!outcome.redraft) return outcome.stage === "checked" ? "checked" : "needs_review";

    row = await ctx.row(row.id);
    const redrafted = await draftJobs(ctx, [{ row, findings: result.findings, previous: draft }]);
    if (!redrafted.has(row.id)) return "error";
    row = await ctx.row(row.id);
  }
}

/** check <n>: drafted -> checked, or redraft (up to MAX_REDRAFTS), or needs_review. */
export async function check(ctx: Context, max = ctx.args.max): Promise<number> {
  const rows = await ctx.rowsAt("drafted", max);
  ctx.log(`check: ${rows.length} drafted row(s)`);
  let passed = 0;
  let stopped = false;
  await pool(rows, 3, async (row) => {
    if (stopped) return;
    try {
      if ((await checkRow(ctx, row)) === "checked") passed++;
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        stopped = true;
        ctx.log(error.message);
        return;
      }
      ctx.log(`${row.id} check failed: ${(error as Error).message}`);
      await ctx.updateQueue(row, {
        stage: "error",
        error: `check: ${(error as Error).message}`.slice(0, 1000),
      });
    }
  });
  return passed;
}
