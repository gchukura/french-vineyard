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
  dedupeCandidates,
  MAX_CANDIDATES,
  namesPlace,
  pickBest,
  scoreSchema,
  searchQueries,
  variantPath,
  type Candidate,
  type ImageTarget,
  type Scored,
} from "../lib/images";
import { pool } from "../lib/pool";
import {
  convert,
  fetchBuffer,
  generateFlux,
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

const SEARCHES = [
  ["wikimedia", searchCommons],
  ["pixabay", searchPixabay],
  ["pexels", searchPexels],
] as const;

type Choice = {
  target: ImageTarget;
  outcome: "picked" | "generated" | "none" | "error";
  reason?: string;
  candidates: number;
  namesPlace: boolean;
  chosen?: Candidate & { score: number; alt: string; notes?: string | null };
  scores?: (Scored & { provider: string; title: string; sourceUrl: string })[];
  heroUrl?: string;
  width?: number;
  keptXmp?: boolean;
  files?: string[];
};

/**
 * images [n]: hero images for published rows with an empty hero_image.
 * Commons, then Pixabay, then Pexels until MAX_CANDIDATES; a vision model
 * scores them against content/image-brief.md; the best at or above
 * IMAGES_MIN_SCORE is converted to AVIF and WebP, uploaded to Blob and
 * written to the row and the Images tab. With no pick, a generic topic (one
 * that names no real place) gets a Flux image instead.
 */
export async function images(ctx: Context): Promise<Choice[]> {
  const brief = await readFile(path.join(CONTENT, "image-brief.md"), "utf8");
  const instructions = await readFile(path.join(CONTENT, "prompts", "image-score.md"), "utf8");
  const threshold = Number(process.env.IMAGES_MIN_SCORE || 70);
  const model = process.env.PIPELINE_IMAGE_MODEL || ctx.config.model;
  if (!ctx.args.dryRun && !process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error("BLOB_READ_WRITE_TOKEN is not set; run with --dry-run to preview picks");

  const { targets, placeNames, used } = await collect(ctx);
  const todo = targets
    .filter((t) => !ctx.args.only || ctx.args.only.includes(t.slug))
    .slice(0, ctx.args.max);
  ctx.log(`images: ${targets.length} published row(s) without a hero image; doing ${todo.length}`);

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

  const system = `${instructions}\n\n---\n\n${brief}`;
  const picks: Choice[] = [];
  let stopped = false;

  await pool(todo, 3, async (target) => {
    if (stopped) return;
    try {
      const pick = await imageFor(ctx, target, {
        system,
        model,
        threshold,
        placeNames,
        used,
        outDir,
      });
      picks.push(pick);
      ctx.log(
        `${target.tab}/${target.slug}: ${pick.outcome}${pick.chosen ? ` ${pick.chosen.provider} ${pick.chosen.score} "${pick.chosen.title}"` : ""}${pick.reason ? ` (${pick.reason})` : ""}`,
      );
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        stopped = true;
        ctx.log(error.message);
        return;
      }
      const reason = (error as Error).message;
      picks.push({ target, outcome: "error", reason, candidates: 0, namesPlace: true });
      ctx.log(`${target.tab}/${target.slug}: error ${reason}`);
    }
  });

  const touched = [...new Set(picks.filter((p) => p.heroUrl).map((p) => p.target.tab))];
  if (touched.length)
    await revalidate(
      ctx,
      [...touched, "Images" as const].map((t) => sheetTag(t)),
    );

  await writeReport(outDir, picks, threshold);
  ctx.log(`images report: ${path.relative(ROOT, outDir)}/picks.md`);
  return picks;
}

/** Published place pages and articles with no hero, in tab order, plus what the rules need. */
async function collect(ctx: Context) {
  const site = await ctx.siteRows();
  const pub = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === "published");
  const regionName = (slug?: string) => site.regions.find((r) => r.slug === slug)?.name;
  const townName = (slug?: string) => site.towns.find((t) => t.slug === slug)?.name;

  const targets: ImageTarget[] = [
    ...pub(site.regions).map((r) => ({
      tab: "Regions" as const,
      slug: r.slug,
      name: r.name,
      regionName: r.name,
      path: regionHref(r.slug),
      hero: r.hero_image,
    })),
    ...pub(site.subregions).map((s) => ({
      tab: "SubRegions" as const,
      slug: s.slug,
      name: s.name,
      regionName: regionName(s.region_slug),
      path: areaHref(s.region_slug, s.slug),
      hero: s.hero_image,
    })),
    ...pub(site.towns).map((t) => ({
      tab: "Towns" as const,
      slug: t.slug,
      name: t.name,
      regionName: regionName(t.region_slug),
      townName: t.name,
      path: townHref(t.slug),
      hero: t.hero_image,
    })),
    ...pub(site.articles).map((a) => ({
      tab: "Articles" as const,
      slug: a.slug,
      name: a.title,
      pageType: a.page_type,
      regionName: regionName(a.region_slug),
      townName: townName(a.town_slug),
      path: articleHref(a),
      hero: a.hero_image,
    })),
  ]
    .filter((t) => !t.hero);

  const placeNames = [
    ...site.regions.flatMap((r) => [r.name, r.name_fr ?? ""]),
    ...site.subregions.map((s) => s.name),
    ...site.towns.map((t) => t.name),
    "France",
    "Paris",
  ].filter(Boolean);

  // Images already on the site are not offered again, so pages don't share a hero.
  const used = new Set(
    (await ctx.store.rows("Images")).flatMap((i) => [i.source_url, i.url]).filter(Boolean),
  );
  for (const tab of ["Regions", "SubRegions", "Towns", "Articles"])
    for (const r of await ctx.store.rows(tab)) if (r.hero_source_url) used.add(r.hero_source_url);
  return { targets, placeNames, used };
}

