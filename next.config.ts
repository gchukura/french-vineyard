import type { NextConfig } from "next";

import { isNoindex } from "./lib/noindex";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // CLAUDE.md: trailing slashes on all URLs.
  trailingSlash: true,
  // Pre-launch: keep every page out of search results (SITE_NOINDEX, docs/DOMAIN.md).
  async headers() {
    if (!isNoindex(process.env.SITE_NOINDEX)) return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  partialPrefetching: true,
  experimental: {
    // Tailwind output is small and most visitors arrive fresh from search,
    // so inline it rather than make it a render-blocking request (Lighthouse).
    inlineCss: true,
  },
  images: {
    // CLAUDE.md: four fixed widths only. No imageSizes, so every srcset
    // (thumbnails included) is drawn from these four.
    deviceSizes: [640, 960, 1280, 1920],
    imageSizes: [],
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
