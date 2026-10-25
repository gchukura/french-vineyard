import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  articleSchema,
  hotelSchema,
  regionSchema,
  subRegionSchema,
  tourSchema,
  townSchema,
  type Article,
  type Hotel,
  type Region,
  type SubRegion,
  type Tour,
  type Town,
} from "@/lib/sheet-schema";
import { articleHref, regionHref, townHref } from "@/lib/site";

import { Claude, type CallResult } from "./claude";
import type { Args } from "./lib/args";
import { parseBannedPhrases } from "./lib/checks";
import { Budget, usageEntry } from "./lib/cost";
import { isoDate } from "./lib/dates";
import type { StoredFactSheet } from "./lib/facts";
import type { ContentFiles, DraftBrief, Target } from "./lib/prompt";
import { appendUsage, queueSchema, type QueueRow } from "./lib/queue";
import { selectHotels, selectTours } from "./lib/selection";
import { embedsCards, TARGET_TAB } from "./lib/targets";
import { parseTemplate, templateName, type Template } from "./lib/template";
import { SheetStore } from "./sheet";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content");

export type Config = {
  model: string;
  checkModel: string;
  budgetUsd: number;
  usdRate: number;
  passScore: number;
  siteUrl: string;
  revalidateSecret?: string;
};

export function loadConfig(args: Args): Config {
  const num = (name: string, fallback: number) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
    return n;
  };
  return {
    model: process.env.PIPELINE_MODEL || "claude-sonnet-5-5",
    checkModel: process.env.PIPELINE_CHECK_MODEL || "claude-haiku-5-5",
    budgetUsd: args.budget ?? num("PIPELINE_BUDGET_USD", 25),
    usdRate: num("PIPELINE_EUR_USD_RATE", 1.08),
    passScore: num("PIPELINE_PASS_SCORE", 80),
    siteUrl: (
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://frenchvineyard.com"
    ).replace(/\/+$/, ""),
    revalidateSecret: process.env.REVALIDATE_SECRET,
  };
}

/** Rough per-call ceilings used to stop before the budget is crossed. */
export const ESTIMATE_USD = { research: 0.35, draft: 0.25, check: 0.02 };

export async function loadContentFiles(): Promise<ContentFiles> {
  const read = (p: string) => readFile(path.join(CONTENT, p), "utf8");
  const [research, draft, redraft, check, styleGuide, banned, selectionRules, blocklist] =
    await Promise.all([
      read("prompts/research.md"),
      read("prompts/draft.md"),
      read("prompts/redraft.md"),
      read("prompts/check.md"),
      read("style-guide.md"),
      read("banned-phrases.txt"),
      read("selection-rules.md"),
      read("research-blocklist.txt"),
    ]);
  return {
    research,
    draft,
    redraft,
    check,
    styleGuide,
    bannedPhrases: parseBannedPhrases(banned),
    selectionRules,
    researchBlocklist: parseBannedPhrases(blocklist),
  };
}

type SiteRows = {
  regions: Region[];
  subregions: SubRegion[];
  towns: Town[];
  articles: Article[];
  tours: Tour[];
  hotels: Hotel[];
};

export class Context {
  readonly today = isoDate(new Date());
  readonly budget: Budget;
  readonly claude: Claude;
  private templates = new Map<string, Template>();
  private site?: SiteRows;

  constructor(
    readonly args: Args,
    readonly config: Config,
    readonly files: ContentFiles,
    readonly store: SheetStore,
    claude?: Claude,
  ) {
    this.budget = claude?.budget ?? new Budget(config.budgetUsd);
    this.claude = claude ?? new Claude(this.budget);
  }

