import type { Metadata } from "next";

import { ArticleIndex } from "@/components/page/ArticleIndex";
import { getSiteData } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { STAY_INDEX_HREF } from "@/lib/site";

const TITLE = "Where to stay in France's wine regions";
const STANDFIRST = "Hotel roundups by region and town, from guesthouses to château hotels.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: STANDFIRST,
  path: STAY_INDEX_HREF,
});

export default async function WhereToStay() {
  return (
    <ArticleIndex
      d={await getSiteData()}
      type="hotel_roundup"
      title={TITLE}
      standfirst={STANDFIRST}
      href={STAY_INDEX_HREF}
      crumbName="Where to Stay"
      showTowns
    />
  );
}
