import type { LayoutProps } from "@/components/articles/types";
import { roundupHotels } from "@/lib/data";
import { Map } from "@/components/map/Map";
import { Mdx } from "@/components/mdx/Mdx";
import { hotelPin } from "@/components/page/cards";
import { HotelTierFilter } from "@/components/page/HotelTierFilter";

export function HotelRoundupLayout({ d, article }: LayoutProps) {
  const hotels = roundupHotels(d, article);
  const pins = hotels.flatMap(hotelPin);
  return (
    <div className="space-y-12">
      <Mdx source={article.body_mdx} />
      {hotels.length ? (
        <section>
          <h2 className="text-3xl">The hotels</h2>
          <div className="mt-5">
            <HotelTierFilter hotels={hotels} />
          </div>
        </section>
      ) : null}
      {pins.length ? (
        <section>
          <h2 className="text-3xl">On the map</h2>
          <div className="mt-5">
            <Map pins={pins} label={`Map of hotels in ${article.title}`} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
