import Link from "next/link";

import { ButtonLink } from "@/components/SmartLink";
import { RegionsMenu, type MenuRegion } from "@/components/header/RegionsMenu";
import { goHref } from "@/lib/links";
import { NAV, REGIONS_INDEX_HREF, SITE_NAME, regionHref } from "@/lib/site";

export function Wordmark() {
  return (
    <Link href="/" className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
      French<span className="text-primary dark:text-accent">Vineyard</span>
      <span className="sr-only"> — {SITE_NAME} home</span>
    </Link>
  );
}

/** Presentational header; `Header` feeds it published regions from the Sheet. */
export function SiteHeader({
  regions,
  sticky = true,
}: {
  regions: MenuRegion[];
  sticky?: boolean;
}) {
  return (
    <header
      className={`${sticky ? "sticky top-0 z-40" : "relative z-30"} border-b border-accent/30 bg-background/92 backdrop-blur-sm`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Wordmark />

        <nav aria-label="Main" className="ml-auto hidden items-center lg:flex">
          <RegionsMenu regions={regions} />
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium hover:text-primary dark:hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ButtonLink href={goHref("gyg", "home")} size="compact" className="ml-auto lg:ml-2">
          Book a Tour
        </ButtonLink>

        <details className="group lg:hidden">
          <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-button [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Menu</span>
            <svg aria-hidden viewBox="0 0 24 24" className="size-6">
              <path
                className="group-open:hidden"
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                className="hidden group-open:block"
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.75"
              />
            </svg>
          </summary>
          <nav
            aria-label="Main"
            className="absolute inset-x-0 top-full max-h-[calc(100svh-4rem)] overflow-y-auto border-y border-accent/40 bg-background px-4 py-4"
          >
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">
              Wine Regions
            </p>
            <ul className="mt-2 mb-4">
              {regions.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={regionHref(r.slug)}
                    className="flex min-h-11 items-center font-heading text-lg"
                  >
                    {r.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={REGIONS_INDEX_HREF}
                  className="flex min-h-11 items-center text-sm font-semibold text-primary dark:text-accent"
                >
                  All wine regions
                </Link>
              </li>
            </ul>
            <ul className="border-t border-accent/30 pt-2">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="flex min-h-11 items-center">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
