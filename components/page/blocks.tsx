import Link from "next/link";
import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Hero } from "@/components/Hero";
import { LastUpdated } from "@/components/LastUpdated";
import { PracticalTable } from "@/components/PracticalTable";
import { ButtonLink } from "@/components/SmartLink";
import { MONTHS } from "@/lib/content";
import { formatEur } from "@/lib/format";
import type { Crumb } from "@/lib/schema";
import type { Estate, Hotel, Town } from "@/lib/sheet-schema";
import { townHref } from "@/lib/site";

export const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6";
export const cardsGrid = "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

/** Hero when the row has an image, a plain title block otherwise; then breadcrumbs. */
export function PageTop({
  eyebrow,
  title,
  standfirst,
  image,
  crumbs,
}: {
  eyebrow?: string;
  title: string;
  standfirst?: string;
  image?: { src: string; alt: string; credit?: string; license?: string; isAi?: boolean } | null;
  crumbs: Crumb[];
}) {
  return (
    <>
      {image?.src ? (
        <Hero image={image} eyebrow={eyebrow} title={title} standfirst={standfirst} />
      ) : (
        <div className="border-b border-accent/30 bg-surface">
          <div className={`${wrap} py-12 sm:py-16`}>
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-[0.2em] text-tag uppercase">{eyebrow}</p>
            ) : null}
            <h1 className="mt-2 max-w-3xl text-4xl leading-tight text-balance sm:text-5xl">
              {title}
            </h1>
            {standfirst ? <p className="mt-4 max-w-2xl text-lg text-muted">{standfirst}</p> : null}
          </div>
        </div>
      )}
      <div className={`${wrap} pt-6`}>
        <Breadcrumbs items={crumbs} />
      </div>
    </>
  );
}

