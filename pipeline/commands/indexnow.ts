import type { Context } from "../context";
import { INDEXNOW_ENDPOINT, indexNowPayloads, sitemapLocs } from "../lib/indexnow";

/**
 * Tells IndexNow about changed pages. Off until INDEXNOW_KEY is set (set it
 * on launch day, with SITE_NOINDEX=0: pinging pages search engines may not
 * index is pointless). Never fails a run: a rejected ping is only logged.
 */
export async function notifyIndexNow(ctx: Context, paths: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key || !paths.length) return;
  for (const payload of indexNowPayloads(ctx.config.siteUrl, key, paths)) {
    if (ctx.args.dryRun) {
      ctx.log(`dry run: would send IndexNow ${payload.urlList.length} URL(s)`);
      continue;
    }
    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      // 200 and 202 both mean accepted (202: the key is still being verified).
      ctx.log(`IndexNow: ${payload.urlList.length} URL(s) -> HTTP ${res.status}`);
    } catch (error) {
      ctx.log(`IndexNow: not sent (${(error as Error).message})`);
    }
  }
}

/** indexnow: submits every page in the site's sitemaps (launch day, or after big changes). */
export async function indexnow(ctx: Context): Promise<number> {
  if (!process.env.INDEXNOW_KEY?.trim())
    throw new Error("INDEXNOW_KEY is not set; set it on launch day, once SITE_NOINDEX=0");
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
    return res.text();
  };
  const children = sitemapLocs(await get(`${ctx.config.siteUrl}/sitemap.xml`)).filter(
    // Image sitemaps list image files, not pages.
    (u) => !u.endsWith("/images.xml"),
  );
  const pages: string[] = [];
  for (const child of children) pages.push(...sitemapLocs(await get(child)));
  ctx.log(`indexnow: ${pages.length} page URL(s) from ${children.length} sitemap(s)`);
  await notifyIndexNow(ctx, pages);
  return pages.length;
}