  log(message: string) {
    console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);
  }

  now(): string {
    return new Date().toISOString();
  }

  async template(row: QueueRow): Promise<Template> {
    const name = templateName(row.target, row.page_type);
    let t = this.templates.get(name);
    if (!t) {
      t = parseTemplate(
        name,
        await readFile(path.join(CONTENT, "templates", `${name}.md`), "utf8"),
      );
      if (t.target !== row.target) {
        throw new Error(
          `Template ${name} targets ${t.target}, but the Queue row targets ${row.target}`,
        );
      }
      this.templates.set(name, t);
    }
    return t;
  }

  /** Queue rows, validated. Malformed rows are reported and skipped, not fatal. */
  async queue(): Promise<QueueRow[]> {
    const out: QueueRow[] = [];
    for (const raw of await this.store.rows("Queue")) {
      if (!Object.values(raw).some((v) => v.trim())) continue;
      const parsed = queueSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
      else
        this.log(
          `Queue row ${raw.id || "(no id)"} skipped: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        );
    }
    return out;
  }

  /** Queue rows at `stage`, in Sheet order, limited by --max and --only. */
  async rowsAt(stage: QueueRow["stage"], max = this.args.max): Promise<QueueRow[]> {
    return (await this.queue())
      .filter((r) => r.stage === stage && (!this.args.only || this.args.only.includes(r.id)))
      .slice(0, max);
  }

  async row(id: string): Promise<QueueRow> {
    const row = (await this.queue()).find((r) => r.id === id);
    if (!row) throw new Error(`Queue row ${id} not found`);
    return row;
  }

  async updateQueue(row: QueueRow, patch: Partial<Record<keyof QueueRow, string>>) {
    await this.store.update("Queue", "id", row.id, { ...patch, updated_at: this.now() } as Record<
      string,
      string
    >);
  }

  /** Adds a call's tokens and cost to the row's usage log and running total. */
  async recordUsage(row: QueueRow, stage: string, result: CallResult, { batch = false } = {}) {
    const fresh = await this.row(row.id);
    const entry = {
      ...usageEntry(stage, result.model, result.usage, this.now(), { batch }),
      usd: result.usd,
    };
    const total = Math.round((fresh.cost_usd + result.usd) * 10_000) / 10_000;
    await this.updateQueue(row, {
      cost_usd: String(total),
      usage_json: appendUsage(fresh.usage_json, [entry]),
    });
    this.log(
      `${row.id} ${stage}: ${entry.in} in / ${entry.out} out / ${entry.cache_read} cached / ${entry.searches} searches = $${result.usd.toFixed(4)} (run total $${this.budget.spent.toFixed(4)})`,
    );
  }

  async siteRows(): Promise<SiteRows> {
    if (!this.site) {
      const all = { includeDrafts: true };
      const [regions, subregions, towns, articles, tours, hotels] = await Promise.all([
        this.store.parsed("Regions", regionSchema, all),
        this.store.parsed("SubRegions", subRegionSchema, all),
        this.store.parsed("Towns", townSchema, all),
        this.store.parsed("Articles", articleSchema, all),
        this.store.parsed("Tours", tourSchema, all),
        this.store.parsed("Hotels", hotelSchema),
      ]);
      this.site = { regions, subregions, towns, articles, tours, hotels };
    }
    return this.site;
  }

  async target(row: QueueRow): Promise<Target> {
    const { regions, subregions, towns } = await this.siteRows();
    const town = towns.find((t) => t.slug === (row.target === "towns" ? row.slug : row.town_slug));
    const area =
      row.target === "subregions" ? subregions.find((s) => s.slug === row.slug) : undefined;
    const regionSlug =
      row.target === "regions"
        ? row.slug
        : (row.region_slug ?? area?.region_slug ?? town?.region_slug);
    const region = regions.find((r) => r.slug === regionSlug);
    const missing =
      (row.target === "towns" && !town) ||
      (row.target === "regions" && !region) ||
      (row.target === "subregions" && !area);
    if (missing) throw new Error(`${TARGET_TAB[row.target]} has no row with slug ${row.slug}`);

    const known: Record<string, unknown> = {};
    if (town) Object.assign(known, { lat: town.lat, lng: town.lng, station: town.station });
    if (region)
      Object.assign(known, {
        region_airport: region.airport,
        region_tgv_from_paris: region.tgv_from_paris,
        ...(row.target === "regions" ? { lat: region.lat, lng: region.lng } : {}),
      });
    const names = {
      towns: town?.name,
      regions: region?.name,
      subregions: area?.name,
      articles: row.target_keyword ?? row.slug.replace(/-/g, " "),
    };
    return {
      row,
      name: names[row.target] ?? row.slug,
      regionSlug,
      regionName: region?.name,
      townName: town?.name,
      known,
    };
  }

  async facts(row: QueueRow): Promise<StoredFactSheet> {
    const hit = (await this.store.rows("Facts")).find((f) => f.queue_id === row.id);
    if (!hit?.facts_json) throw new Error(`No fact sheet for ${row.id}; run research first`);
    return JSON.parse(hit.facts_json) as StoredFactSheet;
  }

  async brief(row: QueueRow, facts?: StoredFactSheet): Promise<DraftBrief> {
    const site = await this.siteRows();
    const target = await this.target(row);
    const region = target.regionSlug;
    const town = row.target === "towns" ? row.slug : row.town_slug;
    // Place pages show tours and hotels from their own tabs, so their briefs carry none.
    const cards = embedsCards(row.target);
    const tours = cards ? selectTours(site.tours, { region, town, category: row.category }) : [];
    const hotels = cards ? selectHotels(site.hotels, site.towns, { region, town }) : [];

    const published = <T extends { status: string }>(xs: T[]) =>
      xs.filter((x) => x.status === "published");
    const links = [
      ...published(site.regions)
        .filter((r) => r.slug === region)
        .map((r) => ({ name: r.name, href: regionHref(r.slug) })),
      ...published(site.towns)
        .filter((t) => t.region_slug === region && t.slug !== row.slug)
        .map((t) => ({ name: t.name, href: townHref(t.slug) })),
      ...published(site.articles)
        .filter((a) => a.region_slug === region && a.slug !== row.slug)
        .map((a) => ({ name: a.title, href: articleHref(a) })),
    ];
    return {
      target,
      facts: facts ?? (await this.facts(row)),
      tours,
      hotels,
      usdRate: this.config.usdRate,
      links,
    };
  }
}
