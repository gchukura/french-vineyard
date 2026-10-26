import { describe, expect, it } from "vitest";

import { imageCaption, usedOn } from "./credit";

describe("usedOn", () => {
  it("splits the used_on cell into pages", () => {
    expect(usedOn("/regions/champagne/, /towns/reims/ ,/regions/champagne/")).toEqual([
      "/regions/champagne/",
      "/towns/reims/",
    ]);
    expect(usedOn("")).toEqual([]);
    expect(usedOn(undefined)).toEqual([]);
  });
});

describe("imageCaption", () => {
  it("credits author, source and licence", () => {
    expect(imageCaption({ credit: "Jane Doe / Wikimedia Commons", license: "CC BY-SA 4.0" })).toBe(
      "Photo: Jane Doe / Wikimedia Commons, CC BY-SA 4.0",
    );
  });

  it("returns nothing when there is nothing to credit", () => {
    expect(imageCaption({})).toBeUndefined();
    expect(imageCaption({ credit: " ", license: "" })).toBeUndefined();
    expect(imageCaption({ license: "CC0" })).toBe("Photo: CC0");
  });
});
