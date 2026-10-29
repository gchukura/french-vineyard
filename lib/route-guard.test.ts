import { describe, expect, it } from "vitest";

import { checkPath, isContentPath, normalizePath } from "@/lib/route-guard";

describe("isContentPath", () => {
  it("matches every dynamic content route", () => {
    for (const p of [
      "/champagne-tasting-guide/",
      "/regions/champagne/",
      "/regions/champagne/montagne-de-reims/",
      "/towns/reims/",
      "/tours/burgundy/",
      "/where-to-stay/where-to-stay-in-reims/",
      "/plan/paris-to-reims-by-train/",
      "/towns/",
    ]) {
      expect(isContentPath(p), p).toBe(true);
    }
  });

  it("leaves fixed routes, files and deeper paths alone", () => {
    for (const p of [
      "/",
      "/regions/",
      "/tours/",
      "/where-to-stay/",
      "/plan/",
      // The getting-there hub is a fixed page, not a practical article.
      "/plan/getting-there/",
      "/about/",
      "/styleguide/",
      "/og-default.jpg",
      "/regions/a/b/c/",
      "/towns/a/b/",
    ]) {
      expect(isContentPath(p), p).toBe(false);
    }
  });

  it("normalises a missing trailing slash", () => {
    expect(normalizePath("/towns/reims")).toBe("/towns/reims/");
    expect(isContentPath("/towns/reims")).toBe(true);
  });
});

describe("checkPath", () => {
  const published = new Set(["/regions/champagne/", "/towns/reims/", "/best-houses/"]);

  it("passes published and fixed paths, 404s the rest", () => {
    expect(checkPath("/regions/champagne/", published)).toBe("pass");
    expect(checkPath("/towns/reims", published)).toBe("pass");
    expect(checkPath("/tours/", published)).toBe("pass");
    expect(checkPath("/regions/bordeaux/", published)).toBe("not-found");
    expect(checkPath("/no-such-article/", published)).toBe("not-found");
    expect(checkPath("/__placeholder__/", published)).toBe("not-found");
  });
});
