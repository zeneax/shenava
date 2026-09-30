import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readProviderError, retryAfterSeconds } from "../src/lib/llm/provider-error.ts";
import { LONGEST_WAIT_SECONDS, nextStep } from "../src/lib/meetings/retry.ts";

/**
 * The refusal that started this: OpenRouter's admission control answering 429
 * with "could not verify available credits for this request in time" and a
 * ten-second Retry-After — and the draft reporting it as the model's JSON being
 * unreadable, twice, without ever waiting the ten seconds. The account had
 * credit. Nothing had reached the model.
 */
const ADMISSION_429 = JSON.stringify({
  error: {
    message: "OpenRouter could not verify available credits for this request in time. Retry shortly.",
    code: 429,
    metadata: {
      limit_source: "openrouter_admission_control",
      remedy_hint: "Slow down the request rate for this account, then retry after the reset (see X-RateLimit-Reset).",
      headers: { "Retry-After": "10" },
      provider_name: null,
    },
  },
});

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a provider's JSON refusal is read as its sentence and its wait", () => {
  const said = readProviderError(ADMISSION_429);
  assert.equal(said.message, "OpenRouter could not verify available credits for this request in time. Retry shortly.");
  assert.equal(said.retryAfterSeconds, 10);
});

test("a body that is not JSON is carried as it came, and clipped", () => {
  assert.deepEqual(readProviderError("<html>Bad Gateway</html>"), { message: "<html>Bad Gateway</html>" });
  assert.deepEqual(readProviderError("   "), { message: "" });
  const long = readProviderError("x".repeat(900)).message;
  assert.equal(long.length, 500);
  assert.ok(long.endsWith("…"));
});

test("a JSON error without a sentence or a wait still reads", () => {
  assert.deepEqual(readProviderError('{"error":{"code":500}}'), { message: '{"error":{"code":500}}', retryAfterSeconds: undefined });
});

test("Retry-After is read as seconds or as a date, and nothing else", () => {
  const now = Date.parse("2026-09-30T15:00:00Z");
  assert.equal(retryAfterSeconds("10"), 10);
  assert.equal(retryAfterSeconds(" 0 "), 0);
  assert.equal(retryAfterSeconds("Wed, 30 Sep 2026 15:00:10 GMT", now), 10);
  // A date already past asks for no wait, not a negative one.
  assert.equal(retryAfterSeconds("Wed, 30 Sep 2026 14:59:00 GMT", now), 0);
  assert.equal(retryAfterSeconds("soon"), undefined);
  assert.equal(retryAfterSeconds(null), undefined);
  assert.equal(retryAfterSeconds(undefined), undefined);
});

test("which statuses are asked again is the kernel's list", () => {
  assert.deepEqual(nextStep({ status: 429 }, 1, 2), { retry: true, waitMs: 0 });
  assert.deepEqual(nextStep({ status: 503 }, 1, 2), { retry: true, waitMs: 0 });
  // On the list deliberately — see the kernel's note on 400.
  assert.deepEqual(nextStep({ status: 400 }, 1, 2), { retry: true, waitMs: 0 });
  for (const status of [401, 403, 404]) {
    assert.deepEqual(nextStep({ status }, 1, 2), { retry: false }, `${status} cannot succeed on a retry`);
  }
});

test("the wait is the provider's own, and one past the limit is a refusal rather than a hold", () => {
  assert.deepEqual(nextStep({ status: 429, retryAfterSeconds: 10 }, 1, 2), { retry: true, waitMs: 10_000 });
  assert.deepEqual(nextStep({ status: 429, retryAfterSeconds: LONGEST_WAIT_SECONDS }, 1, 2), {
    retry: true,
    waitMs: LONGEST_WAIT_SECONDS * 1000,
  });
  assert.deepEqual(nextStep({ status: 429, retryAfterSeconds: LONGEST_WAIT_SECONDS + 1 }, 1, 2), { retry: false });
});

test("the last attempt is never followed by another", () => {
  assert.deepEqual(nextStep({ status: 429, retryAfterSeconds: 1 }, 2, 2), { retry: false });
  assert.deepEqual(nextStep({ status: 0 }, 3, 3), { retry: false });
});

test("a dropped connection or a timeout is asked again at once", () => {
  assert.deepEqual(nextStep({ status: 0 }, 1, 2), { retry: true, waitMs: 0 });
});

test("every seat tells a failure that produced no answer from one it could not read", () => {
  // The wrong word here sends a reader to change the writer model over a
  // network refusal. Read from the source, because the loops live in
  // `server-only` modules a test cannot load.
  for (const path of ["src/lib/meetings/notes.ts", "src/lib/meetings/speakers.ts", "src/lib/meetings/rewrite.ts"]) {
    const source = read(path);
    assert.match(source, /transport \? "transport" : "unreadable"/, `${path} reports every failure the same way`);
    assert.match(source, /nextStep\(answer, attempt, attempts\)/, `${path} does not ask the kernel before asking again`);
    assert.match(source, /await pause\(step\.waitMs\)/, `${path} does not wait the provider's Retry-After`);
    // The verdict note is for an answer that could not be read, never for a refusal.
    assert.match(source, /problem && !transport \? prompt \+ retryNote\(problem\) : prompt/, `${path} sends a refusal's body back to the model`);
  }
});

test("every refusal a seat can give has a sentence in both editions of the draft screen", () => {
  const union = read("src/lib/meetings/seat.ts").match(/export type Refusal =([^;]+);/)?.[1] ?? "";
  const members = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
  assert.ok(members.length >= 9, `only ${members.length} refusals found in seat.ts`);
  for (const lang of ["fa", "en"] as const) {
    const messages = JSON.parse(read(`messages/${lang}.json`)) as { draft: { reason: Record<string, string> } };
    for (const member of members) {
      assert.ok(messages.draft.reason[member], `${lang}.json draft.reason has no sentence for ${member}`);
    }
  }
});
