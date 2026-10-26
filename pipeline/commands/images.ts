import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { sheetTag } from "@/lib/sheet-schema";
import { areaHref, articleHref, regionHref, townHref } from "@/lib/site";

import { textOf } from "../claude";
import type { Context } from "../context";
import { ESTIMATE_USD } from "../context";
import { BudgetExceeded } from "../lib/cost";
import { extractJsonBlock } from "../lib/facts";
import {
  broadQueries,
  dedupeCandidates,
  departmentFor,
  MAX_CANDIDATES,
  mixCandidates,
  parseRejects,
  pickBest,
  scoreSchema,
  searchQueries,
  variantPath,
  type Candidate,
  type ImageTab,
  type ImageTarget,
  type Scored,
} from "../lib/images";
import { pool } from "../lib/pool";
import {
  convert,
  fetchBuffer,
  previewJpeg,
  searchCommons,
  searchPexels,
  searchPixabay,
  upload,
  type Variant,
} from "../media";
import { revalidate } from "./publish";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT = path.join(ROOT, "content");

export const HERO_COLUMNS = [
  "hero_image",
  "hero_credit",
  "hero_license",
  "hero_source_url",
  "hero_is_ai",
];
export const IMAGES_COLUMNS = ["url", "alt", "credit", "license", "source_url", "is_ai", "used_on"];

/** Parents come first, so a page that falls back to its parent's hero finds it set. */
const TAB_ORDER: ImageTab[] = ["Regions", "SubRegions", "Towns", "Articles"];

const SEARCHES = [
  ["wikimedia", searchCommons],
  ["pixabay", searchPixabay],
  ["pexels", searchPexels],
] as const;

type Ranked = Scored & { provider: string; title: string; sourceUrl: string; pass: string };

export type Choice = {
  target: ImageTarget;
  /** picked: a photo of its own; parent: shares a parent page's hero; none: neither. */
  outcome: "picked" | "parent" | "none" | "error";
  /** Which search pass found the pick: specific or broad. */
  pass?: "specific" | "broad";
  reason?: string;
  candidates: number;
  chosen?: Candidate & { score: number; alt: string; notes?: string | null };
  parent?: { tab: ImageTab; slug: string };
  scores?: Ranked[];
  heroUrl?: string;
  width?: number;
  keptXmp?: boolean;
  files?: string[];
};

/**
 * images [n]: hero photos for published rows with an empty hero_image.
 * Each row searches Commons, then Pixabay, then Pexels with specific queries
 * and, if nothing passes, again with broad ones (wine area, region,
 * département). A vision model scores up to MAX_CANDIDATES per pass against
 * content/image-brief.md; the best at or above IMAGES_MIN_SCORE is converted
 * to AVIF and WebP, uploaded to Blob and written to the row and the Images
 * tab. A row still without a pick shares its nearest published parent's
 * hero. Images are never generated.
 */
