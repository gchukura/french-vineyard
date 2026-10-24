"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { MapPin } from "@/components/map/MapCanvas";

export type { MapPin };

// maplibre-gl (and its CSS) is only fetched once the map nears the viewport.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <figure>
      <div
        ref={box}
        role="region"
        aria-label={label}
        className={`relative overflow-hidden rounded-card bg-surface ${className}`}
      >
        {visible ? (
          <MapCanvas pins={pins} />
        ) : (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">
            Loading map…
          </p>
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
