import { describe, expect, it } from "vitest";

import { storedVariant } from "@/lib/image-loader";

import { variantPath } from "../lib/images";
import { cardSlug, namedCard } from "./card-images";

describe("card-images", () => {
  it("makes Blob-safe names from row ids", () => {
    expect(cardSlug("viator-17408P6")).toBe("viator-17408p6");
    expect(cardSlug("booking-le-3-par-champagne-thienot")).toBe(
      "booking-le-3-par-champagne-thienot",
    );
    expect(cardSlug("gyg_95346 (old)")).toBe("gyg-95346-old");
  });

  it("stores card photos where the site's loader serves them", () => {
    const p = variantPath("Tours", cardSlug("viator-17408P6"), "https://x/a.jpg", 640, "webp");
    expect(p).toMatch(/^images\/tours\/viator-17408p6-[0-9a-f]{8}-640\.webp$/);
    const url = `https://abc123.public.blob.vercel-storage.com/${p}`;
    // A 720 px Viator photo is stored at 640 only; every request gets that file.
    expect(storedVariant(url, 1600)).toBe(url);
  });

  it("matches --only by id or Tab/id", () => {
    expect(namedCard(["viator-1"], "Tours", "viator-1")).toBe(true);
    expect(namedCard(["Hotels/booking-a"], "Hotels", "booking-a")).toBe(true);
    expect(namedCard(["Tours/booking-a"], "Hotels", "booking-a")).toBe(false);
    expect(namedCard(undefined, "Tours", "viator-1")).toBe(false);
  });
});