export async function images(ctx: Context): Promise<Choice[]> {
  const brief = await readFile(path.join(CONTENT, "image-brief.md"), "utf8");
  const instructions = await readFile(path.join(CONTENT, "prompts", "image-score.md"), "utf8");
  const rejects = parseRejects(await readFile(path.join(CONTENT, "image-rejects.txt"), "utf8"));
  const threshold = Number(process.env.IMAGES_MIN_SCORE || 70);
  const model = process.env.PIPELINE_IMAGE_MODEL || ctx.config.model;
  const blobAuth =
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  if (!ctx.args.dryRun && !blobAuth)
    throw new Error(
      "No Blob credentials: set BLOB_READ_WRITE_TOKEN, or VERCEL_OIDC_TOKEN and BLOB_STORE_ID (vercel env pull). Use --dry-run to preview picks.",
    );

  const { targets, used } = await collect(ctx);
  for (const url of rejects) used.add(url);
  // --from: the reviewed picks of a dry run, for the pages named with --only.
  const reviewed = ctx.args.from
    ? reviewedPicks(JSON.parse(await readFile(ctx.args.from, "utf8")), ctx.args.only)
    : undefined;
  const todo = reviewed
    ? [...reviewed.values()].map((p) => p.target)
    : targets.filter((t) => !ctx.args.only || named(ctx.args.only, t)).slice(0, ctx.args.max);
  ctx.log(
    reviewed
      ? `images: applying ${todo.length} reviewed pick(s) from ${ctx.args.from}`
      : `images: ${targets.length} published row(s) without a hero image${ctx.args.redo ? " or named for --redo" : ""}; doing ${todo.length}`,
  );

  const outDir = path.join(
    ROOT,
    "pipeline",
    ctx.args.dryRun ? ".dry-run" : ".images",
    `images-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
  );
  await mkdir(outDir, { recursive: true });

  if (todo.length) {
    for (const tab of new Set(todo.map((t) => t.tab)))
      await ctx.store.ensureColumns(tab, HERO_COLUMNS);
    await ctx.store.ensureColumns("Images", IMAGES_COLUMNS);
  }

  const o: Options = {
    system: `${instructions}\n\n---\n\n${brief}`,
    model,
    threshold,
    used,
    outDir,
  };
  const picks: Choice[] = [];
  let stopped = false;

  for (const tab of TAB_ORDER) {
    await pool(
      todo.filter((t) => t.tab === tab),
      3,
      async (target) => {
        if (stopped) return;
        try {
          const pick = reviewed
            ? await applyReviewed(ctx, reviewed.get(`${target.tab}/${target.slug}`)!, o)
            : await imageFor(ctx, target, o);
          picks.push(pick);
          const what = pick.chosen
            ? ` ${pick.pass} ${pick.chosen.provider} ${pick.chosen.score} "${pick.chosen.title}"`
            : pick.parent
              ? ` from ${pick.parent.tab}/${pick.parent.slug}`
              : "";
          ctx.log(
            `${target.tab}/${target.slug}: ${pick.outcome}${what}${pick.reason ? ` (${pick.reason})` : ""}`,
          );
        } catch (error) {
          if (error instanceof BudgetExceeded || isAccountLimit(error)) {
            // Every later row would fail the same way, so stop instead of logging it per row.
            if (!stopped) ctx.log(`stopping: ${(error as Error).message}`);
            stopped = true;
            return;
          }
          const reason = (error as Error).message;
          picks.push({ target, outcome: "error", reason, candidates: 0 });
          ctx.log(`${target.tab}/${target.slug}: error ${reason}`);
        }
      },
    );
  }

  const touched = [...new Set(picks.filter((p) => p.heroUrl).map((p) => p.target.tab))];
  if (touched.length)
    await revalidate(
      ctx,
      [...touched, "Images" as const].map((t) => sheetTag(t)),
    );

  await writeReport(outDir, picks, threshold);
  const count = (o: Choice["outcome"]) => picks.filter((p) => p.outcome === o).length;
  ctx.log(
    `images: ${count("picked")} picked (${picks.filter((p) => p.pass === "broad").length} on broad queries), ${count("parent")} share a parent's hero, ${count("none")} without, ${count("error")} errors`,
  );
  ctx.log(`images report: ${path.relative(ROOT, outDir)}/picks.md`);
  return picks;
}

/**
 * The picked rows of a dry run's picks.json that --only names, keyed by
 * Tab/slug. Every name must match a pick, so a typo can't silently skip an
 * approved page.
 */
export function reviewedPicks(picks: Choice[], only: string[] = []): Map<string, Choice> {
  const chosen = picks.filter((p) => p.outcome === "picked" && p.chosen && named(only, p.target));
  const missing = only.filter((o) => !chosen.some((p) => named([o], p.target)));
  if (missing.length) throw new Error(`No reviewed pick for: ${missing.join(", ")}`);
  return new Map(chosen.map((p) => [`${p.target.tab}/${p.target.slug}`, p]));
}

/** Stores a reviewed pick as it was approved: same photo, credit and alt, no new search or score. */
async function applyReviewed(ctx: Context, pick: Choice, o: Options): Promise<Choice> {
  const { target, chosen } = pick;
  const row = (await ctx.store.rows(target.tab)).find((r) => r.slug === target.slug);
  if (row?.status?.trim().toLowerCase() !== "published")
    throw new Error(`${target.tab}/${target.slug} is not a published row`);
  if (o.used.has(chosen!.sourceUrl))
    throw new Error(`${chosen!.sourceUrl} is already used on the site`);
  o.used.add(chosen!.sourceUrl);
  const buffer = await fetchBuffer(chosen!.downloadUrl);
  const stored = await store(ctx, target, chosen!, buffer, await previewJpeg(buffer), o);
  return { ...pick, ...stored };
}

/** The Anthropic account's spend limit or credit balance is used up; no later call will succeed. */
export const isAccountLimit = (error: unknown) =>
  /reached your specified API usage limits|credit balance is too low/i.test(
    (error as Error)?.message ?? "",
  );

/**
 * Whether --only names this row, by slug or as Tab/slug. Tab/slug tells
 * apart rows that share a slug, such as the Chablis wine area and town.
 */
