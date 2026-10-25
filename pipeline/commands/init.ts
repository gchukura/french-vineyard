import type { Context } from "../context";
import { PIPELINE_TABS } from "../sheet";

/** init: creates the Queue, Facts and Queries tabs, or adds missing columns. */
export async function init(ctx: Context): Promise<void> {
  for (const tab of Object.keys(PIPELINE_TABS)) {
    const result = await ctx.store.ensureTab(tab);
    ctx.log(
      `${tab}: ${result}${ctx.args.dryRun && result !== "ok" ? " (dry run, not written)" : ""}`,
    );
  }
}
