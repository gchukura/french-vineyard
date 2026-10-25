import { NextResponse, type NextRequest } from "next/server";

import { NOT_FOUND_REWRITE, checkPath, isContentPath } from "@/lib/route-guard";

/**
 * Real 404s for unpublished content URLs (see lib/route-guard.ts). The
 * published list comes from /api/published-paths/, held for up to a
 * minute per instance. If it can't be fetched, requests pass through and
 * the page's own notFound() still renders (as a noindex soft 404).
 */

const TTL_MS = 60_000;
let cached: { at: number; paths: Set<string> } | undefined;

async function publishedPaths(origin: string): Promise<Set<string> | undefined> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.paths;
  try {
    const res = await fetch(`${origin}/api/published-paths/`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return cached?.paths;
    const { paths } = (await res.json()) as { paths: string[] };
    cached = { at: Date.now(), paths: new Set(paths) };
    return cached.paths;
  } catch {
    return cached?.paths;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  if (!isContentPath(pathname)) return;
  const published = await publishedPaths(origin);
  if (!published || checkPath(pathname, published) === "pass") return;
  return NextResponse.rewrite(new URL(NOT_FOUND_REWRITE, origin));
}

export const config = {
  // Pages only: skip Next internals, API and redirect routes, sitemaps and files.
  matcher: ["/((?!_next/|api/|go/|sitemaps/|__not-found__/|.*\\.[a-z0-9]+$).*)"],
};
