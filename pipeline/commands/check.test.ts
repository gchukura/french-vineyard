import { describe, expect, it } from "vitest";

import { isAutomatedFinding } from "./check";

describe("isAutomatedFinding", () => {
  it("leaves numbers in digits to the automated check", () => {
    expect(isAutomatedFinding({ rule: "numbers_sourced", quote: "tickets from €11 ($12)" })).toBe(
      true,
    );
    expect(isAutomatedFinding({ rule: "word_count", quote: "596 words" })).toBe(true);
  });

  it("keeps the model's findings on numbers written as words, and on other rules", () => {
    expect(isAutomatedFinding({ rule: "numbers_sourced", quote: "about fifteen minutes" })).toBe(
      false,
    );
    expect(isAutomatedFinding({ rule: "facts_sourced", quote: "It has 3 pools." })).toBe(false);
  });
});
