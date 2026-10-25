# Content pipeline

A Node CLI (run with tsx) that researches, drafts, checks and publishes pages into the content Sheet. It runs nightly from `.github/workflows/pipeline.yml` and can be run locally.

```sh
npm run pipeline -- init                 # create the Queue, Facts and Queries tabs
npm run pipeline -- research 5           # up to 5 queued rows
npm run pipeline -- draft 5
npm run pipeline -- check 5
npm run pipeline -- publish 5
npm run pipeline -- refresh 5            # published rows past refresh_after
npm run pipeline -- run --max 30         # research, draft, check, publish under one budget
npm run pipeline -- seed --file pipeline/launch-queue.json   # append Queue rows (skips existing ids)

# Read the Sheet, call the API, write nothing. Drafts land in pipeline/.dry-run/<time>/.
npm run pipeline -- run --max 3 --dry-run --queue-file pipeline/fixtures/dry-run-queue.json
```

Options: `--max <n>` (or a positional `n`), `--dry-run`, `--queue-file <json>` (dry runs only: Queue rows from a file instead of the tab), `--only <id,id>`, `--budget <usd>`.

## Rules the pipeline keeps

- **Sheet access.** The pipeline's only Sheet code is `pipeline/sheet.ts`, using its own write-enabled service account. The site still reads only through `lib/sheets.ts` with the read-only account. Rows are validated with the site's own schemas in `lib/sheet-schema.ts`.
- **Tours are the owner's.** `draft` filters the owner-curated Tours tab (published rows matching the page's region, town and Queue `category`) in the owner's `rank` order. It never adds, chooses or reorders tours, and `check` rejects any `<TourCards>` id that isn't a published, curated row. A ranked list with no matching tours goes to `needs_review` instead of being drafted.
- **No thin pages.** Before drafting, a fact sheet with fewer than 12 sourced facts, or a town page or guide with no sourced route from Paris, goes straight to `needs_review` with the reason in `findings`; no draft tokens are spent.
- **Sourced facts only.** Research facts must cite a URL that web search actually returned in that run; anything else is dropped (the Facts tab's `dropped_json` lists what). Research gets 8 searches per row, spent in order: the Paris route and nearest station, then estates and visits, then opening months and prices, and the domains in `content/research-blocklist.txt` (Rome2rio, Tripadvisor, Wanderlog, booking platforms and similar) are excluded from search and never count as a source. The writer and checker see the fact sheet without its source URLs. Drafts may only use numbers from the fact sheet, tours and hotels; `check` enforces it.
- **Live pages never show unchecked drafts.** Every draft is stored in `Queue.draft_json`. It is also written to the content tab straight away, but only while that row isn't published. `publish` copies the checked draft over, so a refresh of a live page only goes live once it passes.
- **Dry runs can't write.** `--dry-run` requests a read-only OAuth scope, records every planned write in `writes.json` and skips the revalidate call.

## Stages

```
queued ──research──▶ researched ──draft──▶ drafted ──check──▶ checked ──publish──▶ published
                                              ▲   │ first fail: redraft with findings
                                              └───┘ second fail ──▶ needs_review
any stage ── unrecoverable error ──▶ error (message in the error column)
published ──refresh (facts changed)──▶ researched ──▶ … ──▶ checked ──▶ published
```

| Command    | Picks rows at                                       | Does                                                                                                                                                                                                                                                                                                     | Moves to                                           |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `research` | `queued`                                            | Sonnet-class model with web search (8 searches, blocklisted domains excluded) and `content/prompts/research.md`. Writes the fact sheet to Facts.                                                                                                                                                         | `researched`                                       |
| `draft`    | `researched`                                        | Builds the prompt from `prompts/draft.md`, `style-guide.md`, `banned-phrases.txt`, `templates/{page_type}.md` (towns use `town.md`) and the fact sheet. Single streamed calls up to 20 rows, the Message Batches API (half price) above 20. The shared system prompt and the template are prompt-cached. | `drafted`                                          |
| `check`    | `drafted`                                           | Deterministic checks, then a Haiku-class grade with `prompts/check.md`. Writes `score` and `findings`. On a first fail it redrafts at once with the findings appended (`prompts/redraft.md`) and grades again.                                                                                           | `checked`, or `needs_review` after the second fail |
| `publish`  | `checked`                                           | Copies the draft to Articles/Towns, sets `status=published`, `published_at`, `refresh_after` (6 months for articles, 12 for towns, regions and sub-regions), then one POST to `/api/revalidate` with the touched tabs' tags (`sheet-articles`, `sheet-towns`, `sheet-regions`, `sheet-subregions`).      | `published`                                        |
| `refresh`  | `published` with `refresh_after` on or before today | Re-runs research. If the fact sheet's hash changed: saves it and re-runs draft and check (the next `publish` puts it live). If not: bumps `updated_at` and moves `refresh_after` forward.                                                                                                                | `researched` → … or stays `published`              |
| `run`      |                                                     | research, draft, check, publish in order, each up to `--max`, under one budget.                                                                                                                                                                                                                          |                                                    |

A row in `needs_review` or `error` is left alone. To retry, fix the cause, set `stage` back (for example to `researched`) and clear `attempts`.

### What `check` grades

Deterministic (`pipeline/lib/checks.ts`), each failure an error:

- every number in the title, standfirst, meta description, body and FAQ appears in the fact sheet, tours, hotels (or, on ranked lists, the selection rules). Allowed extras: a USD amount in parentheses within 6% of an allowed EUR amount at `PIPELINE_EUR_USD_RATE`, the hours and minutes of a duration in minutes, ranked-heading numbers and `Day n` labels;
- no banned phrase (`...` in the list matches a short gap);
- body word count within the template's `words` range;
- required H2 headings and components present; no H1; at most `max_tables` tables (default 1), no Markdown pipe tables;
- every `<TourCards>` id is a published Tours row curated for this page; every `<HotelCards>` id is in Hotels; no raw GetYourGuide, Viator, Booking.com, Expedia or Winalist URLs;
- ranked lists: exactly one H2 per curated tour, titles matching, in rank order;
- no "I", "my" or "me", and no "we", "our" or "us" outside a `<MethodologyBox>`;
- no wine-selling language ("buy bottles", "ship them home", discount codes);
- no meta-language about how the page was made ("fact sheet", "not sourced", "unconfirmed", "the sources");
- no 24-hour clock times ("9:00", "14:30", "14h30"); write "9 a.m.", "2:30 p.m.";
- every euro amount followed by its USD conversion, "€25 ($27)".

The model then grades the same rules plus unsourced claims and style. A draft passes when there are no deterministic errors, the model passes it, and the score (the model's score minus 10 per deterministic error) is at least `PIPELINE_PASS_SCORE` (default 80).

## Tabs

The pipeline writes to Queue, Facts, Articles and Towns, and reads Regions, Tours and Hotels. `init` creates Queue, Facts and Queries with these headers, and adds any missing columns to existing tabs.

### Queue (one row per page to produce)

You fill `id`, `target`, `slug` and the page columns; the pipeline fills the rest.

| Column                          | Who      | Meaning                                                                                                                                                        |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | you      | Unique id, e.g. `q-epernay`.                                                                                                                                   |
| `target`                        | you      | `articles`, `towns`, `regions` or `subregions`. Towns, Regions and SubRegions rows must already exist in their tabs; Articles rows are created on first draft. |
| `slug`                          | you      | Lowercase ASCII slug of the Articles or Towns row.                                                                                                             |
| `page_type`                     | you      | Articles only: `guide`, `ranked_list`, `hotel_roundup`, `itinerary` or `practical`.                                                                            |
| `region_slug`, `town_slug`      | you      | Scope for research, tours and hotels.                                                                                                                          |
| `category`                      | you      | Optional Tours `category` to filter on (ranked lists).                                                                                                         |
| `target_keyword`                | you      | Search phrase the page targets; copied to Articles.                                                                                                            |
| `notes`                         | you      | Editor brief for research and drafting.                                                                                                                        |
| `stage`                         | both     | See Stages. Blank means `queued`.                                                                                                                              |
| `attempts`                      | pipeline | Failed checks so far.                                                                                                                                          |
| `score`, `findings`             | pipeline | Last check score and findings (JSON).                                                                                                                          |
| `facts_hash`                    | pipeline | Hash of the fact sheet's content (ignores sources and order); `refresh` compares it.                                                                           |
| `draft_json`                    | pipeline | Latest draft: title, standfirst, meta description, body, FAQ, tour and hotel ids.                                                                              |
| `published_at`, `refresh_after` | pipeline | Set by publish; Towns have no such columns, so they live here.                                                                                                 |
| `cost_usd`                      | pipeline | Total API spend on this row.                                                                                                                                   |
| `usage_json`                    | pipeline | Last 40 calls: stage, model, input/output/cached tokens, searches, USD.                                                                                        |
| `error`                         | pipeline | Last error message.                                                                                                                                            |
| `updated_at`                    | pipeline | Last pipeline write.                                                                                                                                           |

### Facts (one row per Queue row)

`queue_id`, `slug`, `researched_at`, `model`, `facts_hash`, `fact_count`, `dropped_json` (facts dropped for missing sources) and `facts_json`, the fact sheet:

```json
{
  "subject": "Épernay",
  "coordinates": { "lat": 49.04, "lng": 3.96, "sources": ["…"] },
  "from_paris": [
    { "mode": "train", "route": "…", "duration_minutes": 75, "changes": 0, "sources": ["…"] }
  ],
  "opening_months": { "months": ["april", "…"], "notes": "…", "sources": ["…"] },
  "tasting_price_eur": { "min": 20, "max": 45, "sources": ["…"] },
  "estates": [
    { "name": "…", "visits": "booking", "tasting_fee_eur": 30, "website": "…", "sources": ["…"] }
  ],
  "nearest_station": { "name": "Épernay", "distance_km": 0.5, "sources": ["…"] },
  "warnings": [{ "text": "…", "sources": ["…"] }],
  "other_facts": [{ "claim": "…", "sources": ["…"] }],
  "sources": [{ "url": "…", "title": "…" }]
}
```

### Queries (keyword backlog)

`query`, `region_slug`, `town_slug`, `page_type`, `volume`, `notes`, `queued`. A list for the editor to plan from. The CLI doesn't read it; promote a query by adding a Queue row and setting `queued` to the Queue id.

### Content tabs the pipeline writes

- **Articles:** `title`, `standfirst`, `meta_description`, `body_mdx`, `faq_json`, `tour_ids`, `hotel_ids`, `schema_type` (from the template), `updated_at`; on publish also `status`, `published_at`, `refresh_after`. New rows are created with `status=draft`.
- **Towns:** `intro_mdx` (the standfirst), `body_mdx`, `faq_json`, `updated_at`; on publish `status`. The town page shows hotels and tours from their tabs itself, so town drafts embed no cards.
- **Regions:** `tagline` (the standfirst), `intro_mdx` (the body), `updated_at`; on publish `status`.
- **SubRegions:** `intro_mdx` (standfirst, then body); on publish `status`. The tab has no `updated_at` or FAQ column.

Place pages (towns, regions, sub-regions) render their own tours, hotels, estates and practical sections, so their templates leave those out.

## Environment

| Variable                                                                 | Default                |                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                      |                        | API key.                                                                                                                                                                                           |
| `PIPELINE_SERVICE_ACCOUNT_EMAIL`, `PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY` |                        | Service account with **Editor** access to the Sheet. Separate from the site's read-only `GOOGLE_SERVICE_ACCOUNT_*`. Dry runs fall back to the read-only account if these are unset.                |
| `PIPELINE_SHEET_ID`                                                      | `GOOGLE_SHEET_ID`      |                                                                                                                                                                                                    |
| `PIPELINE_MODEL`                                                         | `claude-sonnet-5-5`    | Research and drafting.                                                                                                                                                                             |
| `PIPELINE_CHECK_MODEL`                                                   | `claude-haiku-5-5`     | Grading.                                                                                                                                                                                           |
| `PIPELINE_BUDGET_USD`                                                    | `25`                   | Spend cap per invocation. Each call reserves a ceiling first (research $0.35, draft $0.25, check $0.02) and the stage stops when the next one wouldn't fit. Publish costs nothing and always runs. |
| `PIPELINE_EUR_USD_RATE`                                                  | `1.08`                 | Rate given to the writer and used to verify USD conversions.                                                                                                                                       |
| `PIPELINE_PASS_SCORE`                                                    | `80`                   | Minimum check score.                                                                                                                                                                               |
| `SITE_URL`                                                               | `NEXT_PUBLIC_SITE_URL` | Where to POST `/api/revalidate`.                                                                                                                                                                   |
| `REVALIDATE_SECRET`                                                      |                        | Same secret as the site.                                                                                                                                                                           |

Locally, `.env.local` is loaded automatically. In GitHub Actions, set the secrets `ANTHROPIC_API_KEY`, `PIPELINE_SERVICE_ACCOUNT_EMAIL`, `PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY`, `PIPELINE_SHEET_ID` and `REVALIDATE_SECRET`, and optionally the repository variables `PIPELINE_BUDGET_USD`, `PIPELINE_MODEL`, `PIPELINE_CHECK_MODEL`, `PIPELINE_EUR_USD_RATE` and `SITE_URL`.

Prices for the cost log are in `pipeline/lib/cost.ts`; a model missing from that table stops the run rather than spending untracked money. Sonnet-class calls use the server-side refusal fallback (`fallbacks: "default"`); batch requests can't, so a refused batch request becomes an `error` row.

## Files

```
pipeline/
  cli.ts              argument parsing, dry-run report
  context.ts          config, content files, briefs, usage logging
  sheet.ts            the pipeline's Sheet access (cached reads, logged writes, rate limiting)
  claude.ts           streamed calls, pause_turn, fallbacks, batches, budget
  commands/           init, research, draft, check, publish, refresh, run
  lib/                pure functions, tested with Vitest (*.test.ts)
  fixtures/dry-run-queue.json
  launch-queue.json   launch Queue rows (regions, wine areas, towns, guides, itineraries, practical pages) for `seed`
content/
  prompts/            research.md, draft.md, redraft.md, check.md
  templates/          guide, ranked_list, hotel_roundup, itinerary, practical, town, region, subregion
  style-guide.md, banned-phrases.txt, selection-rules.md, research-blocklist.txt
```

Template frontmatter: `target` (`articles`, `towns`, `regions` or `subregions`), `words` (`min-max`), `required_headings` and `required_components` (`|`-separated), optional `max_tables`, `h2_per_tour: true` (ranked lists) and `schema_type`.
