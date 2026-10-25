import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // CLAUDE.md: trailing slashes on all URLs.
  trailingSlash: true,
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
