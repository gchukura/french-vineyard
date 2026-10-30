import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { indexNowPayloads, sitemapLocs } from "./indexnow";

const KEY = "5eabc586ed974dfab685501ed191bc3d";

describe("indexNowPayloads", () => {
  it("builds the request body for the site's own host", () => {
    expect(
      indexNowPayloads("https://frenchvineyard.com", KEY, [
        "/towns/reims/",
        "https://frenchvineyard.com/where-to-stay/where-to-stay-in-beaune/",
        "/towns/reims/",
        "https://elsewhere.example/page/",
      ]),
    ).toEqual([
      {
        host: "frenchvineyard.com",
        key: KEY,
        keyLocation: `https://frenchvineyard.com/${KEY}.txt`,
        urlList: [
          "https://frenchvineyard.com/towns/reims/",
          "https://frenchvineyard.com/where-to-stay/where-to-stay-in-beaune/",
        ],
      },
    ]);
  });

  it("splits large lists into batches", () => {
    const paths = Array.from({ length: 5 }, (_, i) => `/p${i}/`);
    const batches = indexNowPayloads("https://frenchvineyard.com", KEY, paths, 2);
    expect(batches.map((b) => b.urlList.length)).toEqual([2, 2, 1]);
    expect(indexNowPayloads("https://frenchvineyard.com", KEY, [])).toEqual([]);
  });
});

describe("sitemapLocs", () => {
  it("reads <loc> values from a sitemap index or urlset", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://frenchvineyard.com/</loc></url>
      <url><loc> https://frenchvineyard.com/a/?x=1&amp;y=2 </loc></url></urlset>`;
    expect(sitemapLocs(xml)).toEqual([
      "https://frenchvineyard.com/",
      "https://frenchvineyard.com/a/?x=1&y=2",
    ]);
  });
});

describe("key file", () => {
  it("is served from public/ and holds exactly the key", () => {
    expect(readFileSync(new URL(`../../public/${KEY}.txt`, import.meta.url), "utf8")).toBe(KEY);
  });
});
