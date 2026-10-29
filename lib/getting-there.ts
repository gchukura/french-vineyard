import type { Article, Region } from "@/lib/sheet-schema";

/**
 * The /plan/getting-there/ hub: practical articles the editor tags with
 * cluster "getting-there" in the Articles tab, grouped by region in the
 * Regions tab's order, plus each region's train and airport facts.
 */

export const GETTING_THERE_CLUSTER = "getting-there";

export type GettingThereGroup = { region?: Region; articles: Article[] };

const isGettingThere = (a: Article) =>
  a.page_type === "practical" && a.cluster?.trim().toLowerCase() === GETTING_THERE_CLUSTER;

/** Tagged articles by region, regions in tab order; untagged-region ones last, as "Across France". */
export function gettingThereGroups(regions: Region[], articles: Article[]): GettingThereGroup[] {
  const tagged = articles.filter(isGettingThere);
  const groups: GettingThereGroup[] = regions
    .map((region) => ({ region, articles: tagged.filter((a) => a.region_slug === region.slug) }))
    .filter((g) => g.articles.length);
  const known = new Set(regions.map((r) => r.slug));
  const elsewhere = tagged.filter((a) => !a.region_slug || !known.has(a.region_slug));
  if (elsewhere.length) groups.push({ articles: elsewhere });
  return groups;
}

/** One row per region with a train or airport fact: name, fastest train from Paris, nearest airport. */
export function travelRows(regions: Region[]): [string, string, string][] {
  return regions
    .filter((r) => r.tgv_from_paris || r.airport)
    .map((r) => [r.name, r.tgv_from_paris ?? "—", r.airport ?? "—"]);
}
