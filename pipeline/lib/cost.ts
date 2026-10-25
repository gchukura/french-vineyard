/**
 * USD cost of a call from its usage block. Prices are per million tokens
 * (Anthropic list prices, October 2026); update this table when they change.
 * Batch requests are billed at half price.
 */

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Web search: $10 per 1,000 searches. */
export const WEB_SEARCH_USD = 0.01;

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function priceFor(model: string): Price {
  const price = PRICES[model];
  if (!price) {
    throw new Error(
      `No price for model "${model}". Add it to PRICES in pipeline/lib/cost.ts so the budget cap works.`,
    );
  }
  return price;
}

export function costUsd(model: string, usage: UsageLike, { batch = false } = {}): number {
  const p = priceFor(model);
  const tokens =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite;
  const searches = (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
  return (tokens / 1_000_000) * (batch ? 0.5 : 1) + searches;
}

export type UsageEntry = {
  stage: string;
  model: string;
  in: number;
  out: number;
  cache_read: number;
  cache_write: number;
  searches: number;
  usd: number;
  batch?: boolean;
  at: string;
};

export function usageEntry(
  stage: string,
  model: string,
  usage: UsageLike,
  at: string,
  { batch = false } = {},
): UsageEntry {
  return {
    stage,
    model,
    in: usage.input_tokens,
    out: usage.output_tokens,
    cache_read: usage.cache_read_input_tokens ?? 0,
    cache_write: usage.cache_creation_input_tokens ?? 0,
    searches: usage.server_tool_use?.web_search_requests ?? 0,
    usd: round(costUsd(model, usage, { batch })),
    ...(batch ? { batch } : {}),
    at,
  };
}

export const round = (usd: number) => Math.round(usd * 10_000) / 10_000;

/** Sum of usage across calls (pause_turn continuations, retries). */
export function addUsage(a: UsageLike, b: UsageLike): UsageLike {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens:
      (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    server_tool_use: {
      web_search_requests:
        (a.server_tool_use?.web_search_requests ?? 0) +
        (b.server_tool_use?.web_search_requests ?? 0),
    },
  };
}

export class BudgetExceeded extends Error {
  constructor(spent: number, cap: number) {
    super(`Budget cap reached: $${spent.toFixed(2)} of $${cap.toFixed(2)} spent`);
    this.name = "BudgetExceeded";
  }
}

/** Running total for one CLI invocation, checked before every call. */
export class Budget {
  spent = 0;
  constructor(readonly cap: number) {}

  /** Throws if `estimate` more would take the run past the cap. */
  reserve(estimate: number): void {
    if (this.spent + estimate > this.cap) throw new BudgetExceeded(this.spent, this.cap);
  }

  /** How many calls of `estimate` each still fit. */
  room(estimate: number): number {
    // The epsilon keeps 0.2 / 0.1 from flooring to 1.
    return Math.max(0, Math.floor((this.cap - this.spent) / estimate + 1e-9));
  }

  charge(usd: number): void {
    this.spent += usd;
  }
}
