import { z } from "zod";

import type { UsageEntry } from "./cost";

/** Queue tab rows and the stage machine that moves them along. */

export const STAGES = [
  "queued",
  "researched",
  "drafted",
  "checked",
  "published",
  "needs_review",
  "error",
] as const;
export type Stage = (typeof STAGES)[number];

const text = z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string());
const optional = z.preprocess(
  (v) => (v == null || String(v).trim() === "" ? undefined : String(v).trim()),
  z.string().optional(),
);
const lowerOptional = z.preprocess(
  (v) => (v == null || String(v).trim() === "" ? undefined : String(v).trim().toLowerCase()),
  z.string().optional(),
);
const int = z.preprocess(
  (v) => (v == null || String(v).trim() === "" ? 0 : Number(v)),
  z.number().int(),
);
const num = z.preprocess((v) => (v == null || String(v).trim() === "" ? 0 : Number(v)), z.number());

export const queueSchema = z.object({
  id: text.pipe(z.string().min(1, "id is required")),
  target: z.preprocess(
    (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase(),
    z.enum(["articles", "towns"]),
  ),
  slug: text.pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase ASCII slug")),
  page_type: lowerOptional,
  region_slug: optional,
  town_slug: optional,
  category: optional,
  target_keyword: optional,
  notes: optional,
  stage: z.preprocess(
    (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase() || "queued",
    z.enum(STAGES),
  ),
  attempts: int,
  score: optional,
  findings: optional,
  facts_hash: optional,
  /** The latest draft as JSON; what check grades and publish copies to the content tab. */
  draft_json: optional,
  published_at: optional,
  refresh_after: optional,
  cost_usd: num,
  usage_json: optional,
  error: optional,
  updated_at: optional,
});

export type QueueRow = z.infer<typeof queueSchema>;

export const QUEUE_HEADERS = Object.keys(queueSchema.shape);
export const FACTS_HEADERS = [
  "queue_id",
  "slug",
  "researched_at",
  "model",
  "facts_hash",
  "fact_count",
  "dropped_json",
  "facts_json",
];
export const QUERIES_HEADERS = [
  "query",
  "region_slug",
  "town_slug",
  "page_type",
  "volume",
  "notes",
  "queued",
];

/** Months until a published page is due for a refresh. */
export function refreshMonths(row: Pick<QueueRow, "target" | "page_type">): number {
  return row.target === "towns" ? 12 : 6;
}

export type CheckOutcome = { stage: Stage; attempts: number; redraft: boolean };

/**
 * Pass -> checked. First fail -> redraft with the findings (back to drafted).
 * A fail after a redraft -> needs_review.
 */
export function afterCheck(passed: boolean, attempts: number): CheckOutcome {
  if (passed) return { stage: "checked", attempts, redraft: false };
  if (attempts < 1) return { stage: "drafted", attempts: attempts + 1, redraft: true };
  return { stage: "needs_review", attempts: attempts + 1, redraft: false };
}

/** Appends to the row's usage log, keeping the cell well under Sheets' 50,000-character limit. */
export function appendUsage(current: string | undefined, entries: UsageEntry[]): string {
  let log: UsageEntry[] = [];
  try {
    log = current ? (JSON.parse(current) as UsageEntry[]) : [];
  } catch {
    log = [];
  }
  return JSON.stringify([...log, ...entries].slice(-40));
}
