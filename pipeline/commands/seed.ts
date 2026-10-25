import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Context } from "../context";
import { QUEUE_HEADERS, queueSchema } from "../lib/queue";

/**
 * seed --file <json>: appends Queue rows from a JSON array. Every row is
 * validated first and nothing is written if any is malformed; ids already in
 * the Queue are skipped, so re-running the same file is safe.
 */
export async function seed(ctx: Context): Promise<number> {
  if (!ctx.args.file) throw new Error("seed needs --file <path to a JSON array of Queue rows>");
  const rows = JSON.parse(await readFile(path.resolve(ctx.args.file), "utf8")) as Record<
    string,
    unknown
  >[];
  if (!Array.isArray(rows)) throw new Error(`${ctx.args.file} must contain a JSON array`);

  const problems: string[] = [];
  const ids = new Set<string>();
  for (const [i, raw] of rows.entries()) {
    const parsed = queueSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(
        `row ${i + 1} (${raw.id ?? "no id"}): ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`,
      );
    } else if (ids.has(parsed.data.id))
      problems.push(`row ${i + 1}: duplicate id ${parsed.data.id}`);
    else ids.add(parsed.data.id);
  }
  if (problems.length)
    throw new Error(`Nothing written; fix these rows:\n  ${problems.join("\n  ")}`);

  const existing = new Set((await ctx.store.rows("Queue")).map((r) => r.id));
  let added = 0;
  for (const raw of rows) {
    const id = String(raw.id);
    if (existing.has(id)) {
      ctx.log(`${id} already in the Queue; skipped`);
      continue;
    }
    const values = Object.fromEntries(
      QUEUE_HEADERS.filter((h) => raw[h] != null && raw[h] !== "").map((h) => [h, String(raw[h])]),
    );
    await ctx.store.append("Queue", { stage: "queued", ...values });
    added++;
  }
  ctx.log(
    `seed: ${added} row(s) added${ctx.args.dryRun ? " (dry run, not written)" : ""}, ${rows.length - added} skipped`,
  );
  return added;
}
