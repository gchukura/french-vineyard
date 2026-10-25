"use client";

import { useState } from "react";

import { TourCard, type TourCardTour } from "@/components/TourCard";
import {
  DURATION_BUCKETS,
  PRICE_BUCKETS,
  durationBucket,
  priceBucket,
  type DurationBucket,
  type PriceBucket,
} from "@/lib/content";

export type BrowserTour = TourCardTour & { category?: string };

function Filter<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { id: T; label: string }[];
  value: T | "all";
  onChange: (v: T | "all") => void;
}) {
  const all = [{ id: "all" as const, label: "Any" }, ...options];
  return (
    <fieldset>
      <legend className="text-xs font-semibold tracking-widest text-muted uppercase">
        {legend}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {all.map((o) => (
          <label
            key={o.id}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-button border border-tag px-3 text-sm has-checked:bg-tag has-checked:text-chalk has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              name={legend}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id as T | "all")}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The owner's published tours, grouped by category in rank order. Filters
 * only hide cards; the server HTML lists every tour.
 */
export function ToursBrowser({ tours }: { tours: BrowserTour[] }) {
  const [duration, setDuration] = useState<DurationBucket | "all">("all");
  const [price, setPrice] = useState<PriceBucket | "all">("all");

  const visible = tours.filter(
    (t) =>
      (duration === "all" || durationBucket(t.duration) === duration) &&
      (price === "all" || priceBucket(t.price_from_eur) === price),
  );
  const groups = new Map<string, BrowserTour[]>();
  for (const t of visible) {
    const key = t.category || "Other tours";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <div>
      <div className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:flex-row sm:gap-10">
        <Filter
          legend="Duration"
          options={DURATION_BUCKETS}
          value={duration}
          onChange={setDuration}
        />
        <Filter legend="Price" options={PRICE_BUCKETS} value={price} onChange={setPrice} />
      </div>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        Showing {visible.length} of {tours.length} tours
      </p>
      <div className="mt-8 space-y-14">
        {[...groups].map(([category, list]) => (
          <section key={category}>
            <h2 className="text-2xl">{category}</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <TourCard key={t.id} tour={t} slot="tours-index" />
              ))}
            </div>
          </section>
        ))}
        {!visible.length ? <p>No tours match those filters.</p> : null}
      </div>
    </div>
  );
}
