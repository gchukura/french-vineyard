import { SITEMAP_TYPES, sitemapEntries, type SitemapType } from "@/lib/sitemap-data";
import { urlsetXml, xmlResponse } from "@/lib/sitemap";

export async function generateStaticParams() {
  return SITEMAP_TYPES.map((type) => ({ name: `${type}.xml` }));
}

export async function GET(_request: Request, { params }: RouteContext<"/sitemaps/[name]">) {
  const { name } = await params;
  const type = name.replace(/\.xml$/, "") as SitemapType;
  if (!name.endsWith(".xml") || !SITEMAP_TYPES.includes(type)) {
    return new Response("Not found", { status: 404 });
  }
  return xmlResponse(urlsetXml(await sitemapEntries(type)));
}
