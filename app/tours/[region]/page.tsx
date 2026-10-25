import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ToursPage } from "@/components/page/ToursPage";
import { paramsOrPlaceholder } from "@/lib/content";
import { findRegion, getSiteData } from "@/lib/data";
import { getRegions } from "@/lib/sheets";
import { pageMetadata } from "@/lib/seo";
import { toursHref } from "@/lib/site";

export async function generateStaticParams() {
  return paramsOrPlaceholder(
    "region",
    (await getRegions()).map((r) => r.slug),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/tours/[region]">): Promise<Metadata> {
  const { region } = await params;
  const r = findRegion(await getSiteData(), region);
  if (!r) return {};
  return pageMetadata({
    title: `${r.name} wine tours and tastings`,
    description: `Hand-picked ${r.name} wine tours and cellar visits, ranked, with prices and durations.`,
    path: toursHref(r.slug),
    image: r.hero_image,
  });
}

export default async function RegionTours({ params }: PageProps<"/tours/[region]">) {
  const { region } = await params;
  const d = await getSiteData();
  const r = findRegion(d, region);
  if (!r) notFound();
  return <ToursPage d={d} region={r} />;
}
