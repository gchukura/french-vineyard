import type { Metadata } from "next";

import { ArticleView, findArticle } from "@/components/articles/ArticleView";
import { paramsOrPlaceholder } from "@/lib/content";
import { getSiteData } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { articleHref } from "@/lib/site";

/** Root-level articles. Hotel roundups live at /where-to-stay/, practical ones at /plan/. */
const TYPES = ["guide", "ranked_list", "itinerary"] as const;

export async function generateStaticParams() {
  const d = await getSiteData();
  return paramsOrPlaceholder(
    "slug",
    d.articles.filter((a) => (TYPES as readonly string[]).includes(a.page_type)).map((a) => a.slug),
  );
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = findArticle(await getSiteData(), slug, [...TYPES]);
  if (!a) return {};
  return pageMetadata({
    title: a.title,
    description: a.meta_description ?? a.standfirst,
    path: articleHref(a),
    image: a.hero_image,
    type: "article",
  });
}

export default async function ArticlePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  return <ArticleView d={await getSiteData()} slug={slug} types={[...TYPES]} />;
}
