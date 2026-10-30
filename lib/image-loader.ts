/**
 * next/image loader. Hero and card photos are uploaded to Vercel Blob
 * already resized (`…-640.webp`, `-1024`, `-1600`, `-2400`; see
 * pipeline/media.ts), so the site serves the closest stored width directly
 * instead of asking Vercel's image optimizer to resize them. Other images
 * (local files) are served as they are.
 */

/** The widths every photo is stored at; next.config.ts deviceSizes match them. */
export const STORED_WIDTHS = [640, 1024, 1600, 2400] as const;

// images/<folder>/<name>-<width>.<ext>, as pipeline/lib/images.ts variantPath writes them:
// lowercase letters, digits and hyphens only, so no "..".
const STORED =
  /^(https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/images\/(?:[a-z0-9-]+\/)+[a-z0-9-]+?)-(\d+)\.(webp|avif)$/;

/**
 * The stored variant for a requested width: the smallest stored width that
 * covers it, never above the width in the URL (the largest one stored for
 * that photo, since uploads are never upscaled).
 */
export function storedVariant(src: string, width: number): string | undefined {
  const m = STORED.exec(src);
  if (!m) return undefined;
  const largest = Number(m[2]);
  const available = STORED_WIDTHS.filter((w) => w <= largest);
  if (!available.length) return src;
  const pick = available.find((w) => w >= width) ?? available[available.length - 1];
  return `${m[1]}-${pick}.${m[3]}`;
}

export default function blobImageLoader({ src, width }: { src: string; width: number }): string {
  // Local files keep their path; the width query only marks which size was asked for.
  return storedVariant(src, width) ?? (src.startsWith("/") ? `${src}?w=${width}` : src);
}
