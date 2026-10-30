import Link from "next/link";

import { Logo } from "@/components/Logo";
import { ConsentSettingsButton } from "@/components/consent/ConsentSettingsButton";
import { LEGAL_LINKS, NAV, REGIONS_INDEX_HREF, regionHref } from "@/lib/site";

const ABOUT = LEGAL_LINKS;

const linkClass = "inline-flex min-h-8 items-center hover:text-accent";

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-sans text-xs font-semibold tracking-widest text-chalk/70 uppercase">
        {title}
      </h2>
      <ul className="mt-3 space-y-1 text-sm">{children}</ul>
    </div>
  );
}

export function SiteFooter({ regions }: { regions: { slug: string; name: string }[] }) {
  // Dark in both themes: cellar sits a step above the cellar-night page in dark mode.
  return (
    <footer className="mt-auto border-t border-accent/40 bg-cellar text-chalk">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <Logo reversed />
          <p className="mt-4 text-sm text-chalk/75">
            An independent guide, not affiliated with Booking.com or GetYourGuide. We may earn a
            commission when you book through our links, at no extra cost to you.
          </p>
        </div>
        <Column title="Explore">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={linkClass}>
                {item.label}
              </Link>
            </li>
          ))}
        </Column>
        <Column title="Regions">
          {regions.map((r) => (
            <li key={r.slug}>
              <Link href={regionHref(r.slug)} className={linkClass}>
                {r.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href={REGIONS_INDEX_HREF} className={linkClass}>
              All wine regions
            </Link>
          </li>
        </Column>
        <Column title="About">
          {ABOUT.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={linkClass}>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <ConsentSettingsButton className={`${linkClass} cursor-pointer`} />
          </li>
        </Column>
      </div>
      <div className="border-t border-accent/30">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-chalk/70 sm:px-6">
          Please taste responsibly: use the spittoon, know your limits and never drink and drive.
          Alcohol is not sold to anyone under 18 in France.
        </p>
      </div>
    </footer>
  );
}
