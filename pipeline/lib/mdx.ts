import { plainText } from "@/lib/content";

/** Ids listed in every `<Tag ids="…" />` in the body, in order, deduplicated. */
export function componentIds(mdx: string, tag: "TourCards" | "HotelCards"): string[] {
  const out: string[] = [];
  for (const m of mdx.matchAll(new RegExp(`<${tag}\\b[^>]*\\bids="([^"]*)"`, "g"))) {
    for (const id of m[1].split(",").map((s) => s.trim())) {
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Number of tables: `<PracticalTable>` components plus Markdown pipe tables. */
export function tableCount(mdx: string): number {
  const components = (mdx.match(/<PracticalTable\b/g) ?? []).length;
  const pipeTables = (mdx.match(/^\s*\|?\s*:?-{3,}:?\s*\|/gm) ?? []).length;
  return components + pipeTables;
}

/**
 * Readable text of an MDX body: component tags removed but the prose inside
 * them and the cells of PracticalTable rows kept.
 */
export function mdxToText(mdx: string): string {
  const withCells = mdx.replace(/<PracticalTable\b([^>]*)\/>/g, (_, attrs: string) => {
    const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
    return ["", get("caption"), get("columns"), get("rows")].join("\n").replace(/[|;]/g, " ");
  });
  const noTags = withCells
    .replace(/<(TourCards|HotelCards)\b[^>]*\/>/g, "")
    .replace(/<\/?[A-Z][A-Za-z]*\b[^>]*>/g, (tag) => {
      const title = tag.match(/title="([^"]*)"/)?.[1];
      return title ? `\n${title}\n` : "\n";
    });
  return noTags
    .split(/\n{2,}/)
    .map((p) => plainText(p))
    .filter(Boolean)
    .join("\n\n");
}

export function wordCount(mdx: string): number {
  return mdxToText(mdx)
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** The body with every MethodologyBox removed (where "we" is allowed). */
export function withoutMethodology(mdx: string): string {
  return mdx.replace(/<MethodologyBox\b[\s\S]*?<\/MethodologyBox>/g, "");
}
