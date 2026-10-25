import type { Metadata } from "next";

import { ArticleIndex } from "@/components/page/ArticleIndex";
import { getSiteData } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { PLAN_INDEX_HREF } from "@/lib/site";

const TITLE = "Plan your wine trip";
const STANDFIRST =
  "Practical guides: getting there, getting around, booking cellar visits and what things cost.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: STANDFIRST,
  path: PLAN_INDEX_HREF,
});

export default async function Plan() {
  return (
    <ArticleIndex
      d={await getSiteData()}
      type="practical"
      title={TITLE}
      standfirst={STANDFIRST}
      href={PLAN_INDEX_HREF}
      crumbName="Plan Your Trip"
    />
  );
}
