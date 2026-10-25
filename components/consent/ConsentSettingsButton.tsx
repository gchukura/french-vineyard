"use client";

import { useConsent } from "@/components/consent/useConsent";

export function ConsentSettingsButton({ className = "" }: { className?: string }) {
  const { reset } = useConsent();
  return (
    <button type="button" onClick={reset} className={className}>
      Cookie settings
    </button>
  );
}
