import { createHash } from "node:crypto";

import { z } from "zod";

/**
 * Pure helpers for the `images` command: provider response parsing, licence
 * and size filters, search queries (specific, then broad), scoring and the
 * names and metadata of what gets uploaded. Network, sharp and Blob live in
 * pipeline/media.ts.
 */

export type Provider = "wikimedia" | "pixabay" | "pexels" | "viator";

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
/** Places among them kept for stock sources (Pixabay, Pexels) when they have results. */
export const STOCK_SLOTS = 3;
/** Commons originals above this are skipped rather than downloaded. */
export const MAX_DOWNLOAD_BYTES = 50_000_000;

export const isLandscape = (width: number, height: number, minWidth = MIN_WIDTH) =>
  width >= minWidth && height > 0 && width / height >= MIN_RATIO;

/** Card photos show at card width (about 400 CSS px), so they may be smaller than heroes. */
export const CARD_MIN_WIDTH = 640;

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
export function parseCommons(json: unknown, minWidth = MIN_WIDTH): Candidate[] {
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
    if (!isLandscape(info.width, info.height, minWidth)) continue;
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

type ViatorImage = {
  imageSource?: string;
  caption?: string;
  isCover?: boolean;
  variants?: { width: number; height: number; url: string }[];
};

/** Viator image sources a partner may show: the operator's and Viator's own, never travelers' uploads. */
const VIATOR_SOURCES = new Set(["SUPPLIER_PROVIDED", "PROFESSIONAL"]);

/**
 * A Viator product's own photos (Partner API v2 /products/{code}), cover
 * first, each at its largest landscape variant. Viator supplies them for
 * partners to show with the product; the credit names the operator.
 */
export function parseViatorImages(json: unknown, tourUrl: string): Candidate[] {
  const p = json as { title?: string; images?: ViatorImage[]; supplier?: { name?: string } };
  const operator = p.supplier?.name?.trim() || "Tour operator";
  const images = [...(p.images ?? [])].sort((a, b) => Number(!!b.isCover) - Number(!!a.isCover));
  const out: Candidate[] = [];
  for (const img of images) {
    if (!VIATOR_SOURCES.has(img.imageSource ?? "")) continue;
    const best = (img.variants ?? [])
      .filter((v) => isLandscape(v.width, v.height, CARD_MIN_WIDTH))
      .sort((a, b) => b.width - a.width)[0];
    if (!best) continue;
    out.push({
      provider: "viator",
      id: best.url,
      title: img.caption?.trim() || p.title || "",
      width: best.width,
      height: best.height,
      previewUrl: best.url,
      downloadUrl: best.url,
      sourceUrl: tourUrl,
      author: operator,
      credit: `${operator} / Viator`,
      license: "Viator partner content",
    });
  }
  return out;
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
  /** Wine area of the page or of its town, when it has one. */
  areaName?: string;
  townName?: string;
  /** French département, for the broad search pass. */
  department?: string;
  /** Site path, written to Images.used_on. */
  path: string;
  /** Parent pages whose hero this page may share, nearest first. */
  parents: { tab: ImageTab; slug: string }[];
};

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

/**
 * Départements for the broad search pass, by wine area, with each region's
 * main département for pages that have no wine area.
 */
export const DEPARTMENTS: Record<string, string> = {
  "montagne-de-reims": "Marne",
  "vallee-de-la-marne": "Marne",
  "cote-des-blancs": "Marne",
  "cote-de-sezanne": "Marne",
  "cote-des-bar": "Aube",
  medoc: "Gironde",
  graves: "Gironde",
  sauternais: "Gironde",
  libournais: "Gironde",
  "entre-deux-mers": "Gironde",
  chablis: "Yonne",
  "cote-de-nuits": "Côte-d'Or",
  "cote-de-beaune": "Côte-d'Or",
  "cote-chalonnaise": "Saône-et-Loire",
  maconnais: "Saône-et-Loire",
  // Regions
  champagne: "Marne",
  bordeaux: "Gironde",
  burgundy: "Côte-d'Or",
};

export const departmentFor = (areaSlug?: string, regionSlug?: string): string | undefined =>
  (areaSlug && DEPARTMENTS[areaSlug]) || (regionSlug && DEPARTMENTS[regionSlug]) || undefined;

/**
 * Broader queries for rows the specific pass left without a pick: the wine
 * area, the region and the département, each with "vignoble". Queries the
 * specific pass already ran are left out.
 */
export function broadQueries(target: ImageTarget): string[] {
  const { areaName, regionName, department, name } = target;
  const qs: string[] = [];
  if (areaName && areaName !== name) qs.push(`${areaName} vignoble`, `${areaName} vineyards`);
  if (regionName)
    qs.push(`vignoble ${regionName}`, `${regionName} vignoble`, `${regionName} vineyards`);
  if (department)
    qs.push(`vignoble ${department}`, `${department} vignoble`, `${department} vineyards`);
  const specific = new Set(searchQueries(target));
  return [...new Set(qs)].filter((q) => !specific.has(q));
}

/** Commons queries for a hotel's own photo, the exact name first. */
export function hotelQueries(name: string, town?: string): string[] {
  const n = name.replace(/\s+/g, " ").trim();
  const qs = [town ? `"${n}" ${town}` : `"${n}"`, town ? `${n} ${town}` : n, `${n} hotel`];
  return [...new Set(qs)];
}

/** Source page URLs from content/image-rejects.txt: one per line, # starts a comment. */
export function parseRejects(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
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

/**
 * The candidates one pass scores: up to `reserve` stock photos (Pixabay,
 * Pexels) are always included, Commons fills the rest, and further stock
 * photos fill any places Commons leaves empty. Commons comes first, so it
 * wins ties.
 */
export function mixCandidates(
  commons: Candidate[],
  stock: Candidate[],
  max = MAX_CANDIDATES,
  reserve = STOCK_SLOTS,
): Candidate[] {
  const kept = stock.slice(0, reserve);
  const fromCommons = commons.slice(0, max - kept.length);
  const extra = stock.slice(kept.length, kept.length + max - kept.length - fromCommons.length);
  return [...fromCommons, ...kept, ...extra];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const scoreSchema = z.object({
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

/** Tabs whose cards carry a photo (the `image` column). */
export type CardTab = "Tours" | "Hotels";

/** Blob path for one variant, e.g. images/towns/epernay-1a2b3c4d-1600.webp. */
export function variantPath(
  tab: ImageTab | CardTab,
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
 * and xmpRights), used when the source file carries no XMP of its own.
 */
export function creditXmp(p: {
  author: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
}): string {
  const rights = `${p.credit}${p.license ? `. ${p.license}` : ""}`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(p.author)}</rdf:li></rdf:Seq></dc:creator>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(rights)}</rdf:li></rdf:Alt></dc:rights>
   <photoshop:Credit>${xmlEscape(p.credit)}</photoshop:Credit>${p.sourceUrl ? `\n   <dc:source>${xmlEscape(p.sourceUrl)}</dc:source>` : ""}${p.licenseUrl ? `\n   <xmpRights:WebStatement>${xmlEscape(p.licenseUrl)}</xmpRights:WebStatement>` : ""}
   <xmpRights:Marked>${p.license === "CC0" || p.license === "Public domain" ? "False" : "True"}</xmpRights:Marked>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Whether a cached response written at `mtimeMs` is still usable (Pixabay asks for 24 h caching). */
export const isFresh = (mtimeMs: number, now: number, ttlMs = 24 * 60 * 60 * 1000) =>
  now - mtimeMs < ttlMs;
