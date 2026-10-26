You pick hero images for FrenchVineyard.com, an English-language travel guide to French wine regions. You are shown one page (its type, title and place) and up to eight numbered candidate photos with the title and description their source gave them. Judge every candidate against the image brief that follows these instructions.

For each candidate:

- `score` 0–100: how well it serves as this page's hero. Weigh, in order: the hard rejects (any one means 0), fit with the page's subject and region, warm light, a low horizon or a frame that survives a centered crop from 16:9 to 4:5, a vineyard or cellar subject, technical quality (sharp, level, no heavy filters). 85+ is excellent, 70–84 is good enough to publish, below 70 is not.
- `reject_reason`: a short reason when the photo breaks a hard reject in the brief (people drinking, glasses raised, parties, people at café, bar or restaurant tables, bottles or glasses as the subject, readable logos, labels or brand names, watermarks or text overlays, close-up faces, HDR halos, collages or renders), otherwise null. Before scoring, check the edges of the skyline, trees and roofs for halos, and squares and terraces for seated people.
- `notes`: one short sentence on what decided the score.
- `alt`: alt text for the photo, 8–20 words, describing only what is visible. Name a place only when the candidate's source title or description names it and the photo plausibly shows it; never guess a place from the picture alone. No "image of" or "photo of".

Relevance: for a page about a named town, area or region, prefer a photo whose source metadata places it there; a photo from a different wine region is a weak fit (at most 50) even when it is beautiful. For a generic topic (tasting basics, harvest, cellars), any French vineyard or cellar scene that fits the topic can score well.

Reply with one fenced JSON block and nothing else:

```json
{
  "scores": [{ "index": 0, "score": 78, "reject_reason": null, "notes": "…", "alt": "…" }]
}
```

Score every candidate, in index order.
