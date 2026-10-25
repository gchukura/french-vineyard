import { TARGETS, type PageTarget } from "./targets";

export { templateName } from "./targets";

/**
 * Page-type templates in content/templates/{page_type}.md. The frontmatter is
 * a few `key: value` lines; list values are separated by "|" because headings
 * may contain commas.
 */

export type Template = {
  pageType: string;
  target: PageTarget;
  words: { min: number; max: number };
  requiredHeadings: string[];
  requiredComponents: string[];
  maxTables: number;
  h2PerTour: boolean;
  schemaType?: string;
  /** The template text after the frontmatter, given to the writer. */
  body: string;
};

export function parseTemplate(pageType: string, source: string): Template {
  const m = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`Template ${pageType} has no frontmatter`);
  const meta = new Map<string, string>();
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const list = (key: string) =>
    (meta.get(key) ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

  const target = meta.get("target");
  if (!TARGETS.includes(target as PageTarget)) {
    throw new Error(`Template ${pageType}: target must be one of ${TARGETS.join(", ")}`);
  }
  const words = (meta.get("words") ?? "").match(/^(\d+)\s*-\s*(\d+)$/);
  if (!words) throw new Error(`Template ${pageType}: words must look like "600-1200"`);

  return {
    pageType,
    target: target as PageTarget,
    words: { min: Number(words[1]), max: Number(words[2]) },
    requiredHeadings: list("required_headings"),
    requiredComponents: list("required_components"),
    maxTables: meta.has("max_tables") ? Number(meta.get("max_tables")) : 1,
    h2PerTour: meta.get("h2_per_tour") === "true",
    schemaType: meta.get("schema_type") || undefined,
    body: m[2].trim(),
  };
}
