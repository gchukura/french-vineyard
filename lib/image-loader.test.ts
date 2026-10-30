import { describe, expect, it } from "vitest";

import blobImageLoader, { storedVariant } from "@/lib/image-loader";

const BLOB = "https://a8gabtjhagmgxmkk.public.blob.vercel-storage.com/images";

describe("storedVariant", () => {
  const hero = `${BLOB}/home/home-3913191f-2400.webp`;

  it("serves the smallest stored width that covers the request", () => {
    expect(
      [320, 640, 641, 1024, 1280, 1600, 1920, 2400, 3000].map((w) => storedVariant(hero, w)),
    ).toEqual([
      `${BLOB}/home/home-3913191f-640.webp`,
      `${BLOB}/home/home-3913191f-640.webp`,
      `${BLOB}/home/home-3913191f-1024.webp`,
      `${BLOB}/home/home-3913191f-1024.webp`,
      `${BLOB}/home/home-3913191f-1600.webp`,
      `${BLOB}/home/home-3913191f-1600.webp`,
      `${BLOB}/home/home-3913191f-2400.webp`,
      `${BLOB}/home/home-3913191f-2400.webp`,
      `${BLOB}/home/home-3913191f-2400.webp`,
    ]);
  });

  it("never asks for a width larger than the photo was stored at", () => {
    const small = `${BLOB}/towns/troyes-1a2b3c4d-1600.webp`;
    expect(storedVariant(small, 1920)).toBe(small);
    expect(storedVariant(small, 1000)).toBe(`${BLOB}/towns/troyes-1a2b3c4d-1024.webp`);
  });

  it("leaves other images alone", () => {
    expect(storedVariant("/og-default.jpg", 640)).toBeUndefined();
    expect(storedVariant("https://example.com/photo-2400.webp", 640)).toBeUndefined();
    expect(storedVariant(`${BLOB}/../evil-2400.webp`, 640)).toBeUndefined();
  });
});

describe("blobImageLoader", () => {
  it("serves stored variants, local files as they are and anything else untouched", () => {
    expect(
      blobImageLoader({ src: `${BLOB}/regions/champagne-eea1d8f2-2400.webp`, width: 640 }),
    ).toBe(`${BLOB}/regions/champagne-eea1d8f2-640.webp`);
    expect(blobImageLoader({ src: "/styleguide/hero.jpg", width: 640 })).toBe(
      "/styleguide/hero.jpg?w=640",
    );
    expect(blobImageLoader({ src: "https://example.com/x.jpg", width: 640 })).toBe(
      "https://example.com/x.jpg",
    );
  });
});
