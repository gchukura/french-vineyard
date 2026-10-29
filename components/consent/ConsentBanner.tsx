"use client";

import Link from "next/link";

import { useConsent } from "@/components/consent/useConsent";

/**
 * Rendered into the static HTML so both buttons are there on first paint.
 * globals.css hides it once <html data-consent> is set, which the boot
 * script in the root layout does before paint for returning visitors.
 */
export function ConsentBanner() {
  const { consent, accept, refuse } = useConsent();
  if (consent !== "unset") return null;
  return <ConsentBannerView onAccept={accept} onRefuse={refuse} />;
}

export function ConsentBannerView({
  onAccept,
  onRefuse,
  preview = false,
}: {
  onAccept?: () => void;
  onRefuse?: () => void;
  /** Styleguide: render in flow instead of fixed to the viewport. */
  preview?: boolean;
}) {
  return (
    <section
      aria-label="Cookie consent"
      className={`${preview ? "relative" : "consent-banner fixed inset-x-0 bottom-0 z-50"} border-t border-accent bg-surface text-foreground`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <p className="text-sm sm:flex-1">
          We&rsquo;d like to count visits with Plausible and Vercel Web Analytics, privacy-friendly
          analytics tools. They set no cookies and only run if you accept.{" "}
          {/* Shown on every first visit, so don't prefetch it on every page view. */}
          <Link href="/privacy-policy/" prefetch={false} className="underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:w-72">
          <button type="button" onClick={onRefuse} className={consentButton}>
            Refuse
          </button>
          <button type="button" onClick={onAccept} className={consentButton}>
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}

// One style for both: refusing must be exactly as easy as accepting.
const consentButton =
  "min-h-11 rounded-button bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
