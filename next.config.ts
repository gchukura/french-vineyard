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
    // Photos are stored on Vercel Blob already resized to these four widths
    // (pipeline/media.ts), so lib/image-loader.ts points srcsets straight at
    // them and Vercel's image optimizer isn't used. CLAUDE.md: four fixed
    // widths only; no imageSizes, so thumbnails draw from these four too.
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
    deviceSizes: [640, 1024, 1600, 2400],
    imageSizes: [],
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
