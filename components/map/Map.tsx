"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { MapPin } from "@/components/map/MapCanvas";

export type { MapPin };

// maplibre-gl (and its CSS) is only fetched once the map is wanted.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

const INTERACTIONS = ["scroll", "pointerdown", "keydown", "touchstart", "wheel"] as const;

/**
 * Lazy map: loads when it is near the viewport *and* the visitor has
 * interacted with the page (or pressed "Show map"). A map in the first
 * screen therefore never weighs on the initial load.
 */
export function Map({
  pins,
  label,
  className = "aspect-[4/3] sm:aspect-[16/9]",
}: {
  pins: MapPin[];
  /** Accessible name, e.g. "Map of Champagne towns". */
  label: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const show = near && engaged;

  useEffect(() => {
    const el = box.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      {
        rootMargin: "300px",
      },
    );
    io.observe(el);
    const engage = () => setEngaged(true);
    for (const type of INTERACTIONS)
      window.addEventListener(type, engage, { once: true, passive: true });
    return () => {
      io.disconnect();
      for (const type of INTERACTIONS) window.removeEventListener(type, engage);
    };
  }, [show]);

  return (
    <figure>
      <div
        ref={box}
        role="region"
        aria-label={label}
        className={`relative overflow-hidden rounded-card bg-surface ${className}`}
      >
        {show ? (
          <MapCanvas pins={pins} />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <button
              type="button"
              onClick={() => {
                setNear(true);
                setEngaged(true);
              }}
              className="min-h-11 rounded-button border border-tag px-4 text-sm font-semibold text-tag hover:bg-tag hover:text-chalk"
            >
              Show map
            </button>
          </div>
        )}
      </div>
      {/* The places as text, for screen readers and anyone without WebGL. */}
      <figcaption className="sr-only">
        <ul>
          {pins.map((p) => (
            <li key={p.id}>
              {p.href ? <a href={p.href}>{p.name}</a> : p.name}
              {p.description ? `: ${p.description}` : null}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
