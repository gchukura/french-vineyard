import Link from "next/link";

import { ClosingStack } from "@/components/ClosingStack";
import { JsonLd } from "@/components/JsonLd";
import { PageBottom, PageTop, wrap } from "@/components/page/blocks";
import { regionCard } from "@/components/page/cards";
import { ToursBrowser } from "@/components/page/ToursBrowser";
import { latestDate } from "@/lib/content";
import type { SiteData } from "@/lib/data";
import { collectionPage, type Crumb } from "@/lib/schema";
import type { Region } from "@/lib/sheet-schema";
import { STAY_INDEX_HREF, TOURS_INDEX_HREF, regionHref, toursHref } from "@/lib/site";

/**
 * /tours/ and /tours/[region]/: only the owner's published Tours rows, in
 * the owner's rank order. There is no automatic feed.
 */
export function ToursPage({ d, region }: { d: SiteData; region?: Region }) {
  const tours = region ? d.tours.filter((t) => t.region_slug === region.slug) : d.tours;
  const href = toursHref(region?.slug);
  const title = region ? `${region.name} wine tours and tastings` : "Wine tours and tastings";
  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Tours & Tastings", href: TOURS_INDEX_HREF },
    ...(region ? [{ name: region.name, href }] : []),
  ];
  const regionsWithTours = d.regions.filter((r) => d.tours.some((t) => t.region_slug === r.slug));

  return (
    <main id="main">
      <PageTop
        eyebrow="Tours & tastings"
        title={title}
        standfirst="Every tour here is picked and ranked by hand. Prices are from prices; check details before you book."
        crumbs={crumbs}
      />
      <div className={`${wrap} space-y-10 py-10`}>
        {regionsWithTours.length > 1 || region ? (
          <nav aria-label="Tours by region">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={TOURS_INDEX_HREF}
                  aria-current={!region ? "page" : undefined}
                  className="inline-flex min-h-11 items-center rounded-button border border-primary px-4 text-sm font-semibold text-primary aria-[current=page]:bg-primary aria-[current=page]:text-on-primary dark:border-accent dark:text-accent"
                >
                  All regions
                </Link>
              </li>
              {regionsWithTours.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={toursHref(r.slug)}
                    aria-current={region?.slug === r.slug ? "page" : undefined}
                    className="inline-flex min-h-11 items-center rounded-button border border-primary px-4 text-sm font-semibold text-primary aria-[current=page]:bg-primary aria-[current=page]:text-on-primary dark:border-accent dark:text-accent"
                  >
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {tours.length ? (
          <ToursBrowser tours={tours} />
        ) : (
          <p>Tours for this region are on their way.</p>
        )}
      </div>
      <PageBottom updated={latestDate(tours.map((t) => t.last_checked))}>
        <ClosingStack
          related={(region ? d.regions.filter((r) => r.slug === region.slug) : d.regions).map((r) =>
            regionCard(d, r),
          )}
          cta={{
            title: "Book a tasting, then find a bed",
            primary: { label: "Where to stay", href: STAY_INDEX_HREF },
            secondary: region
              ? { label: `The ${region.name} guide`, href: regionHref(region.slug) }
              : { label: "Compare regions", href: "/regions/" },
          }}
        />
      </PageBottom>
      <JsonLd
        data={collectionPage(
          title,
          href,
          tours.map((t) => ({ name: t.title, node: { "@type": "TouristTrip", name: t.title } })),
        )}
      />
    </main>
  );
}
