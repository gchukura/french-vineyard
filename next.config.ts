import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // CLAUDE.md: trailing slashes on all URLs.
  trailingSlash: true,
  partialPrefetching: true,
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
