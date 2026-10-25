"use client";

import Script from "next/script";

import { useConsent } from "@/components/consent/useConsent";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "frenchvineyard.com";

/** Plausible, injected only after the visitor accepts. */
export function Analytics() {
  const { consent } = useConsent();
  if (consent !== "accepted") return null;
  return (
    <Script
      src="https://plausible.io/js/script.js"
      data-domain={PLAUSIBLE_DOMAIN}
      strategy="afterInteractive"
    />
  );
}
