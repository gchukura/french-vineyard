import type { Metadata } from "next";

import { ArticleView, findArticle } from "@/components/articles/ArticleView";
import { paramsOrPlaceholder } from "@/lib/content";
import { getSiteData } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { articleHref } from "@/lib/site";

export async function generateStaticParams() {
  const d = await getSiteData();
  return paramsOrPlaceholder(
    "slug",
    d.articles.filter((a) => a.page_type === "practical").map((a) => a.slug),
  );
}

export async function generateMetadata({ params }: PageProps<"/plan/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = findArticle(await getSiteData(), slug, ["practical"]);
  if (!a) return {};
  return pageMetadata({
    title: a.title,
    description: a.meta_description ?? a.standfirst,
    path: articleHref(a),
    image: a.hero_image,
    type: "article",
  });
}

export default async function PracticalArticle({ params }: PageProps<"/plan/[slug]">) {
  const { slug } = await params;
  return <ArticleView d={await getSiteData()} slug={slug} types={["practical"]} />;
}
