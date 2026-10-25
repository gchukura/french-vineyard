import { readFile } from "node:fs/promises";

import { JWT } from "google-auth-library";
import { GoogleSpreadsheet, type GoogleSpreadsheetRow } from "google-spreadsheet";

import { normalizePrivateKey, requireEnv } from "@/lib/env";
import { parseTab, type LoadOptions } from "@/lib/sheet-schema";
import type { z } from "zod";

import { FACTS_HEADERS, QUERIES_HEADERS, QUEUE_HEADERS } from "./lib/queue";

/**
 * The pipeline's only access to the content Sheet, through its own
 * write-enabled service account (PIPELINE_SERVICE_ACCOUNT_*). The site reads
 * through lib/sheets.ts with a separate read-only account.
 *
 * Every tab is read once per run and cached. Writes update the cache, so
 * later stages in the same run see them, and are logged. In a dry run the
 * cache is the only thing written.
 */

export const PIPELINE_TABS: Record<string, string[]> = {
  Queue: QUEUE_HEADERS,
  Facts: FACTS_HEADERS,
  Queries: QUERIES_HEADERS,
};

/** Google Sheets rejects cells over 50,000 characters. */
const CELL_LIMIT = 50_000;

/** Sheets allows 60 write requests a minute per user; stay under it. */
const WRITE_GAP_MS = 1_100;

type CachedRow = { data: Record<string, string>; handle?: GoogleSpreadsheetRow };
type CachedTab = { headers: string[]; rows: CachedRow[]; exists: boolean };

export type Write = {
  tab: string;
  op: "update" | "append" | "create_tab";
  key?: string;
  values: Record<string, string>;
};

export class SheetStore {
  readonly writes: Write[] = [];
  private doc?: GoogleSpreadsheet;
  private tabs = new Map<string, CachedTab>();
  private lastWrite = 0;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(readonly dryRun: boolean) {}

