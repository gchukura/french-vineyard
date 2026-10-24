import type { Metadata } from "next";

import { DEFAULT_OG_IMAGE, SITE_NAME } from "@/lib/site";

export type PageMeta = {
  title: string;
  description?: string;
  /** Site path with trailing slash, e.g. "/regions/champagne/". */
  path: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
};

/** Title, description, trailing-slash canonical and Open Graph image for a page. */
export function pageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
  noindex,
}: PageMeta): Metadata {
  if (!path.endsWith("/")) throw new Error(`Canonical path needs a trailing slash: ${path}`);
  const images = [{ url: image || DEFAULT_OG_IMAGE, width: 1200, height: 630 }];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type,
      images,
      locale: "en_GB",
    },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
