---
target: articles
words: 900-1800
required_headings: Day 1 | Day 2
required_components:
max_tables: 0
schema_type: Article
---

# Template: itinerary

An itinerary is a day-by-day plan. The page template renders each `## Day n: …` heading as a numbered card and builds the cost table itself from the tours and hotels in the brief, so **don't write a table in the body**.

## Structure

1. **Opening (no heading), 2 short paragraphs.** Who the plan suits, how to arrive (from `from_paris`) and where to sleep. Use the target keyword in the first paragraph.
2. **One H2 per day:** `## Day 1: {short label}`, `## Day 2: {short label}`, and so on, with as many days as the brief's title or keyword implies (default two). Under each day:
   - morning, afternoon and evening as short paragraphs (no sub-headings needed),
   - estates only from the fact sheet, with their visit type ("book ahead"),
   - travel times only from the fact sheet,
   - if a tour in the brief fits that day, one sentence and `<TourCards ids="{id}" />`.
3. After the last day, if the brief has hotels, one sentence and `<HotelCards ids="…" />`.

## Length

900–1,800 words in the body.
