import { createHash } from "node:crypto";

import { z } from "zod";

/**
 * Pure helpers for the `images` command: provider response parsing, licence
 * and size filters, search queries, the named-place rule, scoring and the
 * names and metadata of what gets uploaded. Network, sharp and Blob live in
 * pipeline/media.ts.
 */

export type Provider = "wikimedia" | "pixabay" | "pexels" | "flux";

export type Candidate = {
  provider: Provider;
  id: string;
  /** Title and description from the source, shown to the scorer as context. */
  title: string;
  description?: string;
  width: number;
  height: number;
  /** Small image for scoring (about 960 px wide). */
  previewUrl: string;
  /** Largest file we may download. */
  downloadUrl: string;
  /** Page on the provider's site, for the credit link. */
  sourceUrl: string;
  /** Photographer or author, plain text. */
  author: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  /** Provider-specific attribution fields kept with the pick (Pexels asks for these). */
  attribution?: Record<string, string>;
};

/** Smallest acceptable width, and the widths every pick is converted to. */
export const MIN_WIDTH = 1600;
export const WIDTHS = [640, 1024, 1600, 2400] as const;
/** Landscape means at least this width/height ratio. */
export const MIN_RATIO = 1.25;
/** Candidates scored per row. */
export const MAX_CANDIDATES = 8;
/** Commons originals above this are skipped rather than downloaded. */
export const MAX_DOWNLOAD_BYTES = 50_000_000;

export const isLandscape = (width: number, height: number) =>
  width >= MIN_WIDTH && height > 0 && width / height >= MIN_RATIO;

// ---------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------

/**
 * Commons licences we accept, normalised for display: CC0, CC BY, CC BY-SA
 * and public domain. Anything else (GFDL-only, "Attribution", NC/ND, fair
 * use) returns undefined. `code` is extmetadata.License ("cc-by-sa-4.0"),
 * `short` is LicenseShortName ("CC BY-SA 4.0").
 */
