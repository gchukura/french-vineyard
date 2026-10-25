import { getSiteData } from "@/lib/data";
import { areaHref, articleHref, regionHref, toursHref, townHref } from "@/lib/site";

/**
 * Every published content path, for proxy.ts's 404 check. Built from the
 * cached Sheet loaders, so it is prerendered and refreshed by the same tag
 * revalidation as the pages.
 */
export async function GET() {
  const d = await getSiteData();
  const paths = [
    ...d.regions.flatMap((r) => [regionHref(r.slug), toursHref(r.slug)]),
    ...d.subRegions.map((s) => areaHref(s.region_slug, s.slug)),
    ...d.towns.map((t) => townHref(t.slug)),
    ...d.articles.map((a) => articleHref(a)),
  ];
  return Response.json({ paths });
}
