import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";
import sharp from "sharp";

import {
  creditXmp,
  isFresh,
  outputWidths,
  parseCommons,
  parsePexels,
  parsePixabay,
  type Candidate,
} from "./lib/images";

/**
 * Network, image processing and storage for the `images` command: Commons,
 * Pixabay and Pexels searches, downloads, sharp conversion and Vercel Blob
 * uploads. Nothing here generates images; the site never uses generated ones.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "pipeline", ".cache");

/**
 * Wikimedia asks every API client for a descriptive User-Agent with a way
 * to reach the operator (meta.wikimedia.org/wiki/User-Agent_policy).
 */
export function userAgent(): string {
  const contact = process.env.IMAGES_CONTACT_EMAIL;
  if (!contact) throw new Error("IMAGES_CONTACT_EMAIL is not set (Wikimedia User-Agent contact)");
  return `FrenchVineyardImageBot/1.0 (https://frenchvineyard.com/; ${contact}) node/${process.versions.node}`;
}

async function fetchOk(url: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
  const headers = { "user-agent": userAgent(), ...(init.headers as Record<string, string>) };
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...init, headers });
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || i >= attempts - 1)
      throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
    const after = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, (after > 0 ? after : 2 ** i * 2) * 1_000));
  }
}

export async function fetchBuffer(url: string, headers: Record<string, string> = {}) {
  return Buffer.from(await (await fetchOk(url, { headers })).arrayBuffer());
}

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------

export async function searchCommons(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: "30",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    // 960 is one of Wikimedia's standard thumbnail steps.
    iiurlwidth: "960",
    iiextmetadatafilter:
      "Artist|LicenseShortName|License|LicenseUrl|ImageDescription|ObjectName|Restrictions",
    iiextmetadatalanguage: "en",
  });
  const res = await fetchOk(`https://commons.wikimedia.org/w/api.php?${params}`);
  return parseCommons(await res.json());
}

/** Pixabay requires responses to be cached for 24 hours; this keeps them on disk under pipeline/.cache/. */
async function cachedJson(name: string, cacheKey: string, url: string) {
  const file = path.join(CACHE, name, `${createHash("sha1").update(cacheKey).digest("hex")}.json`);
  try {
    if (isFresh((await stat(file)).mtimeMs, Date.now()))
      return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    // Not cached yet.
  }
  const json = (await (await fetchOk(url)).json()) as unknown;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(json));
  return json;
}

export async function searchPixabay(query: string): Promise<Candidate[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    key,
    q: query.slice(0, 100),
    image_type: "photo",
    orientation: "horizontal",
    min_width: "1600",
    safesearch: "true",
    per_page: "30",
    lang: "en",
  });
  const url = `https://pixabay.com/api/?${params}`;
  // The cache key leaves the API key out.
  return parsePixabay(await cachedJson("pixabay", url.replace(key, "KEY"), url));
}

export async function searchPexels(query: string): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    query,
    orientation: "landscape",
    size: "large",
    per_page: "30",
  });
  const res = await fetchOk(`https://api.pexels.com/v1/search?${params}`, {
    headers: { authorization: key },
  });
  return parsePexels(await res.json());
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** A JPEG small enough to score cheaply (768 px wide). */
export async function previewJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export type Variant = { width: number; ext: "avif" | "webp"; buffer: Buffer };

/**
 * AVIF and WebP at each fixed width up to the source's own width. EXIF, ICC
 * and XMP are kept (sharp's keepMetadata); WebP and AVIF have no IPTC-IIM
 * block, so when the source carries no XMP the credit goes into a new XMP
 * packet (IPTC Core fields) instead.
 */
export async function convert(
  buffer: Buffer,
  credit: Parameters<typeof creditXmp>[0],
): Promise<{ variants: Variant[]; width: number; height: number; keptXmp: boolean }> {
  const meta = await sharp(buffer).metadata();
  const oriented = meta.orientation && meta.orientation >= 5;
  const width = (oriented ? meta.height : meta.width) ?? 0;
  const height = (oriented ? meta.width : meta.height) ?? 0;
  const keptXmp = Boolean(meta.xmp?.length);
  const variants: Variant[] = [];
  for (const w of outputWidths(width)) {
    for (const ext of ["avif", "webp"] as const) {
      let img = sharp(buffer)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .keepMetadata();
      if (!keptXmp) img = img.withXmp(creditXmp(credit));
      img = ext === "avif" ? img.avif({ quality: 55, effort: 4 }) : img.webp({ quality: 78 });
      variants.push({ width: w, ext, buffer: await img.toBuffer() });
    }
  }
  return { variants, width, height, keptXmp };
}

/** Uploads one file to Vercel Blob (public, fixed path) and returns its URL. */
export async function upload(
  pathname: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}
