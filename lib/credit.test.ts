import { describe, expect, it } from "vitest";

import { imageCaption } from "./credit";

describe("imageCaption", () => {
  it("credits author, source and licence for photos", () => {
    expect(imageCaption({ credit: "Jane Doe / Wikimedia Commons", license: "CC BY-SA 4.0" })).toBe(
      "Photo: Jane Doe / Wikimedia Commons, CC BY-SA 4.0",
    );
  });

  it("labels generated images whatever the credit", () => {
    expect(imageCaption({ isAi: true })).toBe("AI-generated illustration");
    expect(imageCaption({ isAi: true, credit: "Generated with flux-2-pro" })).toBe(
      "AI-generated illustration · Generated with flux-2-pro",
    );
  });

  it("returns nothing when there is nothing to credit", () => {
    expect(imageCaption({})).toBeUndefined();
    expect(imageCaption({ credit: " ", license: "" })).toBeUndefined();
    expect(imageCaption({ license: "CC0" })).toBe("Photo: CC0");
  });
});
