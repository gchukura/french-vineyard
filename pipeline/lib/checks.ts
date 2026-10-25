import { extractHeadings, stripRank } from "@/lib/content";

import { componentIds, mdxToText, tableCount, withoutMethodology, wordCount } from "./mdx";
import { unmatchedNumbers } from "./numbers";
import type { Template } from "./template";

/** Deterministic checks that run before the model grades a draft. */

export type Draft = {
  title?: string;
  standfirst?: string;
  meta_description?: string;
  body_mdx: string;
  faq: { question: string; answer: string }[];
  tour_ids: string[];
  hotel_ids: string[];
};

export type Finding = {
  rule: string;
  severity: "error" | "warning";
  quote: string;
  fix: string;
};

export function parseBannedPhrases(source: string): string[] {
  return source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A banned phrase as a regex: word boundaries, "..." as a short gap, any apostrophe. */
export function phraseRegex(phrase: string): RegExp {
  const parts = phrase
    .split("...")
    .map((p) => p.trim())
    .filter(Boolean);
  const source = parts
    .map((p) => escape(p).replace(/'/g, "['’]").replace(/\s+/g, "\\s+"))
    .join("(?:\\s+\\S+){1,12}?\\s+");
  const start = /^\w/.test(parts[0]) ? "\\b" : "";
  const end = /\w$/.test(parts[parts.length - 1]) ? "\\b" : "";
  return new RegExp(`${start}${source}${end}`, "i");
}

export function bannedPhraseHits(
  text: string,
  phrases: string[],
): { phrase: string; quote: string }[] {
  return phrases.flatMap((phrase) => {
    const m = text.match(phraseRegex(phrase));
    return m ? [{ phrase, quote: m[0] }] : [];
  });
}

const FIRST_PERSON = /(?<![\w'’])(I|I['’]m|I['’]ve|I['’]d|[Mm]y|me|mine)(?![\w'’])/;
// Case-sensitive "us" so "US$" and "US" don't count.
const FIRST_PERSON_PLURAL = /\b([Ww]e|[Ww]e['’]re|[Ww]e['’]ve|[Oo]urs?|us)\b/;

const SELLING = [
  /\b(buy|order|purchase|shop for|stock up on|pick up)\s+(a |some |the |your |a few |extra )?(bottles?|cases?|wines?|champagnes?|crémants?|magnums?)\b/i,
  /\bship(ping|ped)?\s+(it |them |bottles |wine |cases )?home\b/i,
  /\b(free shipping|discount code|promo code|use code|% off)\b/i,
];

/** "€25", "€12.50", "€20–35"; ranges count as one amount. */
const EUR_AMOUNT = /€\s?\d[\d,.]*(?:\s?[–-]\s?€?\d[\d,.]*)?/g;

const RAW_AFFILIATE = /https?:\/\/(www\.)?(getyourguide|viator|booking|expedia|winalist)\.[a-z.]+/i;

export type CheckInput = {
  draft: Draft;
  template: Template;
  bannedPhrases: string[];
  allowedNumbers: Set<string>;
  usdRate: number;
  /** Published tours selected for the page, in rank order. */
  tours: { id: string; title: string }[];
  /** Every published tour id in the Tours tab. */
  publishedTourIds: Set<string>;
  hotelIds: Set<string>;
};

export function runChecks({
  draft,
  template,
  bannedPhrases,
  allowedNumbers,
  usdRate,
  tours,
  publishedTourIds,
  hotelIds,
}: CheckInput): { findings: Finding[]; wordCount: number } {
  const findings: Finding[] = [];
  const err = (rule: string, quote: string, fix: string) =>
    findings.push({ rule, severity: "error", quote: quote.slice(0, 200), fix });

  const body = draft.body_mdx;
  const faqText = draft.faq.map((f) => `${f.question}\n${f.answer}`).join("\n\n");
  const prose = [draft.title, draft.standfirst, draft.meta_description, body, faqText]
    .filter(Boolean)
    .join("\n\n");
  const readable = [draft.title, draft.standfirst, draft.meta_description, mdxToText(body), faqText]
    .filter(Boolean)
    .join("\n\n");

  for (const n of unmatchedNumbers(prose, allowedNumbers, { usdRate })) {
    err(
      "numbers_sourced",
      n.context,
      `${n.number} is not in the fact sheet, tours or hotels; remove it or use a sourced number.`,
    );
  }

  for (const hit of bannedPhraseHits(readable, bannedPhrases)) {
    err("no_banned_phrases", hit.quote, `Rewrite without "${hit.phrase}".`);
  }

  const words = wordCount(body);
  if (words < template.words.min || words > template.words.max) {
    err(
      "word_count",
      `${words} words`,
      `The body must be ${template.words.min}–${template.words.max} words; it is ${words}.`,
    );
  }

  const headings = extractHeadings(body);
  for (const required of template.requiredHeadings) {
    const want = required.toLowerCase();
    if (!headings.some((h) => h.toLowerCase().startsWith(want))) {
      err("required_headings", required, `Add an H2 heading "## ${required}".`);
    }
  }
  for (const component of template.requiredComponents) {
    if (!new RegExp(`<${component}\\b`).test(body)) {
      err("required_components", component, `Add a <${component}> as the template describes.`);
    }
  }
  if (/^# /m.test(body))
    err("required_headings", "# ", "Don't use H1 headings; start sections at ##.");

  const tables = tableCount(body);
  if (tables > template.maxTables) {
    err("style", `${tables} tables`, `Use at most ${template.maxTables} table(s) in the body.`);
  }
  if (/^\s*\|.*\|\s*$/m.test(body)) {
    err("style", "Markdown table", "Write the table with <PracticalTable>, not Markdown pipes.");
  }

  for (const id of [...componentIds(body, "TourCards"), ...draft.tour_ids]) {
    if (!publishedTourIds.has(id)) {
      err("cards_valid", id, `Tour id "${id}" is not a published row in the Tours tab; remove it.`);
    }
  }
  const selected = new Set(tours.map((t) => t.id));
  for (const id of componentIds(body, "TourCards")) {
    if (publishedTourIds.has(id) && !selected.has(id)) {
      err(
        "cards_valid",
        id,
        `Tour id "${id}" was not curated for this page; use only the brief's tours.`,
      );
    }
  }
  for (const id of [...componentIds(body, "HotelCards"), ...draft.hotel_ids]) {
    if (!hotelIds.has(id)) {
      err("cards_valid", id, `Hotel id "${id}" is not in the Hotels tab; remove it.`);
    }
  }

  if (template.h2PerTour) {
    const entries = headings.map(stripRank);
    const want = tours.map((t) => t.title);
    if (entries.length !== want.length) {
      err(
        "required_headings",
        entries.join(" / ") || "(no H2s)",
        `Write exactly one H2 per curated tour (${want.length}) and no other H2s.`,
      );
    } else {
      entries.forEach((h, i) => {
        if (h.trim().toLowerCase() !== want[i].trim().toLowerCase()) {
          err(
            "required_headings",
            h,
            `H2 #${i + 1} must be "## ${i + 1}. ${want[i]}" (owner's rank order).`,
          );
        }
      });
    }
  }

  const reviewText = mdxToText(withoutMethodology(body)) + "\n\n" + faqText;
  const first = reviewText.match(FIRST_PERSON);
  if (first)
    err(
      "no_first_person_reviews",
      first[0],
      'Remove first-person writing; address the reader as "you".',
    );
  const plural = reviewText.match(FIRST_PERSON_PLURAL);
  if (plural) {
    err(
      "no_first_person_reviews",
      plural[0],
      '"We"/"our" is only allowed inside the MethodologyBox.',
    );
  }

  for (const re of SELLING) {
    const m = readable.match(re);
    if (m)
      err("no_alcohol_selling", m[0], "Remove language that encourages buying or shipping wine.");
  }

  // Style guide: every euro amount is followed by its USD conversion, "€25 ($27)".
  for (const m of readable.matchAll(EUR_AMOUNT)) {
    if (!/^\s*\((?:US)?\$/.test(readable.slice(m.index! + m[0].length))) {
      err("style", m[0], `Add the USD conversion in parentheses after ${m[0]}, e.g. "€25 ($27)".`);
    }
  }

  const raw = body.match(RAW_AFFILIATE);
  if (raw)
    err("cards_valid", raw[0], "Never link to providers directly; use <TourCards>/<HotelCards>.");

  return { findings, wordCount: words };
}
