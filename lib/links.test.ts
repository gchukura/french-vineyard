import { describe, expect, it } from "vitest";

import { AFFILIATE_REL, goHref, isAffiliateHref } from "@/lib/links";

describe("goHref", () => {
  it("builds a trailing-slash /go/ path", () => {
    expect(goHref("gyg", "home")).toBe("/go/gyg/home/");
    expect(goHref("booking", "h-reims-1")).toBe("/go/booking/h-reims-1/");
  });

  it("encodes and trims ids", () => {
    expect(goHref("viator", " a b/c ")).toBe("/go/viator/a%20b%2Fc/");
  });

  it("adds an optional slot query", () => {
    expect(goHref("gyg", "t1", "tour-card")).toBe("/go/gyg/t1/?slot=tour-card");
  });

  it("rejects a blank id", () => {
    expect(() => goHref("expedia", "  ")).toThrow(/needs an id/);
  });
});

describe("isAffiliateHref", () => {
  it("matches only /go/ paths", () => {
    expect(isAffiliateHref("/go/gyg/home/")).toBe(true);
    expect(isAffiliateHref("/tours/")).toBe(false);
    expect(isAffiliateHref("https://www.getyourguide.com/")).toBe(false);
  });
});

it("uses the rel value CLAUDE.md requires", () => {
  expect(AFFILIATE_REL).toBe("sponsored nofollow");
});
