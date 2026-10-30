import { z } from "zod";

import type { Tour } from "@/lib/sheet-schema";

import type { Draft, Finding } from "./checks";
import type { BriefHotel } from "./selection";
import type { StoredFactSheet } from "./facts";
import type { QueueRow } from "./queue";
import type { Template } from "./template";

/**
 * Prompt assembly. Pure: the caller loads the files in content/ and passes
 * them in. The shared system block is byte-identical across rows so prompt
 * caching hits on every draft after the first.
 */

export type ContentFiles = {
  research: string;
  draft: string;
  redraft: string;
  check: string;
  styleGuide: string;
  bannedPhrases: string[];
  selectionRules: string;
  /** Hostnames web search must not return during research. */
  researchBlocklist: string[];
};

type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export const draftOutputSchema = z.object({
  title: z.string(),
  standfirst: z.string(),
  meta_description: z.string(),
  body_mdx: z.string(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

export const gradeSchema = z.object({
  pass: z.boolean(),
  score: z.number(),
  findings: z.array(
    z.object({
      rule: z.string(),
      severity: z.enum(["error", "warning"]),
      quote: z.string(),
      fix: z.string(),
    }),
  ),
});
export type Grade = z.infer<typeof gradeSchema>;

/** What research and drafting know about the page from the Queue and the Sheet. */
export type Target = {
  row: QueueRow;
  name: string;
  regionSlug?: string;
  regionName?: string;
  townName?: string;
  /** Values already in the Sheet (coordinates, station), for research to verify. */
  known: Record<string, unknown>;
};

const PAGE_LABEL = {
  towns: "town page",
  regions: "region page",
  subregions: "wine area page",
} as const;

/**
 * Added to the second research attempt when the first was too thin to draft
 * from. Names the reason and points at the listings that usually cover it.
 */
export function researchRetryHint(reason: string): string {
  return [
    "A first research attempt for this page was too thin to write from:",
    reason,
    "Start this time from the official tourist office's pages that list estates, cellars and visits for this place; one listing page usually covers several estates with their visit type and fee. For trains, use SNCF Connect. If the place has no tourist office of its own, use the one for the nearest town or the area. Cite only pages you open in this research.",
  ].join("\n\n");
}

export function researchMessages(target: Target, hint?: string) {
  const { row } = target;
  const brief = {
    page: row.target === "articles" ? `${row.page_type} article` : PAGE_LABEL[row.target],
    subject: target.name,
    region: target.regionName ?? row.region_slug,
    town: target.townName ?? row.town_slug,
    target_keyword: row.target_keyword,
    tour_category: row.category,
    editor_notes: row.notes,
    already_in_database: target.known,
  };
  return [
    {
      role: "user" as const,
      content: [
        `Research this page and return the fact sheet.\n\n${JSON.stringify(brief, null, 2)}`,
        ...(hint ? [hint] : []),
      ].join("\n\n"),
    },
  ];
}

export function sharedDraftSystem(files: ContentFiles): SystemBlock {
  return {
    type: "text",
    text: [
      files.draft.trim(),
      "# Style guide",
      files.styleGuide.trim(),
      "# Banned phrases",
      files.bannedPhrases.map((p) => `- ${p}`).join("\n"),
    ].join("\n\n"),
    cache_control: { type: "ephemeral" },
  };
}

export function templateSystem(template: Template, files: ContentFiles): SystemBlock {
  const rules = [
    `Word range for the body: ${template.words.min}–${template.words.max}.`,
    template.requiredHeadings.length
      ? `Required H2 headings: ${template.requiredHeadings.map((h) => `"${h}"`).join(", ")}.`
      : "",
    template.requiredComponents.length
      ? `Required components: ${template.requiredComponents.map((c) => `<${c}>`).join(", ")}.`
      : "",
    `Tables allowed in the body: ${template.maxTables}.`,
  ].filter(Boolean);
  const parts = [`# Page-type template: ${template.pageType}`, rules.join("\n"), template.body];
  if (template.h2PerTour)
    parts.push("# Selection rules (summarize in the MethodologyBox)", files.selectionRules.trim());
  return { type: "text", text: parts.join("\n\n"), cache_control: { type: "ephemeral" } };
}

export function tourBrief(t: Tour) {
  return {
    id: t.id,
    rank: t.rank,
    title: t.title,
    badge: t.badge,
    best_for: t.best_for,
    why_picked: t.why_picked,
    price_from_eur: t.price_from_eur,
    duration: t.duration,
    rating: t.rating,
    review_count: t.review_count,
    bullets: t.bullets_json,
    town_slug: t.town_slug,
  };
}

export function hotelBrief(h: BriefHotel) {
  return {
    id: h.id,
    name: h.name,
    town_slug: h.town_slug,
    town: h.town_name,
    address: h.address,
    // Spelled out so the writer and checker both read it the same way.
    distance_from_town_centre:
      h.km_from_town_centre != null && h.town_name
        ? `about ${h.km_from_town_centre} km (straight line) from the center of ${h.town_name}`
        : undefined,
    stars: h.stars,
    tier: h.tier,
    price_from_eur: h.price_from_eur,
    best_for: h.best_for,
    blurb: h.blurb,
  };
}

/**
 * The fact sheet as the writer and checker see it: no source URLs. They
 * don't need them, they cost tokens, and they invite talk about sources.
 */
export function factsForWriter(facts: StoredFactSheet): unknown {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== "sources")
          .map(([k, x]) => [k, strip(x)]),
      );
    }
    return v;
  };
  return strip(facts);
}

