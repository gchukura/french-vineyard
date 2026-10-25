import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card } from "@/components/Card";
import { ClosingStack } from "@/components/ClosingStack";
import { ConsentBannerView } from "@/components/consent/ConsentBanner";
import { FactStrip } from "@/components/FactStrip";
import { Faq } from "@/components/Faq";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { SiteHeader } from "@/components/header/SiteHeader";
import { Hero } from "@/components/Hero";
import { HotelCard } from "@/components/HotelCard";
import { LastUpdated } from "@/components/LastUpdated";
import { Map } from "@/components/map/Map";
import { PracticalTable } from "@/components/PracticalTable";
import { ButtonLink } from "@/components/SmartLink";
import { TourCard } from "@/components/TourCard";

import * as s from "./sample-data";

export const metadata: Metadata = {
  title: "Styleguide · FrenchVineyard.com",
  robots: { index: false, follow: false },
};

const wrap = "mx-auto max-w-6xl px-4 sm:px-6";
const grid = "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

function Block({
  name,
  bleed = false,
  children,
}: {
  name: string;
  /** Full-width blocks pad their own label. */
  bleed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2
        className={`${bleed ? wrap : ""} font-sans text-xs font-semibold tracking-widest text-muted uppercase`}
      >
        {name}
      </h2>
      {children}
    </section>
  );
}

/** Every component once. `primary` is the light copy: its hero is high priority and it emits JSON-LD. */
function Showcase({ theme }: { theme: "light" | "dark" }) {
  const primary = theme === "light";
  return (
    <div data-theme={theme} className="bg-background py-12 text-foreground">
      <p className={`${wrap} mb-8 font-heading text-3xl`}>{primary ? "Light" : "Dark"}</p>
      <div className="space-y-16">
        <Block name="Header" bleed>
          <SiteHeader regions={s.sampleMenuRegions} sticky={false} />
        </Block>

        <Block name="Hero" bleed>
          <Hero {...s.sampleHero} priority={primary} />
        </Block>

        <div className={`${wrap} space-y-16`}>
          <Block name="Breadcrumbs">
            <Breadcrumbs items={s.sampleCrumbs} jsonLd={primary} />
          </Block>

          <Block name="LastUpdated">
            <LastUpdated date="2026-10-24" />
          </Block>

          <Block name="FactStrip">
            <FactStrip facts={s.sampleFacts} />
          </Block>

          <Block name="Buttons">
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/regions/">Primary</ButtonLink>
              <ButtonLink href="/regions/" variant="secondary">
                Secondary
              </ButtonLink>
            </div>
          </Block>

          <Block name="Card 3:2">
            <div className={grid}>
              {s.sampleCards.map((c) => (
                <Card key={c.href} {...c} />
              ))}
            </div>
          </Block>

          <Block name="Card 4:3">
            <div className={grid}>
              {s.sampleCards.map((c) => (
                <Card key={c.href} {...c} ratio="4:3" />
              ))}
            </div>
          </Block>

          <Block name="TourCard">
            <div className={grid}>
              {s.sampleTours.map((t, i) => (
                <TourCard key={t.id} tour={t} pickup={i === 0 ? "Pickup in Reims" : undefined} />
              ))}
            </div>
          </Block>

          <Block name="HotelCard">
            <div className={grid}>
              {s.sampleHotels.map((h) => (
                <HotelCard key={h.id} hotel={h} />
              ))}
            </div>
          </Block>

          <Block name="PracticalTable">
            <PracticalTable {...s.sampleTable} />
          </Block>

          <Block name="FAQ">
            <Faq items={s.sampleFaq} jsonLd={primary} />
          </Block>

          <Block name="Map">
            <Map pins={s.samplePins} label="Map of sample Champagne towns" />
          </Block>

          <Block name="ClosingStack">
            <ClosingStack
              tours={s.sampleTours}
              hotels={s.sampleHotels}
              related={s.sampleCards}
              panorama={s.samplePanorama}
              cta={{
                title: "Plan your Champagne trip",
                text: "Pick a base, book one or two cellar visits, and leave time to wander.",
                primary: { label: "Browse tours", href: "/go/gyg/home/" },
                secondary: { label: "Where to stay", href: "/where-to-stay/" },
              }}
            />
          </Block>
        </div>

        <Block name="Consent banner" bleed>
          <ConsentBannerView preview />
        </Block>

        <Block name="Footer" bleed>
          <SiteFooter regions={s.sampleMenuRegions} />
        </Block>
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <main id="main">
      <div className={`${wrap} py-10`}>
        <h1 className="text-4xl">Styleguide</h1>
        <p className="mt-2 text-muted">
          Every shared component with sample data, in light and dark. Not indexed.
        </p>
      </div>
      <Showcase theme="light" />
      <Showcase theme="dark" />
    </main>
  );
}
