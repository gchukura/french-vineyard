import { describe, expect, it } from "vitest";

import { isWithdrawn, type Finding } from "./checks";

const f = (fix: string): Finding => ({ rule: "x", severity: "error", quote: "q", fix });

describe("isWithdrawn", () => {
  it.each([
    "The 12-hour form is used correctly, so no fix is needed; this finding is withdrawn.",
    "This is a valid conversion of 136 minutes, so no change is needed; dismiss this one.",
    "This is a distance with planning value and passes; no change is needed.",
    "Not a number problem; but check 'Prestige' conversion: €49 ($53) is correct, so no change needed here.",
  ])("treats %j as withdrawn", (fix) => {
    expect(isWithdrawn(f(fix))).toBe(true);
  });

  it.each([
    "Remove the claim about what a visit takes in.",
    "Say the four other grapes are permitted and drop the claim that they are white.",
  ])("keeps %j", (fix) => {
    expect(isWithdrawn(f(fix))).toBe(false);
  });
});
