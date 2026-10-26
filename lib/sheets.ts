import "server-only";

import { readFile } from "node:fs/promises";

import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { cacheLife, cacheTag } from "next/cache";

import { normalizePrivateKey, requireEnv } from "@/lib/env";
import {
  TABS,
  articleSchema,
  configSchema,
  estateSchema,
  hotelSchema,
  imageSchema,
  parseTab,
  regionSchema,
  sheetTag,
  subRegionSchema,
  tourSchema,
  townSchema,
  type Article,
  type ConfigRow,
  type Estate,
  type Hotel,
  type ImageRow,
  type LoadOptions,
  type Region,
  type SubRegion,
  type Tab,
  type Tour,
  type Town,
} from "@/lib/sheet-schema";

export type {
  Article,
  ConfigRow,
  Estate,
  Hotel,
  ImageRow,
  LoadOptions,
  Region,
  SubRegion,
  Tour,
  Town,
} from "@/lib/sheet-schema";

/** The only place in the app that reads the content Sheet. */

function getDoc(): GoogleSpreadsheet {
  const auth = new JWT({
    email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: normalizePrivateKey(requireEnv("GOOGLE_PRIVATE_KEY")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return new GoogleSpreadsheet(requireEnv("GOOGLE_SHEET_ID"), auth);
}

type BatchGetResponse = { valueRanges: { range: string; values?: unknown[][] }[] };

/**
 * Fetches every tab in a single values:batchGet call. Tagged with every tab's
 * tag, so revalidating any one tab refetches the lot in one request.
 */
async function fetchAllTabs(): Promise<Record<Tab, unknown[][]>> {
  "use cache";
  cacheLife("max");
  cacheTag(...TABS.map(sheetTag));

  // Local builds and CI can render every route from a JSON fixture
  // ({ "Regions": [[header...], [row...]], ... }) instead of the live Sheet.
  const fixture = process.env.SHEET_FIXTURE;
  if (fixture) {
    const grids = JSON.parse(await readFile(fixture, "utf8")) as Partial<Record<Tab, unknown[][]>>;
    return Object.fromEntries(TABS.map((tab) => [tab, grids[tab] ?? []])) as Record<
      Tab,
      unknown[][]
    >;
  }

  const params = new URLSearchParams();
  for (const tab of TABS) params.append("ranges", `'${tab}'`);
  // Raw numbers and booleans, but dates as the strings shown in the Sheet.
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  params.set("dateTimeRenderOption", "FORMATTED_STRING");

  const res = await getDoc()
    .sheetsApi.get("values:batchGet", { searchParams: params })
    .json<BatchGetResponse>();

  return Object.fromEntries(
    TABS.map((tab, i) => [tab, res.valueRanges[i]?.values ?? []]),
  ) as Record<Tab, unknown[][]>;
}

export async function getRegions(options: LoadOptions = {}): Promise<Region[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Regions"));
  const all = await fetchAllTabs();
  return parseTab("Regions", all.Regions, regionSchema, options);
}

export async function getSubRegions(options: LoadOptions = {}): Promise<SubRegion[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("SubRegions"));
  const all = await fetchAllTabs();
  return parseTab("SubRegions", all.SubRegions, subRegionSchema, options);
}

export async function getTowns(options: LoadOptions = {}): Promise<Town[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Towns"));
  const all = await fetchAllTabs();
  return parseTab("Towns", all.Towns, townSchema, options);
}

export async function getArticles(options: LoadOptions = {}): Promise<Article[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Articles"));
  const all = await fetchAllTabs();
  return parseTab("Articles", all.Articles, articleSchema, options);
}

export async function getHotels(options: LoadOptions = {}): Promise<Hotel[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Hotels"));
  const all = await fetchAllTabs();
  return parseTab("Hotels", all.Hotels, hotelSchema, options);
}

export async function getTours(options: LoadOptions = {}): Promise<Tour[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Tours"));
  const all = await fetchAllTabs();
  return parseTab("Tours", all.Tours, tourSchema, options);
}

export async function getEstates(options: LoadOptions = {}): Promise<Estate[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Estates"));
  const all = await fetchAllTabs();
  return parseTab("Estates", all.Estates, estateSchema, options);
}

export async function getConfigRows(): Promise<ConfigRow[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Config"));
  const all = await fetchAllTabs();
  return parseTab("Config", all.Config, configSchema);
}

export async function getImages(options: LoadOptions = {}): Promise<ImageRow[]> {
  "use cache";
  cacheLife("max");
  cacheTag(sheetTag("Images"));
  const all = await fetchAllTabs();
  return parseTab("Images", all.Images, imageSchema, options);
}
