import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClosingStack } from "@/components/ClosingStack";
import { JsonLd } from "@/components/JsonLd";
import { Mdx } from "@/components/mdx/Mdx";
import {
  EstatesTable,
  PageBottom,
  PageTop,
  Section,
  cardsGrid,
  wrap,
} from "@/components/page/blocks";
import { areaCard, articleCard, heroOf } from "@/components/page/cards";
import { PracticalTable } from "@/components/PracticalTable";
import { TourCard } from "@/components/TourCard";
import { centroid, excerpt, latestDate, PLACEHOLDER } from "@/lib/content";
import {
  areasIn,
  articlesFor,
  estatesInTowns,
  findArea,
  findRegion,
  getSiteData,
  toursFor,
  townsIn,
} from "@/lib/data";
import { graph, placeIn } from "@/lib/schema";
import { getRegions, getSubRegions } from "@/lib/sheets";
import { pageMetadata } from "@/lib/seo";
import { REGIONS_INDEX_HREF, areaHref, regionHref, toursHref, townHref } from "@/lib/site";

export async function generateStaticParams() {
  const published = new Set((await getRegions()).map((r) => r.slug));
  const areas = (await getSubRegions()).filter((s) => published.has(s.region_slug));
  // Cache Components needs at least one param; the page 404s on the placeholder.
  if (!areas.length) return [{ region: PLACEHOLDER, area: PLACEHOLDER }];
  return areas.map((s) => ({ region: s.region_slug, area: s.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/regions/[region]/[area]">): Promise<Metadata> {
  const { region, area } = await params;
  const d = await getSiteData();
  const a = findArea(d, region, area);
  const r = findRegion(d, region);
  if (!a || !r) return {};
  return pageMetadata({
    title: `${a.name}, ${r.name}: appellations, estates and towns`,
    description: excerpt(a.intro_mdx),
    path: areaHref(r.slug, a.slug),
    image: a.hero_image ?? r.hero_image,
  });
}

/** appellation_facts_json -> table rows; nested values are shown as text. */
function factRows(facts: Record<string, unknown>): string[][] {
  return Object.entries(facts).map(([k, v]) => [
    k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    Array.isArray(v)
      ? v.join(", ")
      : typeof v === "object" && v !== null
        ? JSON.stringify(v)
        : String(v),
  ]);
}

export default async function AreaPage({ params }: PageProps<"/regions/[region]/[area]">) {
  const { region, area } = await params;
  const d = await getSiteData();
  const r = findRegion(d, region);
  const a = findArea(d, region, area);
  if (!r || !a) notFound();

  const towns = townsIn(d, r.slug, a.slug);
  const townSlugs = towns.map((t) => t.slug);
  const estates = estatesInTowns(d, townSlugs);
  const areaTours = toursFor(d, r.slug, townSlugs);
  const tours = (areaTours.length ? areaTours : toursFor(d, r.slug)).slice(0, 3);
  const facts = factRows(a.appellation_facts_json);
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Wine Regions", href: REGIONS_INDEX_HREF },
    { name: r.name, href: regionHref(r.slug) },
    { name: a.name, href: areaHref(r.slug, a.slug) },
  ];
  const c = centroid(towns);

  return (
    <main id="main">
      <PageTop
        eyebrow={`${r.name} wine area`}
        title={a.name}
        image={heroOf(d, a)}
        crumbs={crumbs}
      />
      <div className={`${wrap} space-y-16 py-10`}>
        {facts.length ? (
          <PracticalTable
            caption={`${a.name} at a glance`}
            columns={["Fact", "Detail"]}
            rows={facts}
          />
        ) : null}

        <Mdx source={a.intro_mdx} />

        {estates.length ? (
          <Section title={`Estates to visit in ${a.name}`}>
            <EstatesTable estates={estates} towns={towns} />
          </Section>
        ) : null}

        {tours.length ? (
          <Section title="Tours" action={{ label: `All ${r.name} tours`, href: toursHref(r.slug) }}>
            <div className={cardsGrid}>
              {tours.map((t) => (
                <TourCard key={t.id} tour={t} slot="area-tours" />
              ))}
            </div>
          </Section>
        ) : null}

        {towns.length ? (
          <Section title={`Towns in ${a.name}`}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {towns.map((t) => (
                <li key={t.slug}>
                  <Link
                    href={townHref(t.slug)}
                    className="flex min-h-11 items-center justify-between rounded-card border border-transparent bg-surface px-4 py-3 font-heading text-lg font-semibold hover:border-accent"
                  >
                    {t.name}
                    <span aria-hidden className="text-accent">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <PageBottom updated={latestDate(towns.map((t) => t.updated_at)) ?? r.updated_at}>
        <ClosingStack
          related={[
            ...areasIn(d, r.slug)
              .filter((x) => x.slug !== a.slug)
              .map((x) => areaCard(d, x)),
            ...articlesFor(d, { region_slug: r.slug }).map((x) => articleCard(d, x)),
          ].slice(0, 3)}
          cta={{
            title: `Explore more of ${r.name}`,
            primary: { label: `Book a ${r.name} tour`, href: toursHref(r.slug) },
            secondary: { label: `Back to ${r.name}`, href: regionHref(r.slug) },
          }}
        />
      </PageBottom>
      <JsonLd
        data={graph(
          placeIn(
            {
              name: a.name,
              href: areaHref(r.slug, a.slug),
              description: excerpt(a.intro_mdx),
              image: a.hero_image,
              ...c,
            },
            { name: r.name, href: regionHref(r.slug) },
          ),
        )}
      />
    </main>
  );
}
