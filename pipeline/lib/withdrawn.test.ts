import { describe, expect, it } from "vitest";

import { isWithdrawn, type Finding } from "./checks";

const f = (fix: string): Finding => ({ rule: "x", severity: "error", quote: "q", fix });

describe("isWithdrawn", () => {
  it.each([
    "The 12-hour form is used correctly, so no fix is needed; this finding is withdrawn.",
    "This is a valid conversion of 136 minutes, so no change is needed; dismiss this one.",
    "This is a distance with planning value and passes; no change is needed.",
    "Not a number problem; but check 'Prestige' conversion: €49 ($53) is correct, so no change needed here.",
    // Seen on blocking errors in the hotel roundups (2026-10-30).
    "Hotel blurb says 1 km from the center of Épernay while the distance field says 2.9 km; the draft avoids this, so this is fine, but state the Dizy distance consistently if given.",
    "Keep only claims sourced to each hotel; this is fine for those two, but drop any inference about parking elsewhere.",
    "The hotel blurb sources this, so keep it, but remove unsourced claims elsewhere; this is fine as written.",
    "This is allowed safety advice, but make sure no wording elsewhere presents tasting as the trip's point.",
    "The claim is sourced, but the table and text repeat the same data.",
  ])("treats %j as withdrawn", (fix) => {
    expect(isWithdrawn(f(fix))).toBe(true);
  });

  it.each([
    "Remove the claim about what a visit takes in.",
    "Say the four other grapes are permitted and drop the claim that they are white.",
    "Remove this sentence, since the station's walking distance from the tourist office has little planning value for hotel choice.",
    "Keep the 80-minute figure, but do not present it as a settled direct timetable.",
    "Delete this inference, which is not supported by the fact sheet or hotels.",
  ])("keeps %j", (fix) => {
    expect(isWithdrawn(f(fix))).toBe(false);
  });
});
