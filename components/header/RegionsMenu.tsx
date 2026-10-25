"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Picture, SIZES } from "@/components/Picture";
import { REGIONS_INDEX_HREF, regionHref } from "@/lib/site";

export type MenuRegion = {
  slug: string;
  name: string;
  tagline?: string;
  image?: { src: string; alt: string } | null;
};

/** "Wine Regions" mega-menu. Closes on Escape, outside click and navigation. */
export function RegionsMenu({ regions }: { regions: MenuRegion[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1 px-3 text-sm font-medium hover:text-primary dark:hover:text-accent"
      >
        Wine Regions
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-t border-accent/40 bg-background shadow-none"
      >
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {regions.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {regions.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={regionHref(r.slug)}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-4 rounded-card border border-transparent bg-surface p-3 transition-colors hover:border-accent"
                  >
                    <Picture
                      image={r.image}
                      ratio="4 / 3"
                      sizes={SIZES.thumb}
                      className="w-24 shrink-0 rounded-button"
                    />
                    <span>
                      <span className="block font-heading text-lg font-semibold">{r.name}</span>
                      {r.tagline ? (
                        <span className="block text-sm text-muted">{r.tagline}</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Region guides are on their way.</p>
          )}
          <Link
            href={REGIONS_INDEX_HREF}
            onClick={() => setOpen(false)}
            className="mt-4 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline dark:text-accent"
          >
            All wine regions
          </Link>
        </div>
      </div>
    </div>
  );
}
