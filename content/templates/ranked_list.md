---
target: articles
words: 700-1800
required_headings:
required_components: PracticalTable | MethodologyBox
h2_per_tour: true
schema_type: ItemList
---

# Template: ranked_list

A ranked list presents the tours the site owner has chosen for this page, in the owner's order. The page template turns every H2 into a numbered entry in the jump list, so **the only H2 headings are the tours themselves**.

## Structure

1. **Opening (no heading), 2 short paragraphs.** What these tours have in common and who the list is for. Use the target keyword in the first paragraph. Don't say how many tours exist in the region; say how many are on this list.
2. **The comparison table.** Directly after the opening, one `<PracticalTable>` comparing every tour on the list, in rank order. Columns: `Tour|Best for|Duration|From`. Prices as "€95 ($103)". Use only each tour's own `best_for`, `duration` and `price_from_eur`.
3. **The "How we ranked these" box.** After the table, a `<MethodologyBox title="How we ranked these">` that summarizes the selection rules in the brief in 2–4 sentences. This is the only place "we" is allowed.
4. **One H2 per tour, in the brief's order.** Heading format: `## 1. {tour title}` with the tour's exact title. Under each:
   - one paragraph built from the tour's `why_picked`,
   - one sentence on who it suits, from its `best_for`,
   - one or two sentences linking the tour to the place, using only fact sheet facts (for example, the estate or village it visits, how to get to the meeting point),
   - `<TourCards ids="{tour id}" />` with that tour's id alone.
5. **No closing section and no FAQ heading.** The page adds the FAQ and related links itself.

## Rules specific to this page type

- Never mention, compare with or recommend a tour that isn't in the brief, even generically ("other operators also run…").
- Don't reorder the tours or skip any. If a tour has no `why_picked`, use its bullets and `best_for` instead.
- Ratings and review counts may be quoted only as given in the brief, e.g. "rated 4.8 from 1,204 reviews."

## Length

700–1,800 words in the body.
