import "server-only";

import { configText, toConfig, type Config } from "@/lib/config";
import { byRank, latestDate, pickByIds } from "@/lib/content";
import {
  getArticles,
  getConfigRows,
  getEstates,
  getHotels,
  getImages,
  getRegions,
  getSubRegions,
  getTours,
  getTowns,
  type Article,
  type Estate,
  type Hotel,
  type ImageRow,
  type Region,
  type SubRegion,
  type Tour,
  type Town,
} from "@/lib/sheets";
import { articleHref, RESERVED_ROOT_SLUGS } from "@/lib/site";

/**
 * Everything published, loaded through lib/sheets.ts (each getter is cached
 * and tagged per tab), with the lookups the templates share.
 */
export type SiteData = {
  regions: Region[];
  subRegions: SubRegion[];
  towns: Town[];
  articles: Article[];
  hotels: Hotel[];
  tours: Tour[];
  estates: Estate[];
  images: ImageRow[];
  config: Config;
};

export async function getSiteData(): Promise<SiteData> {
  const [regions, subRegions, towns, articles, hotels, tours, estates, images, configRows] =
    await Promise.all([
      getRegions(),
      getSubRegions(),
      getTowns(),
      getArticles(),
      getHotels(),
      getTours(),
      getEstates(),
      getImages(),
      getConfigRows(),
    ]);
  const regionSlugs = new Set(regions.map((r) => r.slug));
  return {
    regions,
    // Children of unpublished regions stay hidden.
    subRegions: subRegions.filter((s) => regionSlugs.has(s.region_slug)),
    towns: towns.filter((t) => regionSlugs.has(t.region_slug)),
    // A root-level article can't take a slug a route already owns ("tours").
    articles: articles.filter(
      (a) => articleHref(a).split("/").length > 3 || !RESERVED_ROOT_SLUGS.has(a.slug),
    ),
    hotels,
    tours: byRank(tours),
    estates,
    images,
    config: toConfig(configRows),
  };
}

export const findRegion = (d: SiteData, slug: string) => d.regions.find((r) => r.slug === slug);
export const findArea = (d: SiteData, region: string, slug: string) =>
  d.subRegions.find((s) => s.region_slug === region && s.slug === slug);
export const findTown = (d: SiteData, slug: string) => d.towns.find((t) => t.slug === slug);

export const townsIn = (d: SiteData, region: string, area?: string) =>
  d.towns.filter((t) => t.region_slug === region && (!area || t.subregion_slug === area));

export const areasIn = (d: SiteData, region: string) =>
  d.subRegions.filter((s) => s.region_slug === region);

export const hotelsInTowns = (d: SiteData, towns: string[]) =>
  d.hotels.filter((h) => towns.includes(h.town_slug));

export const estatesInTowns = (d: SiteData, towns: string[]) =>
  d.estates.filter((e) => towns.includes(e.town_slug));

/** The owner's tours for a region (optionally narrowed to towns), in rank order. */
export function toursFor(d: SiteData, region: string, towns?: string[]): Tour[] {
  return d.tours.filter(
    (t) =>
      t.region_slug === region && (!towns || (t.town_slug != null && towns.includes(t.town_slug))),
  );
}

export const articlesFor = (
  d: SiteData,
  filter: Partial<Pick<Article, "region_slug" | "town_slug" | "page_type">>,
) =>
  d.articles.filter((a) =>
    Object.entries(filter).every(([k, v]) => v === undefined || a[k as keyof Article] === v),
  );

/** Newest first by published_at, then updated_at. */
export const newest = (articles: Article[]) =>
  [...articles].sort((a, b) =>
    (b.published_at ?? b.updated_at ?? "").localeCompare(a.published_at ?? a.updated_at ?? ""),
  );

/** Alt text for an image URL from the Images tab, or "" (decorative) if none. */
export function altFor(d: SiteData, url?: string, fallback = ""): string {
  if (!url) return fallback;
  return d.images.find((i) => i.url === url)?.alt ?? fallback;
}

export function siteLastUpdated(d: SiteData): string | undefined {
  return latestDate([
    ...d.regions.map((r) => r.updated_at),
    ...d.towns.map((t) => t.updated_at),
    ...d.articles.map((a) => a.updated_at ?? a.published_at),
  ]);
}

export const configValue = configText;

/** Hotels a roundup lists: its hotel_ids, or every hotel in its town/region if none are listed. */
export function roundupHotels(d: SiteData, a: Article): Hotel[] {
  if (a.hotel_ids.length) return pickByIds(d.hotels, a.hotel_ids);
  if (a.town_slug) return d.hotels.filter((h) => h.town_slug === a.town_slug);
  if (a.region_slug) {
    const towns = new Set(
      d.towns.filter((t) => t.region_slug === a.region_slug).map((t) => t.slug),
    );
    return d.hotels.filter((h) => towns.has(h.town_slug));
  }
  return [];
}
