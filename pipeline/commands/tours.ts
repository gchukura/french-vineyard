import { readFile } from "node:fs/promises";
import path from "node:path";

import { sheetTag } from "@/lib/sheet-schema";

import { seenUrls, textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { withoutBlocked } from "../lib/blocklist";
import { BudgetExceeded } from "../lib/cost";
import { extractJsonBlock, normalizeUrl } from "../lib/facts";
import { allowedNumbers } from "../lib/numbers";
import { pool } from "../lib/pool";
import {
  checkTourNotes,
  flagText,
  linkVerdict,
  parseGygTour,
  parseTourUrl,
  rankedListsToQueue,
  tourId,
  tourNotesSchema,
  type LinkVerdict,
  type TourProvider,
} from "../lib/tours";
import { isAccountLimit } from "./images";
import { revalidate } from "./publish";

/**
 * Tours stay the owner's: these commands read the Tours tab, check links,
 * write notes and plan ranked lists, but never choose, add or reorder a tour
 * on their own. tours:import only turns URLs the owner pasted into draft rows.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT = path.join(ROOT, "content");

/** Columns the tours commands add to the Tours tab when missing. */
export const TOURS_FLAG_COLUMNS = ["link_flag", "notes_flag"];

const PROVIDER_NAMES: Record<TourProvider, string> = {
  gyg: "GetYourGuide",
  viator: "Viator",
  winalist: "Winalist",
};

const truthy = (v?: string) => /^(true|yes|y|1)$/i.test((v ?? "").trim());
const isPublished = (r: Record<string, string>) => r.status?.trim().toLowerCase() === "published";

// ---------------------------------------------------------------------------
// tours:import
// ---------------------------------------------------------------------------

/**
 * tours:import: each unprocessed URL in Tours_Inbox becomes a draft Tours row
 * (id, provider, provider_id, provider_url, status=draft) and is marked
 * processed. Only the URL is parsed; the tour page is never fetched. A URL
 * that isn't a product page stays unprocessed with the reason in `note`.
 */
export async function toursImport(ctx: Context): Promise<number> {
  if (!(await ctx.store.hasTab("Tours_Inbox"))) {
    await ctx.store.ensureTab("Tours_Inbox");
    ctx.log("created the Tours_Inbox tab: paste tour URLs into its url column");
  }
  await ctx.store.ensureColumns("Tours_Inbox", ["note"]);

  const tours = await ctx.store.rows("Tours");
  const byProduct = new Map(tours.map((t) => [`${t.provider}|${t.provider_id}`, t.id]));
  const ids = new Set(tours.map((t) => t.id));
  let added = 0;

  for (const row of await ctx.store.rows("Tours_Inbox")) {
    const url = row.url?.trim();
    if (!url || truthy(row.processed)) continue;
    const mark = (patch: Record<string, string>) =>
      ctx.store.update("Tours_Inbox", "url", row.url, {
        ...(row.added_at ? {} : { added_at: ctx.now() }),
        ...patch,
      });

    const parsed = parseTourUrl(url);
    if (parsed.kind !== "product") {
      const why = parsed.kind === "listing" ? `${parsed.reason}, not a single tour` : parsed.reason;
      await mark({ note: `Not imported: ${why}. Paste the tour's own page.` });
      ctx.log(`inbox ${url}: skipped (${why})`);
      continue;
    }

    const existing = byProduct.get(`${parsed.provider}|${parsed.providerId}`);
    if (existing) {
      await mark({ processed: "TRUE", note: `Already in Tours as ${existing}` });
      ctx.log(`inbox ${url}: already in Tours as ${existing}`);
      continue;
    }

    let id = tourId(parsed.provider, parsed.providerId);
    for (let n = 2; ids.has(id); n++) id = `${tourId(parsed.provider, parsed.providerId)}-${n}`;
    await ctx.store.append("Tours", {
      id,
      provider: parsed.provider,
      provider_id: parsed.providerId,
      provider_url: parsed.url,
      status: "draft",
    });
    ids.add(id);
    byProduct.set(`${parsed.provider}|${parsed.providerId}`, id);
    await mark({ processed: "TRUE", note: `Added to Tours as ${id} (draft)` });
    ctx.log(`inbox ${url}: added ${id}`);
    added++;
  }
  ctx.log(`tours:import: ${added} draft tour(s) added`);
  return added;
}

// ---------------------------------------------------------------------------
// tours:check
// ---------------------------------------------------------------------------

const CHECK_UA =
  "FrenchVineyardLinkCheck/1.0 (+https://frenchvineyard.com/; weekly check of the site's own affiliate links)";

/**
 * tours:check: for every published tour, follows its /go/ link to the
 * provider and records the verdict: last_checked on success, a dated
 * link_flag when the link errors or lands on a search or listing page. With
 * GYG_API_KEY, GetYourGuide tours are refreshed from the Partner API instead
 * (price_from_eur, rating, review_count).
 */
export async function toursCheck(ctx: Context): Promise<void> {
  await ctx.store.ensureColumns("Tours", TOURS_FLAG_COLUMNS);
  const gygKey = process.env.GYG_API_KEY;
  // Every published tour: link checks cost nothing, so --max doesn't apply.
  const tours = (await ctx.store.rows("Tours")).filter(isPublished);
  const counts = { ok: 0, flagged: 0, unverified: 0, errors: 0 };
  let wrote = false;

  await pool(tours, 3, async (t) => {
    try {
      const provider = t.provider as TourProvider;
      if (provider === "gyg" && gygKey) {
        const result = await gygRefresh(t.provider_id, gygKey);
        if (result.status === "ok") {
          await ctx.store.update("Tours", "id", t.id, {
            ...Object.fromEntries(Object.entries(result.facts).map(([k, v]) => [k, String(v)])),
            last_checked: ctx.today,
            link_flag: "",
          });
          counts.ok++;
          ctx.log(`${t.id}: GetYourGuide API ${JSON.stringify(result.facts)}`);
        } else {
          await ctx.store.update("Tours", "id", t.id, {
            link_flag: `${ctx.today}: ${result.reason}`,
          });
          counts.flagged++;
          ctx.log(`${t.id}: flagged (${result.reason})`);
        }
        wrote = true;
        return;
      }

      const verdict = await followGoLink(ctx.config.siteUrl, t);
      if (verdict.status === "ok") {
        await ctx.store.update("Tours", "id", t.id, { last_checked: ctx.today, link_flag: "" });
        counts.ok++;
        wrote = true;
      } else if (verdict.status === "flag") {
        await ctx.store.update("Tours", "id", t.id, {
          link_flag: `${ctx.today}: ${verdict.reason}`,
        });
        counts.flagged++;
        wrote = true;
      } else counts.unverified++;
      ctx.log(`${t.id}: ${verdict.status}${"reason" in verdict ? ` (${verdict.reason})` : ""}`);
    } catch (error) {
      counts.errors++;
      ctx.log(`${t.id}: check failed, nothing written (${(error as Error).message})`);
    }
  });

  if (wrote) await revalidate(ctx, [sheetTag("Tours")]);
  ctx.log(
    `tours:check: ${counts.ok} ok, ${counts.flagged} flagged, ${counts.unverified} unverified (provider refused the check), ${counts.errors} failed`,
  );
}

/**
 * Follows the site's own /go/ link: first the site's redirect (a 404 there
 * means the row can't be linked at all), then the provider's redirects to
 * where the visitor would finally land. The x-link-check header keeps the
 * visit out of the click log.
 */
async function followGoLink(siteUrl: string, t: Record<string, string>): Promise<LinkVerdict> {
  const go = `${siteUrl}/go/${encodeURIComponent(t.provider)}/${encodeURIComponent(t.id)}/?slot=link-check`;
  const headers = { "user-agent": CHECK_UA, "x-link-check": "1" };
  const first = await fetch(go, {
    redirect: "manual",
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const location = first.headers.get("location");
  if (first.status === 404)
    return {
      status: "flag",
      reason: "the site's /go/ link returns 404: check provider and provider_url",
    };
  if (first.status < 300 || first.status >= 400 || !location)
    return { status: "flag", reason: `the site's /go/ link answered HTTP ${first.status}` };

  try {
    const res = await fetch(new URL(location, go), {
      redirect: "follow",
      headers: { "user-agent": CHECK_UA, "accept-language": "en" },
      signal: AbortSignal.timeout(30_000),
    });
    await res.body?.cancel();
    return linkVerdict(t.provider as TourProvider, res.url, res.status);
  } catch (error) {
    return {
      status: "flag",
      reason: `the provider's page did not load (${(error as Error).message})`,
    };
  }
}

type GygResult =
  { status: "ok"; facts: ReturnType<typeof parseGygTour> } | { status: "flag"; reason: string };

/** GetYourGuide Partner API, GET /1/tours/{tour_id}, prices in EUR. */
async function gygRefresh(providerId: string, key: string): Promise<GygResult> {
  if (!/^\d+$/.test(providerId))
    return { status: "flag", reason: `provider_id "${providerId}" is not a GetYourGuide tour id` };
  const res = await fetch(
    `https://api.getyourguide.com/1/tours/${providerId}?cnt_language=en&currency=EUR`,
    {
      headers: { "X-ACCESS-TOKEN": key, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (res.status === 404) return { status: "flag", reason: "GetYourGuide API: tour not found" };
  if (!res.ok) throw new Error(`GetYourGuide API answered HTTP ${res.status}`);
  return { status: "ok", facts: parseGygTour(await res.json()) };
}

// ---------------------------------------------------------------------------
// tours:describe
// ---------------------------------------------------------------------------

const MAX_TOUR_SEARCHES = 3;

/**
 * tours:describe: writes best_for and why_picked for published tours where
 * either is empty, with a Sonnet-class model, web search (blocklist
 * respected), content/prompts/tour-notes.md, the style guide and the
 * selection rules. The notes must pass checkTourNotes; only empty fields are
 * filled, and a failure leaves them empty with the reason in notes_flag.
 */
export async function toursDescribe(ctx: Context): Promise<void> {
  await ctx.store.ensureColumns("Tours", TOURS_FLAG_COLUMNS);
  const prompt = await readFile(path.join(CONTENT, "prompts", "tour-notes.md"), "utf8");
  const system = [
    prompt,
    `## Style guide\n\n${ctx.files.styleGuide}`,
    `## Tour selection rules\n\n${ctx.files.selectionRules}`,
  ].join("\n\n---\n\n");
  const { regions, towns } = await ctx.siteRows();
  const todo = (await ctx.store.rows("Tours"))
    .filter((t) => isPublished(t) && (!t.best_for?.trim() || !t.why_picked?.trim()))
    .slice(0, ctx.args.max);
  ctx.log(`tours:describe: ${todo.length} published tour(s) need notes`);
  let written = 0;
  let stopped = false;

  await pool(todo, 2, async (t) => {
    if (stopped) return;
    try {
      if (!t.title?.trim()) {
        await ctx.store.update("Tours", "id", t.id, {
          notes_flag: `${ctx.today}: describe: add a title first`,
        });
        return;
      }
      const tour = {
        title: t.title,
        provider: PROVIDER_NAMES[t.provider as TourProvider] ?? t.provider,
        category: t.category || undefined,
        region: regions.find((r) => r.slug === t.region_slug)?.name ?? t.region_slug,
        town: towns.find((x) => x.slug === t.town_slug)?.name,
        duration: t.duration || undefined,
        price_from_eur: t.price_from_eur ? Number(t.price_from_eur) : undefined,
        rating: t.rating ? Number(t.rating) : undefined,
        review_count: t.review_count ? Number(t.review_count) : undefined,
        highlights: parseBullets(t.bullets_json),
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
              max_uses: MAX_TOUR_SEARCHES,
              blocked_domains: ctx.files.researchBlocklist,
            },
          ],
          output_config: { effort: "low" },
          messages: [
            {
              role: "user",
              content: `EUR to USD rate: ${ctx.config.usdRate}\n\nTour data:\n\n\`\`\`json\n${JSON.stringify(tour, null, 2)}\n\`\`\``,
            },
          ],
        },
        ESTIMATE_USD.tourNotes,
      );
      ctx.log(
        `${t.id} describe: $${result.usd.toFixed(4)} (run total $${ctx.budget.spent.toFixed(4)})`,
      );

      const notes = tourNotesSchema.parse(extractJsonBlock(textOf(result.message.content)));
      // A quoted source counts only if search actually returned it and it isn't blocked.
      const seen = new Set(
        [...withoutBlocked(seenUrls(result.turns), ctx.files.researchBlocklist).keys()].map(
          (u) => normalizeUrl(u) ?? u,
        ),
      );
      const quotes = notes.sources
        .filter((s) => seen.has(normalizeUrl(s.url) ?? s.url))
        .map((s) => s.quote);
      const findings = checkTourNotes(notes, {
        bannedPhrases: ctx.files.bannedPhrases,
        allowedNumbers: allowedNumbers(tour, quotes),
        usdRate: ctx.config.usdRate,
      });
      if (findings.length) {
        await ctx.store.update("Tours", "id", t.id, {
          notes_flag: `${ctx.today}: describe: ${flagText(findings)}`,
        });
        ctx.log(`${t.id}: notes failed the checks, left empty (${flagText(findings)})`);
        return;
      }
      // Never overwrite what the owner wrote.
      await ctx.store.update("Tours", "id", t.id, {
        ...(t.best_for?.trim() ? {} : { best_for: notes.best_for.trim() }),
        ...(t.why_picked?.trim() ? {} : { why_picked: notes.why_picked.trim() }),
        notes_flag: "",
      });
      written++;
      ctx.log(`${t.id}: best_for "${notes.best_for.trim()}"`);
    } catch (error) {
      if (error instanceof BudgetExceeded || isAccountLimit(error)) {
        if (!stopped) ctx.log(`stopping: ${(error as Error).message}`);
        stopped = true;
        return;
      }
      await ctx.store.update("Tours", "id", t.id, {
        notes_flag: `${ctx.today}: describe failed: ${(error as Error).message.slice(0, 200)}`,
      });
      ctx.log(`${t.id}: describe failed (${(error as Error).message})`);
    }
  });

  if (written) await revalidate(ctx, [sheetTag("Tours")]);
  ctx.log(`tours:describe: ${written} tour(s) got notes`);
}

function parseBullets(raw?: string): string[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// tours:queue
// ---------------------------------------------------------------------------

/**
 * tours:queue: adds a ranked_list Queue row for each region + category with
 * at least three published tours and no ranked list yet. The list itself is
 * the owner's tours in the owner's rank order; this only asks for the page.
 */
export async function toursQueue(ctx: Context): Promise<number> {
  const [tours, articles, queue, regions] = await Promise.all([
    ctx.store.rows("Tours"),
    ctx.store.rows("Articles"),
    ctx.store.rows("Queue"),
    ctx.store.rows("Regions"),
  ]);
  const plans = rankedListsToQueue(
    tours.map((t) => ({
      region_slug: t.region_slug,
      category: t.category,
      status: t.status?.trim().toLowerCase() ?? "",
    })),
    articles.map((a) => ({ slug: a.slug, page_type: a.page_type })),
    queue.map((q) => ({
      slug: q.slug,
      page_type: q.page_type,
      region_slug: q.region_slug,
      category: q.category,
    })),
  );
  const ids = new Set(queue.map((q) => q.id));
  let added = 0;
  for (const p of plans) {
    const region = regions.find((r) => r.slug === p.region_slug)?.name ?? p.region_slug;
    const id = `q-${p.slug}`;
    if (ids.has(id)) {
      ctx.log(`${id} is already a Queue id; skipped ${p.slug}`);
      continue;
    }
    await ctx.store.append("Queue", {
      id,
      target: "articles",
      slug: p.slug,
      page_type: "ranked_list",
      region_slug: p.region_slug,
      category: p.category,
      target_keyword: `best ${region} ${p.category}`.toLowerCase(),
      notes: `Ranked list of the owner's ${p.tours} published "${p.category}" tours in ${region}, in the owner's rank order.`,
      stage: "queued",
    });
    ids.add(id);
    added++;
    ctx.log(`queued ${id} (${p.tours} ${p.category} tours in ${region})`);
  }
  ctx.log(
    `tours:queue: ${added} ranked list(s) queued${ctx.args.dryRun ? " (dry run, not written)" : ""}`,
  );
  return added;
}
