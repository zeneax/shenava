import { allowsRetry } from "@mazarix/voice-kernel";

/**
 * Whether a model call that failed is worth asking again, and how long to
 * wait first.
 *
 * WHICH STATUSES ARE WORTH IT IS THE KERNEL'S DECISION, not this file's:
 * `allowsRetry` holds the list, and the transcription route has always obeyed
 * it. The seats did not. They counted a 429 as an answer that could not be
 * read, asked again in the same instant — inside the very window the provider
 * had just asked them to sit out — and reported the second refusal as
 * "unreadable", which sends a reader off to change the writer model. Nothing
 * was wrong with the model. Nothing had reached it.
 *
 * The wait is the provider's own `Retry-After`, never a number invented here.
 * A provider that names no wait is asked again at once; one that asks for
 * longer than a reviewer will sit through is not asked again at all, and the
 * refusal says so instead.
 *
 * Not `server-only`, for the reason `ceiling.ts` gives: the seats are, and a
 * test cannot reach into them.
 */

/**
 * The longest a request is held open on a provider's word. The route that
 * carries a draft allows five minutes for the whole exchange, and the call
 * itself may need most of that.
 */
export const LONGEST_WAIT_SECONDS = 30;

export type FailedCall = {
  /** The HTTP status, or 0 for a dropped connection or a timeout. */
  status: number;
  retryAfterSeconds?: number;
};

export type NextStep = { retry: true; waitMs: number } | { retry: false };

export function nextStep(failure: FailedCall, attempt: number, attempts: number): NextStep {
  if (attempt >= attempts) return { retry: false };
  // Status 0 is a timeout or a dropped connection. The kernel counts those as
  // worth another try, and there is no header to wait on.
  if (failure.status !== 0 && !allowsRetry(failure.status)) return { retry: false };
  const wait = failure.retryAfterSeconds ?? 0;
  if (wait > LONGEST_WAIT_SECONDS) return { retry: false };
  return { retry: true, waitMs: wait * 1000 };
}

export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
