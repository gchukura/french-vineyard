import type { Metadata } from "next";

import { ToursPage } from "@/components/page/ToursPage";
import { getSiteData } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { TOURS_INDEX_HREF } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Wine tours and tastings in France",
  description:
    "Hand-picked wine tours, cellar visits and tastings in France's wine regions, filterable by duration and price.",
  path: TOURS_INDEX_HREF,
});

export default async function ToursIndex() {
  return <ToursPage d={await getSiteData()} />;
}
