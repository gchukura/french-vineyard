import type { Metadata } from "next";

import { Card } from "@/components/Card";
import { ClosingStack } from "@/components/ClosingStack";
import { Faq } from "@/components/Faq";
import { Hero } from "@/components/Hero";
import { JsonLd } from "@/components/JsonLd";
import {
  CtaBand,
  PageBottom,
  RegionPicker,
  Section,
  StatCallouts,
  cardsGrid,
  wrap,
} from "@/components/page/blocks";
import { articleCard, regionCard } from "@/components/page/cards";
import { TourCard } from "@/components/TourCard";
import { configJson, configText, faqSchema, statsSchema } from "@/lib/config";
import { altFor, articlesFor, getSiteData, newest, siteLastUpdated } from "@/lib/data";
import { graph, organization, webSite } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import {
  DEFAULT_OG_IMAGE,
  REGIONS_INDEX_HREF,
  STAY_INDEX_HREF,
  TOURS_INDEX_HREF,
  regionHref,
} from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getSiteData();
  return pageMetadata({
    title: configText(d.config, "home_title") ?? "French wine regions for travellers",
    description:
      configText(d.config, "home_description") ??
      "Plan a trip to Champagne, Bordeaux and Burgundy: where to go, what to book and where to stay.",
    path: "/",
    image: configText(d.config, "home_hero_image") ?? d.regions[0]?.hero_image,
  });
}

export default async function Home() {
  const d = await getSiteData();
  const heroSrc =
    configText(d.config, "home_hero_image") ?? d.regions.find((r) => r.hero_image)?.hero_image;
  // The Images tab carries every photo's credit; the hero shows it like every other page does.
  const heroCredit = heroSrc ? d.images.find((i) => i.url === heroSrc) : undefined;
  const stats = configJson(d.config, "home_stats_json", statsSchema, []);
  const faq = configJson(d.config, "home_faq_json", faqSchema, []);
  const featured = d.tours.filter((t) => t.featured).slice(0, 8);
  const guides = newest(
    d.articles.filter((a) => a.page_type !== "hotel_roundup" && a.page_type !== "practical"),
  ).slice(0, 3);
  const roundups = newest(articlesFor(d, { page_type: "hotel_roundup" })).slice(0, 3);

  return (
    <main id="main">
      <Hero
        image={{
          src: heroSrc ?? DEFAULT_OG_IMAGE,
          alt: altFor(d, heroSrc),
          credit: heroCredit?.credit,
          license: heroCredit?.license,
          sourceUrl: heroCredit?.source_url,
        }}
        // The region picker overlaps the bottom of this hero, where the credit usually sits.
        creditAtTop
        eyebrow="An independent travel guide"
        title={configText(d.config, "home_h1") ?? "The wine regions of France, planned properly"}
        standfirst={
          configText(d.config, "home_standfirst") ??
          "Where to go, which cellars to book and where to sleep, region by region."
        }
      />
      <RegionPicker
        regions={d.regions.map((r) => ({ slug: r.slug, name: r.name, href: regionHref(r.slug) }))}
      />

      <div className={`${wrap} space-y-20 py-16`}>
        <StatCallouts stats={stats} />

        {featured.length ? (
          <Section
            title="Tours we recommend"
            action={{ label: "All tours", href: TOURS_INDEX_HREF }}
          >
            <div className={`${cardsGrid} lg:grid-cols-4`}>
              {featured.map((t) => (
                <TourCard key={t.id} tour={t} slot="home-featured" />
              ))}
            </div>
          </Section>
        ) : null}

        {d.regions.length ? (
          <Section title="Wine regions" action={{ label: "All regions", href: REGIONS_INDEX_HREF }}>
            <div className={cardsGrid}>
              {d.regions.map((r) => (
                <Card key={r.slug} {...regionCard(d, r)} ratio="4:3" />
              ))}
            </div>
          </Section>
        ) : null}

        {roundups.length ? (
          <Section
            title="Where to stay"
            action={{ label: "All places to stay", href: STAY_INDEX_HREF }}
          >
            <div className={cardsGrid}>
              {roundups.map((a) => (
                <Card key={a.slug} {...articleCard(d, a)} />
              ))}
            </div>
          </Section>
        ) : null}

        {guides.length ? (
          <Section title="Latest guides">
            <div className={cardsGrid}>
              {guides.map((a) => (
                <Card key={a.slug} {...articleCard(d, a)} />
              ))}
            </div>
          </Section>
        ) : null}

        <CtaBand
          title="Ready to plan your trip?"
          text="Start with a region, book one or two cellar visits, and leave time to wander."
          primary={{ label: "Browse tours", href: TOURS_INDEX_HREF }}
          secondary={{ label: "Find somewhere to stay", href: STAY_INDEX_HREF }}
        />

        {faq.length ? (
          <div className="max-w-3xl">
            <Faq items={faq} />
          </div>
        ) : null}
      </div>

      <PageBottom updated={siteLastUpdated(d)}>
        <ClosingStack
          related={d.regions.length > 3 ? d.regions.slice(3).map((r) => regionCard(d, r)) : []}
          cta={{
            title: "Not sure where to start?",
            text: "Each region guide covers when to go, how to get there and where to stay.",
            primary: { label: "Compare the regions", href: REGIONS_INDEX_HREF },
            secondary: { label: "Plan your trip", href: "/plan/" },
          }}
        />
      </PageBottom>
      <JsonLd data={graph(webSite(), organization())} />
    </main>
  );
}
