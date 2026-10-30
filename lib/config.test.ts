import { describe, expect, it } from "vitest";

import { liveLegalLinks, toConfig } from "@/lib/config";
import { LEGAL_LINKS } from "@/lib/site";

// Draft Config rows never reach the site (parseTab drops them), so a key is
// either here with its published copy or missing.
const config = toConfig([
  { key: "about_mdx", value: "We are a small team.", status: "published" },
  { key: "contact_mdx", value: "", status: "published" },
]);

describe("liveLegalLinks", () => {
  it("keeps pages whose copy is published, and pages with no Config row behind them", () => {
    expect(liveLegalLinks(LEGAL_LINKS, config).map((l) => l.href)).toEqual([
      "/about/",
      "/image-credits/",
    ]);
  });

  it("drops every Config-backed page when none is published", () => {
    expect(liveLegalLinks(LEGAL_LINKS, toConfig([])).map((l) => l.href)).toEqual([
      "/image-credits/",
    ]);
  });
});
