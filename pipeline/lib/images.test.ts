import { describe, expect, it } from "vitest";

import {
  acceptedLicense,
  creditXmp,
  dedupeCandidates,
  isFresh,
  isLandscape,
  namesPlace,
  outputWidths,
  parseCommons,
  parsePexels,
  parsePixabay,
  pickBest,
  searchQueries,
  stripHtml,
  variantPath,
  type ImageTarget,
} from "./images";

describe("acceptedLicense", () => {
  it.each([
    ["cc0", "CC0", "CC0"],
    ["pd", "Public domain", "Public domain"],
    ["", "Public domain", "Public domain"],
    ["cc-by-4.0", "CC BY 4.0", "CC BY 4.0"],
    ["cc-by-sa-3.0", "CC BY-SA 3.0", "CC BY-SA 3.0"],
    ["cc-by-sa-2.0-fr", "CC BY-SA 2.0 fr", "CC BY-SA 2.0"],
    ["", "CC BY-SA 4.0", "CC BY-SA 4.0"],
  ])("accepts %s / %s", (code, short, want) => {
    expect(acceptedLicense(code, short)).toBe(want);
  });

  it.each([
    ["gfdl", "GFDL"],
    ["", "Attribution"],
    ["cc-by-nc-2.0", "CC BY-NC 2.0"],
    ["cc-by-nd-4.0", "CC BY-ND 4.0"],
    ["", "Fair use"],
    ["", ""],
  ])("rejects %s / %s", (code, short) => {
    expect(acceptedLicense(code, short)).toBeUndefined();
  });
});

describe("isLandscape", () => {
  it("needs 1600 px and a landscape ratio", () => {
    expect(isLandscape(2000, 1333)).toBe(true);
    expect(isLandscape(1599, 900)).toBe(false);
    expect(isLandscape(2000, 2000)).toBe(false);
    expect(isLandscape(2000, 1700)).toBe(false);
  });
});

const commonsPage = (over: Record<string, unknown> = {}, meta: Record<string, string> = {}) => ({
  title: "File:Vignes Hautvillers.jpg",
  index: 1,
  imageinfo: [
    {
      url: "https://upload.wikimedia.org/a/b/Vignes_Hautvillers.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Vignes_Hautvillers.jpg",
      thumburl: "https://upload.wikimedia.org/thumb/960px.jpg",
      width: 4000,
      height: 2667,
      size: 5_000_000,
      mime: "image/jpeg",
      extmetadata: Object.fromEntries(
        Object.entries({
          Artist: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane&nbsp;Doe</a>',
          License: "cc-by-sa-4.0",
          LicenseShortName: "CC BY-SA 4.0",
          LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
          ImageDescription: "Vineyards above <b>Hautvillers</b>",
          ...meta,
        }).map(([k, v]) => [k, { value: v }]),
      ),
      ...over,
    },
  ],
});

describe("parseCommons", () => {
  it("maps a free, large, landscape file to a credited candidate", () => {
    const [c] = parseCommons({ query: { pages: [commonsPage()] } });
    expect(c).toMatchObject({
      provider: "wikimedia",
      title: "Vignes Hautvillers",
      description: "Vineyards above Hautvillers",
      author: "Jane Doe",
      credit: "Jane Doe / Wikimedia Commons",
      license: "CC BY-SA 4.0",
      previewUrl: "https://upload.wikimedia.org/thumb/960px.jpg",
      downloadUrl: "https://upload.wikimedia.org/a/b/Vignes_Hautvillers.jpg",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Vignes_Hautvillers.jpg",
    });
  });

  it("drops non-free, small, portrait, oversized and personality-restricted files", () => {
    const pages = [
      commonsPage({}, { License: "gfdl", LicenseShortName: "GFDL" }),
      commonsPage({ width: 1200, height: 800 }),
      commonsPage({ width: 2000, height: 3000 }),
      commonsPage({ size: 80_000_000 }),
      commonsPage({ mime: "image/svg+xml" }),
      commonsPage({}, { Restrictions: "personality" }),
    ];
    expect(parseCommons({ query: { pages } })).toEqual([]);
    expect(parseCommons({})).toEqual([]);
  });

  it("keeps search order when pages come keyed by id", () => {
    const a = { ...commonsPage(), title: "File:A.jpg", index: 2 };
    const b = { ...commonsPage(), title: "File:B.jpg", index: 1 };
    expect(parseCommons({ query: { pages: { "9": a, "3": b } } }).map((c) => c.id)).toEqual([
      "File:B.jpg",
      "File:A.jpg",
    ]);
  });
});

describe("parsePixabay", () => {
  const hit = {
    id: 7,
    pageURL: "https://pixabay.com/photos/vineyard-7/",
    tags: "vineyard, france",
    imageWidth: 6000,
    imageHeight: 4000,
    webformatURL: "https://pixabay.com/get/web.jpg",
    largeImageURL: "https://pixabay.com/get/large.jpg",
    user: "jdoe",
  };

  it("needs full API access URLs to reach 1600 px", () => {
    expect(parsePixabay({ hits: [hit] })).toEqual([]);
    const [c] = parsePixabay({ hits: [{ ...hit, fullHDURL: "https://pixabay.com/get/hd.jpg" }] });
    expect(c).toMatchObject({
      downloadUrl: "https://pixabay.com/get/hd.jpg",
      width: 1920,
      height: 1280,
      credit: "jdoe / Pixabay",
      license: "Pixabay Content License",
    });
  });
});

