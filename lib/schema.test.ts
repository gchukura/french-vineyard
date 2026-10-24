import { describe, expect, it } from "vitest";

import {
  article,
  breadcrumbList,
  collectionPage,
  faqPage,
  graph,
  hotel,
  howTo,
  itemList,
  placeIn,
  serializeJsonLd,
  touristDestination,
  touristTrip,
} from "@/lib/schema";
import { SITE_URL } from "@/lib/site";

describe("faqPage", () => {
  it("maps each item to a Question with an accepted Answer", () => {
    expect(faqPage([{ question: "Do I need to book?", answer: "Yes." }]).mainEntity).toEqual([
      {
        "@type": "Question",
        name: "Do I need to book?",
        acceptedAnswer: { "@type": "Answer", text: "Yes." },
      },
    ]);
  });
});

describe("breadcrumbList", () => {
  it("numbers items from 1 and makes URLs absolute", () => {
    expect(
      breadcrumbList([
        { name: "Home", href: "/" },
        { name: "Champagne", href: "/regions/champagne/" },
      ]).itemListElement,
    ).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Champagne",
        item: `${SITE_URL}/regions/champagne/`,
      },
    ]);
  });
});

describe("touristDestination", () => {
  it("contains the towns as Places with geo, omitting unknown fields", () => {
    const node = touristDestination(
      { name: "Champagne", href: "/regions/champagne/", lat: 49, lng: 4 },
      [{ name: "Reims", href: "/towns/reims/" }],
    );
    expect(node).toMatchObject({
      "@type": "TouristDestination",
      name: "Champagne",
      url: `${SITE_URL}/regions/champagne/`,
      geo: { "@type": "GeoCoordinates", latitude: 49, longitude: 4 },
      containsPlace: [{ "@type": "Place", name: "Reims" }],
    });
    expect(node).not.toHaveProperty("description");
    expect(node.containsPlace).toEqual([expect.not.objectContaining({ geo: expect.anything() })]);
  });

  it("places a town inside its region", () => {
    expect(
      placeIn(
        { name: "Reims", href: "/towns/reims/" },
        { name: "Champagne", href: "/regions/champagne/" },
      ),
    ).toMatchObject({
      containedInPlace: { "@type": "TouristDestination", name: "Champagne" },
    });
  });
});

describe("article-type nodes", () => {
  const a = { title: "Best houses", href: "/best-houses/", publishedAt: "2026-10-01" };

  it("builds an Article with dateModified falling back to datePublished", () => {
    expect(article(a)).toMatchObject({
      "@type": "Article",
      headline: "Best houses",
      datePublished: "2026-10-01",
      dateModified: "2026-10-01",
    });
    expect(article({ ...a, type: "TravelGuide" })["@type"]).toBe("TravelGuide");
  });

  it("builds ItemLists of attractions or hotels", () => {
    const attractions = itemList("Best houses", [{ name: "Ruinart" }], "TouristAttraction");
    expect(attractions.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, item: { "@type": "TouristAttraction", name: "Ruinart" } },
    ]);
    const hotels = itemList("Stay", [
      { name: "H", node: hotel({ name: "H", priceFromEur: 120, town: "Reims" }) },
    ]);
    expect(hotels.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Hotel",
          name: "H",
          priceRange: "From €120",
          address: { "@type": "PostalAddress", addressLocality: "Reims", addressCountry: "FR" },
        },
      },
    ]);
  });

  it("builds TouristTrip days and HowTo steps", () => {
    expect(touristTrip(a, ["Day 1", "Day 2"])).toMatchObject({
      "@type": "TouristTrip",
      itinerary: { numberOfItems: 2 },
    });
    expect(howTo(a, ["Book", "Go"]).step).toEqual([
      { "@type": "HowToStep", position: 1, name: "Book" },
      { "@type": "HowToStep", position: 2, name: "Go" },
    ]);
  });

  it("builds a CollectionPage", () => {
    expect(collectionPage("Tours", "/tours/", [{ name: "A", href: "/a/" }])).toMatchObject({
      "@type": "CollectionPage",
      mainEntity: { "@type": "ItemList", numberOfItems: 1 },
    });
  });
});

describe("serializeJsonLd", () => {
  it("adds @context once and cannot close the script tag early", () => {
    const out = serializeJsonLd(
      graph({ "@type": "Thing", name: "</script><script>alert(1)</script>" }),
    );
    expect(out).not.toContain("<");
    const parsed = JSON.parse(out);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"][0]).toEqual({
      "@type": "Thing",
      name: "</script><script>alert(1)</script>",
    });
  });
});
