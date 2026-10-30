import { STATIC_PATHS, normalizePath } from "@/lib/route-guard";
import { articleHref, toursHref, townHref, type ArticlePageType } from "@/lib/site";

/**
 * Where the header's "Book a Tour" button goes: the tours page of the
 * region the visitor is reading about, or the all-regions tours page.
 */

type TownRef = { slug: string; region_slug: string };
type ArticleRef = {
  slug: string;
  page_type: ArticlePageType;
  region_slug?: string;
  town_slug?: string;
};

/** Town and article paths -> region slug. Region and tours paths are read from the URL. */
export function regionPathMap(towns: TownRef[], articles: ArticleRef[]): Record<string, string> {
  const map: Record<string, string> = {};
  const townRegion = new Map(towns.map((t) => [t.slug, t.region_slug]));
  for (const t of towns) map[townHref(t.slug)] = t.region_slug;
  for (const a of articles) {
    const region = a.region_slug || (a.town_slug ? townRegion.get(a.town_slug) : undefined);
    if (region) map[articleHref(a)] = region;
  }
  return map;
}

export function regionForPath(
  pathname: string,
  regionSlugs: string[],
  paths: Record<string, string>,
): string | undefined {
  const path = normalizePath(pathname);
  // Fixed routes are site-wide, even where an article slug shares the URL.
  if (STATIC_PATHS.has(path)) return undefined;
  const [first, second] = path.split("/").filter(Boolean);
  const fromUrl = first === "regions" || first === "tours" ? second : undefined;
  const region = fromUrl ?? paths[path];
  return region && regionSlugs.includes(region) ? region : undefined;
}

export function bookTourHref(
  pathname: string,
  regionSlugs: string[],
  paths: Record<string, string>,
): string {
  return toursHref(regionForPath(pathname, regionSlugs, paths));
}
