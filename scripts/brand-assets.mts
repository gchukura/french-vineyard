/**
 * Regenerates the favicon, app icons and default Open Graph image from the
 * brand SVGs in public/brand/. Run after changing any of them:
 * `npm run brand`. Runs on Node's built-in TypeScript support, so imports
 * are relative.
 *
 *   app/icon.svg              copy of icon.svg (modern browsers)
 *   app/favicon.ico           16 px (from icon-16.svg) + 32 px (from icon.svg)
 *   app/apple-icon.png        180 px, square bordeaux corners (iOS rounds them)
 *   public/brand/icon-*.png   192 px and 512 px for app/manifest.ts
 *   public/og-default.jpg     scripts/brand/og-background.jpg + badge.svg
 */
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { encodeIco } from "../lib/ico.mts";

const root = process.cwd();
const brand = (name: string) => join(root, "public", "brand", name);

const BORDEAUX = "#6B1E2B";

/** Rasterise at 4x then downsample, so small sizes stay crisp. */
async function png(svgFile: string, size: number, background?: string): Promise<Buffer> {
  const svg = await readFile(svgFile);
  const { width = size } = await sharp(svg).metadata();
  let img = sharp(svg, { density: (72 * size * 4) / width }).resize(size, size);
  if (background) img = img.flatten({ background });
  return img.png().toBuffer();
}

async function main() {
  await copyFile(brand("icon.svg"), join(root, "app", "icon.svg"));

  const ico = encodeIco([
    { size: 16, png: await png(brand("icon-16.svg"), 16) },
    { size: 32, png: await png(brand("icon.svg"), 32) },
  ]);
  await writeFile(join(root, "app", "favicon.ico"), ico);

  await writeFile(join(root, "app", "apple-icon.png"), await png(brand("icon.svg"), 180, BORDEAUX));
  for (const size of [192, 512]) {
    await writeFile(brand(`icon-${size}.png`), await png(brand("icon.svg"), size));
  }

  // Centred in the open sky above the hills, so centre-square crops keep it.
  const BADGE = 220;
  await sharp(join(root, "scripts", "brand", "og-background.jpg"))
    .composite([{ input: await png(brand("badge.svg"), BADGE), left: (1200 - BADGE) / 2, top: 22 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(root, "public", "og-default.jpg"));

  console.log("Brand assets written.");
}

await main();
