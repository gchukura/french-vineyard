import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { sheetTag } from "@/lib/sheet-schema";
import { toursHref, townHref } from "@/lib/site";

import { textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { BudgetExceeded } from "../lib/cost";
import { extractJsonBlock } from "../lib/facts";
import {
  CARD_MIN_WIDTH,
  dedupeCandidates,
  hotelQueries,
  MAX_CANDIDATES,
  parseRejects,
  parseViatorImages,
  pickBest,
  scoreSchema,
  variantPath,
  type Candidate,
  type CardTab,
} from "../lib/images";
import { pool } from "../lib/pool";
import { convert, fetchBuffer, previewJpeg, searchCommons, upload } from "../media";
import { IMAGES_COLUMNS, isAccountLimit } from "./images";
import { revalidate } from "./publish";
import { viatorApi } from "./tours-enrich";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT = path.join(ROOT, "content");

export const CARD_IMAGE_COLUMNS = ["image", "image_credit"];

export type CardTarget = {
  tab: CardTab;
  id: string;
  name: string;
  /** Tours: provider and product id, for the provider's own photos. */
  provider?: string;
  providerId?: string;
  providerUrl?: string;
  address?: string;
  townSlug?: string;
  townName?: string;
  regionSlug?: string;
  regionName?: string;
  /** The page whose credit line lists the photo (Images.used_on). */
  path: string;
};

export type CardChoice = {
  target: CardTarget;
  /** picked: its own photo; fallback: its town's or region's hero; none: neither. */
  outcome: "picked" | "fallback" | "none" | "error";
  reason?: string;
  candidates: number;
  chosen?: Candidate & { score: number; alt: string; notes?: string | null };
  image?: string;
  from?: string;
};

const published = (r: Record<string, string>) => r.status?.trim().toLowerCase() === "published";

/** Whether --only names this row, by id or as Tab/id. */
export const namedCard = (only: string[] | undefined, tab: CardTab, id: string) =>
  Boolean(only?.some((o) => o === id || o === `${tab}/${id}`));

/**
 * card-images [n]: photos for published Tours and Hotels rows with an empty
 * `image`. Tours are offered their provider's own photos (Viator's partner
 * API: the operator's and Viator's photos, never travelers' uploads);
 * hotels, Commons photos found by the hotel's name and town. A vision model
 * screens them against content/prompts/card-image-score.md (no drinking
 * scenes; a hotel photo must show that hotel); the best at or above
 * IMAGES_MIN_SCORE is stored on Blob at the fixed widths and credited in the
 * Images tab. A row with no pick takes its town's hero, else its region's.
 * Never generates images. With `auto` (after tours:import / hotels:import)
 * it waits quietly when Blob or the Wikimedia contact isn't configured.
 */
export async function cardImages(ctx: Context, { auto = false } = {}): Promise<CardChoice[]> {
  const blobAuth =
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  const missing = [
    !ctx.args.dryRun && !blobAuth ? "BLOB_READ_WRITE_TOKEN" : "",
    process.env.IMAGES_CONTACT_EMAIL ? "" : "IMAGES_CONTACT_EMAIL",
  ].filter(Boolean);
  if (missing.length) {
    const why = `card-images needs ${missing.join(" and ")}`;
    if (auto) {
      ctx.log(`${why}; card photos wait`);
      return [];
    }
    throw new Error(`${why} (use --dry-run to preview picks without Blob).`);
  }

  const instructions = await readFile(path.join(CONTENT, "prompts", "card-image-score.md"), "utf8");
  const rejects = parseRejects(await readFile(path.join(CONTENT, "image-rejects.txt"), "utf8"));
  const threshold = Number(process.env.IMAGES_MIN_SCORE || 70);
  const model = process.env.PIPELINE_IMAGE_MODEL || ctx.config.model;

  const targets = await collectCards(ctx);
  const todo = targets
    .filter((t) => !ctx.args.only || namedCard(ctx.args.only, t.tab, t.id))
    .slice(0, auto ? undefined : ctx.args.max);
  ctx.log(
    `card-images: ${targets.length} published tour(s) and hotel(s) without a photo; doing ${todo.length}`,
  );
  if (!todo.length) return [];

  for (const tab of new Set(todo.map((t) => t.tab)))
    await ctx.store.ensureColumns(tab, CARD_IMAGE_COLUMNS);
  await ctx.store.ensureColumns("Images", IMAGES_COLUMNS);

  const used = new Set(
    (await ctx.store.rows("Images")).flatMap((i) => [i.source_url, i.url]).filter(Boolean),
  );
  for (const url of rejects) used.add(url);
  const outDir = path.join(
    ROOT,
    "pipeline",
    ctx.args.dryRun ? ".dry-run" : ".images",
    `card-images-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
  );
  await mkdir(outDir, { recursive: true });

  const o = { system: instructions, model, threshold, used, outDir };
  const picks: CardChoice[] = [];
  let stopped = false;
  await pool(todo, 3, async (target) => {
    if (stopped) return;
    try {
      const pick = await cardImageFor(ctx, target, o);
      picks.push(pick);
      const what = pick.chosen
        ? ` ${pick.chosen.provider} ${pick.chosen.score} "${pick.chosen.title.slice(0, 50)}"`
        : pick.from
          ? ` from ${pick.from}`
          : "";
      ctx.log(
        `${target.tab}/${target.id}: ${pick.outcome}${what}${pick.reason ? ` (${pick.reason})` : ""}`,
      );
    } catch (error) {
      if (error instanceof BudgetExceeded || isAccountLimit(error)) {
        if (!stopped) ctx.log(`stopping: ${(error as Error).message}`);
        stopped = true;
        return;
      }
      const reason = (error as Error).message;
      picks.push({ target, outcome: "error", reason, candidates: 0 });
      ctx.log(`${target.tab}/${target.id}: error ${reason}`);
    }
  });

  const touched = [...new Set(picks.filter((p) => p.image).map((p) => p.target.tab))];
  if (touched.length)
    await revalidate(
      ctx,
      [...touched, "Images" as const].map((t) => sheetTag(t)),
    );
  await writeFile(path.join(outDir, "picks.json"), JSON.stringify(picks, null, 2));
  const count = (x: CardChoice["outcome"]) => picks.filter((p) => p.outcome === x).length;
  ctx.log(
    `card-images: ${count("picked")} own photo(s), ${count("fallback")} town or region hero(es), ${count("none")} without, ${count("error")} error(s); previews in ${path.relative(ROOT, outDir)}/`,
  );
  return picks;
}

/** Published tours and hotels with no photo yet (or named with --redo --only). */
async function collectCards(ctx: Context): Promise<CardTarget[]> {
  const site = await ctx.siteRows();
  const town = (slug?: string) => site.towns.find((t) => t.slug === slug);
  const region = (slug?: string) => site.regions.find((r) => r.slug === slug);
  const want = (r: Record<string, string>, tab: CardTab) =>
    published(r) &&
    (!r.image?.trim() || Boolean(ctx.args.redo && namedCard(ctx.args.only, tab, r.id)));

  const tours = (await ctx.store.rows("Tours"))
    .filter((r) => want(r, "Tours"))
    .map((r) => ({
      tab: "Tours" as const,
      id: r.id,
      name: r.title,
      provider: r.provider,
      providerId: r.provider_id,
      providerUrl: r.provider_url,
      townSlug: r.town_slug || undefined,
      townName: town(r.town_slug)?.name,
      regionSlug: r.region_slug,
      regionName: region(r.region_slug)?.name,
      path: toursHref(r.region_slug),
    }));
  const hotels = (await ctx.store.rows("Hotels"))
    .filter((r) => want(r, "Hotels"))
    .map((r) => {
      const t = town(r.town_slug);
      return {
        tab: "Hotels" as const,
        id: r.id,
        name: r.name,
        address: r.address || undefined,
        townSlug: r.town_slug,
        townName: t?.name,
        regionSlug: t?.region_slug,
        regionName: region(t?.region_slug)?.name,
        path: townHref(r.town_slug),
      };
    });
  return [...tours, ...hotels];
}

type Options = {
  system: string;
  model: string;
  threshold: number;
  used: Set<string>;
  outDir: string;
};

/** The provider's photos for a tour, or Commons photos for a hotel. */
async function candidatesFor(ctx: Context, t: CardTarget, used: Set<string>) {
  if (t.tab === "Tours") {
    if (t.provider !== "viator" || !t.providerId || !process.env.VIATOR_API_KEY) return [];
    const product = await viatorApi(
      `/products/${encodeURIComponent(t.providerId)}`,
      process.env.VIATOR_API_KEY,
    );
    // A tour's photos all share the tour page as their source, so they're
    // filtered by their own URL: content/image-rejects.txt can list one.
    return parseViatorImages(product, t.providerUrl || `viator:${t.providerId}`)
      .filter((c) => !used.has(c.downloadUrl))
      .slice(0, MAX_CANDIDATES);
  }
  let list: Candidate[] = [];
  for (const q of hotelQueries(t.name, t.townName)) {
    if (list.length >= MAX_CANDIDATES) break;
    try {
      list = dedupeCandidates([...list, ...(await searchCommons(q, CARD_MIN_WIDTH))], used);
    } catch (error) {
      ctx.log(`${t.id}: Commons "${q}" failed: ${(error as Error).message}`);
      break;
    }
  }
  return list.slice(0, MAX_CANDIDATES);
}

async function cardImageFor(ctx: Context, t: CardTarget, o: Options): Promise<CardChoice> {
  const candidates = await candidatesFor(ctx, t, o.used);
  const previews = (
    await Promise.all(
      candidates.map(async (c) => {
        try {
          return { c, jpeg: await previewJpeg(await fetchBuffer(c.previewUrl)) };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x) => x !== null);

  if (previews.length) {
    const scored = await score(ctx, t, previews, o);
    const best = pickBest(scored.scores, previews.length, o.threshold);
    if (best) {
      const c = previews[best.index].c;
      const chosen = {
        ...c,
        score: best.score,
        alt: best.alt?.trim() || t.name,
        notes: best.notes,
      };
      const buffer = await fetchBuffer(c.downloadUrl);
      const image = await storeCard(ctx, t, chosen, buffer, previews[best.index].jpeg, o);
      return { target: t, outcome: "picked", candidates: previews.length, chosen, image };
    }
  }

  const reason = previews.length
    ? `nothing scored ${o.threshold}+`
    : t.tab === "Tours" && t.provider !== "viator"
      ? `no photo source for ${t.provider} yet`
      : "no candidates";
  const fallback = await shareParentHero(ctx, t);
  return fallback
    ? { target: t, outcome: "fallback", candidates: previews.length, reason, ...fallback }
    : {
        target: t,
        outcome: "none",
        candidates: previews.length,
        reason: `${reason}; no town or region hero`,
      };
}

async function score(
  ctx: Context,
  t: CardTarget,
  previews: { c: Candidate; jpeg: Buffer }[],
  o: Options,
) {
  const card = [
    t.tab === "Tours" ? `Tour card: "${t.name}"` : `Hotel card: "${t.name}"`,
    t.address ? `Address: ${t.address}` : "",
    t.townName ? `Town: ${t.townName}` : "",
    t.regionName ? `Region: ${t.regionName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const content: BetaContentBlockParam[] = [{ type: "text", text: card }];
  previews.forEach(({ c, jpeg }, i) => {
    content.push({
      type: "text",
      text: `Candidate ${i} (${c.provider}): ${c.title}${c.description ? ` — ${c.description}` : ""}`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
    });
  });
  content.push({
    type: "text",
    text: `Score all ${previews.length} candidate(s) and reply with the JSON block.`,
  });
  const result = await ctx.claude.call(
    {
      model: o.model,
      max_tokens: 4_000,
      system: o.system,
      output_config: { effort: "low" },
      messages: [{ role: "user", content }],
    },
    ESTIMATE_USD.imageScore,
  );
  ctx.log(
    `${t.id} score: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out = $${result.usd.toFixed(4)} (run total $${ctx.budget.spent.toFixed(4)})`,
  );
  return scoreSchema.parse(extractJsonBlock(textOf(result.message.content)));
}

/** Blob-safe name for a row id ("viator-17408p6", "booking-le-3-par-champagne-thienot"). */
export const cardSlug = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Converts and uploads (or saves, in a dry run) the pick, then writes the row and its Images line. */
async function storeCard(
  ctx: Context,
  t: CardTarget,
  chosen: Candidate & { alt: string },
  buffer: Buffer,
  preview: Buffer,
  o: Options,
): Promise<string> {
  o.used.add(chosen.sourceUrl);
  const { variants } = await convert(buffer, {
    author: chosen.author,
    credit: chosen.credit,
    license: chosen.license,
    licenseUrl: chosen.licenseUrl,
    sourceUrl: chosen.sourceUrl,
  });
  const slug = cardSlug(t.id);
  const dir = path.join(o.outDir, `${t.tab.toLowerCase()}-${slug}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "preview.jpg"), preview);

  let image = "";
  for (const v of variants) {
    const p = variantPath(t.tab, slug, chosen.id, v.width, v.ext);
    let url = `dry-run://${p}`;
    if (ctx.args.dryRun) await writeFile(path.join(dir, path.basename(p)), v.buffer);
    else url = await upload(p, v.buffer, `image/${v.ext}`);
    // Variants come smallest first; the row keeps the largest WebP and the
    // site's loader picks the stored width it needs.
    if (v.ext === "webp") image = url;
  }
  await ctx.store.update(t.tab, "id", t.id, { image, image_credit: chosen.credit });
  await ctx.store.append("Images", {
    url: image,
    alt: chosen.alt,
    credit: chosen.credit,
    license: chosen.license,
    source_url: chosen.sourceUrl,
    is_ai: "FALSE",
    used_on: t.path,
  });
  return image;
}

/** Gives the card its town's hero, else its region's, and lists the card's page on that photo's credit. */
async function shareParentHero(ctx: Context, t: CardTarget) {
  const parents = [
    ["Towns", t.townSlug],
    ["Regions", t.regionSlug],
  ] as const;
  for (const [tab, slug] of parents) {
    if (!slug) continue;
    const row = (await ctx.store.rows(tab)).find((r) => r.slug === slug);
    if (!row?.hero_image || !published(row)) continue;
    await ctx.store.update(t.tab, "id", t.id, {
      image: row.hero_image,
      image_credit: row.hero_credit ?? "",
    });
    const line = (await ctx.store.rows("Images")).find((i) => i.url === row.hero_image);
    if (line) {
      const pages = new Set(
        (line.used_on ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      pages.add(t.path);
      await ctx.store.update("Images", "url", row.hero_image, { used_on: [...pages].join(", ") });
    } else {
      await ctx.store.append("Images", {
        url: row.hero_image,
        alt: "",
        credit: row.hero_credit ?? "",
        license: row.hero_license ?? "",
        source_url: row.hero_source_url ?? "",
        is_ai: "FALSE",
        used_on: t.path,
      });
    }
    return { image: row.hero_image, from: `${tab}/${slug}` };
  }
  return undefined;
}
