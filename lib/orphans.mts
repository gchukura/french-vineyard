/**
 * Orphan check: every published page needs at least MIN_INBOUND other pages
 * linking to it. Pure functions; scripts/orphan-check.ts feeds it the
 * prerendered HTML from `next build`. Relative imports only, so Node can run
 * the script directly.
 */

export const MIN_INBOUND = 3;

/** Paths that are not content pages and are never counted. */
const IGNORED = /^\/(?:go|api|_next|styleguide|sitemaps)\//;

/** Normalises an href to a site path with a trailing slash, or null if not an internal page. */
export function internalPath(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const path = href.split(/[?#]/)[0]!;
  if (IGNORED.test(path)) return null;
  const last = path.split("/").pop() ?? "";
  if (last.includes(".")) return null; // files: /sitemap.xml, /og-default.jpg
  return path.endsWith("/") ? path : `${path}/`;
}

/** Internal page paths linked from an HTML document's <a href> attributes. */
export function linksIn(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]+)"/gi)) {
    const p = internalPath(m[1]!.replace(/&amp;/g, "&"));
    if (p) out.add(p);
  }
  return out;
}

export type OrphanReport = { path: string; inbound: number; from: string[] }[];

/** Pages with fewer than `min` distinct other pages linking to them. */
export function findOrphans(pages: Map<string, Set<string>>, min = MIN_INBOUND): OrphanReport {
  const inbound = new Map<string, Set<string>>([...pages.keys()].map((p) => [p, new Set()]));
  for (const [source, links] of pages) {
    for (const target of links) {
      if (target !== source) inbound.get(target)?.add(source);
    }
  }
  return [...inbound]
    .filter(([, from]) => from.size < min)
    .map(([path, from]) => ({ path, inbound: from.size, from: [...from].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** ".next/server/app/regions/champagne.html" (relative "regions/champagne.html") -> "/regions/champagne/". */
export function routeFromHtmlFile(relative: string): string {
  const route = relative
    .replace(/\\/g, "/")
    .replace(/\.html$/, "")
    .replace(/(^|\/)index$/, "");
  return route ? `/${route}/` : "/";
}