export type DraftBrief = {
  target: Target;
  facts: StoredFactSheet;
  tours: Tour[];
  hotels: BriefHotel[];
  usdRate: number;
  /** Internal links the writer may use. */
  links: { name: string; href: string }[];
};

export function draftUserText(brief: DraftBrief): string {
  const { target, facts, tours, hotels, usdRate, links } = brief;
  const page = {
    type: target.row.target === "articles" ? target.row.page_type : PAGE_LABEL[target.row.target],
    subject: target.name,
    slug: target.row.slug,
    region: target.regionName,
    town: target.townName,
    target_keyword: target.row.target_keyword,
    editor_notes: target.row.notes,
    eur_to_usd_rate: usdRate,
  };
  return [
    "# Page",
    JSON.stringify(page, null, 2),
    "# Fact sheet",
    JSON.stringify(factsForWriter(facts), null, 2),
    `# Tours (${tours.length}, owner's rank order)`,
    tours.length
      ? JSON.stringify(tours.map(tourBrief), null, 2)
      : target.row.target === "articles"
        ? "None curated for this page. Don't suggest booking a tour through the site. You may name official, non-commercial tours and visits from the fact sheet (tourist office tours, the Cité du Vin, interprofession visits, estates' own visits)."
        : "None here: this page shows tours from the site's Tours tab itself. You may name official, non-commercial tours and visits from the fact sheet (tourist office tours, the Cité du Vin, interprofession visits, estates' own visits).",
    `# Hotels (${hotels.length})`,
    hotels.length ? JSON.stringify(hotels.map(hotelBrief), null, 2) : "None. Don't name hotels.",
    "# Internal links you may use",
    links.map((l) => `- [${l.name}](${l.href})`).join("\n") || "None.",
  ].join("\n\n");
}

export function redraftText(files: ContentFiles, findings: Finding[], previous: Draft): string {
  const list = findings.map((f) => `- [${f.rule}] "${f.quote}": ${f.fix}`).join("\n");
  return files.redraft
    .replace("{{findings}}", list || "- (none recorded)")
    .replace("{{previous_draft}}", JSON.stringify(previous, null, 2));
}

export function checkSystem(files: ContentFiles): SystemBlock {
  return { type: "text", text: files.check.trim(), cache_control: { type: "ephemeral" } };
}

export function checkUserText(
  brief: DraftBrief,
  template: Template,
  files: ContentFiles,
  draft: Draft,
  automated: Finding[],
  words: number,
): string {
  return [
    draftUserText(brief),
    `# Template: ${template.pageType}`,
    `Word range ${template.words.min}–${template.words.max}; automated count ${words}.`,
    `Required H2 headings: ${template.requiredHeadings.join(" | ") || "(none fixed)"}.`,
    template.h2PerTour ? "One H2 per tour, in the tours' order, and no other H2s." : "",
    "# Banned phrases",
    files.bannedPhrases.join("\n"),
    "# Automated findings",
    automated.length ? JSON.stringify(automated, null, 2) : "None.",
    "# Draft",
    JSON.stringify(draft, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
}
