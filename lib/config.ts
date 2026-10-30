import { z } from "zod";

import type { ConfigRow } from "@/lib/sheet-schema";

/** Config tab helpers: key/value rows, some holding JSON. */

export type Config = Map<string, ConfigRow>;

export function toConfig(rows: ConfigRow[]): Config {
  return new Map(rows.map((r) => [r.key.trim(), r]));
}

export function configText(config: Config, key: string): string | undefined {
  return config.get(key)?.value || undefined;
}

/**
 * The legal links whose page exists: those with no Config row behind them,
 * and those whose copy is published (LegalPage answers 404 otherwise).
 */
export function liveLegalLinks<T extends { configKey?: string }>(links: T[], config: Config): T[] {
  return links.filter((l) => !l.configKey || Boolean(configText(config, l.configKey)));
}

/** A JSON config value validated by `schema`; falls back on blank or invalid JSON. */
export function configJson<T>(config: Config, key: string, schema: z.ZodType<T>, fallback: T): T {
  const raw = configText(config, key);
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export const statsSchema = z.array(z.object({ value: z.string(), label: z.string() }));
export const faqSchema = z.array(z.object({ question: z.string(), answer: z.string() }));
