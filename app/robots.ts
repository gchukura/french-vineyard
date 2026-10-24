import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const NAMED_BOTS = ["Googlebot", "Bingbot", "GPTBot", "ClaudeBot", "PerplexityBot"];
const DISALLOW = ["/go/", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...NAMED_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
      { userAgent: "*", allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
