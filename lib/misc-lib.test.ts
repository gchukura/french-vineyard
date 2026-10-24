import { describe, expect, it, vi } from "vitest";

import { buildClick, logClick } from "@/lib/clicks";
import { findOrphans, internalPath, linksIn, routeFromHtmlFile } from "@/lib/orphans.mts";
import { pageMetadata } from "@/lib/seo";
import { articleHref, areaHref, regionHref, townHref, toursHref } from "@/lib/site";
import { escapeXml, sitemapIndexXml, urlsetXml } from "@/lib/sitemap";

describe("site URLs", () => {
  it("all end in a slash and route articles by page_type", () => {
    expect(regionHref("champagne")).toBe("/regions/champagne/");
    expect(areaHref("champagne", "montagne-de-reims")).toBe(
      "/regions/champagne/montagne-de-reims/",
    );
    expect(townHref("reims")).toBe("/towns/reims/");
    expect(toursHref()).toBe("/tours/");
    expect(toursHref("burgundy")).toBe("/tours/burgundy/");
    expect(articleHref({ slug: "a", page_type: "guide" })).toBe("/a/");
    expect(articleHref({ slug: "a", page_type: "ranked_list" })).toBe("/a/");
    expect(articleHref({ slug: "a", page_type: "itinerary" })).toBe("/a/");
    expect(articleHref({ slug: "a", page_type: "hotel_roundup" })).toBe("/where-to-stay/a/");
    expect(articleHref({ slug: "a", page_type: "practical" })).toBe("/plan/a/");
  });
});

describe("pageMetadata", () => {
  it("sets a trailing-slash canonical and an og:image", () => {
    const meta = pageMetadata({
      title: "Champagne",
      description: "d",
      path: "/regions/champagne/",
    });
    expect(meta.alternates?.canonical).toBe("/regions/champagne/");
    expect(meta.openGraph).toMatchObject({
      url: "/regions/champagne/",
      images: [{ url: "/og-default.jpg" }],
    });
    expect(pageMetadata({ title: "x", path: "/", image: "/h.jpg" }).openGraph).toMatchObject({
      images: [{ url: "/h.jpg" }],
    });
  });

  it("rejects a canonical without a trailing slash", () => {
    expect(() => pageMetadata({ title: "x", path: "/regions" })).toThrow(/trailing slash/);
  });
});

describe("sitemap XML", () => {
  it("escapes values", () => {
    expect(escapeXml(`a&b<"'>`)).toBe("a&amp;b&lt;&quot;&apos;&gt;");
  });

  it("writes a urlset with lastmod, adding the image namespace only when needed", () => {
    const plain = urlsetXml([{ path: "/regions/", lastmod: "2026-10-24" }]);
    expect(plain).toContain(
      "<loc>https://frenchvineyard.com/regions/</loc><lastmod>2026-10-24</lastmod>",
    );
    expect(plain).not.toContain("xmlns:image");
    const images = urlsetXml([{ path: "/", images: [{ loc: "/a.jpg", title: "A & B" }] }]);
    expect(images).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(images).toContain(
      "<image:loc>https://frenchvineyard.com/a.jpg</image:loc><image:title>A &amp; B</image:title>",
    );
  });

  it("writes a sitemap index", () => {
    expect(sitemapIndexXml([{ path: "/sitemaps/regions.xml", lastmod: "2026-10-01" }])).toContain(
      "<sitemap><loc>https://frenchvineyard.com/sitemaps/regions.xml</loc><lastmod>2026-10-01</lastmod></sitemap>",
    );
  });
});

describe("clicks", () => {
  it("builds a click with a sanitised slot", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(buildClick({ provider: "gyg", id: "t1", page: "home", slot: "tour-card" }, now)).toEqual(
      {
        ts: "2026-10-24T12:00:00.000Z",
        provider: "gyg",
        id: "t1",
        page: "home",
        slot: "tour-card",
      },
    );
    expect(
      buildClick({ provider: "gyg", id: "t1", page: "home", slot: "<script>" }, now).slot,
    ).toBe("unknown");
  });

  it("posts with the secret, skips when unconfigured, and swallows errors", async () => {
    const click = buildClick({ provider: "gyg", id: "t1", page: "home" });
    const ok = vi.fn().mockResolvedValue(new Response("ok"));
    await logClick(
      click,
      { CLICKS_WEBHOOK_URL: "https://script.example/x", CLICKS_WEBHOOK_SECRET: "s" },
      ok,
    );
    expect(ok).toHaveBeenCalledOnce();
    expect(JSON.parse(ok.mock.calls[0]![1].body)).toEqual({ secret: "s", click });

    const none = vi.fn();
    await logClick(click, {}, none);
    expect(none).not.toHaveBeenCalled();

    const boom = vi.fn().mockRejectedValue(new Error("down"));
    await expect(
      logClick(click, { CLICKS_WEBHOOK_URL: "https://x", CLICKS_WEBHOOK_SECRET: "s" }, boom),
    ).resolves.toBeUndefined();
  });
});

describe("orphans", () => {
  it("normalises internal page links and ignores the rest", () => {
    expect(internalPath("/regions/champagne")).toBe("/regions/champagne/");
    expect(internalPath("/tours/?d=short#x")).toBe("/tours/");
    for (const href of [
      "https://x.com/",
      "//cdn.x/",
      "/go/gyg/1/",
      "/api/revalidate/",
      "/sitemap.xml",
      "/_next/x/",
    ]) {
      expect(internalPath(href)).toBeNull();
    }
  });

  it("collects <a href> links", () => {
    const html = '<a class="x" href="/a/">A</a><a href="/b?x=1&amp;y=2">B</a><link href="/c/">';
    expect([...linksIn(html)]).toEqual(["/a/", "/b/"]);
  });

  it("flags pages with fewer than three other pages linking in, ignoring self-links", () => {
    const pages = new Map([
      ["/", new Set(["/a/", "/b/"])],
      ["/a/", new Set(["/", "/a/", "/b/"])],
      ["/b/", new Set(["/", "/a/"])],
      ["/c/", new Set(["/", "/a/", "/b/"])],
    ]);
    expect(findOrphans(pages)).toEqual(
      [
        { path: "/", inbound: 3, from: ["/a/", "/b/", "/c/"] },
        { path: "/a/", inbound: 3, from: ["/", "/b/", "/c/"] },
        { path: "/b/", inbound: 3, from: ["/", "/a/", "/c/"] },
        { path: "/c/", inbound: 0, from: [] },
      ].filter((r) => r.inbound < 3),
    );
  });

  it("maps build HTML files to routes", () => {
    expect(routeFromHtmlFile("index.html")).toBe("/");
    expect(routeFromHtmlFile("regions/champagne.html")).toBe("/regions/champagne/");
    expect(routeFromHtmlFile("regions/index.html")).toBe("/regions/");
  });
});
