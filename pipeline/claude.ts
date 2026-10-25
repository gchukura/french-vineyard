import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";

import { addUsage, type Budget, costUsd, PRICES, type UsageLike } from "./lib/cost";

/**
 * Claude API access for the pipeline: single streamed calls (with the
 * server-side refusal fallback on models that support it), Message Batches,
 * and the per-run budget check before every call.
 */

export type CallResult = {
  message: BetaMessage;
  /** Every response in the call, including pause_turn continuations. */
  turns: BetaMessage[];
  usage: UsageLike;
  usd: number;
  model: string;
};

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Models with a server-side default fallback chain (not Haiku). */
const supportsFallbacks = (model: string) => /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);

export class Claude {
  readonly client: Anthropic;

  constructor(
    readonly budget: Budget,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ maxRetries: 4 });
  }

  /**
   * One streamed request. `estimate` is the most this call is expected to
   * cost; the call is refused if it would take the run past the budget.
   * pause_turn (long server-tool turns) is resumed up to `maxContinuations`.
   */
  async call(
    params: BetaMessageStreamParams,
    estimate: number,
    maxContinuations = 4,
  ): Promise<CallResult> {
    this.budget.reserve(estimate);
    const fallbacks = supportsFallbacks(params.model);
    const messages: BetaMessageParam[] = [...params.messages];
    let usage: UsageLike = { input_tokens: 0, output_tokens: 0 };
    let usd = 0;
    const turns: BetaMessage[] = [];

    for (let i = 0; ; i++) {
      const message = await this.client.beta.messages
        .stream({
          ...params,
          messages,
          ...(fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        })
        .finalMessage();
      turns.push(message);
      // Bill at the model that served the turn (a fallback may have run).
      const callUsd = costUsd(PRICES[message.model] ? message.model : params.model, message.usage);
      usd += callUsd;
      this.budget.charge(callUsd);
      usage = addUsage(usage, message.usage);

      if (message.stop_reason === "pause_turn" && i < maxContinuations) {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      if (message.stop_reason === "refusal") {
        throw new Error(
          `Refused (${message.stop_details?.category ?? "no category"}): ${message.stop_details?.explanation ?? ""}`,
        );
      }
      if (message.stop_reason === "max_tokens") throw new Error("Hit max_tokens before finishing");
      if (message.stop_reason === "pause_turn") throw new Error("Still paused after continuations");
      return { message, turns, usage, usd, model: message.model };
    }
  }

  /**
   * Message Batches at half price. Waits for the batch to end and returns
   * results keyed by custom_id. Batches don't take `fallbacks`, so a refusal
   * comes back as an error for that row.
   */
  async batch(
    requests: { custom_id: string; params: MessageCreateParamsNonStreaming }[],
    estimateEach: number,
    log: (msg: string) => void,
  ): Promise<Map<string, CallResult | { error: string }>> {
    this.budget.reserve(estimateEach * requests.length);
    const created = await this.client.messages.batches.create({ requests });
    log(`batch ${created.id}: ${requests.length} requests submitted`);

    let batch = created;
    while (batch.processing_status !== "ended") {
      await new Promise((r) => setTimeout(r, 30_000));
      batch = await this.client.messages.batches.retrieve(created.id);
      const c = batch.request_counts;
      log(
        `batch ${created.id}: ${c.processing} processing, ${c.succeeded} done, ${c.errored} errored`,
      );
    }

    const out = new Map<string, CallResult | { error: string }>();
    for await (const r of await this.client.messages.batches.results(created.id)) {
      if (r.result.type !== "succeeded") {
        out.set(r.custom_id, {
          error:
            r.result.type === "errored"
              ? `${r.result.error.error.type}: ${r.result.error.error.message}`
              : r.result.type,
        });
        continue;
      }
      const message = r.result.message as unknown as BetaMessage;
      const billed = PRICES[message.model] ? message.model : requests[0].params.model;
      const usd = costUsd(billed, message.usage, { batch: true });
      this.budget.charge(usd);
      if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
        out.set(r.custom_id, { error: `stop_reason ${message.stop_reason}` });
        continue;
      }
      out.set(r.custom_id, {
        message,
        turns: [message],
        usage: message.usage,
        usd,
        model: message.model,
      });
    }
    return out;
  }
}

export function textOf(content: BetaContentBlock[]): string {
  return content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
}

/** Every URL research saw: web search results and text citations, with titles. */
export function seenUrls(
  messages: { content: BetaContentBlock[] }[],
): Map<string, string | undefined> {
  const seen = new Map<string, string | undefined>();
  for (const m of messages) {
    for (const block of m.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) seen.set(r.url, r.title);
      }
      if (block.type === "text") {
        for (const c of block.citations ?? []) {
          if ("url" in c && typeof c.url === "string")
            seen.set(c.url, "title" in c ? (c.title ?? undefined) : undefined);
        }
      }
    }
  }
  return seen;
}
