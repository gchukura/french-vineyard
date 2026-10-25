# FrenchVineyard.com style guide

Readers are English-speaking travelers planning a few days in a French wine region. Most have never been, many are on a phone, and all of them want to know what to do next. Write for that person.

## Voice

- **Plain.** Use the everyday word: "use," not "utilize"; "about," not "approximately"; "start," not "commence."
- **Specific.** Name the station, the estate, the month, the price. "The 8:16 TGV from Gare de l'Est reaches Reims in 46 minutes" beats "Reims is easy to reach by train."
- **Second person.** Address the reader as "you." "You can walk from the station to the cathedral in 15 minutes."
- **Calm and useful.** No hype, no breathless openers, no rhetorical questions. Don't tell readers how they will feel.
- **Third person for the site.** Use "we" only inside a "How we ranked these" or "How we chose" box. Never write a first-person review ("I loved," "we tasted," "our guide was").

## Structure

- **Short paragraphs.** One to three sentences, never more than 60 words. One idea per paragraph.
- **Lead with the answer.** The first sentence under every heading should be useful even if the reader stops there.
- **Headings are labels, not teasers.** "When to go," not "Timing is everything."
- **One table per article.** Use it for the comparison readers would otherwise build in their heads (journey options, tasting fees, tours side by side). Write tables with the `<PracticalTable>` component, not Markdown pipes.
- **Lists only for genuinely parallel items** (what to pack, the three warnings). Don't turn prose into bullets.

## Claims and numbers

- **Every number must come from the fact sheet** or from the tour and hotel data you are given. If a number isn't there, write the sentence without it.
- **No superlatives without a number.** Don't write "the best," "the most famous," "the largest" or "the oldest" unless the same sentence gives the figure that proves it ("the largest house by volume, at 30 million bottles a year"). If you can't prove it, cut it.
- **Prices in EUR with USD in parentheses**, rounded to whole units: "€25 ($27)". Use the exchange rate in the brief. Write price ranges as "€20–35 ($22–38)".
- **Times and durations:** durations as "1 hour 30 minutes" or "90 minutes" in prose, "1h30" only inside tables. Clock times always use the 12-hour clock: "9 a.m.", "2:30 p.m.", "noon", never "14:30" or "14h30", in prose and in tables.
- **Dates:** "May to September," "from April 1." No ordinals ("1st").
- **Hedge sparingly.** Opening hours and fees change, but a page full of "ask the estate" is no use to anyone. Use at most two "ask the estate," "check with the tourist office" or "confirm before you go" lines on a page, FAQ included, where they matter most.
- **No trivia.** Every fact should help the reader plan or enjoy the visit. Leave out administrative facts (population, number of communes, postcodes), road numbers that aren't directions ("Épernay lies on the RN 3"), and history that doesn't change what the reader does.

## Wine and alcohol

- Describe wine as part of a place: what grows there, how it's made, what a visit involves.
- **Never sell wine.** No "buy," "order," "stock up," "ship home," discount codes or bottle prices framed as deals. Tasting fees are fine; they're the cost of a visit.
- Don't describe drinking as the point of the trip. No toasts, no "raise a glass," no party language.
- Mention spitting and designated drivers matter-of-factly where tastings are covered; that advice needs no source. Say anything about the drink-drive law itself (the limit, the penalties, that it is strict) only if the fact sheet states it.

## Spelling, punctuation and names

- **American English spelling:** "color," "traveler," "center," "theater," "organize," "program."
- **American punctuation:** double quotation marks, with periods and commas inside them. Use the serial (Oxford) comma. Use an en dash for ranges (€20–35, May–September) and an em dash without spaces for asides.
- **French names keep their accents:** Épernay, Aÿ, Saint-Émilion, Mâcon, Châlons-en-Champagne. Italicize nothing; French words in common use ("cuvée," "grand cru," "caveau") need no explanation beyond a few words the first time.
- **Capitalize** appellations and named places (Côte de Nuits, Grand Cru), not grape varieties (pinot noir, chardonnay).

## Links and components

- Internal links use trailing slashes: `/towns/epernay/`.
- Never paste a raw booking, tour or hotel URL. Commercial tours and hotels appear only through `<TourCards ids="…" />` and `<HotelCards ids="…" />` with ids you are given. Official, non-commercial visits (tourist office tours, the Cité du Vin, an estate's own tastings) can be named in prose.
- Use `<Callout title="…">` for at most one practical tip per article.

## Write as a guide, not a researcher

Never tell the reader how the page was made. No "not sourced," "unconfirmed," "the sources checked," "according to our research" or "we couldn't find." Don't describe where a fact was found: not "one source says," "reportedly," "according to," "the listing shows" or "lists a tasting on the Reims Tourisme page," but the fact itself: "Champagne Guy de Chassey runs a tasting visit." If something isn't known, leave it out, or send the reader to the people who know: "Ask the estate about fees when you book."

## Before you finish

Read your draft against the banned phrases list. If a sentence still works with the place name swapped for another town, it is too generic: make it specific or cut it.
