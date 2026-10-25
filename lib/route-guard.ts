/**
 * Real 404s for unpublished content URLs. Under Cache Components a dynamic
 * page streams its shell before notFound() runs, so the status sticks at
 * 200. proxy.ts uses these checks to answer unknown content paths with a
 * true 404 before rendering starts. Pure functions; no Sheet access.
 */

/** Fixed routes: always served as-is. */
export const STATIC_PATHS = new Set([
  "/",
  "/regions/",
  "/tours/",
  "/where-to-stay/",
  "/plan/",
  "/about/",
  "/contact/",
  "/privacy-policy/",
  "/legal-notice/",
  "/image-credits/",
  "/styleguide/",
]);

/** Where proxy.ts rewrites unknown paths: no route matches it, so Next serves its 404. */
export const NOT_FOUND_REWRITE = "/__not-found__/missing/";

export function normalizePath(pathname: string): string {
  const p = pathname.split(/[?#]/)[0] || "/";
  return p.endsWith("/") ? p : `${p}/`;
}

/**
 * True when the path belongs to a dynamic content route, so whether it
 * exists depends on what is published:
 * /[slug]/, /regions/[region]/, /regions/[region]/[area]/, /towns/[town]/,
 * /tours/[region]/, /where-to-stay/[slug]/, /plan/[slug]/.
 */
export function isContentPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (STATIC_PATHS.has(path)) return false;
  const parts = path.split("/").filter(Boolean);
  if (parts.some((p) => p.includes("."))) return false; // files
  const [first, ...rest] = parts;
  if (!first) return false;
  if (first === "regions") return rest.length === 1 || rest.length === 2;
  // Their index pages are in STATIC_PATHS; "/towns/" has none and falls to /[slug]/.
  if (["towns", "tours", "where-to-stay", "plan"].includes(first)) return rest.length <= 1;
  return parts.length === 1;
}

/** "pass" to render normally, "not-found" to answer 404. */
export function checkPath(pathname: string, published: Set<string>): "pass" | "not-found" {
  if (!isContentPath(pathname)) return "pass";
  return published.has(normalizePath(pathname)) ? "pass" : "not-found";
}
