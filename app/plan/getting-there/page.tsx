import type { Metadata } from "next";

import { Card } from "@/components/Card";
import { ClosingStack } from "@/components/ClosingStack";
import { JsonLd } from "@/components/JsonLd";
import { PageBottom, PageTop, Section, cardsGrid, wrap } from "@/components/page/blocks";
import { articleCard } from "@/components/page/cards";
import { PracticalTable } from "@/components/PracticalTable";
import { latestDate } from "@/lib/content";
import { findTown, getSiteData } from "@/lib/data";
import { gettingThereGroups, travelRows } from "@/lib/getting-there";
import { collectionPage, type Crumb } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import {
  GETTING_THERE_HREF,
  PLAN_INDEX_HREF,
  TOURS_INDEX_HREF,
  articleHref,
  regionHref,
} from "@/lib/site";

const TITLE = "Getting to France's wine regions";
const STANDFIRST =
  "Trains from Paris, the nearest airports and the local connections to the vineyards, region by region.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: STANDFIRST,
  path: GETTING_THERE_HREF,
});

/**
 * Hub for the practical articles tagged cluster "getting-there" in the
 * Articles tab, with each region's train and airport facts from the Regions
 * tab. Nothing here is written by hand beyond the title and standfirst.
 */
export default async function GettingThere() {
  const d = await getSiteData();
  const groups = gettingThereGroups(d.regions, d.articles);
  const articles = groups.flatMap((g) => g.articles);
  const rows = travelRows(d.regions);
  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Plan Your Trip", href: PLAN_INDEX_HREF },
    { name: "Getting There", href: GETTING_THERE_HREF },
  ];

  return (
    <main id="main">
      <PageTop eyebrow="Plan Your Trip" title={TITLE} standfirst={STANDFIRST} crumbs={crumbs} />
      <div className={`${wrap} space-y-16 py-10`}>
        {rows.length ? (
          <PracticalTable
            caption="From Paris and the nearest airport"
            columns={["Region", "Fastest train from Paris", "Nearest main airport"]}
            rows={rows}
          />
        ) : null}
        {groups.map(({ region, articles: list }) => (
          <Section
            key={region?.slug ?? "all"}
            id={region?.slug}
            title={region ? `Getting to ${region.name}` : "Across France"}
            action={
              region
                ? { label: `The ${region.name} guide`, href: regionHref(region.slug) }
                : undefined
            }
          >
            <div className={cardsGrid}>
              {list.map((a) => (
                <Card
                  key={a.slug}
                  {...articleCard(d, a)}
                  eyebrow={
                    (a.town_slug ? findTown(d, a.town_slug)?.name : undefined) ?? region?.name
                  }
                />
              ))}
            </div>
          </Section>
        ))}
        {!articles.length ? <p>Route guides are on their way.</p> : null}
      </div>
      <PageBottom updated={latestDate(articles.map((a) => a.updated_at ?? a.published_at))}>
        <ClosingStack
          cta={{
            title: "Book the tastings next",
            primary: { label: "Browse tours", href: TOURS_INDEX_HREF },
            secondary: { label: "Compare regions", href: "/regions/" },
          }}
        />
      </PageBottom>
      <JsonLd
        data={collectionPage(
          TITLE,
          GETTING_THERE_HREF,
          articles.map((a) => ({ name: a.title, href: articleHref(a) })),
        )}
      />
    </main>
  );
}
