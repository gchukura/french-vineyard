import { absoluteUrl } from "@/lib/site";

/** XML for the sitemap index, per-type sitemaps and the image sitemap. */

export type SitemapImage = { loc: string; title?: string; caption?: string };
export type SitemapEntry = { path: string; lastmod?: string; images?: SitemapImage[] };

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

const tag = (name: string, value?: string) =>
  value ? `<${name}>${escapeXml(value)}</${name}>` : "";

export function urlsetXml(entries: SitemapEntry[]): string {
  const withImages = entries.some((e) => e.images?.length);
  const ns = withImages
    ? ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  const urls = entries.map((e) => {
    const images = (e.images ?? [])
      .map(
        (img) =>
          `<image:image>${tag("image:loc", absoluteUrl(img.loc))}${tag("image:title", img.title)}${tag("image:caption", img.caption)}</image:image>`,
      )
      .join("");
    return `<url>${tag("loc", absoluteUrl(e.path))}${tag("lastmod", e.lastmod)}${images}</url>`;
  });
  return `${XML_HEAD}\n<urlset${ns}>\n${urls.join("\n")}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: { path: string; lastmod?: string }[]): string {
  const items = sitemaps.map(
    (s) => `<sitemap>${tag("loc", absoluteUrl(s.path))}${tag("lastmod", s.lastmod)}</sitemap>`,
  );
  return `${XML_HEAD}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
