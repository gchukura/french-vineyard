import type { LayoutProps } from "@/components/articles/types";
import { Mdx } from "@/components/mdx/Mdx";
import { PracticalTable } from "@/components/PracticalTable";
import { pickByIds, splitDays } from "@/lib/content";
import { formatEur } from "@/lib/format";

/** "## Day n" sections as numbered blocks, then a cost table from the tours and hotels the article lists. */
export function ItineraryLayout({ d, article }: LayoutProps) {
  const { intro, days } = splitDays(article.body_mdx);
  const tours = pickByIds(d.tours, article.tour_ids).filter((t) => t.price_from_eur != null);
  const hotels = pickByIds(d.hotels, article.hotel_ids).filter((h) => h.price_from_eur != null);
  const nights = Math.max(days.length - 1, 1);
  const cheapestNight = hotels.length
    ? Math.min(...hotels.map((h) => h.price_from_eur!))
    : undefined;
  const toursTotal = tours.reduce((s, t) => s + t.price_from_eur!, 0);
  const costRows = [
    ...tours.map((t) => [t.title, "Tour, per person", formatEur(t.price_from_eur!)]),
    ...hotels.map((h) => [h.name, "Hotel, per night", formatEur(h.price_from_eur!)]),
  ];
  if (costRows.length) {
    costRows.push([
      "Indicative total",
      cheapestNight != null
        ? `Tours + ${nights} night${nights > 1 ? "s" : ""} at the lowest rate`
        : "Tours",
      formatEur(toursTotal + (cheapestNight ?? 0) * nights),
    ]);
  }

  return (
    <div className="space-y-12">
      <Mdx source={intro} />
      {days.length ? (
        <ol className="space-y-8">
          {days.map((day, i) => (
            <li key={day.title} className="rounded-card bg-surface p-6 sm:p-8">
              <section aria-labelledby={`day-${i + 1}`}>
                <p className="text-xs font-semibold tracking-widest text-tag uppercase">
                  Day {i + 1}
                </p>
                <h2 id={`day-${i + 1}`} className="mt-1 text-2xl">
                  {day.title.replace(/^day\s+\d+\s*[:–—-]?\s*/i, "") || day.title}
                </h2>
                <Mdx source={day.body} className="mt-4" />
              </section>
            </li>
          ))}
        </ol>
      ) : null}
      {costRows.length ? (
        <section>
          <h2 className="text-3xl">What it costs</h2>
          <div className="mt-5">
            <PracticalTable
              caption="From prices, per person, before extras"
              columns={["Item", "Basis", "From"]}
              rows={costRows}
              numeric={[2]}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
