# Playbook: building an AI-written affiliate travel site

How FrenchVineyard.com was planned and built in October 2026, written so the same approach can be reused for another site. Hand this file to Claude or Claude Code at the start of a new project as context.

## 1. What the site is

- An English-language travel guide to French wine regions for US and UK tourists, modelled on thegambia.com (structure, page furniture, monetization) and aegeansea.com (what an unfinished version of that template looks like).
- Launch scope: 3 regions (Champagne, Bordeaux, Burgundy), 15 wine areas, 20 towns, plus guides, itineraries and practical pages: about 140 pages.
- Money comes from affiliate links: tours (GetYourGuide, Viator, Winalist) and hotels (Booking.com via CJ or Travelpayouts, Expedia Group). No display ads.
- Content is written by AI from sourced facts. The owner picks, ranks and badges the tours by hand; the AI writes every word, including the notes on each tour.
- Owner decisions that shaped the build: no named author (the site brand is the author), no affiliate or AI disclosure pages or text, American English, prices in EUR with USD in parentheses.

## 2. The order that worked

1. **Interview before research.** Five questions settled the plan: geographic scope, affiliate status, image sourcing, editorial review, and where content is stored. Ask them one at a time.
2. **Deep research in parallel**: reference-site teardown, affiliate programme status, Google's policy on AI content, image licensing, region demand, architecture limits and legal. Each finding went into a living plan document with sources.
3. **Plan document** with: reference-site analysis, site structure and URL scheme, launch regions, design theme, monetization, curation, image sourcing, architecture, content pipeline, Google risk, SEO, legal, a day-by-day build plan, and numbered Claude Code prompts.
4. **Build with Claude Code**, one prompt per session, each starting "Read CLAUDE.md":
   - 0: write `CLAUDE.md` (brief, stack, design tokens, rules, Sheet columns)
   - 1: scaffold and data layer (Next.js, Sheets loaders, revalidate hook)
   - 2: layout, components, design system, consent banner
   - 3: routes and templates, `/go/` affiliate redirect, sitemaps, legal pages
   - 4: content pipeline (research, draft, check, publish, refresh)
   - 5: hero images
   - 5b: tour curation tools
   - 6: SEO hardening and QA
   - 7: deploy, domain, runbook
5. **Deploy a hidden preview early** (after prompt 1) with `SITE_NOINDEX` on, and only point the real domain at it at launch.
6. **Content**: written by Claude Code itself under the Max plan (see lessons), with the API pipeline kept for weekly upkeep.
7. **Brand**: logo and favicon designed on a Claude design canvas, exported as SVGs into `public/brand/`.

## 3. Stack and architecture

- Next.js (App Router, `cacheComponents`), TypeScript, Tailwind, MDX, Vitest. Hosted on Vercel Pro (Hobby forbids commercial use).
- **Google Sheets as the CMS** (tabs: Regions, SubRegions, Towns, Articles, Hotels, Tours, Estates, Queue, Facts, Images, Queries, Clicks, Config, Tours_Inbox). The site reads it only inside `'use cache'` functions tagged per tab; an Apps Script hook and the pipeline call `/api/revalidate` when rows change. The Sheets API allows 60 reads per minute per service account, so the Sheet must never be read on a page view.
- Two Google service accounts: a read-only one for the site, an Editor one for the pipeline.
- `/go/[provider]/[id]` builds every affiliate URL from environment variables, so switching networks is a config change. All affiliate links carry `rel="sponsored nofollow"`.
- Real 404s for draft and unknown URLs via `proxy.ts`, which checks a cached list of published paths.
- Images: Wikimedia Commons first, then Pexels; scored by a vision model against `content/image-brief.md`; converted to AVIF and WebP with sharp; stored in Vercel Blob; credits on `/image-credits/`. AI image generation is switched off.
- Migration path when the Sheet outgrows itself (about 5,000 rows): Neon Postgres via the Vercel Marketplace, with the same cache tags.
- Weekly GitHub Actions run (Sundays 02:00 UTC): check tour links, write notes for new tours, refresh pages whose `refresh_after` date has passed. A monthly keepalive commit stops GitHub from disabling scheduled workflows.

## 4. Content system