type Options = {
  system: string;
  model: string;
  threshold: number;
  placeNames: string[];
  used: Set<string>;
  outDir: string;
};

async function imageFor(ctx: Context, target: ImageTarget, o: Options): Promise<Choice> {
  const queries = searchQueries(target);
  let candidates: Candidate[] = [];
  for (const [provider, search] of SEARCHES) {
    for (const q of queries) {
      if (candidates.length >= MAX_CANDIDATES) break;
      try {
        candidates = dedupeCandidates([...candidates, ...(await search(q))], o.used);
      } catch (error) {
        ctx.log(`${target.slug}: ${provider} "${q}" failed: ${(error as Error).message}`);
        break;
      }
    }
  }
  candidates = candidates.slice(0, MAX_CANDIDATES);

  // Previews that fail to download are dropped before scoring.
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

  let placed = namesPlace(target, o.placeNames);
  const base = { target, candidates: previews.length };

  if (previews.length) {
    const scores = await score(ctx, target, previews, o);
    placed ||= scores.names_place;
    const ranked = scores.scores.map((s) => ({
      ...s,
      provider: previews[s.index]?.c.provider ?? "?",
      title: previews[s.index]?.c.title ?? "?",
      sourceUrl: previews[s.index]?.c.sourceUrl ?? "",
    }));
    // Another row in this run may have taken a candidate while this one was scored.
    const free = scores.scores.filter(
      (s) => previews[s.index] && !o.used.has(previews[s.index].c.sourceUrl),
    );
    const best = pickBest(free, previews.length, o.threshold);
    if (best) {
      const c = previews[best.index].c;
      o.used.add(c.sourceUrl);
      const alt = best.alt?.trim() || target.name;
      const chosen = { ...c, score: best.score, alt, notes: best.notes };
      const buffer = await fetchBuffer(c.downloadUrl);
      const stored = await store(ctx, target, chosen, buffer, previews[best.index].jpeg, false, o);
      return { ...base, outcome: "picked", namesPlace: placed, chosen, scores: ranked, ...stored };
    }
    if (placed)
      return {
        ...base,
        outcome: "none",
        namesPlace: true,
        scores: ranked,
        reason: `nothing scored ${o.threshold}+; names a real place, so no generation`,
      };
  } else if (placed) {
    return {
      ...base,
      outcome: "none",
      namesPlace: true,
      reason: "no candidates; names a real place, so no generation",
    };
  }

  // A generic topic with no usable photo: generate one, then hold it to the same brief.
  if (!process.env.BFL_API_KEY)
    return {
      ...base,
      outcome: "none",
      namesPlace: false,
      reason: "generic topic, but BFL_API_KEY is not set",
    };
  ctx.budget.reserve(ESTIMATE_USD.flux);
  const brief =
    o.system.split("## For generated images")[1]?.split("\n\n").slice(1).join("\n\n").trim() ?? "";
  const { buffer, model } = await generateFlux(
    `${brief}\n\nTopic: ${target.name}. Photographic, natural color, 16:9 landscape.`,
  );
  ctx.budget.charge(ESTIMATE_USD.flux);
  const jpeg = await previewJpeg(buffer);
  const generated: Candidate = {
    provider: "flux",
    id: `flux-${target.slug}`,
    title: `Generated for "${target.name}"`,
    width: 2400,
    height: 1344,
    previewUrl: "",
    downloadUrl: "",
    sourceUrl: "",
    author: "Black Forest Labs FLUX",
    credit: `Generated with ${model} (Black Forest Labs)`,
    license: "AI-generated",
  };
  const check = await score(ctx, target, [{ c: generated, jpeg }], o);
  const ok = pickBest(check.scores, 1, o.threshold);
  if (!ok)
    return {
      ...base,
      outcome: "none",
      namesPlace: false,
      reason: `generated image scored ${check.scores[0]?.score ?? "?"} (${check.scores[0]?.reject_reason ?? check.scores[0]?.notes ?? ""})`,
    };
  const chosen = {
    ...generated,
    score: ok.score,
    alt: ok.alt?.trim() || target.name,
    notes: ok.notes,
  };
  const stored = await store(ctx, target, chosen, buffer, jpeg, true, o);
  return { ...base, outcome: "generated", namesPlace: false, chosen, ...stored };
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

/** Converts, uploads (or saves, in a dry run) and writes the row and the Images line. */
async function store(
  ctx: Context,
  target: ImageTarget,
  chosen: Candidate & { alt: string },
  buffer: Buffer,
  preview: Buffer,
  isAi: boolean,
  o: Options,
): Promise<Pick<Choice, "heroUrl" | "width" | "keptXmp" | "files">> {
  const { variants, width, keptXmp } = await convert(buffer, {
    author: chosen.author,
    credit: chosen.credit,
    license: chosen.license,
    licenseUrl: chosen.licenseUrl,
    sourceUrl: chosen.sourceUrl || undefined,
    isAi,
  });
  const key = chosen.sourceUrl || chosen.id;
  const dir = path.join(o.outDir, `${target.tab.toLowerCase()}-${target.slug}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "preview.jpg"), preview);

  const urls = new Map<Variant, string>();
  for (const v of variants) {
    const p = variantPath(target.tab, target.slug, key, v.width, v.ext);
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

  await ctx.store.update(target.tab, "slug", target.slug, {
    hero_image: heroUrl,
    hero_credit: chosen.credit,
    hero_license: chosen.license,
    hero_source_url: chosen.sourceUrl,
    hero_is_ai: isAi ? "TRUE" : "FALSE",
  });
  await ctx.store.append("Images", {
    url: heroUrl,
    alt: chosen.alt,
    credit: chosen.credit,
    license: chosen.license,
    source_url: chosen.sourceUrl,
    is_ai: isAi ? "TRUE" : "FALSE",
    used_on: target.path,
  });
  return {
    heroUrl,
    width,
    keptXmp,
    files: [...urls.values()],
  };
}

async function writeReport(dir: string, picks: Choice[], threshold: number) {
  await writeFile(path.join(dir, "picks.json"), JSON.stringify(picks, null, 2));
  const lines = [`# Hero image picks (threshold ${threshold})`, ""];
  for (const p of picks) {
    const t = p.target;
    lines.push(
      `## ${t.tab}/${t.slug}: ${t.name}`,
      "",
      `- Outcome: **${p.outcome}**${p.reason ? ` (${p.reason})` : ""}; ${p.candidates} candidate(s) scored; names a place: ${p.namesPlace}`,
    );
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
        "| # | Provider | Score | Candidate | Note |",
        "| - | - | - | - | - |",
        ...p.scores.map(
          (s) =>
            `| ${s.index} | ${s.provider} | ${s.score} | ${s.title.replace(/\|/g, "/").slice(0, 60)} | ${(s.reject_reason ?? s.notes ?? "").replace(/\|/g, "/")} |`,
        ),
      );
    lines.push("");
  }
  await writeFile(path.join(dir, "picks.md"), lines.join("\n"));
}