describe("parsePexels", () => {
  it("keeps Pexels' attribution fields", () => {
    const [c] = parsePexels({
      photos: [
        {
          id: 42,
          width: 5000,
          height: 3000,
          url: "https://www.pexels.com/photo/42/",
          alt: "Vineyard rows at sunset",
          photographer: "Ann Lee",
          photographer_url: "https://www.pexels.com/@ann",
          photographer_id: 9,
          src: {
            original: "https://images.pexels.com/42.jpeg",
            large: "https://images.pexels.com/42-l.jpeg",
          },
        },
      ],
    });
    expect(c).toMatchObject({
      provider: "pexels",
      credit: "Ann Lee / Pexels",
      license: "Pexels License",
      downloadUrl: "https://images.pexels.com/42.jpeg",
      attribution: {
        photographer: "Ann Lee",
        photographer_url: "https://www.pexels.com/@ann",
        photographer_id: "9",
        photo_url: "https://www.pexels.com/photo/42/",
      },
    });
  });
});

const article = (name: string, over: Partial<ImageTarget> = {}): ImageTarget => ({
  tab: "Articles",
  slug: "x",
  name,
  pageType: "guide",
  path: "/x/",
  ...over,
});
const PLACES = ["Champagne", "Épernay", "Côte des Blancs", "Aÿ", "Reims"];

describe("namesPlace", () => {
  it("treats every place page as a named place", () => {
    expect(namesPlace({ tab: "Towns", slug: "ay", name: "Aÿ", path: "/towns/ay/" }, PLACES)).toBe(
      true,
    );
    expect(namesPlace({ tab: "Regions", slug: "x", name: "X", path: "/" }, [])).toBe(true);
  });

  it("finds place names in article titles, accents and case aside", () => {
    expect(namesPlace(article("Reims or Epernay: Trains Compared"), PLACES)).toBe(true);
    expect(namesPlace(article("Walking the cote des blancs"), PLACES)).toBe(true);
    expect(namesPlace(article("Harvest guide", { slug: "champagne-harvest" }), PLACES)).toBe(true);
    expect(namesPlace(article("Tasting basics", { townName: "Beaune" }), PLACES)).toBe(true);
  });

  it("lets generic topics through, without partial-word matches", () => {
    expect(namesPlace(article("How Wine Tasting Works: Etiquette and Fees"), PLACES)).toBe(false);
    expect(namesPlace(article("Ayurvedic Picnics"), PLACES)).toBe(false);
  });
});

describe("searchQueries", () => {
  it("searches place pages by name and article subjects before their region", () => {
    expect(searchQueries({ tab: "Towns", slug: "ay", name: "Aÿ", path: "/" })).toEqual([
      "Aÿ vineyards",
      "Aÿ vignes",
      "Aÿ",
    ]);
    expect(
      searchQueries(
        article("Dom Pérignon Hautvillers Abbey: Church and Tomb", { regionName: "Champagne" }),
      ),
    ).toEqual(["Dom Pérignon Hautvillers Abbey", "Champagne vineyards", "Champagne wine cellar"]);
  });
});

describe("dedupeCandidates", () => {
  it("drops repeats and images already used on the site", () => {
    const c = (id: string, sourceUrl: string) => ({
      ...parseCommons({ query: { pages: [commonsPage()] } })[0],
      id,
      sourceUrl,
    });
    const out = dedupeCandidates(
      [c("a", "u1"), c("a", "u2"), c("b", "u1"), c("c", "u3"), c("d", "used")],
      new Set(["used"]),
    );
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("pickBest", () => {
  const s = (index: number, score: number, reject_reason: string | null = null) => ({
    index,
    score,
    reject_reason,
  });
  it("picks the highest score at the threshold, skipping rejects and earlier on ties", () => {
    expect(pickBest([s(0, 72), s(1, 91, "glasses raised"), s(2, 80), s(3, 80)], 4, 70)?.index).toBe(
      2,
    );
    expect(pickBest([s(0, 69), s(1, 95, "logo")], 2, 70)).toBeUndefined();
    expect(pickBest([s(5, 99)], 2, 70)).toBeUndefined();
  });
});

describe("output", () => {
  it("never upscales", () => {
    expect(outputWidths(4000)).toEqual([640, 1024, 1600, 2400]);
    expect(outputWidths(1920)).toEqual([640, 1024, 1600]);
    expect(outputWidths(500)).toEqual([640]);
  });

  it("names variants by tab, slug, source and width", () => {
    const p = variantPath("Towns", "epernay", "https://x/y.jpg", 1600, "webp");
    expect(p).toMatch(/^images\/towns\/epernay-[0-9a-f]{8}-1600\.webp$/);
    expect(variantPath("Towns", "epernay", "https://x/y.jpg", 640, "avif")).toBe(
      p.replace("1600.webp", "640.avif"),
    );
  });

  it("writes credit XMP, escaped, with the AI source type only for generated images", () => {
    const xmp = creditXmp({
      author: "A & B",
      credit: "A & B / Pexels",
      license: "Pexels License",
      sourceUrl: "https://p/1",
      isAi: false,
    });
    expect(xmp).toContain("<rdf:li>A &amp; B</rdf:li>");
    expect(xmp).toContain("<dc:source>https://p/1</dc:source>");
    expect(xmp).toContain("<xmpRights:Marked>True</xmpRights:Marked>");
    expect(xmp).not.toContain("trainedAlgorithmicMedia");
    expect(creditXmp({ author: "x", credit: "x", license: "AI-generated", isAi: true })).toContain(
      "trainedAlgorithmicMedia",
    );
  });

  it("cleans Commons HTML and honours the 24 h cache", () => {
    expect(stripHtml("<span>Jane&#39;s &amp; co</span>")).toBe("Jane's & co");
    expect(isFresh(0, 23 * 3600_000)).toBe(true);
    expect(isFresh(0, 25 * 3600_000)).toBe(false);
  });
});
