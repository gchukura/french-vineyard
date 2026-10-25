import { formatCount } from "@/lib/format";

export function Rating({ rating, count }: { rating: number; count?: number }) {
  const label = `Rated ${rating.toFixed(1)} out of 5${count ? ` from ${formatCount(count)} reviews` : ""}`;
  return (
    <p className="flex items-center gap-1.5 text-sm" aria-label={label} role="img">
      <span
        aria-hidden
        className="relative inline-block leading-none tracking-tight text-accent/35"
      >
        ★★★★★
        <span
          className="absolute inset-0 overflow-hidden text-accent"
          style={{ width: `${Math.max(0, Math.min(5, rating)) * 20}%` }}
        >
          ★★★★★
        </span>
      </span>
      <span aria-hidden className="font-semibold tabular-nums">
        {rating.toFixed(1)}
      </span>
      {count ? (
        <span aria-hidden className="text-muted tabular-nums">
          ({formatCount(count)})
        </span>
      ) : null}
    </p>
  );
}