- **Facts first, then writing.** Research produces a fact sheet in which every fact has a source URL that web search actually returned. The writer may use only those facts; the checker rejects any number not in the fact sheet.
- **Rules live in files**: `content/style-guide.md`, `banned-phrases.txt`, `research-blocklist.txt` (aggregators such as Rome2rio and Tripadvisor, booking sites, coordinate-lookup sites), `selection-rules.md`, page templates in `content/templates/`, prompts in `content/prompts/`.
- **Research order**: the route from Paris and the nearest station first, then estates and visits, then opening months and prices, then the wine (grapes, appellations, soils). Prefer official tourist offices, the estates' own sites, SNCF Connect, UNESCO and the interprofessions (CIVB, BIVB, Comité Champagne).
- **Checks that earned their place**: no talk about research ("not sourced", "one source says", "reportedly"); 12-hour times; EUR with USD; no first-person reviews (the FTC reviews rule bans fake ones); no wine-selling language (Loi Évin); at most two "ask the estate" lines per page; two checker passes must agree before a finding blocks a page.
- **Word count is a warning, not a blocker.** Floors: 350 words for practical pages, 400 for towns. Minimums force padding, and padding is what the checker rejects.
- **Publish order**: regions before their wine areas and towns, because child pages link to parents.
- **Tours**: the owner pastes tour URLs into `Tours_Inbox`; `tours:import` fills each tour in from the provider's API and publishes the ones that meet `selection-rules.md` (the rest stay drafts with the reason noted); the owner sets rank and badge; the AI writes `best_for` and `why_picked` in the site voice; a ranked-list article is queued once a category has three tours. The code never finds or chooses a tour on its own.
- **Hotels**: the same pattern through `Hotels_Inbox` and `hotels:import`, which fills each hotel in from its own site and official registers.

## 5. Lessons: what to do differently next time

1. **Write content with Claude Code on the subscription from the start.** The one-shot API pipeline (research, draft, check, rewrite) passed only 25% to 55% of pages, even after several rounds of tuning, and cost about $40 in test runs. When Claude Code wrote or fixed a page directly, in a loop of draft, check, fix only the flagged sentences, and check again, pages passed reliably. Use the API pipeline only for unattended upkeep.
2. **If you do run an automated pipeline, give the writer the checker as a tool** and have it fix flagged sentences rather than redraft the whole page; a full rewrite introduces new errors.
3. **Research each region once, in depth,** into a shared fact base that every page draws on, instead of 8 searches per page. Thin research is the root cause of short, padded pages.
4. **Don't set word-count minimums** as hard rules (see above).
5. **Watch the cost of research.** About $0.35 to $0.60 per page on Sonnet, almost all of it search-result tokens. Capping at 6 searches made pages too thin; 8 searches with a fixed research order was the balance.
6. **Check affiliate programmes before planning around them.** Booking.com closed direct signups to small publishers in 2025, and its Awin route reportedly ended in June 2026; it is now reached through CJ or Travelpayouts. Plan hotel revenue across several networks from day one.
7. **Never scrape partner sites.** GetYourGuide's terms forbid it, so tour facts are copied by hand or come from the Partner API.
8. **GitHub secrets for private keys**: paste only the `private_key` value, newlines intact, or copy it programmatically from a working `.env.local`.
9. **Claude Code's background sessions can't merge PRs**; the owner merges them.
10. **Keep the site noindexed until launch**, on the `vercel.app` address too.

## 6. Costs (October 2026)

- Vercel Pro: $20 a month. Anthropic API: test runs about $40 in total; images about $0.02 a page; weekly upkeep a few dollars a month. Most launch content was written under the Claude Max plan.
- Claude API prices used: Sonnet 5.5 $2 / $10 per million input and output tokens (half on the Batch API); Haiku 5.5 $0.10 / $0.50; Opus 5.5 $4 / $20.

## 7. Legal and policy notes (not legal advice)

- EU and UK visitors: cookie consent before analytics or affiliate cookies, with Refuse as easy as Accept (CNIL). Plausible or Umami can run without consent when configured as site-only and anonymous; GA4 can't.
- Loi Évin: keep wine content informational; no images of people drinking or raised glasses; no links that sell wine.
- EU AI Act article 50 (since 2 August 2026): realistic AI images of real places are the main risk, so the site never generates them.
- Required pages: About, Contact, Privacy Policy, Legal Notice (French LCEN), Image Credits.
- Google: scaled AI content is allowed if it is useful; sourced facts, real tables, internal links and a capped, on-topic page set are the defences. Expect 6 to 9 months before meaningful organic traffic.

## 8. Design

- "Terroir" theme: chalk `#F7F3EC` background, parchment `#EFE8DB` surfaces, cellar `#2B2320` text, cork `#6B5E54` secondary text, Bordeaux `#6B1E2B` for actions, vine `#5B6B3A` tags, gold `#C9A24B` hairlines; Fraunces for headings, Inter for body.
- Logo: the hillside-rows badge (vine rows under a gold sun in a Bordeaux circle) with "FrenchVineyard" set to its right in Fraunces 600. The favicon is the same badge as a rounded square, with a one-row version for 16 px. Files are in `public/brand/`.

## 9. Reusing this for another site

1. Copy this repository's structure: `CLAUDE.md`, `content/`, `pipeline/`, `lib/sheets.ts`, `/go/` redirects and the templates. Rename the place types (regions, towns) to the new subject's.
2. Rewrite `CLAUDE.md`, the style guide, the research order and the source preferences for the new subject and its official sources.
3. Check every affiliate programme's current status before building around it.
4. Run the interview, research and plan steps above before any code.
5. Write launch content with Claude Code in a draft, check and fix loop; keep the scheduled pipeline for refreshes only.
6. Keep the site noindexed until it launches on its real domain (see `docs/DOMAIN.md`).
