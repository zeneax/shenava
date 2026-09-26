/**
 * What a call cost, from the provider's own token counts.
 *
 * Dollars per million tokens. These are read from OpenRouter's model list and
 * go stale; the figures a run is billed at come from here, so a model you add
 * and do not price is counted as free and its spending is invisible. That is
 * why `costOf` returns a flag saying whether it knew the model — the Settings
 * page shows it, rather than quietly reporting zero.
 *
 * Pure and dependency-free: the tests read it.
 */
export type Price = { in: number; out: number };

export const PRICES: Record<string, Price> = {
  // Transcription-capable, cheap, fast. What the transcriber seat wants.
  "google/gemini-3.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
  "google/gemini-3.8-flash": { in: 0.3, out: 2.5 },
  "openai/gpt-4o-mini-transcribe": { in: 1.25, out: 5 },
  // Judgement, for the writer seat.
  "anthropic/claude-sonnet-5": { in: 3, out: 15 },
  "anthropic/claude-opus-5": { in: 15, out: 75 },
  "anthropic/claude-haiku-4.5": { in: 1, out: 5 },
  "openai/gpt-5.6-luna": { in: 1.25, out: 10 },
  "deepseek/deepseek-v4.1-flash": { in: 0.25, out: 1 },
};

export type Cost = { usd: number; known: boolean };

export function costOf(model: string, tokensIn: number, tokensOut: number): Cost {
  const price = PRICES[model];
  if (!price) return { usd: 0, known: false };
  const usd = (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out;
  // Six decimal places is what the column holds; a tenth of a cent is the
  // smallest amount worth accounting for and rounding below it invites drift.
  return { usd: Math.round(usd * 1_000_000) / 1_000_000, known: true };
}