export function acceptedLicense(code = "", short = ""): string | undefined {
  const c = code.trim().toLowerCase();
  const s = short.trim();
  if (c === "cc0" || /^cc0\b/i.test(s)) return "CC0";
  if (c === "pd" || c.startsWith("pd-") || /^public domain$/i.test(s) || /^pd\b/i.test(s))
    return "Public domain";
  const fromCode = /^cc-(by|by-sa)-(\d(?:\.\d)?)(?:-[a-z]+)?$/.exec(c);
  if (fromCode) return `CC ${fromCode[1].toUpperCase()} ${fromCode[2]}`;
  const fromShort = /^CC[ -](BY|BY-SA)[ -](\d(?:\.\d)?)(?:[ -][A-Za-z]+)?$/i.exec(s);
  if (fromShort) return `CC ${fromShort[1].toUpperCase()} ${fromShort[2]}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider responses
// ---------------------------------------------------------------------------

/** Plain text from Commons' HTML metadata ("<a href=…>Jane</a>" -> "Jane"). */
export function stripHtml(html = ""): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

type Meta = Record<string, { value?: string } | undefined>;
type CommonsPage = {
  title?: string;
  imageinfo?: {
    url?: string;
    descriptionurl?: string;
    thumburl?: string;
    width?: number;
    height?: number;
    size?: number;
    mime?: string;
    extmetadata?: Meta;
  }[];
};

const COMMONS_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

/** Commons search results (generator=search, prop=imageinfo) that pass the licence and size rules. */
export function parseCommons(json: unknown): Candidate[] {
  const pages = (json as { query?: { pages?: Record<string, CommonsPage> | CommonsPage[] } })?.query
    ?.pages;
  if (!pages) return [];
  const list = (Array.isArray(pages) ? pages : Object.values(pages)) as (CommonsPage & {
    index?: number;
  })[];
  list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: Candidate[] = [];
  for (const page of list) {
    const info = page.imageinfo?.[0];
    if (!info?.url || !info.width || !info.height || !info.descriptionurl) continue;
    if (!COMMONS_MIMES.has(info.mime ?? "")) continue;
    if (!isLandscape(info.width, info.height)) continue;
    if ((info.size ?? 0) > MAX_DOWNLOAD_BYTES) continue;
    const m = info.extmetadata ?? {};
    // Personality rights (identifiable people) are a reason to stay away.
    if (/personality/i.test(m.Restrictions?.value ?? "")) continue;
    const license = acceptedLicense(m.License?.value, m.LicenseShortName?.value);
    if (!license) continue;
    const author = stripHtml(m.Artist?.value) || "Unknown author";
    const title = (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
    out.push({
      provider: "wikimedia",
      id: page.title ?? info.url,
      title: stripHtml(m.ObjectName?.value) || title,
      description: stripHtml(m.ImageDescription?.value).slice(0, 300) || undefined,
      width: info.width,
      height: info.height,
      previewUrl: info.thumburl ?? info.url,
      downloadUrl: info.url,
      sourceUrl: info.descriptionurl,
      author,
      credit: `${author} / Wikimedia Commons`,
      license,
      licenseUrl: m.LicenseUrl?.value,
    });
  }
  return out;
}

type PixabayHit = {
  id: number;
  pageURL: string;
  tags?: string;
  imageWidth: number;
  imageHeight: number;
  webformatURL: string;
  largeImageURL: string;
  fullHDURL?: string;
  imageURL?: string;
  user: string;
};

/**
 * Pixabay hits. Standard API keys only get `largeImageURL` (1280 px), which
 * is below MIN_WIDTH, so only keys with full API access (fullHDURL, imageURL)
 * yield candidates.
 */
export function parsePixabay(json: unknown): Candidate[] {
  const hits = ((json as { hits?: PixabayHit[] })?.hits ?? []) as PixabayHit[];
  const out: Candidate[] = [];
  for (const h of hits) {
    if (!isLandscape(h.imageWidth, h.imageHeight)) continue;
    const ratio = h.imageWidth / h.imageHeight;
    const [url, width] = h.imageURL
      ? [h.imageURL, h.imageWidth]
      : h.fullHDURL
        ? [h.fullHDURL, Math.min(1920, h.imageWidth)]
        : [h.largeImageURL, Math.min(1280, h.imageWidth)];
    if (width < MIN_WIDTH) continue;
    out.push({
      provider: "pixabay",
      id: String(h.id),
      title: h.tags ?? "",
      width,
      height: Math.round(width / ratio),
      previewUrl: h.webformatURL,
      downloadUrl: url,
      sourceUrl: h.pageURL,
      author: h.user,
      credit: `${h.user} / Pixabay`,
      license: "Pixabay Content License",
      licenseUrl: "https://pixabay.com/service/license-summary/",
    });
  }
  return out;
}

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt?: string;
  photographer: string;
  photographer_url: string;
  photographer_id?: number;
  src: { original: string; large: string; large2x?: string };
};

/** Pexels photos, with the attribution fields Pexels asks us to keep. */
export function parsePexels(json: unknown): Candidate[] {
  const photos = ((json as { photos?: PexelsPhoto[] })?.photos ?? []) as PexelsPhoto[];
  return photos
    .filter((p) => isLandscape(p.width, p.height))
    .map((p) => ({
      provider: "pexels" as const,
      id: String(p.id),
      title: p.alt ?? "",
      width: p.width,
      height: p.height,
      previewUrl: p.src.large,
      downloadUrl: p.src.original,
      sourceUrl: p.url,
      author: p.photographer,
      credit: `${p.photographer} / Pexels`,
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      attribution: {
        photographer: p.photographer,
        photographer_url: p.photographer_url,
        ...(p.photographer_id ? { photographer_id: String(p.photographer_id) } : {}),
        photo_url: p.url,
      },
    }));
}

// ---------------------------------------------------------------------------
// Targets and queries
// ---------------------------------------------------------------------------

export type ImageTab = "Regions" | "SubRegions" | "Towns" | "Articles";

export type ImageTarget = {
  tab: ImageTab;
  slug: string;
  /** Heading of the page: place name or article title. */
  name: string;
  pageType?: string;
  regionName?: string;
  townName?: string;
  /** Site path, written to Images.used_on. */
  path: string;
};

/** "Épernay" -> "epernay", for matching place names in titles. */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Whether the page names a real place, which rules out a generated image
 * (CLAUDE.md). Place pages always do; an article does when it belongs to a
 * town or its title or slug contains any known place name. The scorer's own
 * judgment is added on top of this, never instead of it.
 */
export function namesPlace(target: ImageTarget, placeNames: string[]): boolean {
  if (target.tab !== "Articles") return true;
  if (target.townName) return true;
  const haystack = ` ${fold(`${target.name} ${target.slug.replace(/-/g, " ")}`).replace(/[^a-z0-9]+/g, " ")} `;
  return placeNames.some((p) => {
    const needle = fold(p)
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return needle.length > 2 && haystack.includes(` ${needle} `);
  });
}

/** Search queries, most specific first. Commons, Pixabay and Pexels share them. */
export function searchQueries(target: ImageTarget): string[] {
  const { tab, name, regionName, townName } = target;
  const qs: string[] = [];
  if (tab === "Regions") qs.push(`${name} vineyards`, `${name} vignoble`, `${name} wine region`);
  else if (tab === "SubRegions")
    qs.push(`${name} vineyards`, `${name} vignoble`, `${name} ${regionName ?? ""}`);
  else if (tab === "Towns") qs.push(`${name} vineyards`, `${name} vignes`, name);
  else {
    // Article titles are "Subject: details"; the subject is the useful part.
    const subject = name.split(":")[0].trim();
    qs.push(subject);
    if (townName) qs.push(`${townName} vineyards`);
    if (regionName) qs.push(`${regionName} vineyards`, `${regionName} wine cellar`);
  }
  return [...new Set(qs.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

/** Drops duplicates (same provider id or source page) and anything already used on the site. */
export function dedupeCandidates(candidates: Candidate[], used: Set<string>): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const keys = [`${c.provider}:${c.id}`, c.sourceUrl];
    if (keys.some((k) => seen.has(k) || used.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const scoreSchema = z.object({
  names_place: z.boolean(),
  scores: z.array(
    z.object({
      index: z.number().int().min(0),
      score: z.number().min(0).max(100),
      reject_reason: z.string().nullish(),
      notes: z.string().nullish(),
      alt: z.string().nullish(),
    }),
  ),
});

export type Scores = z.infer<typeof scoreSchema>;
export type Scored = Scores["scores"][number];

/** The highest-scoring candidate at or above `threshold` with no reject reason; ties go to the earlier one. */
export function pickBest(scores: Scored[], count: number, threshold: number): Scored | undefined {
  return scores
    .filter((s) => s.index < count && !s.reject_reason && s.score >= threshold)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Widths to produce for a source of `width` px: the fixed set, never upscaled. */
export function outputWidths(width: number): number[] {
  const ws = WIDTHS.filter((w) => w <= width);
  return ws.length ? ws : [WIDTHS[0]];
}

/** Blob path for one variant, e.g. images/towns/epernay-1a2b3c4d-1600.webp. */
export function variantPath(
  tab: ImageTab,
  slug: string,
  sourceKey: string,
  width: number,
  ext: "avif" | "webp",
) {
  const hash = createHash("sha1").update(sourceKey).digest("hex").slice(0, 8);
  return `images/${tab.toLowerCase()}/${slug}-${hash}-${width}.${ext}`;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * An XMP packet with creator, rights and source (IPTC Core via Dublin Core
 * and xmpRights), used when the source file carries no XMP of its own. AI
 * images are marked with the IPTC digital source type for generated media.
 */
export function creditXmp(p: {
  author: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
  isAi: boolean;
}): string {
  const rights = `${p.credit}${p.license ? `. ${p.license}` : ""}`;
  const dst = p.isAi
    ? `\n   <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>`
    : "";
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(p.author)}</rdf:li></rdf:Seq></dc:creator>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(rights)}</rdf:li></rdf:Alt></dc:rights>
   <photoshop:Credit>${xmlEscape(p.credit)}</photoshop:Credit>${p.sourceUrl ? `\n   <dc:source>${xmlEscape(p.sourceUrl)}</dc:source>` : ""}${p.licenseUrl ? `\n   <xmpRights:WebStatement>${xmlEscape(p.licenseUrl)}</xmpRights:WebStatement>` : ""}
   <xmpRights:Marked>${p.isAi || p.license === "CC0" || p.license === "Public domain" ? "False" : "True"}</xmpRights:Marked>${dst}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Whether a cached response written at `mtimeMs` is still usable (Pixabay asks for 24 h caching). */
export const isFresh = (mtimeMs: number, now: number, ttlMs = 24 * 60 * 60 * 1000) =>
  now - mtimeMs < ttlMs;
