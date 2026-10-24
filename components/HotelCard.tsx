import { cardClass } from "@/components/Card";
import { Picture, SIZES } from "@/components/Picture";
import { ButtonLink, SmartLink } from "@/components/SmartLink";
import { formatEur } from "@/lib/format";
import { goHref } from "@/lib/links";
import type { Hotel } from "@/lib/sheet-schema";

const TIER_LABEL: Record<Hotel["tier"], string> = {
  budget: "Budget",
  mid: "Mid-range",
  luxury: "Luxury",
};

export type HotelCardHotel = Pick<
  Hotel,
  | "id"
  | "name"
  | "tier"
  | "booking_hotel_id"
  | "expedia_id"
  | "price_from_eur"
  | "blurb"
  | "best_for"
  | "image"
  | "image_credit"
>;

export function HotelCard({ hotel }: { hotel: HotelCardHotel }) {
  return (
    <article className={`flex flex-col overflow-hidden ${cardClass}`}>
      <div className="relative">
        <Picture
          image={hotel.image ? { src: hotel.image, alt: "" } : null}
          ratio="4 / 3"
          sizes={SIZES.card}
        />
        {hotel.image_credit ? (
          <p className="absolute right-2 bottom-1 text-[11px] text-chalk/90 [text-shadow:0_0_3px_#2b2320]">
            {hotel.image_credit}
          </p>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-button border border-tag px-2 py-0.5 text-xs font-semibold text-tag">
            {TIER_LABEL[hotel.tier]}
          </span>
          {hotel.price_from_eur != null ? (
            <p className="text-sm tabular-nums">
              From <span className="font-semibold">{formatEur(hotel.price_from_eur)}</span>
              <span className="text-muted"> a night</span>
            </p>
          ) : null}
        </div>
        <h3 className="mt-3 text-xl leading-snug">{hotel.name}</h3>
        {hotel.blurb ? <p className="mt-2 text-sm text-muted">{hotel.blurb}</p> : null}
        {hotel.best_for ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Best for:</span> {hotel.best_for}
          </p>
        ) : null}
        <div className="mt-auto pt-5">
          {hotel.booking_hotel_id ? (
            <ButtonLink href={goHref("booking", hotel.id)} className="w-full">
              Check prices
            </ButtonLink>
          ) : null}
          {hotel.expedia_id ? (
            <p className="mt-2 text-center text-sm">
              <SmartLink
                href={goHref("expedia", hotel.id)}
                className="inline-flex min-h-8 items-center text-primary underline underline-offset-2 dark:text-accent"
              >
                or compare on Expedia
              </SmartLink>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
