"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";

import { useConsent } from "@/components/consent/useConsent";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "frenchvineyard.com";

/** Plausible, Vercel Web Analytics and Speed Insights, injected only after the visitor accepts. */
export function Analytics() {
  const { consent } = useConsent();
  if (consent !== "accepted") return null;
  return (
    <>
      <Script
        src="https://plausible.io/js/script.js"
        data-domain={PLAUSIBLE_DOMAIN}
        strategy="afterInteractive"
      />
      <VercelAnalytics />
      <SpeedInsights />
    </>
  );
}
