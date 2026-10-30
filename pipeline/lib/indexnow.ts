/**
 * IndexNow (Bing and other engines): tells search engines which URLs changed.
 * The key is public by design; the site serves it at /<key>.txt from
 * public/. Pure helpers here; the network calls are in commands/indexnow.ts.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
/** IndexNow accepts at most this many URLs per request. */
export const INDEXNOW_MAX_URLS = 10_000;

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

/**
 * Request bodies for `paths` (site paths like "/towns/reims/", or absolute
 * URLs on the site's own host), deduplicated and split into batches.
 */
export function indexNowPayloads(
  siteUrl: string,
  key: string,
  paths: string[],
  max = INDEXNOW_MAX_URLS,
): IndexNowPayload[] {
  const base = new URL(siteUrl);
  const urls = [
    ...new Set(
      paths
        .map((p) => new URL(p, base))
        .filter((u) => u.host === base.host)
        .map((u) => u.href),
    ),
  ];
  const payloads: IndexNowPayload[] = [];
  for (let i = 0; i < urls.length; i += max)
    payloads.push({
      host: base.host,
      key,
      keyLocation: `${base.origin}/${key}.txt`,
      urlList: urls.slice(i, i + max),
    });
  return payloads;
}

/** <loc> values of a sitemap or sitemap index. */
export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}
