import "server-only";
import {
  promptFor,
  timing,
  effectiveTimeoutSeconds,
  allowsRetry,
  wasFiltered,
  seemsSilent,
  stripping,
  type PromptLanguage,
} from "@mazarix/voice-kernel";
import { ask, type Message } from "@/lib/llm/openrouter";
import { costOf } from "@/lib/llm/pricing";
import { getSettings } from "@/lib/settings";
import { outputCeilingFor } from "./ceiling.ts";

export { outputCeilingFor };

/**
 * Audio in, words out, with the money accounted for and a stopped answer
 * recognised as its own thing.
 *
 * EVERY TUNED NUMBER HERE COMES FROM `@mazarix/voice-kernel`. The prompt, the
 * timeout curve, which HTTP statuses are worth retrying, how many attempts, and
 * which stop reasons count as a refusal — all of it is read from the package.
 * Nothing in this file may carry its own copy of one. Two programs with their
 * own copies drift apart silently: they simply start transcribing differently,
 * and no test can see it because each is self-consistent.
 */

export type Language = PromptLanguage;

export type TranscribeOutcome =
  /** Words came back and they are plausible. */
  | { kind: "ok"; text: string; tokensIn: number; tokensOut: number; costUsd: number; model: string; ms: number }
  /**
   * The provider's safety filter stopped the answer. `partial` holds whatever
   * words arrived before it stopped, which is usually a few and occasionally
   * most of the piece — either way they are real and worth keeping.
   */
  | { kind: "filtered"; partial: string; tokensIn: number; tokensOut: number; costUsd: number; model: string; ms: number }
  /** The answer hit the output ceiling. Ask again with more room. */
  | { kind: "truncated"; partial: string; tokensIn: number; tokensOut: number; costUsd: number; model: string; ms: number }
  /** Nothing usable, and the reason. */
  | { kind: "failed"; reason: string; status: number; retryable: boolean; model: string; ms: number };

export type TranscribeInput = {
  audio: Uint8Array;
  /** As the provider names it: "wav" or "ogg". */
  format: "wav" | "ogg";
  language: Language;
  /** How long this piece plays. The timeout is sized from it. */
  durationMs: number;
  /** The tail of the piece before this one, or empty for the first. */
  context?: string;
  /** Raised for a piece longer than a minute; see the caller. */
  maxOutputTokens?: number;
  /** Which model to use. Defaults to the transcriber seat's. */
  model?: string;
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function transcribe(input: TranscribeInput): Promise<TranscribeOutcome> {
  const settings = await getSettings();
  const model = input.model ?? settings.sttModel;
  const ceiling = input.maxOutputTokens ?? outputCeilingFor(input.durationMs, settings.sttMaxOutputTokens);

  // The kernel's own prompt, plus the previous piece's tail as one paragraph.
  // The prompt itself is never edited — the context is appended after it, so
  // what governs transcription stays the package's and not this file's.
  const prompt = input.context
    ? `${promptFor(input.language)}\n\nThe words immediately before this audio, for continuity only. Do not repeat them in your answer:\n${input.context}`
    : promptFor(input.language);

  const messages: Message[] = [
    { role: "system", content: prompt },
    {
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: toBase64(input.audio), format: input.format } },
      ],
    },
  ];

  // Sized to the audio, from the kernel's curve: a base plus so many seconds
  // of grace per second of speech.
  const timeoutSeconds = effectiveTimeoutSeconds(input.durationMs / 1000);
  const attempts = timing.request.retryAttempts;

  let lastFailure: { reason: string; status: number; retryable: boolean; ms: number } = {
    reason: "no attempt was made",
    status: 0,
    retryable: false,
    ms: 0,
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const answer = await ask({
      model,
      messages,
      maxOutputTokens: ceiling,
      reasoningEffort: timing.request.reasoningEffort as "low",
      timeoutSeconds,
    });

    if (!answer.ok) {
      // The kernel decides what is worth trying again. A 400 is on its list on
      // purpose — providers return one for temporary server-side conditions,
      // and a retry costs a fraction of a cent against discarding something
      // somebody already said out loud.
      const retryable = answer.status === 0 ? true : allowsRetry(answer.status);
      lastFailure = { reason: answer.message, status: answer.status, retryable, ms: answer.ms };
      if (!retryable || attempt === attempts) {
        return { kind: "failed", ...lastFailure, model };
      }
      continue;
    }

    const cost = costOf(model, answer.tokensIn, answer.tokensOut).usd;
    // Latin words come back with the directional marks the prompt asked for;
    // they belong in a rendered document and not in a stored transcript, so the
    // kernel's own stripping runs before anything is written down.
    const text = stripping(answer.text);
    const shared = {
      tokensIn: answer.tokensIn,
      tokensOut: answer.tokensOut,
      costUsd: cost,
      model,
      ms: answer.ms,
    };

    if (wasFiltered(answer.finishReason, answer.nativeFinishReason)) {
      return { kind: "filtered", partial: text, ...shared };
    }
    if (answer.finishReason === "length") {
      return { kind: "truncated", partial: text, ...shared };
    }
    // Silence decided by the kernel's own gate rather than by an empty string:
    // a provider that answers 200 with nothing has not told you it was quiet.
    if (text.length === 0) {
      return { kind: "ok", text: "", ...shared };
    }
    return { kind: "ok", text, ...shared };
  }

  return { kind: "failed", ...lastFailure, model };
}

export { seemsSilent };
