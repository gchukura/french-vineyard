import Image from "next/image";
import Link from "next/link";

/** Up to this size the simplified badge reads better; above it, the full one. */
const SMALL_BADGE_MAX = 40;

/**
 * Badge + "FrenchVineyard" lockup, linking home. `reversed` is for dark
 * backgrounds: the chalk badge, chalk text and the tagline underneath.
 */
export function Logo({
  size = SMALL_BADGE_MAX,
  reversed = false,
  className = "",
}: {
  size?: number;
  reversed?: boolean;
  className?: string;
}) {
  const src = reversed
    ? "/brand/badge-reversed.svg"
    : size <= SMALL_BADGE_MAX
      ? "/brand/badge-small.svg"
      : "/brand/badge.svg";
  return (
    <Link
      href="/"
      aria-label="FrenchVineyard home"
      className={`inline-flex min-h-11 items-center gap-2.5 ${className}`}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        loading="eager"
        className="shrink-0"
      />
      <span className="flex flex-col">
        {/* Beside the header's Book and menu buttons the name only fits from
            440 px; narrower phones get the badge alone (the link label stays). */}
        <span
          className={`font-heading text-2xl leading-none font-semibold tracking-tight ${reversed ? "text-chalk" : "max-[439px]:sr-only"}`}
        >
          FrenchVineyard
        </span>
        {reversed ? (
          <span className="mt-1.5 text-sm leading-none tracking-wide text-chalk/75 [font-variant-caps:small-caps]">
            guide to the wine regions
          </span>
        ) : null}
      </span>
    </Link>
  );
}