export const named = (only: string[] | undefined, t: Pick<ImageTarget, "tab" | "slug">) =>
  Boolean(only?.some((o) => o === t.slug || o === `${t.tab}/${t.slug}`));

/** Published place pages and articles with no hero, in tab order, plus images already in use. */
async function collect(ctx: Context) {
  const site = await ctx.siteRows();
  const pub = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === "published");
  const region = (slug?: string) => site.regions.find((r) => r.slug === slug);
  const area = (slug?: string) => site.subregions.find((s) => s.slug === slug);
  const town = (slug?: string) => site.towns.find((t) => t.slug === slug);
  const up = (tab: ImageTab, slug?: string) => (slug ? [{ tab, slug }] : []);

  const all: (ImageTarget & { hero?: string })[] = [
    ...pub(site.regions).map((r) => ({
      tab: "Regions" as const,
      slug: r.slug,
      name: r.name,
      regionName: r.name,
      department: departmentFor(undefined, r.slug),
      path: regionHref(r.slug),
      parents: [],
      hero: r.hero_image,
    })),
    ...pub(site.subregions).map((s) => ({
      tab: "SubRegions" as const,
      slug: s.slug,
      name: s.name,
      regionName: region(s.region_slug)?.name,
      department: departmentFor(s.slug, s.region_slug),
      path: areaHref(s.region_slug, s.slug),
      parents: up("Regions", s.region_slug),
      hero: s.hero_image,
    })),
    ...pub(site.towns).map((t) => ({
      tab: "Towns" as const,
      slug: t.slug,
      name: t.name,
      regionName: region(t.region_slug)?.name,
      areaName: area(t.subregion_slug)?.name,
      townName: t.name,
      department: departmentFor(t.subregion_slug, t.region_slug),
      path: townHref(t.slug),
      parents: [...up("SubRegions", t.subregion_slug), ...up("Regions", t.region_slug)],
      hero: t.hero_image,
    })),
    ...pub(site.articles).map((a) => {
      const t = town(a.town_slug);
      return {
        tab: "Articles" as const,
        slug: a.slug,
        name: a.title,
        pageType: a.page_type,
        regionName: region(a.region_slug ?? t?.region_slug)?.name,
        areaName: area(t?.subregion_slug)?.name,
        townName: t?.name,
        department: departmentFor(t?.subregion_slug, a.region_slug ?? t?.region_slug),
        path: articleHref(a),
        // An article's nearest parent is its town, then the town's wine area, then the region.
        parents: [
          ...up("Towns", t?.slug),
          ...up("SubRegions", t?.subregion_slug),
          ...up("Regions", a.region_slug ?? t?.region_slug),
        ],
        hero: a.hero_image,
      };
    }),
  ];
  // --redo also takes rows that already have a hero, but only those named with --only.
  const targets: ImageTarget[] = all.filter(
    (t) => !t.hero || (ctx.args.redo && named(ctx.args.only, t)),
  );

  // Images already on the site are not offered again, so pages don't share a photo by accident.
  const used = new Set(
    (await ctx.store.rows("Images")).flatMap((i) => [i.source_url, i.url]).filter(Boolean),
  );
  for (const tab of TAB_ORDER)
    for (const r of await ctx.store.rows(tab)) if (r.hero_source_url) used.add(r.hero_source_url);
  return { targets, used };
}

type Options = {
  system: string;
  model: string;
  threshold: number;
  used: Set<string>;
  outDir: string;
};

async function imageFor(ctx: Context, target: ImageTarget, o: Options): Promise<Choice> {
  const scores: Ranked[] = [];
  let candidates = 0;
  const passes = [
    ["specific", searchQueries(target)],
    ["broad", broadQueries(target)],
  ] as const;

  for (const [pass, queries] of passes) {
    const previews = await gather(ctx, target, queries, o.used);
    if (!previews.length) continue;
    candidates += previews.length;
    const scored = await score(ctx, target, previews, o);
    scores.push(
      ...scored.scores.map((s) => ({
        ...s,
        pass,
        provider: previews[s.index]?.c.provider ?? "?",
        title: previews[s.index]?.c.title ?? "?",
        sourceUrl: previews[s.index]?.c.sourceUrl ?? "",
      })),
    );
    // Another row in this run may have taken a candidate while this one was scored.
    const free = scored.scores.filter(
      (s) => previews[s.index] && !o.used.has(previews[s.index].c.sourceUrl),
    );
    const best = pickBest(free, previews.length, o.threshold);
    if (!best) continue;
    const c = previews[best.index].c;
    o.used.add(c.sourceUrl);
    const chosen = {
      ...c,
      score: best.score,
      alt: best.alt?.trim() || target.name,
      notes: best.notes,
    };
    const stored = await store(
      ctx,
      target,
      chosen,
      await fetchBuffer(c.downloadUrl),
      previews[best.index].jpeg,
      o,
    );
    return { target, outcome: "picked", pass, candidates, chosen, scores, ...stored };
  }

  const shared = await shareParent(ctx, target);
  if (shared)
    return {
      target,
      outcome: "parent",
      candidates,
      scores,
      parent: shared.parent,
      heroUrl: shared.heroUrl,
      reason: `nothing scored ${o.threshold}+ on specific or broad queries`,
    };
  return {
    target,
    outcome: "none",
    candidates,
    scores,
    reason: `nothing scored ${o.threshold}+ and no parent page has a hero`,
  };
}

