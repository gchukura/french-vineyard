"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  LngLatBounds,
  Map as MapLibre,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import { useEffect, useRef } from "react";

import { mutedMapStyle } from "@/lib/map-style";

// MapLibre v6 loads its tile worker from a file next to its own bundle,
// which the bundler doesn't emit. Point it at the worker as a bundled asset.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href?: string;
  description?: string;
};

const VINE = "#5b6b3a";

/** Escapes text for the popup's HTML. */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export default function MapCanvas({ pins }: { pins: MapPin[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = el.current;
    if (!container || !pins.length) return;
    const theme =
      container.closest("[data-theme]")?.getAttribute("data-theme") === "dark" ? "dark" : "light";

    const bounds = new LngLatBounds();
    pins.forEach((p) => bounds.extend([p.lng, p.lat]));

    const map = new MapLibre({
      container,
      style: mutedMapStyle(theme),
      bounds,
      fitBoundsOptions: { padding: 48, maxZoom: 14 },
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    for (const p of pins) {
      const html = p.href
        ? `<a href="${esc(p.href)}" class="font-semibold underline">${esc(p.name)}</a>`
        : `<strong>${esc(p.name)}</strong>`;
      const popup = new Popup({ offset: 24, closeButton: false }).setHTML(
        `${html}${p.description ? `<p>${esc(p.description)}</p>` : ""}`,
      );
      const marker = new Marker({ color: VINE })
        .setLngLat([p.lng, p.lat])
        .setPopup(popup)
        .addTo(map);
      marker.getElement().setAttribute("aria-label", p.name);
    }

    return () => map.remove();
  }, [pins]);

  // size-full, not absolute: maplibre-gl.css forces position: relative on the container.
  return <div ref={el} className="size-full" />;
}
