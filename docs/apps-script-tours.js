/* eslint-disable @typescript-eslint/no-unused-vars -- entry points are run from the Apps Script editor */
/**
 * FrenchVineyard.com: rules for the owner-curated Tours tab.
 *
 * Paste into Extensions → Apps Script on the content Sheet (as its own file,
 * next to apps-script.js), then run `installToursRules` once and grant
 * permissions. Run it again after adding or moving Tours columns, or after
 * editing the lists below; it replaces only the rules it made.
 *
 * Data validation:
 *   provider, category, badge, status  dropdowns (lists below)
 *   region_slug                        dropdown of the slugs in the Regions tab
 *   rank                               a whole number of 1 or more, unique among
 *                                      tours in the same region_slug + category
 *                                      (archived rows don't count)
 *   why_picked                         at most 300 characters
 *
 * Conditional formatting:
 *   red row    status is published but a field the site needs is empty
 *   amber row  tours:check (link_flag) or tours:describe (notes_flag) flagged it
 */

const TOURS_TAB = "Tours";
const REGIONS_TAB = "Regions";

const PROVIDERS = ["gyg", "viator", "winalist"];
// Category labels are shown on the site as section headings, and ranked-list
// slugs come from them ("Cellar tours" -> best-champagne-cellar-tours).
const CATEGORIES = [
  "Cellar tours",
  "Vineyard tours",
  "Day trips from Paris",
  "Private tours",
  "Tastings and classes",
];
const BADGES = ["Top pick", "Best value", "Small group", "Private", "Luxury"];
const STATUSES = ["draft", "published", "archived"];

/** Empty in any of these on a published row turns the row red. */
const REQUIRED_WHEN_PUBLISHED = [
  "id",
  "provider",
  "provider_id",
  "provider_url",
  "region_slug",
  "category",
  "rank",
  "title",
  "price_from_eur",
  "duration",
  "rating",
  "review_count",
];
const FLAG_COLUMNS = ["link_flag", "notes_flag"];
const WHY_PICKED_MAX = 300;

/** Marks this script's conditional format rules so a re-run replaces only them. */
const MARKER = 'N("fv-tours")=0';
const RED = "#F4CCCC";
const AMBER = "#FCE8B2";

function installToursRules() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(TOURS_TAB);
  if (!sheet) throw new Error(`No "${TOURS_TAB}" tab`);
  addMissingColumns_(sheet, FLAG_COLUMNS);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const col = (name) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Tours has no "${name}" column`);
    return i + 1;
  };
  const letter = (name) => columnLetter_(col(name));
  const rows = sheet.getMaxRows() - 1;
  const column = (name) => sheet.getRange(2, col(name), rows, 1);

  const list = (values, help) =>
    SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true)
      .setAllowInvalid(false)
      .setHelpText(help)
      .build();
  column("provider").setDataValidation(list(PROVIDERS, "gyg, viator or winalist"));
  column("category").setDataValidation(list(CATEGORIES, "Pick a category from the list"));
  column("badge").setDataValidation(list(BADGES, "Optional: pick a badge from the list"));
  column("status").setDataValidation(list(STATUSES, "draft, published or archived"));

  const regions = ss.getSheetByName(REGIONS_TAB);
  if (!regions) throw new Error(`No "${REGIONS_TAB}" tab`);
  const regionHeaders = regions.getRange(1, 1, 1, regions.getLastColumn()).getValues()[0];
  const slugCol = regionHeaders.indexOf("slug") + 1;
  if (!slugCol) throw new Error(`${REGIONS_TAB} has no "slug" column`);
  column("region_slug").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(regions.getRange(2, slugCol, regions.getMaxRows() - 1, 1), true)
      .setAllowInvalid(false)
      .setHelpText("A slug from the Regions tab")
      .build(),
  );

  // Rank: whole number ≥ 1, unique within region_slug + category among rows that aren't archived.
  const [R, G, C, S] = [
    letter("rank"),
    letter("region_slug"),
    letter("category"),
    letter("status"),
  ];
  const rankFormula =
    `=OR($${S}2="archived",AND(ISNUMBER(${R}2),${R}2>=1,INT(${R}2)=${R}2,` +
    `COUNTIFS($${G}$2:$${G},$${G}2,$${C}$2:$${C},$${C}2,$${R}$2:$${R},${R}2,$${S}$2:$${S},"<>archived")=1))`;
  column("rank").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(rankFormula)
      .setAllowInvalid(false)
      .setHelpText("A whole number from 1, not already used in this region and category")
      .build(),
  );

  const W = letter("why_picked");
  column("why_picked").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(`=LEN(${W}2)<=${WHY_PICKED_MAX}`)
      .setAllowInvalid(false)
      .setHelpText(`At most ${WHY_PICKED_MAX} characters`)
      .build(),
  );

  // Whole rows, from column A to the last column.
  const all = sheet.getRange(2, 1, rows, sheet.getLastColumn());
  const missing = REQUIRED_WHEN_PUBLISHED.map((name) => `LEN($${letter(name)}2)=0`).join(",");
  const flags = FLAG_COLUMNS.map((name) => `$${letter(name)}2`).join("&");
  const ours = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(${MARKER},$${S}2="published",OR(${missing}))`)
      .setBackground(RED)
      .setRanges([all])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(${MARKER},LEN(${flags})>0)`)
      .setBackground(AMBER)
      .setRanges([all])
      .build(),
  ];
  const others = sheet.getConditionalFormatRules().filter((rule) => {
    const condition = rule.getBooleanCondition();
    const values = condition ? condition.getCriteriaValues() : [];
    return !values.some((v) => String(v).includes(MARKER));
  });
  sheet.setConditionalFormatRules([...others, ...ours]);
}

/** Appends header cells for any of `names` the tab doesn't have yet. */
function addMissingColumns_(sheet, names) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missing = names.filter((n) => !headers.includes(n));
  if (!missing.length) return;
  const start = sheet.getLastColumn() + 1;
  if (sheet.getMaxColumns() < start + missing.length - 1)
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      start + missing.length - 1 - sheet.getMaxColumns(),
    );
  sheet.getRange(1, start, 1, missing.length).setValues([missing]);
}

/** 1 -> A, 27 -> AA. */
function columnLetter_(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
