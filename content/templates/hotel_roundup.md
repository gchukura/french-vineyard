---
target: articles
words: 600-1300
required_headings: Which area to stay in | Getting around | How to choose
required_components: PracticalTable
schema_type: Article
---

# Template: hotel_roundup

A hotel roundup helps the reader decide where to base themselves. The page template lists every hotel in the brief with a tier filter and a map after the body, so the body is about **choosing**, not about describing each hotel in turn.

## Structure

1. **Opening (no heading), 2 short paragraphs.** Who stays here and why: the place's position for estate visits, from the fact sheet. Use the target keyword in the first paragraph.
2. **## Which area to stay in.** Where the hotels in the brief are, using only each hotel's `town`, `address` and `distance_from_town_centre` (write it as given: "about 1.2 km from the center of Reims"). List or group hotels by those fields only, name each hotel's own town's center when you give a distance, and where a hotel's blurb gives a different distance, use `distance_from_town_centre`. Don't place a hotel near a station, landmark or estate unless its address or the fact sheet says so. Name hotels only from the brief.

   Throughout the page, state facts and let the reader choose: no summary of the choice ("where to stay comes down to…", "most are four-star"), no matching of hotels to kinds of traveler beyond each hotel's own `best_for` wording, and no link between hotels and estates unless the fact sheet makes it.

3. **## Getting around.** From `nearest_station` and `from_paris`: whether you need a car, how far the station is, and one warning about driving after tastings if the fact sheet has one.
4. **## How to choose.** One `<PracticalTable>` comparing the hotels in the brief: `Hotel|Tier|Best for|From`, with prices per night as "€140 ($151)". Then 2–3 short paragraphs on which tier suits which trip, drawn from each hotel's `best_for`, `blurb`, `stars` and tier; recommend a hotel for a kind of trip only in those words.
5. Optionally, `<HotelCards ids="…" />` for up to three hotels the body singles out.

## Length

600–1,300 words in the body.
