/** True when `url`'s host is `domain` or one of its subdomains. */
export function isBlocked(url: string, blocklist: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  return blocklist.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * The URLs research saw, minus blocked domains, so a fact sourced only from
 * an aggregator is dropped even if one slips past the search filter.
 */
export function withoutBlocked(
  seen: Map<string, string | undefined>,
  blocklist: string[],
): Map<string, string | undefined> {
  return new Map([...seen].filter(([url]) => !isBlocked(url, blocklist)));
}
