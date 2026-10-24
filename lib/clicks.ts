/**
 * Click log for /go/. The site's Sheet credentials are read-only, so clicks
 * are POSTed to the Sheet's Apps Script web app (docs/apps-script.js, doPost),
 * which appends them to the Clicks tab. Unset env = logging off.
 */

export type Click = { ts: string; provider: string; id: string; page: string; slot: string };

export const SLOT_PATTERN = /^[a-z0-9-]{1,40}$/;

export function buildClick(
  input: { provider: string; id: string; page: string; slot?: string | null },
  now = new Date(),
): Click {
  const slot = input.slot && SLOT_PATTERN.test(input.slot) ? input.slot : "unknown";
  return { ts: now.toISOString(), provider: input.provider, id: input.id, page: input.page, slot };
}

export async function logClick(
  click: Click,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = env.CLICKS_WEBHOOK_URL;
  const secret = env.CLICKS_WEBHOOK_SECRET;
  if (!url || !secret) return;
  try {
    await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, click }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // A lost click log must never break the redirect.
  }
}