  private async getDoc(): Promise<GoogleSpreadsheet> {
    if (this.doc) return this.doc;
    // A dry run only reads, so it may fall back to the site's read-only
    // account until both pipeline credentials are set.
    const fallback =
      this.dryRun &&
      !(
        process.env.PIPELINE_SERVICE_ACCOUNT_EMAIL &&
        process.env.PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY
      );
    const auth = new JWT({
      email: requireEnv(
        fallback ? "GOOGLE_SERVICE_ACCOUNT_EMAIL" : "PIPELINE_SERVICE_ACCOUNT_EMAIL",
      ),
      key: normalizePrivateKey(
        requireEnv(fallback ? "GOOGLE_PRIVATE_KEY" : "PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY"),
      ),
      scopes: [
        this.dryRun
          ? "https://www.googleapis.com/auth/spreadsheets.readonly"
          : "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    const id = process.env.PIPELINE_SHEET_ID || requireEnv("GOOGLE_SHEET_ID");
    const doc = new GoogleSpreadsheet(id, auth);
    await doc.loadInfo();
    this.doc = doc;
    return doc;
  }

  /** Loads Queue rows from a JSON file instead of the Queue tab (dry runs only). */
  async useQueueFile(path: string): Promise<void> {
    const rows = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>[];
    this.tabs.set("Queue", {
      headers: QUEUE_HEADERS,
      exists: true,
      rows: rows.map((r) => ({
        data: Object.fromEntries(QUEUE_HEADERS.map((h) => [h, r[h] == null ? "" : String(r[h])])),
      })),
    });
  }

  private async load(tab: string): Promise<CachedTab> {
    const cached = this.tabs.get(tab);
    if (cached) return cached;
    const sheet = (await this.getDoc()).sheetsByTitle[tab];
    let loaded: CachedTab;
    if (!sheet) {
      if (!PIPELINE_TABS[tab]) throw new Error(`The Sheet has no "${tab}" tab`);
      if (!this.dryRun)
        throw new Error(`The Sheet has no "${tab}" tab. Run: npm run pipeline -- init`);
      loaded = { headers: PIPELINE_TABS[tab], rows: [], exists: false };
    } else {
      await sheet.loadHeaderRow();
      const headers = sheet.headerValues;
      const rows = await withRetry(() => sheet.getRows());
      loaded = {
        headers,
        exists: true,
        rows: rows.map((handle) => ({
          handle,
          data: Object.fromEntries(headers.map((h) => [h, String(handle.get(h) ?? "")])),
        })),
      };
    }
    this.tabs.set(tab, loaded);
    return loaded;
  }

  async hasTab(tab: string): Promise<boolean> {
    return Boolean((await this.getDoc()).sheetsByTitle[tab]) || Boolean(this.tabs.get(tab)?.exists);
  }

  /** Raw rows as strings keyed by header. */
  async rows(tab: string): Promise<Record<string, string>[]> {
    return (await this.load(tab)).rows.map((r) => ({ ...r.data }));
  }

  /** Rows validated with the site's schema for that tab (lib/sheet-schema.ts). */
  async parsed<T extends z.ZodType<{ status: string }>>(
    tab: string,
    schema: T,
    options: LoadOptions = {},
  ): Promise<z.infer<T>[]> {
    const { headers, rows } = await this.load(tab);
    return parseTab(
      tab,
      [headers, ...rows.map((r) => headers.map((h) => r.data[h]))],
      schema,
      options,
    );
  }

  async update(
    tab: string,
    key: string,
    value: string,
    patch: Record<string, string>,
  ): Promise<void> {
    const t = await this.load(tab);
    this.assertColumns(tab, t.headers, patch);
    const row = t.rows.find((r) => r.data[key] === value);
    if (!row) throw new Error(`${tab}: no row with ${key}=${value}`);
    Object.assign(row.data, patch);
    this.writes.push({ tab, op: "update", key: `${key}=${value}`, values: patch });
    if (this.dryRun) return;
    const handle = row.handle;
    if (!handle) throw new Error(`${tab}: row ${key}=${value} has no Sheet handle`);
    await this.serialized(async () => {
      handle.assign(patch);
      await withRetry(() => handle.save({ raw: true }));
    });
  }

  async append(tab: string, values: Record<string, string>): Promise<void> {
    const t = await this.load(tab);
    this.assertColumns(tab, t.headers, values);
    const row: CachedRow = { data: Object.fromEntries(t.headers.map((h) => [h, values[h] ?? ""])) };
    t.rows.push(row);
    this.writes.push({ tab, op: "append", values });
    if (this.dryRun) return;
    const sheet = (await this.getDoc()).sheetsByTitle[tab];
    row.handle = await this.serialized(() => withRetry(() => sheet.addRow(values, { raw: true })));
  }

  /** Updates the row whose `key` column equals `value`, or appends one. */
  async upsert(
    tab: string,
    key: string,
    value: string,
    values: Record<string, string>,
  ): Promise<void> {
    const t = await this.load(tab);
    if (t.rows.some((r) => r.data[key] === value)) await this.update(tab, key, value, values);
    else await this.append(tab, { [key]: value, ...values });
  }

  /** Creates a pipeline tab with its headers, or adds missing header columns. */
  async ensureTab(tab: string): Promise<"created" | "extended" | "ok"> {
    const headers = PIPELINE_TABS[tab];
    const doc = await this.getDoc();
    const sheet = doc.sheetsByTitle[tab];
    if (!sheet) {
      this.writes.push({ tab, op: "create_tab", values: { headers: headers.join(",") } });
      if (!this.dryRun) await doc.addSheet({ title: tab, headerValues: headers });
      return "created";
    }
    await sheet.loadHeaderRow();
    const missing = headers.filter((h) => !sheet.headerValues.includes(h));
    if (!missing.length) return "ok";
    this.writes.push({ tab, op: "create_tab", values: { add_columns: missing.join(",") } });
    if (!this.dryRun) {
      const all = [...sheet.headerValues, ...missing];
      if (sheet.columnCount < all.length)
        await sheet.resize({ rowCount: sheet.rowCount, columnCount: all.length });
      await sheet.setHeaderRow(all);
    }
    return "extended";
  }

  private assertColumns(tab: string, headers: string[], values: Record<string, string>) {
    const missing = Object.keys(values).filter((k) => !headers.includes(k));
    if (missing.length) throw new Error(`${tab} is missing column(s): ${missing.join(", ")}`);
    for (const [k, v] of Object.entries(values)) {
      if (v.length > CELL_LIMIT)
        throw new Error(`${tab}.${k} is ${v.length} characters; Sheets allows ${CELL_LIMIT}`);
    }
  }

  /** One write at a time, spaced to stay under the Sheets write quota. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(async () => {
      const wait = this.lastWrite + WRITE_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        this.lastWrite = Date.now();
      }
    });
    this.writeChain = next.catch(() => undefined);
    return next;
  }
}

/** Retries Sheets calls on rate limits and server errors with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || i >= attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 2 ** i * 2_000));
    }
  }
}
