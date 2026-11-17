import { JWT } from "google-auth-library";

import { normalizePrivateKey, requireEnv } from "@/lib/env";
import { townSchema } from "@/lib/sheet-schema";

import type { Context } from "../context";
import { assertPrivateKey } from "../lib/credentials";
import {
  aggregateByQuery,
  GSC_COLUMNS,
  gscWindow,
  planQueryWrites,
  type GscApiRow,
} from "../lib/gsc";

/** Domain property; override with GSC_SITE_URL (e.g. "https://frenchvineyard.com/" for a URL-prefix property). */
const DEFAULT_SITE = "sc-domain:frenchvineyard.com";
/** The API's largest page. */
const PAGE_SIZE = 25_000;

/**
 * gsc: pulls the last 28 days of Search Console queries into the Queries tab.
 * Refreshes the figures on rows already there and appends up to --max new
 * queries, most impressions first. Reads Search Console with the pipeline's
 * service account, which must be a user on the property (Restricted is enough).
 */
export async function gsc(ctx: Context): Promise<void> {
  const site = process.env.GSC_SITE_URL?.trim() || DEFAULT_SITE;
  const window = gscWindow(ctx.today);
  const apiRows = await fetchSearchAnalytics(site, window);
  const stats = aggregateByQuery(apiRows);
  ctx.log(
    `gsc: ${site} ${window.startDate}..${window.endDate}: ${apiRows.length} query/page row(s), ${stats.length} quer${stats.length === 1 ? "y" : "ies"}`,
  );

  const added = await ctx.store.ensureColumns("Queries", [...GSC_COLUMNS]);
  if (added.length) ctx.log(`Queries: added column(s) ${added.join(", ")}`);

  const towns = await ctx.store.parsed("Towns", townSchema, { includeDrafts: true });
  const plan = planQueryWrites(await ctx.store.rows("Queries"), stats, {
    max: ctx.args.max,
    today: ctx.today,
    townRegions: new Map(towns.map((t) => [t.slug, t.region_slug])),
  });

  for (const u of plan.updates)
    await ctx.store.updateAt("Queries", u.index, u.values, `query=${u.query}`);
  for (const row of plan.appends) await ctx.store.append("Queries", row);
  ctx.log(
    `gsc: ${plan.updates.length} row(s) refreshed, ${plan.appends.length} added` +
      (plan.skipped ? `, ${plan.skipped} more over the threshold (raise --max)` : ""),
  );
}

async function fetchSearchAnalytics(
  site: string,
  window: { startDate: string; endDate: string },
): Promise<GscApiRow[]> {
  const email = requireEnv("PIPELINE_SERVICE_ACCOUNT_EMAIL");
  const auth = new JWT({
    email,
    key: assertPrivateKey(
      "PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY",
      normalizePrivateKey(requireEnv("PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY")),
    ),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const { token } = await auth.getAccessToken();
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;

  const rows: GscApiRow[] = [];
  for (let startRow = 0; ; startRow += PAGE_SIZE) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...window,
        dimensions: ["query", "page"],
        type: "web",
        rowLimit: PAGE_SIZE,
        startRow,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 403) {
      throw new Error(
        `Search Console refused ${email} for ${site} (HTTP 403). Add it as a user on the property ` +
          `(Settings > Users and permissions, Restricted is enough); new users can take a few minutes to work.`,
      );
    }
    if (!res.ok) throw new Error(`Search Console answered HTTP ${res.status}: ${await res.text()}`);
    const page = ((await res.json()) as { rows?: GscApiRow[] }).rows ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