/** Candidates for one pass: Commons first, then Pixabay, then Pexels, up to MAX_CANDIDATES, with previews. */
async function gather(
  ctx: Context,
  target: ImageTarget,
  queries: readonly string[],
  used: Set<string>,
) {
  // Each source is searched on its own, so stock photos get their reserved places.
  const found: Record<string, Candidate[]> = {};
  for (const [provider, search] of SEARCHES) {
    let list: Candidate[] = [];
    for (const q of queries) {
      if (list.length >= MAX_CANDIDATES) break;
      try {
        list = dedupeCandidates([...list, ...(await search(q))], used);
      } catch (error) {
        ctx.log(`${target.slug}: ${provider} "${q}" failed: ${(error as Error).message}`);
        break;
      }
    }
    found[provider] = list;
  }
  const stock = dedupeCandidates([...found.pixabay, ...found.pexels], used);
  const candidates = mixCandidates(found.wikimedia, stock);
  // Previews that fail to download are dropped before scoring.
  return (
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
}

async function score(
  ctx: Context,
  target: ImageTarget,
  previews: { c: Candidate; jpeg: Buffer }[],
  o: Options,
) {
  const page = [
    `Page: ${target.tab === "Articles" ? `article (${target.pageType})` : target.tab.replace(/s$/, "").replace("SubRegion", "wine area").toLowerCase()} "${target.name}"`,
    target.townName && target.tab === "Articles" ? `Town: ${target.townName}` : "",
    target.areaName ? `Wine area: ${target.areaName}` : "",
    target.regionName ? `Region: ${target.regionName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const content: BetaContentBlockParam[] = [{ type: "text", text: page }];
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
    `${target.slug} score: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out = $${result.usd.toFixed(4)} (run total $${ctx.budget.spent.toFixed(4)})`,
  );
  return scoreSchema.parse(extractJsonBlock(textOf(result.message.content)));
}

/**
 * Gives the row the hero of its nearest published parent that has one, and
 * adds the row's path to that image's Images line. Reads the raw tabs, which
 * include heroes written earlier in this run.
 */
export async function shareParent(ctx: Pick<Context, "store">, target: ImageTarget) {
  for (const parent of target.parents) {
    const row = (await ctx.store.rows(parent.tab)).find((r) => r.slug === parent.slug);
    if (!row?.hero_image || row.status?.trim().toLowerCase() !== "published") continue;
    await detach(ctx, target, row.hero_image);
    await ctx.store.update(target.tab, "slug", target.slug, {
      hero_image: row.hero_image,
      hero_credit: row.hero_credit ?? "",
      hero_license: row.hero_license ?? "",
      hero_source_url: row.hero_source_url ?? "",
      hero_is_ai: "FALSE",
    });
    const line = (await ctx.store.rows("Images")).find((i) => i.url === row.hero_image);
    if (line) {
      const usedOn = [...new Set([...splitList(line.used_on), target.path])].join(", ");
      await ctx.store.update("Images", "url", row.hero_image, { used_on: usedOn });
    } else {
      await ctx.store.append("Images", {
        url: row.hero_image,
        alt: "",
        credit: row.hero_credit ?? "",
        license: row.hero_license ?? "",
        source_url: row.hero_source_url ?? "",
        is_ai: "FALSE",
        // A hero set by hand has no Images line yet; this one starts with the sharing page.
        used_on: target.path,
      });
    }
    return { parent, heroUrl: row.hero_image };
  }
  return undefined;
}

/**
 * Before a page (redone with --redo) takes a different hero, removes its path
 * from the Images line of the hero it had, so /image-credits/ stays accurate.
 */
export async function detach(ctx: Pick<Context, "store">, target: ImageTarget, next: string) {
  const current = (await ctx.store.rows(target.tab)).find(
    (r) => r.slug === target.slug,
  )?.hero_image;
  if (!current || current === next) return;
  const line = (await ctx.store.rows("Images")).find((i) => i.url === current);
  if (!line) return;
  const usedOn = splitList(line.used_on).filter((p) => p !== target.path);
  await ctx.store.update("Images", "url", current, { used_on: usedOn.join(", ") });
}

const splitList = (s = "") =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Converts, uploads (or saves, in a dry run) and writes the row and the Images line. */
async function store(
  ctx: Context,
  target: ImageTarget,
  chosen: Candidate & { alt: string },
  buffer: Buffer,
  preview: Buffer,
  o: Options,
): Promise<Pick<Choice, "heroUrl" | "width" | "keptXmp" | "files">> {
  const { variants, width, keptXmp } = await convert(buffer, {
    author: chosen.author,
    credit: chosen.credit,
    license: chosen.license,
    licenseUrl: chosen.licenseUrl,
    sourceUrl: chosen.sourceUrl,
  });
  const dir = path.join(o.outDir, `${target.tab.toLowerCase()}-${target.slug}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "preview.jpg"), preview);

  const urls = new Map<Variant, string>();
  for (const v of variants) {
    const p = variantPath(target.tab, target.slug, chosen.sourceUrl, v.width, v.ext);
    if (ctx.args.dryRun) {
      await writeFile(path.join(dir, path.basename(p)), v.buffer);
      urls.set(v, `dry-run://${p}`);
    } else {
      urls.set(v, await upload(p, v.buffer, `image/${v.ext}`));
    }
  }
  // The hero is the largest WebP; next/image resizes it to the site's widths.
  const hero = variants.filter((v) => v.ext === "webp").at(-1)!;
  const heroUrl = urls.get(hero)!;

  await detach(ctx, target, heroUrl);
  await ctx.store.update(target.tab, "slug", target.slug, {
    hero_image: heroUrl,
    hero_credit: chosen.credit,
    hero_license: chosen.license,
    hero_source_url: chosen.sourceUrl,
    hero_is_ai: "FALSE",
  });
  await ctx.store.append("Images", {
    url: heroUrl,
    alt: chosen.alt,
    credit: chosen.credit,
    license: chosen.license,
    source_url: chosen.sourceUrl,
    is_ai: "FALSE",
    used_on: target.path,
  });
  return { heroUrl, width, keptXmp, files: [...urls.values()] };
}

