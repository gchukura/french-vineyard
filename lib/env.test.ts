import { describe, expect, it } from "vitest";

import { normalizePrivateKey, safeEqual } from "@/lib/env";

describe("normalizePrivateKey", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";

  it("turns escaped newlines into real ones", () => {
    expect(normalizePrivateKey(pem.replace(/\n/g, "\\n"))).toBe(pem);
  });

  it("strips wrapping quotes", () => {
    expect(normalizePrivateKey(`"${pem.replace(/\n/g, "\\n")}"`)).toContain("abc\n-----END");
  });

  it("leaves a real PEM alone", () => {
    expect(normalizePrivateKey(pem)).toBe(pem.trim());
  });
});

describe("safeEqual", () => {
  it("compares strings", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret-longer")).toBe(false);
  });
});
