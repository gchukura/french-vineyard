import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Card } from "@/components/Card";
import { ClosingStack } from "@/components/ClosingStack";
import { FactStrip, type Fact } from "@/components/FactStrip";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { Map } from "@/components/map/Map";
import { Mdx } from "@/components/mdx/Mdx";
import {
  GettingThere,
  MonthTable,
  PageBottom,
  PageTop,
  Section,
  StayByTownTable,
  cardsGrid,
  wrap,
} from "@/components/page/blocks";
import {
  areaCard,
  areaPin,
  articleCard,
  heroOf,
  regionCard,
  townPin,
} from "@/components/page/cards";
import { TourCard } from "@/components/TourCard";
import { excerpt, MONTHS, paramsOrPlaceholder, parseMonths } from "@/lib/content";
import {
  areasIn,
  articlesFor,
  findRegion,
  getSiteData,
  hotelsInTowns,
  toursFor,
  townsIn,
  type SiteData,
} from "@/lib/data";
import { graph, touristDestination, type FaqItem } from "@/lib/schema";
import { getRegions, type Region } from "@/lib/sheets";
import { pageMetadata } from "@/lib/seo";
import {
  REGIONS_INDEX_HREF,
  STAY_INDEX_HREF,
  areaHref,
  articleHref,
  regionHref,
  toursHref,
  townHref,
} from "@/lib/site";

