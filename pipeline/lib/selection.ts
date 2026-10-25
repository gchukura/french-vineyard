import { byRank, TIER_ORDER } from "@/lib/content";
import type { Hotel, Tour, Town } from "@/lib/sheet-schema";

/**
 * Tours for a page: published rows of the owner's Tours tab that match the
 * page's region, town and category, in the owner's rank order. This filters
 * the owner's list; it never adds or reorders tours.
 */
export function selectTours(
  tours: Tour[],
  { region, town, category }: { region?: string; town?: string; category?: string },
): Tour[] {
  const cat = category?.trim().toLowerCase();
  return byRank(
    tours.filter(
      (t) =>
        t.status === "published" &&
        (!region || t.region_slug === region) &&
        (!town || t.town_slug === town) &&
        (!cat || t.category?.trim().toLowerCase() === cat),
    ),
  );
}

/** Hotels in the page's town, or in every town of its region; budget to luxury. */
export function selectHotels(
  hotels: Hotel[],
  towns: Pick<Town, "slug" | "region_slug">[],
  { region, town }: { region?: string; town?: string },
): Hotel[] {
  const inRegion = new Set(towns.filter((t) => t.region_slug === region).map((t) => t.slug));
  const matches = hotels.filter((h) =>
    town ? h.town_slug === town : region ? inRegion.has(h.town_slug) : false,
  );
  return [...matches].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}
