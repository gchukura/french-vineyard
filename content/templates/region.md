---
target: regions
words: 450-900
required_headings: The wine | How visits work | Planning a trip
required_components:
max_tables: 1
schema_type: TouristDestination
---

# Template: region

A region page is the front door to one wine region. The page template already shows, around your text: a fact strip (airport, TGV time, best months, signature grape), a map, top tours, the region's wine areas, where to stay, a **When to go** section and a **Getting there** section. So the body must **not** repeat train times or best months as sections, list hotels or embed tour cards.

The `standfirst` you return becomes the region's tagline, shown under the title and used as its search description. Make it one sentence of under 25 words that says what the region is and why a wine traveler goes.

## Structure

1. **Opening (no heading), 2 short paragraphs.** What the region makes and where it is, in plain terms, with the most useful numbers from the fact sheet (area under vine, number of villages, UNESCO status).
2. **## The wine.** How the region's wine is made and organized, in terms a first-time visitor needs: the main grapes, how the appellations or classifications work, and the difference between big houses or châteaux and small producers. Two to four short paragraphs.
3. **## How visits work.** Walk-in, booking or appointment, what a typical visit includes, and the fee range from the fact sheet, with USD in parentheses. Name up to four estates from the fact sheet as examples. An optional `<PracticalTable>` (`Estate|Visits|Tasting from`) fits here.
4. **## Planning a trip.** How many days to give the region, which base towns suit which trip, and the three warnings from the fact sheet as a short list.

## Length

450–900 words in the body. There is no FAQ on region pages; return the `faq` field anyway (it is not shown).
