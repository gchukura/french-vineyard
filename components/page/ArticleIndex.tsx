import Link from "next/link";

import { Card } from "@/components/Card";
import { ClosingStack } from "@/components/ClosingStack";
import { JsonLd } from "@/components/JsonLd";
import { PageBottom, PageTop, Section, cardsGrid, wrap } from "@/components/page/blocks";
import { articleCard } from "@/components/page/cards";
import { latestDate } from "@/lib/content";
import { findRegion, findTown, newest, type SiteData } from "@/lib/data";
import { collectionPage, type Crumb } from "@/lib/schema";
import type { Article } from "@/lib/sheet-schema";
import { TOURS_INDEX_HREF, articleHref, regionHref, townHref } from "@/lib/site";

/** /where-to-stay/ and /plan/: articles of one page_type, grouped by region (and town). */
export function ArticleIndex({
  d,
  type,
  title,
  standfirst,
  href,
  crumbName,
  showTowns = false,
}: {
  d: SiteData;
  type: Article["page_type"];
  title: string;
  standfirst: string;
  href: string;
  crumbName: string;
  showTowns?: boolean;
}) {
  const articles = newest(d.articles.filter((a) => a.page_type === type));
  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: crumbName, href },
  ];
  const groups = new Map<string, Article[]>();
  for (const a of articles) {
    const key = a.region_slug ?? "";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const townsWithHotels = showTowns
    ? d.towns.filter((t) => d.hotels.some((h) => h.town_slug === t.slug))
    : [];

  return (
    <main id="main">
      <PageTop eyebrow={crumbName} title={title} standfirst={standfirst} crumbs={crumbs} />
      <div className={`${wrap} space-y-16 py-10`}>
        {[...groups].map(([regionSlug, list]) => {
          const region = regionSlug ? findRegion(d, regionSlug) : undefined;
          return (
            <Section
              key={regionSlug || "all"}
              title={region ? region.name : "Across France"}
              action={
                region
                  ? { label: `The ${region.name} guide`, href: regionHref(region.slug) }
                  : undefined
              }
            >
              <div className={cardsGrid}>
                {list.map((a) => {
                  const town = a.town_slug ? findTown(d, a.town_slug) : undefined;
                  return (
                    <Card
                      key={a.slug}
                      {...articleCard(d, a)}
                      eyebrow={town?.name ?? region?.name ?? undefined}
                    />
                  );
                })}
              </div>
            </Section>
          );
        })}
        {!articles.length ? <p>Guides are on their way.</p> : null}
        {townsWithHotels.length ? (
          <Section title="Hotels by town">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {townsWithHotels.map((t) => (
                <li key={t.slug}>
                  <Link
                    href={townHref(t.slug)}
                    className="flex min-h-11 items-center rounded-card bg-surface px-4 py-3 font-heading text-lg font-semibold hover:underline"
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
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
          title,
          href,
          articles.map((a) => ({ name: a.title, href: articleHref(a) })),
        )}
      />
    </main>
  );
}
