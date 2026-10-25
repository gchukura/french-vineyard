import { sitemapIndexEntries } from "@/lib/sitemap-data";
import { sitemapIndexXml, xmlResponse } from "@/lib/sitemap";

/** Sitemap index: one child sitemap per content type, plus images. */
export async function GET() {
  return xmlResponse(sitemapIndexXml(await sitemapIndexEntries()));
}
