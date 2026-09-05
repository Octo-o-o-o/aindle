export interface ModelPrice {
  /** $ per 1M input tokens */
  input: number;
  /** $ per 1M output tokens */
  output: number;
}

// $/1M tokens; first case-insensitive prefix match wins.
const PRICES: Array<[string, ModelPrice]> = [
  ['claude-opus-4', { input: 15, output: 75 }],
  ['claude-sonnet-4', { input: 3, output: 15 }],
  ['claude-haiku', { input: 1, output: 5 }],
  ['gpt-5', { input: 1.25, output: 10 }],
  ['codex-mini', { input: 1.5, output: 6 }],
  ['kimi-k2', { input: 0.6, output: 2.5 }],
  ['kimi-k1', { input: 0.6, output: 2.5 }],
  ['glm-4', { input: 0.6, output: 2.2 }],
];

export function priceFor(model: string): ModelPrice | undefined {
  const key = model.trim().toLowerCase();
  if (!key) return undefined;
  for (const [prefix, price] of PRICES) {
    if (key.startsWith(prefix)) return price;
  }
  return undefined;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** USD for one usage record; undefined when the model has no known price. */
export function costOf(model: string, counts: TokenCounts): number | undefined {
  const price = priceFor(model);
  if (!price) return undefined;
  return (
    (counts.input * price.input +
      counts.output * price.output +
      (counts.cacheRead ?? 0) * price.input * 0.1 +
      (counts.cacheWrite ?? 0) * price.input * 1.25) /
    1_000_000
  );
}
