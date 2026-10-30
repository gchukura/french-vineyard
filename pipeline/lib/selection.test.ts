import { describe, expect, it } from "vitest";

import type { Hotel } from "@/lib/sheet-schema";

import { hotelBrief } from "./prompt";
import { placeHotels } from "./selection";

const hotel = (over: Partial<Hotel>): Hotel =>
  ({
    id: "booking-x",
    name: "Hôtel X",
    town_slug: "reims",
    tier: "mid",
    status: "published",
    ...over,
  }) as Hotel;

const towns = [
  { slug: "reims", name: "Reims", lat: 49.2583, lng: 4.0317 },
  { slug: "epernay", name: "Épernay" },
];

describe("placeHotels", () => {
  it("adds the town's name and the distance from its centre, to one decimal", () => {
    const [h] = placeHotels([hotel({ lat: 49.2675, lng: 4.0317 })], towns);
    expect(h.town_name).toBe("Reims");
    // 0.0092° of latitude is about 1.02 km.
    expect(h.km_from_town_centre).toBe(1);
  });

  it("leaves the distance out when either point has no coordinates", () => {
    const [noHotel, noTown] = placeHotels(
      [hotel({}), hotel({ town_slug: "epernay", lat: 49.04, lng: 3.95 })],
      towns,
    );
    expect(noHotel.km_from_town_centre).toBeUndefined();
    expect(noTown).toMatchObject({ town_name: "Épernay" });
    expect(noTown.km_from_town_centre).toBeUndefined();
  });

  it("puts address, stars, town and distance in the writer's brief", () => {
    const [h] = placeHotels(
      [hotel({ lat: 49.2675, lng: 4.0317, address: "17 rue Buirette, Reims", stars: "4" })],
      towns,
    );
    expect(hotelBrief(h)).toMatchObject({
      town: "Reims",
      address: "17 rue Buirette, Reims",
      stars: "4",
      distance_from_town_centre: "about 1 km (straight line) from the center of Reims",
    });
  });
});
