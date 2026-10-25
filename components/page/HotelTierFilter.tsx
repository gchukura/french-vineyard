"use client";

import { useState } from "react";

import { HotelCard, type HotelCardHotel } from "@/components/HotelCard";

const TIERS = [
  { id: "all", label: "All" },
  { id: "budget", label: "Budget" },
  { id: "mid", label: "Mid-range" },
  { id: "luxury", label: "Luxury" },
] as const;

type TierId = (typeof TIERS)[number]["id"];

/** Hotel roundup grid with a tier filter. The server HTML lists every hotel. */
export function HotelTierFilter({ hotels }: { hotels: HotelCardHotel[] }) {
  const [tier, setTier] = useState<TierId>("all");
  const present = TIERS.filter((t) => t.id === "all" || hotels.some((h) => h.tier === t.id));
  const visible = tier === "all" ? hotels : hotels.filter((h) => h.tier === tier);
  return (
    <div>
      {present.length > 2 ? (
        <div role="group" aria-label="Filter by tier" className="flex flex-wrap gap-2">
          {present.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tier === t.id}
              onClick={() => setTier(t.id)}
              className="min-h-11 rounded-button border border-tag px-4 text-sm aria-pressed:bg-tag aria-pressed:text-chalk"
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((h) => (
          <HotelCard key={h.id} hotel={h} slot="roundup" />
        ))}
      </div>
    </div>
  );
}