export async function generateStaticParams() {
  return paramsOrPlaceholder(
    "region",
    (await getRegions()).map((r) => r.slug),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/regions/[region]">): Promise<Metadata> {
  const { region } = await params;
  const r = findRegion(await getSiteData(), region);
  if (!r) return {};
  return pageMetadata({
    title: `${r.name} wine region: a travel guide`,
    description: r.tagline ?? excerpt(r.intro_mdx),
    path: regionHref(r.slug),
    image: r.hero_image,
  });
}

function regionFacts(r: Region): [Fact, Fact, Fact, Fact] {
  const months = [...parseMonths(r.best_months)].sort((a, b) => a - b);
  return [
    { label: "From Paris", value: r.tgv_from_paris ?? "—" },
    {
      label: "Best months",
      value: months.length ? months.map((m) => MONTHS[m]!.slice(0, 3)).join(", ") : "—",
    },
    { label: "Signature grape", value: r.signature_grape ?? "—" },
    { label: "UNESCO listed", value: r.unesco ? "Yes" : "No" },
  ];
}

/** The region tab has no FAQ column, so the FAQ restates the page's own facts. */
function regionFaq(r: Region, d: SiteData): FaqItem[] {
  const months = [...parseMonths(r.best_months)].sort((a, b) => a - b).map((m) => MONTHS[m]);
  const towns = townsIn(d, r.slug);
  const out: FaqItem[] = [];
  if (months.length)
    out.push({
      question: `When is the best time to visit ${r.name}?`,
      answer: `${months.join(", ")} are the best months to visit.`,
    });
  if (r.tgv_from_paris || r.airport)
    out.push({
      question: `How do I get to ${r.name}?`,
      answer: [
        r.tgv_from_paris && `By TGV from Paris: ${r.tgv_from_paris}.`,
        r.airport && `The nearest airport is ${r.airport}.`,
      ]
        .filter(Boolean)
        .join(" "),
    });
  if (r.signature_grape)
    out.push({
      question: `Which grape is ${r.name} known for?`,
      answer: `${r.name} is best known for ${r.signature_grape}.`,
    });
  if (towns.length)
    out.push({
      question: `Which town is the best base in ${r.name}?`,
      answer: `This guide covers ${towns.map((t) => t.name).join(", ")}. Each town page lists where to stay and which estates to visit.`,
    });
  return out;
}

export default async function RegionPage({ params }: PageProps<"/regions/[region]">) {
  const { region } = await params;
  const d = await getSiteData();
  const r = findRegion(d, region);
  if (!r) notFound();

  const areas = areasIn(d, r.slug);
  const towns = townsIn(d, r.slug);
  const tours = toursFor(d, r.slug).slice(0, 5);
  const hotels = hotelsInTowns(
    d,
    towns.map((t) => t.slug),
  );
  const guides = articlesFor(d, { region_slug: r.slug });
  const gettingThere = d.articles.find(
    (a) => a.page_type === "practical" && a.region_slug === r.slug,
  );
  const faq = regionFaq(r, d);
  const pins = [...areas.flatMap((a) => areaPin(d, a)), ...towns.flatMap(townPin)];
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Wine Regions", href: REGIONS_INDEX_HREF },
    { name: r.name, href: regionHref(r.slug) },
  ];

  return (
    <main id="main">
      <PageTop
        eyebrow={r.name_fr && r.name_fr !== r.name ? r.name_fr : "Wine region"}
        title={r.name}
        standfirst={r.tagline}
        image={heroOf(d, r)}
        crumbs={crumbs}
      />
      <div className={`${wrap} space-y-16 py-10`}>
        <FactStrip facts={regionFacts(r)} />

        <Mdx source={r.intro_mdx} />

        {pins.length ? (
          <Section title={`Map of ${r.name}`}>
            <Map pins={pins} label={`Map of wine areas and towns in ${r.name}`} />
          </Section>
        ) : null}

        {tours.length ? (
          <Section
            title={`Top tours in ${r.name}`}
            action={{ label: `All ${r.name} tours`, href: toursHref(r.slug) }}
          >
            <div className={cardsGrid}>
              {tours.map((t) => (
                <TourCard key={t.id} tour={t} slot="region-tours" />
              ))}
            </div>
          </Section>
        ) : null}

        {areas.length ? (
          <Section title="Wine areas">
            <div className={cardsGrid}>
              {areas.map((a) => (
                <Card key={a.slug} {...areaCard(d, a)} />
              ))}
            </div>
          </Section>
        ) : null}

        {hotels.length ? (
          <Section
            title="Where to stay"
            action={{ label: "All places to stay", href: STAY_INDEX_HREF }}
          >
            <StayByTownTable towns={towns} hotels={hotels} />
          </Section>
        ) : null}

        {parseMonths(r.best_months).size ? (
          <Section title="When to go">
            <MonthTable name={r.name} best={parseMonths(r.best_months)} />
          </Section>
        ) : null}

        <Section title="Getting there">
          <GettingThere
            name={r.name}
            airport={r.airport}
            tgv={r.tgv_from_paris}
            moreHref={gettingThere ? articleHref(gettingThere) : undefined}
          />
        </Section>

        {guides.length ? (
          <Section title={`${r.name} guides`}>
            <div className={cardsGrid}>
              {guides.map((a) => (
                <Card key={a.slug} {...articleCard(d, a)} />
              ))}
            </div>
          </Section>
        ) : null}

        {faq.length ? (
          <div className="max-w-3xl">
            <Faq items={faq} />
          </div>
        ) : null}
      </div>

      <PageBottom updated={r.updated_at}>
        <ClosingStack
          related={d.regions.filter((x) => x.slug !== r.slug).map((x) => regionCard(d, x))}
          cta={{
            title: `Plan your ${r.name} trip`,
            primary: { label: `Book a ${r.name} tour`, href: toursHref(r.slug) },
            secondary: { label: "Where to stay", href: STAY_INDEX_HREF },
          }}
        />
      </PageBottom>
      <JsonLd
        data={graph(
          touristDestination(
            {
              name: r.name,
              href: regionHref(r.slug),
              description: r.tagline ?? excerpt(r.intro_mdx),
              image: r.hero_image,
              lat: r.lat,
              lng: r.lng,
            },
            [
              ...areas.map((a) => ({ name: a.name, href: areaHref(r.slug, a.slug) })),
              ...towns.map((t) => ({
                name: t.name,
                href: townHref(t.slug),
                lat: t.lat,
                lng: t.lng,
              })),
            ],
          ),
        )}
      />
    </main>
  );
}
