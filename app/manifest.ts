import type { MetadataRoute } from "next";

import { SITE_NAME } from "@/lib/site";

// Icons are generated from public/brand/icon.svg by `npm run brand`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "FrenchVineyard",
    description: "An English-language travel guide to the wine regions of France.",
    start_url: "/",
    display: "standalone",
    theme_color: "#6B1E2B",
    background_color: "#F7F3EC",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
