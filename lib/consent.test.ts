import { describe, expect, it } from "vitest";

import {
  CONSENT_BOOT_SCRIPT,
  CONSENT_MAX_AGE,
  clearConsentCookie,
  consentCookie,
  readConsent,
} from "@/lib/consent";

describe("readConsent", () => {
  it("reads a stored choice among other cookies", () => {
    expect(readConsent("a=1; fv_consent=accepted; b=2")).toBe("accepted");
    expect(readConsent("fv_consent=refused")).toBe("refused");
  });

  it("treats missing or unknown values as unset", () => {
    expect(readConsent("")).toBe("unset");
    expect(readConsent("fv_consent=maybe")).toBe("unset");
    expect(readConsent("xfv_consent=accepted")).toBe("unset");
  });
});

describe("consentCookie", () => {
  it("lasts about six months", () => {
    const days = CONSENT_MAX_AGE / 86400;
    expect(days).toBeGreaterThanOrEqual(180);
    expect(days).toBeLessThanOrEqual(184);
    expect(consentCookie("accepted")).toBe(
      `fv_consent=accepted; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax; Secure`,
    );
  });

  it("can drop Secure for http://localhost", () => {
    expect(consentCookie("refused", { secure: false })).not.toContain("Secure");
  });

  it("clears with Max-Age=0", () => {
    expect(clearConsentCookie()).toContain("Max-Age=0");
  });
});

describe("CONSENT_BOOT_SCRIPT", () => {
  it("marks <html> only for a valid stored choice", () => {
    const run = (cookie: string) => {
      const documentElement = { dataset: {} as Record<string, string> };
      new Function("document", CONSENT_BOOT_SCRIPT)({ cookie, documentElement });
      return documentElement.dataset.consent;
    };
    expect(run("fv_consent=accepted")).toBe("accepted");
    expect(run("x=1; fv_consent=refused")).toBe("refused");
    expect(run("fv_consent=maybe")).toBeUndefined();
    expect(run("")).toBeUndefined();
  });
});
