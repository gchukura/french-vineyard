import "server-only";

import { latestDate } from "@/lib/content";
import { areasIn, getSiteData, townsIn, type SiteData } from "@/lib/data";
import type { SitemapEntry } from "@/lib/sitemap";
import {
  LEGAL_LINKS,
  PLAN_INDEX_HREF,
  REGIONS_INDEX_HREF,
  STAY_INDEX_HREF,
  TOURS_INDEX_HREF,
  areaHref,
  articleHref,
  regionHref,
  toursHref,
  townHref,
} from "@/lib/site";

/** One child sitemap per content type, plus images. */
export const SITEMAP_TYPES = [
  "pages",
  "regions",
  "areas",
  "towns",
  "articles",
  "tours",
  "images",
] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];

export const sitemapPath = (type: SitemapType) => `/sitemaps/${type}.xml`;

function entries(d: SiteData, type: SitemapType): SitemapEntry[] {
  const articleDates = d.articles.map((a) => a.updated_at ?? a.published_at);
  switch (type) {
    case "pages":
      return [
        {
          path: "/",
          lastmod: latestDate([...d.regions.map((r) => r.updated_at), ...articleDates]),
        },
        { path: REGIONS_INDEX_HREF, lastmod: latestDate(d.regions.map((r) => r.updated_at)) },
        {
          path: STAY_INDEX_HREF,
          lastmod: latestDate(
            d.articles.filter((a) => a.page_type === "hotel_roundup").map((a) => a.updated_at),
          ),
        },
        {
          path: PLAN_INDEX_HREF,
          lastmod: latestDate(
            d.articles.filter((a) => a.page_type === "practical").map((a) => a.updated_at),
          ),
        },
        ...LEGAL_LINKS.map((l) => ({ path: l.href })),
      ];
    case "regions":
      return d.regions.map((r) => ({
        path: regionHref(r.slug),
        lastmod: r.updated_at?.slice(0, 10),
      }));
    case "areas":
      return d.regions.flatMap((r) =>
        areasIn(d, r.slug).map((a) => ({
          path: areaHref(r.slug, a.slug),
          lastmod: latestDate(townsIn(d, r.slug, a.slug).map((t) => t.updated_at)),
        })),
      );
    case "towns":
      return d.towns.map((t) => ({ path: townHref(t.slug), lastmod: t.updated_at?.slice(0, 10) }));
    case "articles":
      return d.articles.map((a) => ({
        path: articleHref(a),
        lastmod: latestDate([a.updated_at, a.published_at]),
      }));
    case "tours":
      return [
        { path: TOURS_INDEX_HREF, lastmod: latestDate(d.tours.map((t) => t.last_checked)) },
        ...d.regions
          .filter((r) => d.tours.some((t) => t.region_slug === r.slug))
          .map((r) => ({
            path: toursHref(r.slug),
            lastmod: latestDate(
              d.tours.filter((t) => t.region_slug === r.slug).map((t) => t.last_checked),
            ),
          })),
      ];
    case "images": {
      // Hero images of every published page, captioned from the Images tab when listed.
      const caption = (src: string) => d.images.find((i) => i.url === src)?.alt;
      const withHero = [
        ...d.regions.map((r) => ({ path: regionHref(r.slug), src: r.hero_image, title: r.name })),
        ...d.subRegions.map((s) => ({
          path: areaHref(s.region_slug, s.slug),
          src: s.hero_image,
          title: s.name,
        })),
        ...d.towns.map((t) => ({ path: townHref(t.slug), src: t.hero_image, title: t.name })),
        ...d.articles.map((a) => ({ path: articleHref(a), src: a.hero_image, title: a.title })),
      ];
      return withHero.flatMap((p) =>
        p.src
          ? [{ path: p.path, images: [{ loc: p.src, title: p.title, caption: caption(p.src) }] }]
          : [],
      );
    }
  }
}

export async function sitemapEntries(type: SitemapType): Promise<SitemapEntry[]> {
  return entries(await getSiteData(), type);
}

export async function sitemapIndexEntries() {
  const d = await getSiteData();
  return SITEMAP_TYPES.map((type) => ({
    path: sitemapPath(type),
    lastmod: latestDate(entries(d, type).map((e) => e.lastmod)),
  }));
}
