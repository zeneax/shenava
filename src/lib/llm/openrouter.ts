import "server-only";
import { openRouterKey, openRouterApp } from "@/lib/env";
import { readProviderError, retryAfterSeconds } from "./provider-error.ts";

/**
 * One way to reach a model, and one place that knows how.
 *
 * OpenRouter's chat completions endpoint, spoken directly rather than through a
 * provider SDK: the request is four fields and the answer is one object, and an
 * SDK in between is a dependency that has opinions about retries and timeouts
 * which this project already has its own — the kernel's.
 *
 * Nothing here retries. Retry policy belongs to the caller, because what counts
 * as worth retrying differs between transcribing a minute of speech and asking
 * for a JSON draft — and which statuses are worth it is the kernel's list,
 * obeyed by `transcribe.ts` for the first and `meetings/retry.ts` for the
 * second. A failure therefore carries everything a caller needs to decide:
 * the status, the provider's own sentence, and how long it asked us to wait.
 */
const BASE = "https://openrouter.ai/api/v1";

export type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "user"; content: ContentPart[] };

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export type AskOptions = {
  model: string;
  messages: Message[];
  maxOutputTokens: number;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutSeconds: number;
  responseFormat?: "json_object";
};

export type Answer = {
  ok: true;
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** Why the model stopped. Both spellings, because providers disagree. */
  finishReason: string;
  nativeFinishReason: string;
  ms: number;
};

export type Failure = {
  ok: false;
  /** The HTTP status, or 0 for a transport failure or a timeout. */
  status: number;
  /** The provider's own sentence where its body carried one; the body otherwise. */
  message: string;
  /** How long the provider asked us to wait before asking again, when it said. */
  retryAfterSeconds?: number;
  ms: number;
};

export async function ask(options: AskOptions): Promise<Answer | Failure> {
  const key = openRouterKey();
  const started = Date.now();
  if (!key) return { ok: false, status: 0, message: "OPENROUTER_API_KEY is empty", ms: 0 };

  const app = openRouterApp();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutSeconds * 1000);

  try {
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "http-referer": app.url,
        "x-title": app.name,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxOutputTokens,
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
        ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
      }),
    });

    const ms = Date.now() - started;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const said = readProviderError(body);
      return {
        ok: false,
        status: response.status,
        message: said.message || response.statusText,
        // The header is the word. OpenRouter also echoes it inside the body,
        // which is read when the header is missing.
        retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")) ?? said.retryAfterSeconds,
        ms,
      };
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string; native_finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = body.choices?.[0];
    return {
      ok: true,
      text: (choice?.message?.content ?? "").trim(),
      tokensIn: body.usage?.prompt_tokens ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
      finishReason: choice?.finish_reason ?? "",
      nativeFinishReason: choice?.native_finish_reason ?? "",
      ms,
    };
  } catch (error) {
    const ms = Date.now() - started;
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: 0, message: aborted ? "timeout" : String(error), ms };
  } finally {
    clearTimeout(timer);
  }
}
