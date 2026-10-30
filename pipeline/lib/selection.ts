import { byRank, TIER_ORDER } from "@/lib/content";
import type { Hotel, Tour, Town } from "@/lib/sheet-schema";

import { distanceKm } from "./hotels";

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

/** A hotel as a draft brief carries it: its town's name and straight-line distance from the town's centre. */
export type BriefHotel = Hotel & { town_name?: string; km_from_town_centre?: number };

/**
 * Adds where each hotel is, from data the site already holds (the hotel's
 * and its town's coordinates), so a roundup can say which hotels are central
 * without guessing. Distances are straight-line, to one decimal.
 */
export function placeHotels(
  hotels: Hotel[],
  towns: Pick<Town, "slug" | "name" | "lat" | "lng">[],
): BriefHotel[] {
  return hotels.map((h) => {
    const town = towns.find((t) => t.slug === h.town_slug);
    const km =
      town?.lat != null && town.lng != null && h.lat != null && h.lng != null
        ? Math.round(
            distanceKm({ lat: h.lat, lng: h.lng }, { lat: town.lat, lng: town.lng }) * 10,
          ) / 10
        : undefined;
    return {
      ...h,
      ...(town ? { town_name: town.name } : {}),
      ...(km != null ? { km_from_town_centre: km } : {}),
    };
  });
}
