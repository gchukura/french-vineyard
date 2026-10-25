import { cardClass } from "@/components/Card";
import { Picture, SIZES } from "@/components/Picture";
import { Rating } from "@/components/Rating";
import { ButtonLink } from "@/components/SmartLink";
import { formatEur } from "@/lib/format";
import { goHref } from "@/lib/links";
import type { Tour } from "@/lib/sheet-schema";

export type TourCardTour = Pick<
  Tour,
  | "id"
  | "provider"
  | "title"
  | "badge"
  | "why_picked"
  | "image"
  | "price_from_eur"
  | "duration"
  | "rating"
  | "review_count"
  | "bullets_json"
  | "best_for"
>;

/**
 * A tour from the owner-curated Tours tab. Pages pass rows they were told to
 * show (an article's tour_ids); this component never picks tours itself.
 */
export function TourCard({ tour, pickup }: { tour: TourCardTour; pickup?: string }) {
  const meta = [
    tour.price_from_eur != null ? `From ${formatEur(tour.price_from_eur)}` : null,
    tour.duration,
    pickup,
  ].filter(Boolean);
  return (
    <article className={`flex flex-col overflow-hidden ${cardClass}`}>
      <div className="relative">
        <Picture
          image={tour.image ? { src: tour.image, alt: "" } : null}
          ratio="3 / 2"
          sizes={SIZES.card}
        />
        {tour.badge ? (
          <span className="absolute top-3 left-3 rounded-button bg-vine px-2.5 py-1 text-xs font-semibold text-chalk">
            {tour.badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl leading-snug">{tour.title}</h3>
        {tour.why_picked ? <p className="mt-2 text-sm italic">{tour.why_picked}</p> : null}
        {meta.length ? (
          <p className="mt-3 text-sm text-muted tabular-nums">
            {meta.map((m, i) => (
              <span key={i}>
                {i ? <span aria-hidden> · </span> : null}
                {m}
              </span>
            ))}
          </p>
        ) : null}
        {tour.rating != null ? (
          <div className="mt-2">
            <Rating rating={tour.rating} count={tour.review_count} />
          </div>
        ) : null}
        {tour.bullets_json.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {tour.bullets_json.slice(0, 3).map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-vine" />
                {b}
              </li>
            ))}
          </ul>
        ) : null}
        {tour.best_for ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Best for:</span> {tour.best_for}
          </p>
        ) : null}
        <div className="mt-auto pt-5">
          <ButtonLink href={goHref(tour.provider, tour.id)} className="w-full">
            See tour details
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
