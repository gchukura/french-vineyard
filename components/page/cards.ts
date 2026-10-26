import type { CardProps } from "@/components/Card";
import type { MapPin } from "@/components/map/MapCanvas";
import { centroid, excerpt } from "@/lib/content";
import { altFor, townsIn, type SiteData } from "@/lib/data";
import type { Article, Hotel, Region, SubRegion, Town } from "@/lib/sheet-schema";
import { areaHref, articleHref, regionHref, townHref } from "@/lib/site";

/** Row -> card / pin mappers shared by the templates. */

const TYPE_LABEL: Record<Article["page_type"], string> = {
  guide: "Guide",
  ranked_list: "Best of",
  hotel_roundup: "Where to stay",
  itinerary: "Itinerary",
  practical: "Plan your trip",
};

const img = (d: SiteData, src?: string) => (src ? { src, alt: altFor(d, src) } : null);

export const articleCard = (d: SiteData, a: Article): CardProps => ({
  href: articleHref(a),
  title: a.title,
  eyebrow: TYPE_LABEL[a.page_type],
  description: a.standfirst ?? a.meta_description,
  image: img(d, a.hero_image),
});

export const regionCard = (d: SiteData, r: Region): CardProps => ({
  href: regionHref(r.slug),
  title: r.name,
  eyebrow: r.name_fr && r.name_fr !== r.name ? r.name_fr : "Wine region",
  description: r.tagline ?? excerpt(r.intro_mdx, 120),
  image: img(d, r.hero_image),
});

export const areaCard = (d: SiteData, s: SubRegion): CardProps => ({
  href: areaHref(s.region_slug, s.slug),
  title: s.name,
  eyebrow: "Wine area",
  description: excerpt(s.intro_mdx, 120),
  image: img(d, s.hero_image),
});

export const townCard = (d: SiteData, t: Town): CardProps => ({
  href: townHref(t.slug),
  title: t.name,
  eyebrow: "Town",
  description: excerpt(t.intro_mdx, 120),
  image: img(d, t.hero_image),
});

export const townPin = (t: Town): MapPin[] =>
  t.lat != null && t.lng != null
    ? [{ id: `town-${t.slug}`, name: t.name, lat: t.lat, lng: t.lng, href: townHref(t.slug) }]
    : [];

/** A subregion has no coordinates of its own; pin it at the centre of its towns. */
export function areaPin(d: SiteData, s: SubRegion): MapPin[] {
  const c = centroid(townsIn(d, s.region_slug, s.slug));
  return c
    ? [
        {
          id: `area-${s.slug}`,
          name: s.name,
          ...c,
          href: areaHref(s.region_slug, s.slug),
          description: "Wine area",
        },
      ]
    : [];
}

export const regionPin = (r: Region): MapPin[] =>
  r.lat != null && r.lng != null
    ? [{ id: `region-${r.slug}`, name: r.name, lat: r.lat, lng: r.lng, href: regionHref(r.slug) }]
    : [];

export const hotelPin = (h: Hotel): MapPin[] =>
  h.lat != null && h.lng != null
    ? [{ id: `hotel-${h.id}`, name: h.name, lat: h.lat, lng: h.lng, description: h.best_for }]
    : [];

export const heroOf = (
  d: SiteData,
  row: {
    hero_image?: string;
    hero_credit?: string;
    hero_license?: string;
    hero_source_url?: string;
  },
) =>
  row.hero_image
    ? {
        src: row.hero_image,
        alt: altFor(d, row.hero_image),
        credit: row.hero_credit,
        license: row.hero_license,
        sourceUrl: row.hero_source_url,
      }
    : null;
