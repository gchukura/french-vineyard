import { notFound } from "next/navigation";

import { GuideLayout } from "@/components/articles/GuideLayout";
import { HotelRoundupLayout } from "@/components/articles/HotelRoundupLayout";
import { ItineraryLayout } from "@/components/articles/ItineraryLayout";
import { PracticalLayout } from "@/components/articles/PracticalLayout";
import { RankedListLayout } from "@/components/articles/RankedListLayout";
import { ClosingStack } from "@/components/ClosingStack";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { articleCard, heroOf } from "@/components/page/cards";
import { PageBottom, PageTop, wrap } from "@/components/page/blocks";
import { extractHeadings, pickByIds, splitDays, stripRank } from "@/lib/content";
import { articlesFor, findRegion, findTown, roundupHotels, type SiteData } from "@/lib/data";
import {
  article as articleNode,
  graph,
  hotel as hotelNode,
  howTo,
  itemList,
  touristTrip,
  type ArticleInput,
  type Crumb,
} from "@/lib/schema";
import type { Article } from "@/lib/sheet-schema";
import {
  PLAN_INDEX_HREF,
  REGIONS_INDEX_HREF,
  STAY_INDEX_HREF,
  articleHref,
  regionHref,
  toursHref,
} from "@/lib/site";

export function findArticle(d: SiteData, slug: string, types: Article["page_type"][]) {
  return d.articles.find((a) => a.slug === slug && types.includes(a.page_type));
}

function crumbsFor(d: SiteData, a: Article): Crumb[] {
  const home = { name: "Home", href: "/" };
  const self = { name: a.title, href: articleHref(a) };
  if (a.page_type === "hotel_roundup")
    return [home, { name: "Where to Stay", href: STAY_INDEX_HREF }, self];
  if (a.page_type === "practical")
    return [home, { name: "Plan Your Trip", href: PLAN_INDEX_HREF }, self];
  const region = a.region_slug ? findRegion(d, a.region_slug) : undefined;
  return region
    ? [
        home,
        { name: "Wine Regions", href: REGIONS_INDEX_HREF },
        { name: region.name, href: regionHref(region.slug) },
        self,
      ]
    : [home, self];
}

/** JSON-LD per page_type: Article, plus ItemList / TouristTrip / HowTo built from what the page shows. */
export function articleJsonLd(d: SiteData, a: Article) {
  const input: ArticleInput = {
    type: a.schema_type,
    title: a.title,
    description: a.meta_description ?? a.standfirst,
    href: articleHref(a),
    image: a.hero_image,
    publishedAt: a.published_at,
    updatedAt: a.updated_at,
  };
  const base = articleNode(input);
  switch (a.page_type) {
    case "ranked_list":
      return graph(
        base,
        itemList(
          a.title,
          extractHeadings(a.body_mdx).map((h) => ({ name: stripRank(h) })),
          "TouristAttraction",
        ),
      );
    case "hotel_roundup":
      return graph(
        base,
        itemList(
          a.title,
          roundupHotels(d, a).map((h) => ({
            name: h.name,
            node: hotelNode({
              name: h.name,
              lat: h.lat,
              lng: h.lng,
              image: h.image,
              priceFromEur: h.price_from_eur,
              description: h.blurb,
              town: findTown(d, h.town_slug)?.name,
            }),
          })),
        ),
      );
    case "itinerary":
      return graph(
        base,
        touristTrip(
          input,
          splitDays(a.body_mdx).days.map((x) => x.title),
        ),
      );
    case "practical":
      return graph(base, howTo(input, extractHeadings(a.body_mdx)));
    default:
      return base;
  }
}

export function ArticleView({
  d,
  slug,
  types,
}: {
  d: SiteData;
  slug: string;
  types: Article["page_type"][];
}) {
  const a = findArticle(d, slug, types);
  if (!a) notFound();

  const tours = pickByIds(d.tours, a.tour_ids);
  const hotels = a.page_type === "hotel_roundup" ? [] : pickByIds(d.hotels, a.hotel_ids);
  const related = articlesFor(d, { region_slug: a.region_slug })
    .filter((x) => x.slug !== a.slug)
    .slice(0, 3)
    .map((x) => articleCard(d, x));

  const Layout = {
    guide: GuideLayout,
    ranked_list: RankedListLayout,
    hotel_roundup: HotelRoundupLayout,
    itinerary: ItineraryLayout,
    practical: PracticalLayout,
  }[a.page_type];

  return (
    <main id="main">
      <PageTop
        eyebrow={a.region_slug ? findRegion(d, a.region_slug)?.name : undefined}
        title={a.title}
        standfirst={a.standfirst}
        image={heroOf(d, a)}
        crumbs={crumbsFor(d, a)}
      />
      <article className={`${wrap} py-10`}>
        <Layout d={d} article={a} />
        {a.faq_json.length ? (
          <div className="mt-16 max-w-3xl">
            <Faq items={a.faq_json} />
          </div>
        ) : null}
      </article>
      <PageBottom updated={a.updated_at ?? a.published_at}>
        <ClosingStack
          tours={tours}
          hotels={hotels}
          related={related}
          cta={{
            title: "Plan the rest of your trip",
            primary: { label: "Browse tours", href: toursHref(a.region_slug) },
            secondary: { label: "Where to stay", href: STAY_INDEX_HREF },
          }}
        />
      </PageBottom>
      <JsonLd data={articleJsonLd(d, a)} />
    </main>
  );
}
