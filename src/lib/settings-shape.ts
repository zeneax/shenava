/**
 * What a setting is, and what it is when nobody has chosen.
 *
 * Separate from `lib/settings.ts` because that one is `server-only` — it holds
 * the database read — and `server-only` does not resolve outside Next, which
 * would put the defaults out of reach of a plain node test. The test that
 * matters here is the one asserting that both seats' default models appear in
 * the price table: a model with no price is counted as free, and its spending
 * is then invisible.
 */
export type Settings = {
  studioName: string;
  studioNameFa: string;
  studioVoice: string;
  sttModel: string;
  sttFallbackModel: string;
  sttMaxOutputTokens: number;
  writerModel: string;
  writerTemperature: number;
  writerMaxOutputTokens: number;
  dailyCeilingUsd: number;
  monthlyCeilingUsd: number;
  retentionDays: number;
};

export const SETTING_DEFAULTS: Settings = {
  studioName: "Your Studio",
  studioNameFa: "استودیوی شما",
  studioVoice: "",
  sttModel: "google/gemini-3.5-flash",
  sttFallbackModel: "",
  sttMaxOutputTokens: 4000,
  writerModel: "anthropic/claude-sonnet-5",
  writerTemperature: 0.3,
  writerMaxOutputTokens: 12_000,
  dailyCeilingUsd: 3,
  monthlyCeilingUsd: 30,
  retentionDays: 0,
};
