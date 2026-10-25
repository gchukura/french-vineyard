import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/Card";
import { ClosingStack } from "@/components/ClosingStack";
import { FactStrip } from "@/components/FactStrip";
import { JsonLd } from "@/components/JsonLd";
import { Map } from "@/components/map/Map";
import { PageBottom, PageTop, Section, cardsGrid, wrap } from "@/components/page/blocks";
import { regionCard, regionPin } from "@/components/page/cards";
import { latestDate } from "@/lib/content";
import { areasIn, getSiteData } from "@/lib/data";
import { collectionPage } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import {
  REGIONS_INDEX_HREF,
  STAY_INDEX_HREF,
  TOURS_INDEX_HREF,
  areaHref,
  regionHref,
} from "@/lib/site";

const TITLE = "French wine regions";
const DESCRIPTION =
  "Compare France's wine regions for a trip: when to go, how to get there, and the towns to base yourself in.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: REGIONS_INDEX_HREF,
});

export default async function RegionsIndex() {
  const d = await getSiteData();
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Wine Regions", href: REGIONS_INDEX_HREF },
  ];
  const pins = d.regions.flatMap(regionPin);
  return (
    <main id="main">
      <PageTop eyebrow="Wine regions" title={TITLE} standfirst={DESCRIPTION} crumbs={crumbs} />
      <div className={`${wrap} space-y-16 py-10`}>
        <FactStrip
          facts={[
            { label: "Regions", value: String(d.regions.length) },
            { label: "Wine areas", value: String(d.subRegions.length) },
            { label: "Towns", value: String(d.towns.length) },
            { label: "Estates listed", value: String(d.estates.length) },
          ]}
        />
        <div className={cardsGrid}>
          {d.regions.map((r) => (
            <Card key={r.slug} {...regionCard(d, r)} ratio="4:3" />
          ))}
        </div>
        {pins.length ? (
          <Section title="On the map">
            <Map pins={pins} label="Map of French wine regions" />
          </Section>
        ) : null}
        {d.regions.some((r) => areasIn(d, r.slug).length) ? (
          <Section title="Wine areas by region">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {d.regions.map((r) => {
                const areas = areasIn(d, r.slug);
                return areas.length ? (
                  <div key={r.slug}>
                    <h3 className="text-xl">
                      <Link href={regionHref(r.slug)} className="hover:underline">
                        {r.name}
                      </Link>
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {areas.map((a) => (
                        <li key={a.slug}>
                          <Link
                            href={areaHref(r.slug, a.slug)}
                            className="inline-flex min-h-8 items-center underline-offset-2 hover:underline"
                          >
                            {a.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })}
            </div>
          </Section>
        ) : null}
      </div>
      <PageBottom updated={latestDate(d.regions.map((r) => r.updated_at))}>
        <ClosingStack
          cta={{
            title: "Already picked a region?",
            primary: { label: "Browse tours", href: TOURS_INDEX_HREF },
            secondary: { label: "Where to stay", href: STAY_INDEX_HREF },
          }}
        />
      </PageBottom>
      <JsonLd
        data={collectionPage(
          TITLE,
          REGIONS_INDEX_HREF,
          d.regions.map((r) => ({ name: r.name, href: regionHref(r.slug) })),
        )}
      />
    </main>
  );
}
