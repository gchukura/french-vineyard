/**
 * Consent cookie. Stores only the visitor's choice, which is strictly
 * necessary, so it is set without asking. Nothing that tracks may load
 * until the value is "accepted".
 */

export type ConsentChoice = "accepted" | "refused";
export type ConsentState = ConsentChoice | "unset";

export const CONSENT_COOKIE = "fv_consent";
/** Six months, in seconds. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

export function readConsent(cookieHeader: string): ConsentState {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== CONSENT_COOKIE) continue;
    const value = rest.join("=");
    if (value === "accepted" || value === "refused") return value;
  }
  return "unset";
}

export function consentCookie(choice: ConsentChoice, { secure = true } = {}): string {
  return [
    `${CONSENT_COOKIE}=${choice}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearConsentCookie(): string {
  return `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Inline <head> script: marks <html data-consent> before first paint so CSS
 * can hide the server-rendered banner for visitors who already chose.
 */
export const CONSENT_BOOT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=(accepted|refused)/);if(m)document.documentElement.dataset.consent=m[1]}catch(e){}`;
