import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { check } from "./commands/check";
import { draft } from "./commands/draft";
import { init } from "./commands/init";
import { publish } from "./commands/publish";
import { refresh } from "./commands/refresh";
import { research } from "./commands/research";
import { run } from "./commands/run";
import { seed } from "./commands/seed";
import { Context, loadConfig, loadContentFiles } from "./context";
import { parseArgs } from "./lib/args";
import type { Draft, Finding } from "./lib/checks";
import type { StoredFactSheet } from "./lib/facts";
import { SheetStore } from "./sheet";

/** Entry point: npm run pipeline -- <command> [n] [--dry-run] … */

const ROOT = path.resolve(import.meta.dirname, "..");

async function main() {
  // Local runs read .env.local; CI passes secrets as environment variables.
  const envFile = path.join(ROOT, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const args = parseArgs(process.argv.slice(2));
  const store = new SheetStore(args.dryRun);
  if (args.queueFile) await store.useQueueFile(path.resolve(args.queueFile));
  const ctx = new Context(args, loadConfig(args), await loadContentFiles(), store);
  ctx.log(
    `${args.command}${args.dryRun ? " (dry run: no Sheet writes)" : ""}: max ${args.max}, budget $${ctx.budget.cap}, models ${ctx.config.model} / ${ctx.config.checkModel}`,
  );

  try {
    switch (args.command) {
      case "init":
        await init(ctx);
        break;
      case "research":
        await research(ctx);
        break;
      case "draft":
        await draft(ctx);
        break;
      case "check":
        await check(ctx);
        break;
      case "publish":
        await publish(ctx);
        break;
      case "refresh":
        await refresh(ctx);
        break;
      case "seed":
        await seed(ctx);
        break;
      case "run":
        await run(ctx);
        break;
    }
  } finally {
    ctx.log(
      `spent $${ctx.budget.spent.toFixed(4)}; ${store.writes.length} Sheet write(s)${args.dryRun ? " planned" : ""}`,
    );
    if (args.dryRun) await writeDryRunReport(ctx);
  }
}

/**
 * Dry runs write what would have gone to the Sheet under pipeline/.dry-run/:
 * one Markdown file per drafted row (draft, check result, fact sheet) and
 * writes.json with every planned Sheet write.
 */
async function writeDryRunReport(ctx: Context) {
  const dir = path.join(
    ROOT,
    "pipeline",
    ".dry-run",
    new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
  );
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "writes.json"), JSON.stringify(ctx.store.writes, null, 2));

  const facts = new Map((await ctx.store.rows("Facts")).map((f) => [f.queue_id, f]));
  for (const row of await ctx.queue()) {
    if (!row.draft_json && !facts.has(row.id)) continue;
    const d = row.draft_json ? (JSON.parse(row.draft_json) as Draft) : undefined;
    const f = facts.get(row.id);
    const sheet = f?.facts_json ? (JSON.parse(f.facts_json) as StoredFactSheet) : undefined;
    const findings = row.findings ? (JSON.parse(row.findings) as Finding[]) : [];
    const lines = [
      `# ${row.id}: ${d?.title ?? row.slug}`,
      "",
      `- Target: ${row.target}/${row.slug} (${row.target === "towns" ? "town" : row.page_type})`,
      `- Stage: ${row.stage}${row.score ? `, score ${row.score}` : ""}, attempts ${row.attempts}`,
      `- Cost: $${row.cost_usd.toFixed(4)}`,
      `- Tour ids: ${d?.tour_ids.join(", ") || "none"}; hotel ids: ${d?.hotel_ids.join(", ") || "none"}`,
      row.error ? `- Error: ${row.error}` : "",
      "",
      d
        ? `**Standfirst:** ${d.standfirst}\n\n**Meta description (${d.meta_description?.length ?? 0} chars):** ${d.meta_description}`
        : "",
      "",
      "---",
      "",
      d?.body_mdx ?? "_No draft._",
      "",
      "---",
      "",
      "## FAQ (faq_json)",
      "",
      ...(d?.faq ?? []).flatMap((q) => [`**${q.question}**`, "", q.answer, ""]),
      "## Check findings",
      "",
      ...(findings.length
        ? findings.map((x) => `- **${x.rule}** (${x.severity}) "${x.quote}": ${x.fix}`)
        : ["None."]),
      "",
      "## Fact sheet",
      "",
      f ? `${f.fact_count} facts kept; dropped for missing sources: ${f.dropped_json}` : "",
      "",
      "```json",
      JSON.stringify(sheet ?? null, null, 2),
      "```",
    ];
    await writeFile(
      path.join(dir, `${row.id}-${row.slug}.md`),
      lines.filter((l) => l !== undefined).join("\n"),
    );
  }
  ctx.log(`dry run report: ${path.relative(ROOT, dir)}/`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