async function writeReport(dir: string, picks: Choice[], threshold: number) {
  await writeFile(path.join(dir, "picks.json"), JSON.stringify(picks, null, 2));
  const lines = [`# Hero image picks (threshold ${threshold})`, ""];
  for (const p of picks) {
    const t = p.target;
    lines.push(
      `## ${t.tab}/${t.slug}: ${t.name}`,
      "",
      `- Outcome: **${p.outcome}**${p.pass ? ` (${p.pass} queries)` : ""}${p.reason ? ` (${p.reason})` : ""}; ${p.candidates} candidate(s) scored`,
    );
    if (p.parent) lines.push(`- Shares the hero of ${p.parent.tab}/${p.parent.slug}: ${p.heroUrl}`);
    if (p.chosen)
      lines.push(
        `- Pick: ${p.chosen.provider}, score ${p.chosen.score}: [${p.chosen.title}](${p.chosen.sourceUrl})`,
        `- Credit: ${p.chosen.credit} · ${p.chosen.license}`,
        `- Alt: ${p.chosen.alt}`,
        `- Source width ${p.width}px; metadata ${p.keptXmp ? "kept (source XMP)" : "kept, credit XMP added"}`,
        `- Hero: ${p.heroUrl}`,
        "",
        `![${p.chosen.alt}](${t.tab.toLowerCase()}-${t.slug}/preview.jpg)`,
      );
    if (p.scores?.length)
      lines.push(
        "",
        "| Pass | # | Provider | Score | Candidate | Note |",
        "| - | - | - | - | - | - |",
        ...p.scores.map(
          (s) =>
            `| ${s.pass} | ${s.index} | ${s.provider} | ${s.score} | ${s.title.replace(/\|/g, "/").slice(0, 60)} | ${(s.reject_reason ?? s.notes ?? "").replace(/\|/g, "/")} |`,
        ),
      );
    lines.push("");
  }
  await writeFile(path.join(dir, "picks.md"), lines.join("\n"));
}
