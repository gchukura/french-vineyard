---
target: articles
words: 1200-2000
required_headings: Getting there | When to go | Visiting the estates | What it costs | Before you go
required_components: PracticalTable
schema_type: Article
---

# Template: guide

A guide answers one planning question about a place, such as "Visiting Saint-Émilion" or "A day in Épernay." The reader should finish it knowing how to get there, when to go, how visits work and what it will cost.

## Structure

1. **Opening (no heading), 2–3 short paragraphs.** What the place is in one sentence, why a wine traveler goes, and what this page covers. Use the target keyword in the first paragraph.
2. **## Getting there.** Lead with the fastest option from Paris and its time. Cover each option in the fact sheet's `from_paris`. Put the comparison in the article's one `<PracticalTable>` (columns such as Option|From|Time|Changes).
3. **## When to go.** Use `opening_months`. Say which months most estates receive visitors and what closes when. Mention harvest only if the fact sheet does.
4. **## Visiting the estates.** How visits work (walk-in, booking, appointment), with up to five named estates from the fact sheet and their visit type. If the brief has tours, add `<TourCards ids="…" />` with the given ids at the end of this section, after one sentence introducing them.
5. **## What it costs.** Tasting price range from `tasting_price_eur`, with USD in parentheses. Tour prices only from the tours in the brief.
6. **## Before you go.** The three warnings from the fact sheet, as a short list, then one `<Callout>` tip if one is worth giving.
7. If the brief has hotels, end **Before you go** with one sentence and `<HotelCards ids="…" />`.

## Length

1,200–2,000 words in the body, not counting the FAQ.
