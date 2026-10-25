import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { runChecks, type Draft, type Finding } from "../lib/checks";
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

  const result = await ctx.claude.call(
    {
      model: ctx.config.checkModel,
      max_tokens: 8_000,
      system: [checkSystem(ctx.files)],
      output_config: { effort: "medium", format: zodOutputFormat(gradeSchema) },
      messages: [
        {
          role: "user",
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
    },
    ESTIMATE_USD.check,
  );
  await ctx.recordUsage(row, "check", result);
  const grade = gradeSchema.parse(JSON.parse(textOf(result.message.content)));

  const errors = automated.findings.filter((f) => f.severity === "error").length;
  const score = Math.max(0, Math.min(100, Math.round(grade.score) - 10 * errors));
  const passed = grade.pass && errors === 0 && score >= ctx.config.passScore;
  return {
    passed,
    score,
    findings: [...automated.findings, ...grade.findings],
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
