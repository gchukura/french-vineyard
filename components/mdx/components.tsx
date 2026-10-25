import type { ReactNode } from "react";

import { HotelCard } from "@/components/HotelCard";
import { PracticalTable } from "@/components/PracticalTable";
import { SmartLink } from "@/components/SmartLink";
import { TourCard } from "@/components/TourCard";
import { pickByIds } from "@/lib/content";
import { getHotels, getTours } from "@/lib/sheets";

const ids = (s?: string) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const cardGrid = "not-prose my-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

/** Tours named in the MDX, from the owner's Tours tab, in the order written. */
async function TourCards({ ids: list }: { ids?: string }) {
  const tours = pickByIds(await getTours(), ids(list));
  if (!tours.length) return null;
  return (
    <div className={cardGrid}>
      {tours.map((t) => (
        <TourCard key={t.id} tour={t} slot="mdx" />
      ))}
    </div>
  );
}

async function HotelCards({ ids: list }: { ids?: string }) {
  const hotels = pickByIds(await getHotels(), ids(list));
  if (!hotels.length) return null;
  return (
    <div className={cardGrid}>
      {hotels.map((h) => (
        <HotelCard key={h.id} hotel={h} slot="mdx" />
      ))}
    </div>
  );
}

/** rows="a|b; c|d" — rows split on ";" (or newlines), cells on "|". */
function MdxPracticalTable({
  caption = "",
  columns = "",
  rows = "",
  numeric = "",
}: {
  caption?: string;
  columns?: string;
  rows?: string;
  numeric?: string;
}) {
  const cols = columns.split("|").map((c) => c.trim());
  const body = rows
    .split(/;|\n/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.split("|").map((c) => c.trim()));
  const nums = numeric
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n));
  return (
    <div className="not-prose my-8">
      <PracticalTable caption={caption} columns={cols} rows={body} numeric={nums} />
    </div>
  );
}

function Callout({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <aside className="not-prose my-8 rounded-card border-l-4 border-accent bg-surface px-5 py-4">
      {title ? <p className="font-heading text-lg font-semibold">{title}</p> : null}
      <div className="prose-fv text-sm [&>*:first-child]:mt-0">{children}</div>
    </aside>
  );
}

function MethodologyBox({
  title = "How we chose",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <aside className="not-prose my-8 rounded-card border border-accent/50 px-5 py-4">
      <p className="text-xs font-semibold tracking-widest text-tag uppercase">{title}</p>
      <div className="prose-fv mt-2 text-sm [&>*:first-child]:mt-0">{children}</div>
    </aside>
  );
}

/** Markdown links: internal ones through next/link, /go/ with rel=sponsored, external with noopener. */
function A({ href = "", children }: { href?: string; children?: ReactNode }) {
  if (href.startsWith("/")) return <SmartLink href={href}>{children}</SmartLink>;
  return (
    <a href={href} rel="noopener" target="_blank">
      {children}
    </a>
  );
}

export const mdxComponents = {
  TourCards,
  HotelCards,
  PracticalTable: MdxPracticalTable,
  Callout,
  MethodologyBox,
  a: A,
};
