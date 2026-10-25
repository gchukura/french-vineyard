import Image from "next/image";

export type ImageData = { src: string; alt: string };

/** Common `sizes` hints. next.config.ts limits output to four widths. */
export const SIZES = {
  full: "100vw",
  card: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  half: "(min-width: 768px) 50vw, 100vw",
  thumb: "96px",
} as const;

/**
 * next/image filling a fixed-ratio box, or a parchment placeholder when the
 * Sheet row has no image yet.
 */
export function Picture({
  image,
  ratio,
  sizes,
  preload = false,
  className = "",
}: {
  image?: ImageData | null;
  ratio: string;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-surface ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {image?.src ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          preload={preload}
          className="object-cover"
        />
      ) : null}
    </div>
  );
}
