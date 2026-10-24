import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClosingStack } from "@/components/ClosingStack";
import { Faq } from "@/components/Faq";
import { HotelCard } from "@/components/HotelCard";
import { JsonLd } from "@/components/JsonLd";
import { Map } from "@/components/map/Map";
import { Mdx } from "@/components/mdx/Mdx";
import {
  EstatesTable,
  GettingThere,
  PageBottom,
  PageTop,
  Section,
  cardsGrid,
  wrap,
} from "@/components/page/blocks";
import { articleCard, heroOf, hotelPin, townCard, townPin } from "@/components/page/cards";
import { TourCard } from "@/components/TourCard";
import { excerpt, hotelsByTier, paramsOrPlaceholder } from "@/lib/content";
import {
  articlesFor,
  estatesInTowns,
  findArea,
  findRegion,
  findTown,
  getSiteData,
  hotelsInTowns,
  toursFor,
  townsIn,
} from "@/lib/data";
import { graph, placeIn } from "@/lib/schema";
import { getRegions, getTowns } from "@/lib/sheets";
import { pageMetadata } from "@/lib/seo";
import {
  REGIONS_INDEX_HREF,
  STAY_INDEX_HREF,
  areaHref,
  regionHref,
  toursHref,
  townHref,
} from "@/lib/site";

const TIER_TITLE = { budget: "Budget", mid: "Mid-range", luxury: "Luxury" } as const;

export async function generateStaticParams() {
  const published = new Set((await getRegions()).map((r) => r.slug));
  return paramsOrPlaceholder(
    "town",
    (await getTowns()).filter((t) => published.has(t.region_slug)).map((t) => t.slug),
  );
}

export async function generateMetadata({ params }: PageProps<"/towns/[town]">): Promise<Metadata> {
  const { town } = await params;
  const d = await getSiteData();
  const t = findTown(d, town);
  if (!t) return {};
  const r = findRegion(d, t.region_slug);
  return pageMetadata({
    title: `${t.name}${r ? `, ${r.name}` : ""}: estates, hotels and tours`,
    description: excerpt(t.intro_mdx),
    path: townHref(t.slug),
    image: t.hero_image ?? r?.hero_image,
  });
}

export default async function TownPage({ params }: PageProps<"/towns/[town]">) {
  const { town } = await params;
  const d = await getSiteData();
  const t = findTown(d, town);
  const r = t ? findRegion(d, t.region_slug) : undefined;
  if (!t || !r) notFound();

  const area = t.subregion_slug ? findArea(d, r.slug, t.subregion_slug) : undefined;
  const estates = t.estates_json.length
    ? d.estates.filter((e) => t.estates_json.includes(e.id))
    : estatesInTowns(d, [t.slug]);
  const hotels = hotelsInTowns(d, [t.slug]);
  const townTours = toursFor(d, r.slug, [t.slug]);
  const tours = (townTours.length ? townTours : toursFor(d, r.slug)).slice(0, 3);
  const pins = [...townPin(t), ...hotels.flatMap(hotelPin)];
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Wine Regions", href: REGIONS_INDEX_HREF },
    { name: r.name, href: regionHref(r.slug) },
    ...(area ? [{ name: area.name, href: areaHref(r.slug, area.slug) }] : []),
    { name: t.name, href: townHref(t.slug) },
  ];
  const siblings = townsIn(d, r.slug).filter((x) => x.slug !== t.slug);
  // This town's articles, then neighbouring towns, then the region's other guides.
  const townArticles = articlesFor(d, { town_slug: t.slug });
  const related = [
    ...townArticles.map((a) => articleCard(d, a)),
    ...siblings.map((x) => townCard(d, x)),
    ...articlesFor(d, { region_slug: r.slug })
      .filter((a) => !townArticles.includes(a))
      .map((a) => articleCard(d, a)),
  ].slice(0, 3);

  return (
    <main id="main">
      <PageTop
        eyebrow={area ? `${area.name} · ${r.name}` : r.name}
        title={t.name}
        image={heroOf(d, t)}
        crumbs={crumbs}
      />
      <div className={`${wrap} space-y-16 py-10`}>
        <Mdx source={t.intro_mdx} />

        {pins.length ? (
          <Section title={`Map of ${t.name}`}>
            <Map pins={pins} label={`Map of ${t.name} and its hotels`} />
          </Section>
        ) : null}

        <Mdx source={t.body_mdx} />

        {t.station ? (
          <Section title="Getting there">
            <GettingThere
              name={t.name}
              station={t.station}
              tgv={r.tgv_from_paris}
              airport={r.airport}
            />
          </Section>
        ) : null}

        {estates.length ? (
          <Section title={`Estates in and around ${t.name}`}>
            <EstatesTable estates={estates} towns={townsIn(d, r.slug)} />
          </Section>
        ) : null}

        {hotels.length ? (
          <Section
            title={`Where to stay in ${t.name}`}
            action={{ label: "All places to stay", href: STAY_INDEX_HREF }}
          >
            <div className="space-y-10">
              {hotelsByTier(hotels).map(([tier, list]) => (
                <div key={tier}>
                  <h3 className="text-xl">{TIER_TITLE[tier]}</h3>
                  <div className={`${cardsGrid} mt-4`}>
                    {list.map((h) => (
                      <HotelCard key={h.id} hotel={h} slot="town-hotels" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {t.faq_json.length ? (
          <div className="max-w-3xl">
            <Faq items={t.faq_json} />
          </div>
        ) : null}

        {tours.length ? (
          <Section
            title={`Tours from ${t.name}`}
            action={{ label: `All ${r.name} tours`, href: toursHref(r.slug) }}
          >
            <div className={cardsGrid}>
              {tours.map((x) => (
                <TourCard key={x.id} tour={x} slot="town-tours" />
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      <PageBottom updated={t.updated_at}>
        <ClosingStack
          related={related}
          cta={{
            title: `More of ${r.name}`,
            primary: { label: `Book a ${r.name} tour`, href: toursHref(r.slug) },
            secondary: { label: `The ${r.name} guide`, href: regionHref(r.slug) },
          }}
        />
      </PageBottom>
      <JsonLd
        data={graph(
          placeIn(
            {
              name: t.name,
              href: townHref(t.slug),
              description: excerpt(t.intro_mdx),
              image: t.hero_image,
              lat: t.lat,
              lng: t.lng,
            },
            { name: r.name, href: regionHref(r.slug) },
            "City",
          ),
        )}
      />
    </main>
  );
}
