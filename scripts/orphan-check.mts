/**
 * Build-time orphan check: fails the build if any published page has fewer
 * than MIN_INBOUND other pages linking to it. Reads the prerendered HTML
 * that `next build` leaves in .next/server/app. Runs on Node's built-in
 * TypeScript support (`node scripts/orphan-check.mts`), so imports are relative.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { MIN_INBOUND, findOrphans, linksIn, routeFromHtmlFile } from "../lib/orphans.mts";

const APP_DIR = join(process.cwd(), ".next", "server", "app");

/** Not content pages: Next internals, fallback shells for unknown params, the styleguide. */
const skip = (rel: string) =>
  /(^|\/)_/.test(rel) ||
  rel.includes("[") ||
  rel.includes("__placeholder__") ||
  rel.startsWith("styleguide");

async function htmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const pages = new Map<string, Set<string>>();
for (const file of await htmlFiles(APP_DIR)) {
  const rel = relative(APP_DIR, file);
  if (skip(rel)) continue;
  pages.set(routeFromHtmlFile(rel), linksIn(await readFile(file, "utf8")));
}

const orphans = findOrphans(pages);
if (orphans.length) {
  console.error(
    `\nOrphan check failed: ${orphans.length} page(s) with fewer than ${MIN_INBOUND} inbound internal links.\n`,
  );
  for (const o of orphans) {
    console.error(
      `  ${o.path}  ${o.inbound} inbound${o.from.length ? ` (from ${o.from.join(", ")})` : ""}`,
    );
  }
  console.error("\nLink to these pages from related content, or unpublish them.\n");
  process.exit(1);
}
console.log(
  `Orphan check passed: ${pages.size} pages, each with at least ${MIN_INBOUND} inbound links.`,
);
