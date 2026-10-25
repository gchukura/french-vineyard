import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * JSON-LD builders. CLAUDE.md: every content page renders JSON-LD matching
 * its visible content, so builders take exactly what the page shows.
 */

type Node = Record<string, unknown>;

export type FaqItem = { question: string; answer: string };
export type Crumb = { name: string; href: string };

const CONTEXT = "https://schema.org";
const PUBLISHER_ID = `${SITE_URL}/#organization`;

/** Drops undefined and empty-array values so nodes only claim what we know. */
function clean<T extends Node>(node: T): T {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;
}

const geo = (lat?: number, lng?: number) =>
  lat != null && lng != null
    ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng }
    : undefined;

const image = (src?: string) => (src ? absoluteUrl(src) : undefined);

/** Several nodes in one script. */
export function graph(...nodes: (Node | undefined)[]) {
  return {
    "@graph": nodes.filter(Boolean).map((n) => {
      const { "@context": _ctx, ...rest } = n as Node;
      void _ctx;
      return rest;
    }),
  };
}

export function organization(): Node {
  return { "@type": "Organization", "@id": PUBLISHER_ID, name: SITE_NAME, url: `${SITE_URL}/` };
}

export function webSite(): Node {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: "en",
    publisher: { "@id": PUBLISHER_ID },
  };
}

export function faqPage(items: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function breadcrumbList(items: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export type PlaceInput = {
  name: string;
  href: string;
  description?: string;
  image?: string;
  lat?: number;
  lng?: number;
};

export function place(p: PlaceInput, type = "Place", extra: Node = {}): Node {
  return clean({
    "@type": type,
    "@id": `${absoluteUrl(p.href)}#place`,
    name: p.name,
    url: absoluteUrl(p.href),
    description: p.description,
    image: image(p.image),
    geo: geo(p.lat, p.lng),
    ...extra,
  });
}

/** A wine region: TouristDestination containing the towns shown on its page. */
export function touristDestination(region: PlaceInput, places: PlaceInput[]): Node {
  return place(region, "TouristDestination", {
    containsPlace: places.map((p) => place(p)),
  });
}

/** A place inside a region (town or appellation area). */
export function placeIn(
  p: PlaceInput,
  parent: { name: string; href: string },
  type = "Place",
): Node {
  return place(p, type, {
    containedInPlace: {
      "@type": "TouristDestination",
      name: parent.name,
      url: absoluteUrl(parent.href),
    },
  });
}

export type ListEntry = { name: string; href?: string; node?: Node };

export function itemList(name: string, entries: ListEntry[], itemType?: string): Node {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) =>
      clean({
        "@type": "ListItem",
        position: i + 1,
        url: e.href ? absoluteUrl(e.href) : undefined,
        item: e.node ?? (itemType ? clean({ "@type": itemType, name: e.name }) : undefined),
        name: e.node || itemType ? undefined : e.name,
      }),
    ),
  };
}

export type HotelInput = {
  name: string;
  lat?: number;
  lng?: number;
  image?: string;
  priceFromEur?: number;
  description?: string;
  town?: string;
};

export function hotel(h: HotelInput): Node {
  return clean({
    "@type": "Hotel",
    name: h.name,
    description: h.description,
    image: image(h.image),
    geo: geo(h.lat, h.lng),
    priceRange: h.priceFromEur != null ? `From €${h.priceFromEur}` : undefined,
    address: h.town
      ? { "@type": "PostalAddress", addressLocality: h.town, addressCountry: "FR" }
      : undefined,
  });
}

export type ArticleInput = {
  type?: string;
  title: string;
  description?: string;
  href: string;
  image?: string;
  publishedAt?: string;
  updatedAt?: string;
};

export function article(a: ArticleInput): Node {
  return clean({
    "@type": a.type || "Article",
    "@id": `${absoluteUrl(a.href)}#article`,
    headline: a.title,
    description: a.description,
    url: absoluteUrl(a.href),
    mainEntityOfPage: absoluteUrl(a.href),
    image: image(a.image),
    datePublished: a.publishedAt,
    dateModified: a.updatedAt ?? a.publishedAt,
    inLanguage: "en",
    author: { "@id": PUBLISHER_ID },
    publisher: organization(),
  });
}

export function touristTrip(a: ArticleInput, days: string[]): Node {
  return clean({
    "@type": "TouristTrip",
    name: a.title,
    description: a.description,
    url: absoluteUrl(a.href),
    itinerary: {
      "@type": "ItemList",
      numberOfItems: days.length,
      itemListElement: days.map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "TouristAttraction", name: d },
      })),
    },
  });
}

export function howTo(a: ArticleInput, steps: string[]): Node {
  return clean({
    "@type": "HowTo",
    name: a.title,
    description: a.description,
    url: absoluteUrl(a.href),
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s })),
  });
}

/** For index pages: a CollectionPage listing what it links to. */
export function collectionPage(name: string, href: string, entries: ListEntry[]): Node {
  return {
    "@type": "CollectionPage",
    name,
    url: absoluteUrl(href),
    mainEntity: itemList(name, entries),
  };
}

/**
 * Serialises JSON-LD for a <script> tag. Escapes "<" so content such as
 * "</script>" in an answer cannot close the tag early.
 */
export function serializeJsonLd(data: Node): string {
  return JSON.stringify({ "@context": CONTEXT, ...data }).replace(/</g, "\\u003c");
}
