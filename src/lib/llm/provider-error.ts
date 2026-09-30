/**
 * What a provider's refusal says, read off the wire.
 *
 * No imports and not `server-only`, for the reason `meetings/ceiling.ts`
 * gives: the client that calls this is, and a test cannot reach into it. The
 * body this is held to in `tests/retry.test.ts` is one OpenRouter actually
 * sent — a 429 from its admission control, with the wait it asked for inside
 * the JSON as well as in the header.
 */

/** As much of a body as is worth carrying into a ledger row or onto a screen. */
const LONGEST_MESSAGE = 500;

export type ProviderError = {
  /** The provider's own sentence when the body is JSON that has one; the body otherwise. */
  message: string;
  /** How long it asked us to wait before asking again, when it said. */
  retryAfterSeconds?: number;
};

export function readProviderError(body: string): ProviderError {
  const raw = body.trim();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON: an HTML page from a proxy, or nothing at all. The bytes are the message.
  }
  const error = (parsed as { error?: unknown } | null)?.error;
  if (error && typeof error === "object") {
    const { message, metadata } = error as { message?: unknown; metadata?: unknown };
    const headers = (metadata as { headers?: unknown } | null)?.headers;
    return {
      message: typeof message === "string" && message.trim() ? clip(message.trim()) : clip(raw),
      retryAfterSeconds: retryAfterSeconds(headerValue(headers, "retry-after")),
    };
  }
  return { message: clip(raw) };
}

/**
 * `Retry-After`, in seconds. RFC 9110 allows a delay in seconds or an HTTP
 * date, and both are read. Anything else, or nothing, is undefined, so a
 * caller can tell "did not say" from "said zero".
 */
export function retryAfterSeconds(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === name && (typeof value === "string" || typeof value === "number")) {
      return String(value);
    }
  }
  return undefined;
}

const clip = (line: string): string =>
  line.length > LONGEST_MESSAGE ? `${line.slice(0, LONGEST_MESSAGE - 1)}…` : line;
