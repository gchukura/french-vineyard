# FrenchVineyard.com
An English-language travel guide to French wine regions for tourists, monetized by GetYourGuide, Viator, Booking.com (via CJ/Travelpayouts) and Expedia affiliate links. Launch regions: Champagne, Bordeaux, Burgundy.

## Stack
Next.js (App Router, TypeScript, cacheComponents enabled), Tailwind CSS, next-mdx-remote, google-spreadsheet v5 (service account, read-only), Vercel Pro, Vercel Blob for images, Plausible analytics behind consent, Pagefind search. Content lives in one Google Sheet; the site reads it only inside 'use cache' functions tagged per tab and revalidated by POST /api/revalidate.

## Design tokens
Colours: chalk #F7F3EC (background), parchment #EFE8DB (surfaces), cellar #2B2320 (text), cork #6B5E54 (secondary text), bordeaux #6B1E2B (primary action), vine #5B6B3A (tags, pins), gold #C9A24B (ratings, hairlines), cellar-night #1A1512 (dark mode base). Fonts: Fraunces (headings, 600) and Inter (body). Cards: parchment, 12px radius, no shadow, gold hairline on hover. Buttons: bordeaux fill, chalk text, 6px radius. No gradients except a bottom-up cellar fade on hero images.

## Rules
- Every affiliate link goes through /go/[provider]/[id] and carries rel="sponsored nofollow".
- Tours come only from links the owner pastes into Tours_Inbox (or rows the owner adds to the Tours tab); the code never finds, adds or chooses a tour on its own. `tours:import` fills those tours in from the provider's API and publishes the ones that meet content/selection-rules.md; the rest stay drafts with the reason in notes_flag.
- No tracking script loads before consent. Refuse is as easy as Accept.
- No images of people drinking, glasses raised or parties. No copy that sells wine.
- Never generate a photorealistic image of a real, named place.
- Trailing slashes on all URLs; lowercase ASCII slugs; accented names in headings.
- Every content page renders JSON-LD matching its visible content.
- Target Lighthouse 95+ mobile. Use next/image with sizes; four fixed widths only.
- Never read the Google Sheet outside lib/sheets.ts (site) and pipeline/sheet.ts (pipeline).
- Write tests for lib/ functions with Vitest. Run `npm run lint && npm run typecheck && npm test` before declaring any task done.

## Sheet tabs and key columns
Regions: slug, name, name_fr, tagline, intro_mdx, hero_image, hero_credit, hero_license, hero_source_url, hero_is_ai, lat, lng, airport, tgv_from_paris, best_months, signature_grape, unesco, gyg_location_id, status, updated_at
SubRegions: slug, region_slug, name, appellation_facts_json, intro_mdx, hero_image..., status
Towns: slug, region_slug, subregion_slug, name, intro_mdx, body_mdx, lat, lng, station, estates_json, faq_json, hero_image..., status, updated_at
Articles: slug, page_type (guide|ranked_list|hotel_roundup|itinerary|practical), region_slug, town_slug, title, standfirst, meta_description, body_mdx, faq_json, schema_type, tour_ids, hotel_ids, tags, cluster, target_keyword, secondary_keywords, search_intent, hero_image..., status, published_at, updated_at, refresh_after
Hotels: id, name, town_slug, tier (budget|mid|luxury), booking_hotel_id, expedia_id, lat, lng, price_from_eur, blurb, best_for, image, image_credit
Tours (hand-curated by the owner): id, provider (gyg|viator|winalist), provider_id, provider_url, region_slug, town_slug, category, rank, badge, best_for (AI-written), why_picked (AI-written), title, price_from_eur, duration, rating, review_count, bullets_json, image, featured, status, last_checked, link_flag (tours:check), notes_flag (tours:describe)
Tours_Inbox: url, added_at, processed, note (tours:import reads it)
Estates: id, name, town_slug, appellation, visits (walk-in|booking|appointment), tasting_fee_eur, languages, website, winalist_id
Config: key, value, updated_at, status (rows go live only when status=published; site copy: home_stats_json, home_faq_json, home_title, home_description, home_h1, home_standfirst, home_hero_image, about_mdx, contact_mdx, privacy_policy_mdx, legal_notice_mdx, image_credits_mdx)
Images: url, alt, credit, license, source_url, is_ai, used_on (drives /image-credits/ and alt text)
Clicks: ts, provider, id, page, slot (write-only; appended by the Apps Script doPost, never read by the site)
Queue, Facts, Queries: pipeline tabs described in /pipeline/README.md
