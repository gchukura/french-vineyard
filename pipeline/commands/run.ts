import type { Context } from "../context";
import { check } from "./check";
import { draft } from "./draft";
import { publish } from "./publish";
import { research } from "./research";

/**
 * run: research, draft, check and publish in sequence, each up to --max
 * rows, under one budget. Rows move through every stage in a single run.
 * Once the budget is spent the paid stages stop; publish still runs.
 */
export async function run(ctx: Context): Promise<void> {
  const researched = await research(ctx);
  const drafted = await draft(ctx);
  const checked = await check(ctx);
  const published = await publish(ctx);
  ctx.log(
    `run: ${researched} researched, ${drafted} drafted, ${checked} passed check, ${published} published; spent $${ctx.budget.spent.toFixed(4)} of $${ctx.budget.cap.toFixed(2)}`,
  );
}
