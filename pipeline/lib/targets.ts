import type { Draft } from "./checks";
import { countFacts, type FactSheet } from "./facts";

/**
 * What each Queue `target` writes to. Articles are created by the pipeline;
 * Towns, Regions and SubRegions rows must already exist in the Sheet.
 */

export const TARGETS = ["articles", "towns", "regions", "subregions"] as const;
export type PageTarget = (typeof TARGETS)[number];

export const TARGET_TAB = {
  articles: "Articles",
  towns: "Towns",
  regions: "Regions",
  subregions: "SubRegions",
} as const satisfies Record<PageTarget, string>;

/** Template file for a row: Articles use their page_type, the rest a fixed template. */
export function templateName(target: PageTarget, pageType: string | undefined): string {
  if (target === "towns") return "town";
  if (target === "regions") return "region";
  if (target === "subregions") return "subregion";
  if (!pageType) throw new Error("Articles rows need a page_type");
  return pageType;
}

/** Months until a published page is due for a refresh: 6 for articles, 12 for place pages. */
export function refreshMonths(row: { target: PageTarget }): number {
  return row.target === "articles" ? 6 : 12;
}

/** Place pages show tours and hotels from their own tabs; only articles embed cards. */
export function embedsCards(target: PageTarget): boolean {
  return target === "articles";
}

/**
 * The content-tab columns a draft fills. Columns differ by tab: Towns keep
 * the standfirst in intro_mdx, Regions in tagline, and SubRegions (no
 * updated_at, no FAQ) get it as the first paragraph of intro_mdx.
 */
export function contentPatch(
  target: PageTarget,
  draft: Draft,
  today: string,
  schemaType?: string,
): Record<string, string> {
  const faq = JSON.stringify(draft.faq);
  const standfirst = draft.standfirst ?? "";
  switch (target) {
    case "towns":
      return { intro_mdx: standfirst, body_mdx: draft.body_mdx, faq_json: faq, updated_at: today };
    case "regions":
      return { tagline: standfirst, intro_mdx: draft.body_mdx, updated_at: today };
    case "subregions":
      return { intro_mdx: [standfirst, draft.body_mdx].filter(Boolean).join("\n\n") };
    case "articles":
      return {
        title: draft.title ?? "",
        standfirst,
        meta_description: draft.meta_description ?? "",
        body_mdx: draft.body_mdx,
        faq_json: faq,
        tour_ids: draft.tour_ids.join(", "),
        hotel_ids: draft.hotel_ids.join(", "),
        ...(schemaType ? { schema_type: schemaType } : {}),
        updated_at: today,
      };
  }
}

/**
 * Wine areas and towns are hidden on the site until their region is
 * published (lib/data.ts), so publish holds them back until it is.
 */
export function waitsForRegion(target: PageTarget): boolean {
  return target === "subregions" || target === "towns";
}

/** Regions first, so their wine areas and towns can follow in the same run. */
export function orderForPublish<T extends { target: PageTarget }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.target === "regions") - Number(a.target === "regions"));
}

/** Whether the tab has an updated_at column (SubRegions doesn't). */
export function hasUpdatedAt(target: PageTarget): boolean {
  return target !== "subregions";
}

/** Fewest sourced facts a page can be drafted from. */
export const MIN_FACTS = 12;

/**
 * Why a fact sheet is too thin to draft from, or undefined if it's fine.
 * Town pages and guides also need a sourced route from Paris.
 */
export function researchGate(
  facts: FactSheet,
  row: { target: PageTarget; page_type?: string },
): string | undefined {
  const n = countFacts(facts);
  if (n < MIN_FACTS) {
    return `Research kept ${n} sourced facts; at least ${MIN_FACTS} are needed to draft. Re-run research or add notes to the Queue row.`;
  }
  const needsParis =
    row.target === "towns" || (row.target === "articles" && row.page_type === "guide");
  if (needsParis && !facts.from_paris.length) {
    return "Research found no sourced route from Paris, which town pages and guides need. Re-run research or add notes to the Queue row.";
  }
  return undefined;
}
