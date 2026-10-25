import { describe, expect, it } from "vitest";

import { breadcrumbJsonLd, faqPageJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";

describe("faqPageJsonLd", () => {
  it("maps each item to a Question with an accepted Answer", () => {
    const ld = faqPageJsonLd([{ question: "Do I need to book?", answer: "Yes, most houses." }]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toEqual([
      {
        "@type": "Question",
        name: "Do I need to book?",
        acceptedAnswer: { "@type": "Answer", text: "Yes, most houses." },
      },
    ]);
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers items from 1 and makes URLs absolute", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Champagne", href: "/champagne/" },
    ]);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Champagne", item: `${SITE_URL}/champagne/` },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script tag early", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script>" });
  });
});
