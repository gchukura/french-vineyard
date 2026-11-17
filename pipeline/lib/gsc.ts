/**
 * Google Search Console → Queries tab. Pure helpers here; the API call and
 * Sheet writes are in commands/gsc.ts.
 *
 * The owner's columns (region_slug, town_slug, page_type, volume, notes,
 * queued) are never overwritten. The command only fills these columns, and
 * the scope columns on rows it appends.
 */

export const GSC_COLUMNS = [
  "source",
  "top_page",
  "impressions",
  "clicks",
  "ctr_pct",
  "position",
  "gsc_updated",
] as const;

/** The metric columns compared to decide whether a row needs a write. */
const METRIC_COLUMNS = ["top_page", "impressions", "clicks", "ctr_pct", "position"] as const;

/** Search Console's figures settle after about two days; stay clear of them. */
export const GSC_LAG_DAYS = 3;
export const GSC_WINDOW_DAYS = 28;
/** New queries need at least this many impressions in the window to be appended. */
export const GSC_MIN_IMPRESSIONS = 5;

export type GscApiRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type QueryStats = {
  query: string;
  /** Site path of the page with the most impressions for this query, e.g. "/towns/reims/". */
  topPage: string;
  impressions: number;
  clicks: number;
  /** Impression-weighted average position. */
  position: number;
};

/** The 28 days ending GSC_LAG_DAYS before `today` (yyyy-mm-dd, UTC). */
export function gscWindow(
  today: string,
  days = GSC_WINDOW_DAYS,
  lag = GSC_LAG_DAYS,
): { startDate: string; endDate: string } {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - lag);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/** Lowercase, trimmed, single-spaced: how queries are matched to existing rows. */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** "https://frenchvineyard.com/towns/reims/" -> "/towns/reims/". Keeps the URL if it can't parse it. */
export function pagePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Collapses [query, page] rows into one entry per query: impressions and
 * clicks summed, position weighted by impressions, top page by impressions.
 * Sorted by impressions, then clicks, descending.
 */
export function aggregateByQuery(rows: GscApiRow[]): QueryStats[] {
  type Acc = {
    query: string;
    impressions: number;
    clicks: number;
    posSum: number;
    pages: Map<string, number>;
  };
  const byQuery = new Map<string, Acc>();
  for (const r of rows) {
    const [rawQuery, page = ""] = r.keys;
    if (!rawQuery) continue;
    const query = normalizeQuery(rawQuery);
    const acc = byQuery.get(query) ?? {
      query,
      impressions: 0,
      clicks: 0,
      posSum: 0,
      pages: new Map<string, number>(),
    };
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.posSum += r.position * r.impressions;
    const path = pagePath(page);
    acc.pages.set(path, (acc.pages.get(path) ?? 0) + r.impressions);
    byQuery.set(query, acc);
  }
  return [...byQuery.values()]
    .map((a) => ({
      query: a.query,
      topPage: [...a.pages.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "",
      impressions: a.impressions,
      clicks: a.clicks,
      position: a.impressions ? a.posSum / a.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

/** Cell values for the metric columns. */
export function metricCells(
  s: QueryStats | undefined,
): Record<(typeof METRIC_COLUMNS)[number], string> {
  if (!s) return { top_page: "", impressions: "0", clicks: "0", ctr_pct: "", position: "" };
  return {
    top_page: s.topPage,
    impressions: String(s.impressions),
    clicks: String(s.clicks),
    ctr_pct: s.impressions ? (Math.round((s.clicks / s.impressions) * 1000) / 10).toFixed(1) : "",
    position: s.position ? s.position.toFixed(1) : "",
  };
}

/**
 * Region and town for a page path, from the site's URL scheme: /towns/<town>/
 * (region from the Towns tab), /regions/<region>/… and /tours/<region>/.
 */
export function scopeFromPath(
  path: string,
  townRegions: Map<string, string>,
): { region_slug: string; town_slug: string } {
  const town = path.match(/^\/towns\/([a-z0-9-]+)\//)?.[1];
  if (town) return { town_slug: town, region_slug: townRegions.get(town) ?? "" };
  const region = path.match(/^\/(?:regions|tours)\/([a-z0-9-]+)\//)?.[1];
  return { region_slug: region ?? "", town_slug: "" };
}

export type QueryWrites = {
  /** Index into the existing rows, and the cells to set. */
  updates: { index: number; query: string; values: Record<string, string> }[];
  appends: Record<string, string>[];
  /** New queries over the threshold that didn't fit under `max`. */
  skipped: number;
};

/**
 * Plans the Sheet writes: refreshes metrics on every existing row whose
 * figures changed (a query no longer seen drops to 0 impressions), and
 * appends up to `max` new queries with GSC_MIN_IMPRESSIONS or more.
 */
export function planQueryWrites(
  existing: Record<string, string>[],
  stats: QueryStats[],
  opts: { max: number; today: string; townRegions: Map<string, string>; minImpressions?: number },
): QueryWrites {
  const min = opts.minImpressions ?? GSC_MIN_IMPRESSIONS;
  const byQuery = new Map(stats.map((s) => [s.query, s]));
  const seen = new Set<string>();
  const updates: QueryWrites["updates"] = [];

  existing.forEach((row, index) => {
    const query = normalizeQuery(row.query ?? "");
    if (!query) return;
    // A query listed twice: only the first row carries the figures.
    if (seen.has(query)) return;
    seen.add(query);
    const s = byQuery.get(query);
    // Rows the owner added that Search Console has never reported stay untouched.
    if (!s && !row.impressions) return;
    const cells = metricCells(s);
    const changed = METRIC_COLUMNS.some((c) => (row[c] ?? "") !== cells[c]);
    if (changed) updates.push({ index, query, values: { ...cells, gsc_updated: opts.today } });
  });

  const fresh = stats.filter((s) => !seen.has(s.query) && s.impressions >= min);
  const appends = fresh.slice(0, opts.max).map((s) => ({
    query: s.query,
    ...scopeFromPath(s.topPage, opts.townRegions),
    source: "gsc",
    ...metricCells(s),
    gsc_updated: opts.today,
  }));
  return { updates, appends, skipped: fresh.length - appends.length };
}
