---
target: towns
words: 600-1200
required_headings: Why visit | Visiting the estates | When to go | Before you go
required_components: PracticalTable
schema_type: TouristDestination
---

# Template: town

A town page introduces one wine town. The page template already shows, around your text: a map, a **Getting there** section built from the station, an estates table from our Estates tab, hotels, tours and the FAQ. So the body must **not** repeat train times as a section, list hotels or embed tour cards.

The `standfirst` you return becomes the town's intro paragraph, shown above the map. Make it two sentences that say what the town is and why a wine traveler stops there.

## Structure

1. **## Why visit.** What the town is known for in wine terms, using `other_facts` (appellation, UNESCO status, houses) and two or three short paragraphs.
2. **## Visiting the estates.** How visits work here, with up to six named estates from the fact sheet and their visit type and fee. Put them in the page's one `<PracticalTable>`: `Estate|Visits|Tasting from`, fees as "€30 ($32)" or "—" if unknown.
3. **## When to go.** From `opening_months`; what's open when, and what closes.
4. **## Before you go.** The three warnings from the fact sheet as a short list, then one sentence on getting around town from `nearest_station`.

## Length

600–1,200 words in the body.
