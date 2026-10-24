import { Card, type CardProps } from "@/components/Card";
import { HotelCard, type HotelCardHotel } from "@/components/HotelCard";
import { Picture, SIZES, type ImageData } from "@/components/Picture";
import { ButtonLink } from "@/components/SmartLink";
import { TourCard, type TourCardTour } from "@/components/TourCard";

type Cta = { label: string; href: string };

const grid = "mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

/**
 * The end-of-page stack. Every section is optional; pass the tours and hotels
 * the page's Sheet row lists (tour_ids, hotel_ids), never a computed pick.
 */
export function ClosingStack({
  tours = [],
  hotels = [],
  related = [],
  panorama,
  cta,
}: {
  tours?: TourCardTour[];
  hotels?: HotelCardHotel[];
  related?: CardProps[];
  panorama?: ImageData & { caption?: string };
  cta?: { title: string; text?: string; primary: Cta; secondary: Cta };
}) {
  return (
    <div className="space-y-16">
      {tours.length ? (
        <section>
          <h2 className="text-3xl">Ready to book a tasting?</h2>
          <div className={grid}>
            {tours.map((t) => (
              <TourCard key={t.id} tour={t} />
            ))}
          </div>
        </section>
      ) : null}
      {hotels.length ? (
        <section>
          <h2 className="text-3xl">Need somewhere to stay?</h2>
          <div className={grid}>
            {hotels.map((h) => (
              <HotelCard key={h.id} hotel={h} />
            ))}
          </div>
        </section>
      ) : null}
      {related.length ? (
        <section>
          <h2 className="text-3xl">Keep exploring</h2>
          <div className={grid}>
            {related.map((c) => (
              <Card key={c.href} {...c} />
            ))}
          </div>
        </section>
      ) : null}
      {panorama ? (
        <figure>
          <Picture image={panorama} ratio="21 / 9" sizes={SIZES.full} className="rounded-card" />
          {panorama.caption ? (
            <figcaption className="mt-2 text-sm text-muted">{panorama.caption}</figcaption>
          ) : null}
        </figure>
      ) : null}
      {cta ? (
        <section className="rounded-card bg-surface px-6 py-10 text-center">
          <h2 className="text-3xl">{cta.title}</h2>
          {cta.text ? <p className="mx-auto mt-3 max-w-xl text-muted">{cta.text}</p> : null}
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={cta.primary.href}>{cta.primary.label}</ButtonLink>
            <ButtonLink href={cta.secondary.href} variant="secondary">
              {cta.secondary.label}
            </ButtonLink>
          </div>
        </section>
      ) : null}
    </div>
  );
}
