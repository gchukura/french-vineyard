/* eslint-disable @typescript-eslint/no-unused-vars -- entry points are called by Apps Script triggers */
/**
 * FrenchVineyard.com: Sheet → site revalidation.
 *
 * Paste into Extensions → Apps Script on the content Sheet, then:
 *   1. Project Settings → Script Properties:
 *        REVALIDATE_URL    https://frenchvineyard.com/api/revalidate/
 *        REVALIDATE_SECRET same value as the site's REVALIDATE_SECRET
 *   2. Run `install` once and grant permissions. A simple onEdit trigger
 *      cannot call UrlFetchApp, so this creates an installable one.
 *
 * Edits are debounced: at most one POST per minute, carrying every tab
 * tag edited since the last POST. Tag rule matches lib/sheet-schema.ts
 * sheetTag(): "sheet-" + tab name lowercased.
 */

const SITE_TABS = ["Regions", "SubRegions", "Towns", "Articles", "Hotels", "Tours", "Estates"];
const DEBOUNCE_MS = 60 * 1000;
const PENDING_KEY = "pendingTags";
const LAST_SENT_KEY = "lastSentAt";

function install() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ["handleEdit", "flushRevalidation"].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("handleEdit").forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

function handleEdit(e) {
  const tab = e.range.getSheet().getName();
  if (!SITE_TABS.includes(tab)) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(10 * 1000);
  try {
    const props = PropertiesService.getScriptProperties();
    const pending = new Set(JSON.parse(props.getProperty(PENDING_KEY) || "[]"));
    pending.add("sheet-" + tab.toLowerCase());
    props.setProperty(PENDING_KEY, JSON.stringify([...pending]));

    const lastSent = Number(props.getProperty(LAST_SENT_KEY) || 0);
    const wait = lastSent + DEBOUNCE_MS - Date.now();
    if (wait <= 0) {
      flushLocked_(props);
    } else if (!hasFlushTrigger_()) {
      ScriptApp.newTrigger("flushRevalidation").timeBased().after(wait).create();
    }
  } finally {
    lock.releaseLock();
  }
}

/** Time-driven trigger target: sends whatever is pending. */
function flushRevalidation() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10 * 1000);
  try {
    ScriptApp.getProjectTriggers()
      .filter((t) => t.getHandlerFunction() === "flushRevalidation")
      .forEach((t) => ScriptApp.deleteTrigger(t));
    flushLocked_(PropertiesService.getScriptProperties());
  } finally {
    lock.releaseLock();
  }
}

function flushLocked_(props) {
  const tags = JSON.parse(props.getProperty(PENDING_KEY) || "[]");
  if (tags.length === 0) return;

  const res = UrlFetchApp.fetch(props.getProperty("REVALIDATE_URL"), {
    method: "post",
    contentType: "application/json",
    headers: { "x-revalidate-secret": props.getProperty("REVALIDATE_SECRET") },
    payload: JSON.stringify({ tags }),
    muteHttpExceptions: true,
  });

  props.setProperty(LAST_SENT_KEY, String(Date.now()));
  if (res.getResponseCode() === 200) {
    props.deleteProperty(PENDING_KEY);
  } else {
    // Keep tags pending; the next edit (or a manual flushRevalidation run) retries.
    console.error("Revalidate failed: " + res.getResponseCode() + " " + res.getContentText());
  }
}

function hasFlushTrigger_() {
  return ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "flushRevalidation");
}