export function Section({
  title,
  id,
  action,
  children,
}: {
  title: string;
  id?: string;
  action?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl">{title}</h2>
        {action ? (
          <Link
            href={action.href}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline dark:text-accent"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function PageBottom({ updated, children }: { updated?: string; children?: ReactNode }) {
  return (
    <div className={`${wrap} space-y-16 pb-20`}>
      <LastUpdated date={updated} />
      {children}
    </div>
  );
}

const VISITS: Record<NonNullable<Estate["visits"]>, string> = {
  "walk-in": "Walk-in",
  booking: "Book ahead",
  appointment: "By appointment",
};

export function EstatesTable({ estates, towns }: { estates: Estate[]; towns: Town[] }) {
  if (!estates.length) return null;
  const townName = new Map(towns.map((t) => [t.slug, t.name]));
  return (
    <div className="overflow-x-auto rounded-card border border-accent/40">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">Estates to visit</caption>
        <thead>
          <tr className="border-b border-accent/40 text-left">
            {["Estate", "Town", "Visits", "Tasting from", "Languages"].map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {estates.map((e) => (
            <tr key={e.id} className="odd:bg-surface">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                {e.website ? (
                  <a
                    href={e.website}
                    rel="noopener"
                    target="_blank"
                    className="underline underline-offset-2"
                  >
                    {e.name}
                  </a>
                ) : (
                  e.name
                )}
                {e.appellation ? (
                  <span className="block text-xs text-muted">{e.appellation}</span>
                ) : null}
              </th>
              <td className="px-4 py-2">
                <Link href={townHref(e.town_slug)} className="underline-offset-2 hover:underline">
                  {townName.get(e.town_slug) ?? e.town_slug}
                </Link>
              </td>
              <td className="px-4 py-2">{e.visits ? VISITS[e.visits] : "—"}</td>
              <td className="px-4 py-2">
                {e.tasting_fee_eur != null ? formatEur(e.tasting_fee_eur) : "—"}
              </td>
              <td className="px-4 py-2">{e.languages.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MonthTable({ name, best }: { name: string; best: Set<number> }) {
  if (!best.size) return null;
  return (
    <PracticalTable
      caption={`When to visit ${name}`}
      columns={["Month", "Visiting"]}
      rows={MONTHS.map((m, i) => [m, best.has(i) ? "Best time" : "Quieter"])}
    />
  );
}

export function StayByTownTable({ towns, hotels }: { towns: Town[]; hotels: Hotel[] }) {
  const rows = towns.flatMap((t) => {
    const here = hotels.filter((h) => h.town_slug === t.slug);
    if (!here.length) return [];
    const prices = here.flatMap((h) => (h.price_from_eur != null ? [h.price_from_eur] : []));
    const tiers = [...new Set(here.map((h) => h.tier))];
    return [
      { town: t, count: here.length, from: prices.length ? Math.min(...prices) : undefined, tiers },
    ];
  });
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-card border border-accent/40">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">Where to stay by town</caption>
        <thead>
          <tr className="border-b border-accent/40">
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              Town
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Hotels
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              From a night
            </th>
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              Tiers
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.town.slug} className="odd:bg-surface">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                <Link href={townHref(r.town.slug)} className="underline underline-offset-2">
                  {r.town.name}
                </Link>
              </th>
              <td className="px-4 py-2 text-right">{r.count}</td>
              <td className="px-4 py-2 text-right">{r.from != null ? formatEur(r.from) : "—"}</td>
              <td className="px-4 py-2">
                {r.tiers
                  .map((t) => ({ budget: "Budget", mid: "Mid-range", luxury: "Luxury" })[t])
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GettingThere({
  name,
  airport,
  tgv,
  station,
  moreHref,
}: {
  name: string;
  airport?: string;
  tgv?: string;
  station?: string;
  moreHref?: string;
}) {
  const items = [
    tgv ? { label: "By TGV from Paris", value: tgv } : null,
    station ? { label: "Nearest station", value: station } : null,
    airport ? { label: "Nearest airport", value: airport } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);
  if (!items.length) return null;
  return (
    <div className="rounded-card bg-surface p-6">
      <dl className="grid gap-4 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="text-xs font-semibold tracking-widest text-muted uppercase">
              {i.label}
            </dt>
            <dd className="mt-1 font-heading text-lg font-semibold">{i.value}</dd>
          </div>
        ))}
      </dl>
      {moreHref ? (
        <Link
          href={moreHref}
          className="mt-4 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline dark:text-accent"
        >
          Getting to {name}: the full guide
        </Link>
      ) : null}
    </div>
  );
}

export function StatCallouts({ stats }: { stats: { value: string; label: string }[] }) {
  if (!stats.length) return null;
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {stats.slice(0, 3).map((s) => (
        <div key={s.label} className="rounded-card border border-accent/50 px-5 py-6 text-center">
          <dt className="sr-only">{s.label}</dt>
          <dd>
            <span className="block font-heading text-4xl font-semibold text-primary tabular-nums dark:text-accent">
              {s.value}
            </span>
            <span className="mt-1 block text-sm text-muted" aria-hidden>
              {s.label}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CtaBand({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="rounded-card bg-cellar px-6 py-12 text-center text-chalk">
      <h2 className="text-3xl">{title}</h2>
      {text ? <p className="mx-auto mt-3 max-w-xl text-chalk/85">{text}</p> : null}
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href={primary.href}>{primary.label}</ButtonLink>
        {secondary ? (
          <Link
            href={secondary.href}
            className="inline-flex min-h-11 items-center justify-center rounded-button border border-chalk px-5 text-sm font-semibold hover:bg-chalk hover:text-cellar"
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Region links laid over the home hero. */
export function RegionPicker({
  regions,
}: {
  regions: { slug: string; name: string; href: string }[];
}) {
  if (!regions.length) return null;
  return (
    <nav aria-label="Choose a region" className={`${wrap} relative z-10 -mt-8`}>
      <ul className="flex flex-wrap gap-3 rounded-card bg-background p-4 sm:p-5">
        <li className="w-full text-sm font-semibold text-muted sm:w-auto sm:self-center sm:pr-2">
          Choose a region
        </li>
        {regions.map((r) => (
          <li key={r.slug}>
            <Link
              href={r.href}
              className="inline-flex min-h-11 items-center rounded-button border border-primary px-4 font-heading text-lg font-semibold text-primary hover:bg-primary hover:text-on-primary dark:border-accent dark:text-accent"
            >
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
