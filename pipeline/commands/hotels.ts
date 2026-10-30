import { readFile } from "node:fs/promises";
import path from "node:path";

import { sheetTag } from "@/lib/sheet-schema";

import { seenUrls, textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { withoutBlocked } from "../lib/blocklist";
import { BudgetExceeded } from "../lib/cost";
import { extractJsonBlock, normalizeUrl } from "../lib/facts";
import {
  BLURB_MAX,
  distanceKm,
  hotelProblems,
  hotelResearchSchema,
  hotelRowId,
  matchTown,
  parseHotelUrl,
  roundupsToQueue,
  tierFor,
} from "../lib/hotels";
import { allowedNumbers } from "../lib/numbers";
import { checkShortCopy, flagText } from "../lib/tours";
import { isAccountLimit } from "./images";
import { revalidate } from "./publish";
import { AUTO } from "./tours-enrich";

/**
 * Hotels stay the owner's choice: the owner pastes a hotel's Booking.com or
 * Expedia link into Hotels_Inbox, and these commands do the rest. Nothing
 * here finds or adds a hotel on its own.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT = path.join(ROOT, "content");

/** Columns the hotels commands add to the Hotels tab when missing. */
export const HOTEL_COLUMNS = ["status", "stars", "address", "listing_url", "notes_flag"];
const MAX_HOTEL_SEARCHES = 4;
/** A geocoded address farther than this from its town is ignored. */
const GEOCODE_MAX_KM = 15;

const truthy = (v?: string) => /^(true|yes|y|1)$/i.test((v ?? "").trim());

// ---------------------------------------------------------------------------
// hotels:import
// ---------------------------------------------------------------------------

/**
 * hotels:import: each unprocessed link in Hotels_Inbox becomes a draft
 * Hotels row (id, a provisional name from the link, booking_hotel_id or
 * expedia_id, listing_url, status=draft). Only the URL is read. A city or
 * search page stays unprocessed with the reason in `note`.
 */
export async function hotelsImport(ctx: Context): Promise<number> {
  if (!(await ctx.store.hasTab("Hotels_Inbox"))) {
    await ctx.store.ensureTab("Hotels_Inbox");
    ctx.log("created the Hotels_Inbox tab: paste hotel links into its url column");
  }
  await ctx.store.ensureColumns("Hotels_Inbox", ["note"]);
  await ctx.store.ensureColumns("Hotels", HOTEL_COLUMNS);

  const hotels = await ctx.store.rows("Hotels");
  const known = new Map<string, string>();
  for (const h of hotels) {
    if (h.booking_hotel_id) known.set(`booking|${h.booking_hotel_id}`, h.id);
    if (h.expedia_id) known.set(`expedia|${h.expedia_id}`, h.id);
  }
  const ids = new Set(hotels.map((h) => h.id));
  let added = 0;

  for (const [i, row] of (await ctx.store.rows("Hotels_Inbox")).entries()) {
    if (!row.url?.trim() || truthy(row.processed)) continue;
    // By position: the same link can be pasted twice.
    const mark = (patch: Record<string, string>) =>
      ctx.store.updateAt("Hotels_Inbox", i, {
        ...(row.added_at ? {} : { added_at: ctx.now() }),
        ...patch,
      });
    const parsed = parseHotelUrl(row.url);
    if (parsed.kind !== "hotel") {
      const why =
        parsed.kind === "listing" ? `${parsed.reason}, not a single hotel` : parsed.reason;
      await mark({ note: `Not imported: ${why}. Paste the hotel's own page.` });
      continue;
    }
    const key =
      parsed.provider === "booking" ? `booking|${parsed.bookingId}` : `expedia|${parsed.expediaId}`;
    const existing = known.get(key);
    if (existing) {
      await mark({ processed: "TRUE", note: `Already in Hotels as ${existing}` });
      continue;
    }
    let id = hotelRowId(parsed);
    for (let n = 2; ids.has(id); n++) id = `${hotelRowId(parsed)}-${n}`;
    await ctx.store.append("Hotels", {
      id,
      name: parsed.name,
      ...(parsed.provider === "booking"
        ? { booking_hotel_id: parsed.bookingId }
        : { expedia_id: parsed.expediaId }),
      listing_url: parsed.url,
      status: "draft",
    });
    ids.add(id);
    known.set(key, id);
    await mark({ processed: "TRUE", note: `Added to Hotels as ${id} (draft)` });
    ctx.log(`hotels inbox ${row.url}: added ${id}`);
    added++;
  }
  ctx.log(`hotels:import: ${added} draft hotel(s) added`);
  return added;
}

// ---------------------------------------------------------------------------
// hotels:enrich
// ---------------------------------------------------------------------------

/**
 * hotels:enrich: for draft hotels imported from links (no tier yet) or held
 * back before (notes_flag "auto: …"): one Sonnet-class call with web search
 * (research blocklist applied, so booking platforms are excluded) finds the
 * hotel's town among the site's towns, its official classification and
 * address on its own site or official registers, and writes best_for and a
 * blurb. OpenStreetMap's Nominatim gives the map position. A hotel in one of
 * the site's towns, with a star rating stated in a quoted source and a
 * bookable link, whose copy passes the checks, is published; otherwise it
 * stays a draft with the reasons in notes_flag. Only empty fields are
 * filled, except the provisional name from the link.
 */
export async function hotelsEnrich(ctx: Context): Promise<number> {
  await ctx.store.ensureColumns("Hotels", HOTEL_COLUMNS);
  const todo = (await ctx.store.rows("Hotels"))
    .filter(
      (h) =>
        h.status?.trim().toLowerCase() === "draft" &&
        (!h.tier?.trim() || h.notes_flag?.startsWith(AUTO)),
    )
    .slice(0, ctx.args.max);
  if (!todo.length) return 0;

  const prompt = await readFile(path.join(CONTENT, "prompts", "hotel-notes.md"), "utf8");
  const system = `${prompt}\n\n---\n\n## Style guide\n\n${ctx.files.styleGuide}`;
  const { towns, regions } = await ctx.siteRows();
  const liveTowns = towns.filter((t) => t.status === "published");
  const townList = liveTowns.map((t) => ({
    name: t.name,
    region: regions.find((r) => r.slug === t.region_slug)?.name,
  }));
  let published = 0;
  let wrote = false;

  // One at a time: geocoding allows one request a second, and drafts are few.
  for (const h of todo) {
    try {
      const fromLink = h.listing_url ? parseHotelUrl(h.listing_url) : undefined;
      const linkName = fromLink?.kind === "hotel" ? fromLink.name : undefined;
      const input = {
        name: h.name || linkName,
        town_in_link:
          fromLink?.kind === "hotel" && fromLink.provider === "expedia" ? fromLink.city : undefined,
        towns: townList,
      };
      const result = await ctx.claude.call(
        {
          model: ctx.config.model,
          max_tokens: 4_000,
          system,
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: MAX_HOTEL_SEARCHES,
              blocked_domains: ctx.files.researchBlocklist,
            },
          ],
          output_config: { effort: "low" },
          messages: [
            {
              role: "user",
              content: `Hotel:\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``,
            },
          ],
        },
        ESTIMATE_USD.hotelResearch,
      );
      ctx.log(
        `${h.id} research: $${result.usd.toFixed(4)} (run total $${ctx.budget.spent.toFixed(4)})`,
      );

      const research = hotelResearchSchema.parse(extractJsonBlock(textOf(result.message.content)));
      const seen = new Set(
        [...withoutBlocked(seenUrls(result.turns), ctx.files.researchBlocklist).keys()].map(
          (u) => normalizeUrl(u) ?? u,
        ),
      );
      const quotes = research.sources
        .filter((s) => seen.has(normalizeUrl(s.url) ?? s.url))
        .map((s) => s.quote);
      const town = matchTown(research.town, liveTowns);
      const problems = hotelProblems(research, town, quotes, {
        booking: h.booking_hotel_id,
        expedia: h.expedia_id,
      });
      const findings = checkShortCopy(
        { best_for: research.best_for, text: research.blurb },
        { field: "blurb", sentences: [1, 2], maxChars: BLURB_MAX, subject: "hotel" },
        {
          bannedPhrases: ctx.files.bannedPhrases,
          allowedNumbers: allowedNumbers({ name: research.name, stars: research.stars }, quotes),
          usdRate: ctx.config.usdRate,
        },
      );

      const position = town && research.address ? await geocode(research.address, town) : undefined;
      const fill: Record<string, string | undefined> = {
        town_slug: town?.slug,
        tier: tierFor(research.stars, research.palace ?? false),
        stars: research.palace ? "Palace" : research.stars?.toString(),
        address: research.address ?? undefined,
        lat: position?.lat.toString(),
        lng: position?.lng.toString(),
        ...(findings.length
          ? {}
          : { best_for: research.best_for.trim(), blurb: research.blurb.trim() }),
      };
      const patch: Record<string, string> = {};
      // The provisional name from the link gives way to the hotel's own spelling.
      if (research.name.trim() && (!h.name?.trim() || h.name === linkName))
        patch.name = research.name.trim();
      for (const [k, v] of Object.entries(fill)) if (v && !h[k]?.trim()) patch[k] = v;

      const reasons = [...problems, ...(findings.length ? [`copy: ${flagText(findings)}`] : [])];
      if (!reasons.length) {
        patch.status = "published";
        patch.notes_flag = "";
        published++;
        ctx.log(`${h.id}: published as ${patch.tier ?? h.tier} in ${town?.slug}`);
      } else {
        patch.notes_flag = `${AUTO} held as draft: ${reasons.join("; ")}`.slice(0, 480);
        ctx.log(`${h.id}: held as draft (${reasons.join("; ")})`);
      }
      await ctx.store.update("Hotels", "id", h.id, patch);
      wrote = true;
    } catch (error) {
      if (error instanceof BudgetExceeded || isAccountLimit(error)) {
        ctx.log(`stopping: ${(error as Error).message}`);
        break;
      }
      ctx.log(`${h.id}: not filled in (${(error as Error).message})`);
    }
  }

  if (wrote) await revalidate(ctx, [sheetTag("Hotels")]);
  ctx.log(
    `hotels:enrich: ${published} published, ${todo.length - published} held as draft or failed`,
  );
  return published;
}

/**
 * The map position of an address from OpenStreetMap's Nominatim (one
 * request, identified, within its usage policy), kept only if it lies
 * within GEOCODE_MAX_KM of the town.
 */
async function geocode(
  address: string,
  town: { lat?: number; lng?: number },
): Promise<{ lat: number; lng: number } | undefined> {
  const contact = process.env.IMAGES_CONTACT_EMAIL ?? "https://frenchvineyard.com/contact/";
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "fr");
  url.searchParams.set("q", address);
  await new Promise((r) => setTimeout(r, 1_100));
  const res = await fetch(url, {
    headers: { "user-agent": `FrenchVineyardBot/1.0 (+https://frenchvineyard.com/; ${contact})` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return undefined;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  if (!hit) return undefined;
  const point = { lat: Number(hit.lat), lng: Number(hit.lon) };
  if (
    town.lat != null &&
    town.lng != null &&
    distanceKm(point, { lat: town.lat, lng: town.lng }) > GEOCODE_MAX_KM
  )
    return undefined;
  return point;
}

// ---------------------------------------------------------------------------
// hotels:queue
// ---------------------------------------------------------------------------

/** hotels:queue: a hotel_roundup Queue row per town with 3+ published hotels, and per region with 3+ across two towns. */
export async function hotelsQueue(ctx: Context): Promise<number> {
  const [hotels, towns, regions, articles, queue] = await Promise.all([
    ctx.store.rows("Hotels"),
    ctx.store.rows("Towns"),
    ctx.store.rows("Regions"),
    ctx.store.rows("Articles"),
    ctx.store.rows("Queue"),
  ]);
  const plans = roundupsToQueue(
    hotels.map((h) => ({
      town_slug: h.town_slug,
      // As on the site: once Hotels has a status column, only "published" rows are live.
      status: h.status?.trim().toLowerCase() ?? "",
    })),
    towns
      .filter((t) => t.status === "published")
      .map((t) => ({ slug: t.slug, name: t.name, region_slug: t.region_slug })),
    regions.filter((r) => r.status === "published").map((r) => ({ slug: r.slug, name: r.name })),
    articles.map((a) => ({ slug: a.slug })),
    queue.map((q) => ({
      slug: q.slug,
      page_type: q.page_type,
      region_slug: q.region_slug,
      town_slug: q.town_slug,
    })),
  );
  const ids = new Set(queue.map((q) => q.id));
  let added = 0;
  for (const p of plans) {
    const id = `q-${p.slug}`;
    if (ids.has(id)) continue;
    await ctx.store.append("Queue", {
      id,
      target: "articles",
      slug: p.slug,
      page_type: "hotel_roundup",
      region_slug: p.region_slug,
      ...(p.town_slug ? { town_slug: p.town_slug } : {}),
      target_keyword: `where to stay in ${p.place}`.toLowerCase(),
      notes: `Where to stay in ${p.place}: the owner's ${p.hotels} published hotels.`,
      stage: "queued",
    });
    ids.add(id);
    added++;
    ctx.log(`queued ${id} (${p.hotels} hotels in ${p.place})`);
  }
  ctx.log(
    `hotels:queue: ${added} roundup(s) queued${ctx.args.dryRun ? " (dry run, not written)" : ""}`,
  );
  return added;
}
