/**
 * Number matching for the "every number in the draft appears in the fact
 * sheet" rule. Numbers are compared as normalized strings ("1,204" -> "1204",
 * "4,5" -> "4.5", "30.0" -> "30").
 */

const NUMBER = /(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d])|(?<![\w.])\d+(?:[.,]\d+)?(?![\d])/g;

export function normalizeNumber(raw: string): string {
  let s = raw.trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : s;
}

export function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((m) => normalizeNumber(m[0]));
}

/** Keys holding euro amounts, e.g. price_from_eur, tasting_fee_eur. */
const PRICE_KEY = /(^|_)(price|fee|cost|eur)(_|$)/i;

/**
 * Every number a draft may use: numbers anywhere in the given data (numeric
 * values and numbers inside strings), plus the hours and minutes of every
 * `duration_minutes` / `*_minutes` value, and the whole-euro rounding of
 * prices (87.19 may be written "€87"; ratings are never rounded).
 */
export function allowedNumbers(...data: unknown[]): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => out.add(normalizeNumber(String(n)));
  const addPrice = (n: number, key: string) => {
    if (PRICE_KEY.test(key) && !Number.isInteger(n)) add(Math.round(n));
  };
  const walk = (v: unknown, key = "") => {
    if (typeof v === "number") {
      add(v);
      addPrice(v, key);
      if (/minutes$/.test(key)) {
        add(Math.floor(v / 60));
        add(v % 60);
        add(Math.round((v / 60) * 10) / 10);
      }
    } else if (typeof v === "string") {
      // Skip URLs: their digits are ids, not facts.
      const text = v.replace(/https?:\/\/\S+/g, "");
      for (const n of numbersIn(text)) {
        out.add(n);
        addPrice(Number(n), key);
      }
      // Clock times ("17:30", "9.30am", "14h00") may be written in 12-hour form.
      for (const m of text.matchAll(/(?<!\d)([01]?\d|2[0-3])[:h.]([0-5]\d)(?!\d)/g)) {
        add(Number(m[1]) % 12 || 12);
        add(Number(m[2]));
      }
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, key);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  for (const d of data) walk(d);
  return out;
}

/** "($27)", "(US$27)", "($22–38)", "(about $27)" — dollar amounts given as conversions. */
const USD = /\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s?[–-]\s?\$?(\d[\d,]*(?:\.\d+)?))?/g;

/**
 * Text with structural numbers removed: ranked-list heading numbers
 * ("## 3. Tour"), "Day n" labels, component props and link targets.
 */
export function stripStructuralNumbers(mdx: string): string {
  return mdx
    .replace(/^#{2,3}\s+#?\d+[.)]?\s+/gm, "## ")
    .replace(/\bDay\s+\d+\b/gi, "Day")
    .replace(/\b(ids|numeric)="[^"]*"/g, "")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, "");
}

export type NumberFinding = { number: string; context: string };

/**
 * Numbers in `text` that are not in `allowed`. A dollar amount passes when it
 * is within `tolerance` of an allowed number times `usdRate`.
 */
export function unmatchedNumbers(
  text: string,
  allowed: Set<string>,
  { usdRate, tolerance = 0.06 }: { usdRate: number; tolerance?: number },
): NumberFinding[] {
  const clean = stripStructuralNumbers(text);
  const allowedValues = [...allowed].map(Number).filter(Number.isFinite);
  const usdOk = (raw: string) => {
    const usd = Number(normalizeNumber(raw));
    return allowedValues.some(
      (eur) => eur > 0 && Math.abs(eur * usdRate - usd) <= Math.max(1, eur * usdRate * tolerance),
    );
  };

  const findings: NumberFinding[] = [];
  const consumed: [number, number][] = [];
  for (const m of clean.matchAll(USD)) {
    consumed.push([m.index!, m.index! + m[0].length]);
    for (const raw of [m[1], m[2]].filter(Boolean)) {
      if (!usdOk(raw))
        findings.push({ number: `$${normalizeNumber(raw)}`, context: around(clean, m.index!) });
    }
  }
  for (const m of clean.matchAll(NUMBER)) {
    if (consumed.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    const n = normalizeNumber(m[0]);
    if (!allowed.has(n)) findings.push({ number: n, context: around(clean, m.index!) });
  }
  return findings;
}

function around(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - 50), index + 50)
    .replace(/\s+/g, " ")
    .trim();
}
