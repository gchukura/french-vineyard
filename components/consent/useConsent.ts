"use client";

import { useSyncExternalStore } from "react";

import {
  clearConsentCookie,
  consentCookie,
  readConsent,
  type ConsentChoice,
  type ConsentState,
} from "@/lib/consent";

const EVENT = "fv:consent";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const getSnapshot = (): ConsentState => readConsent(document.cookie);
const getServerSnapshot = (): ConsentState => "unset";

function apply(cookie: string, choice: ConsentChoice | null) {
  const before = getSnapshot();
  document.cookie = cookie;
  if (choice) document.documentElement.dataset.consent = choice;
  else delete document.documentElement.dataset.consent;
  // Analytics already running cannot be unloaded, so start a clean page.
  if (before === "accepted" && choice !== "accepted") {
    window.location.reload();
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The visitor's consent choice ("unset" until they pick). Server renders and
 * the first client render see "unset"; the stored value follows after.
 */
export function useConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    consent,
    accept: () =>
      apply(consentCookie("accepted", { secure: location.protocol === "https:" }), "accepted"),
    refuse: () =>
      apply(consentCookie("refused", { secure: location.protocol === "https:" }), "refused"),
    /** Forget the choice so the banner shows again. */
    reset: () => apply(clearConsentCookie(), null),
  };
}
