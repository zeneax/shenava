import { test } from "node:test";
import assert from "node:assert/strict";

import { sendPieces } from "../src/lib/meetings/send.ts";
import { planSegments, planOptionsFor } from "../src/lib/meetings/segments.ts";
import { isKernelWav, wavDurationMs } from "../src/lib/meetings/wav.ts";

const RATE = 16_000;

function speech(seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sin(i * 0.05) * 0.4;
  return out;
}

type Call = { url: string; format: string | null; bytes: Uint8Array };

/**
 * A stand-in server. `answer` decides what each index gets back, so a test can
 * refuse one piece, or refuse with a ceiling, without a network.
 */
function stubFetch(answer: (idx: number) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const idx = Number(String(url).split("/").pop());
    calls.push({
      url: String(url),
      format: new Headers(init.headers).get("x-shenava-format"),
      bytes: new Uint8Array(init.body as ArrayBuffer),
    });
    const { status, body } = answer(idx);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const samples = speech(150);
const pieces = planSegments(samples, RATE, planOptionsFor("minute"));

test("every piece is posted, in index order, as one kernel WAV each", async () => {
  const marks: string[] = [];
  const server = stubFetch(() => ({ status: 200, body: { ok: true } }));
  try {
    const outcome = await sendPieces({
      meetingId: "m1",
      mode: "minute",
      samples,
      pieces,
      indices: pieces.map((p) => p.idx),
      mark: (idx, state) => marks.push(`${idx}:${state}`),
    });

    assert.deepEqual(outcome.done, pieces.map((p) => p.idx));
    assert.deepEqual(outcome.failed, []);
    assert.equal(outcome.halted, false);
    assert.deepEqual(
      server.calls.map((c) => c.url),
      pieces.map((p) => `/api/meetings/m1/segments/${p.idx}`),
    );
    for (const [i, call] of server.calls.entries()) {
      assert.equal(call.format, "wav");
      assert.ok(isKernelWav(call.bytes), `piece ${i} is not a kernel WAV`);
      const piece = pieces[i]!;
      assert.ok(
        Math.abs(wavDurationMs(call.bytes) - (piece.endMs - piece.startMs)) < 50,
        `piece ${i} carries the wrong stretch of audio`,
      );
    }
    assert.equal(marks[0], "0:sending");
    assert.equal(marks[1], "0:done");
  } finally {
    server.restore();
  }
});

test("one refused piece does not stop the rest", async () => {
  const server = stubFetch((idx) =>
    idx === 1 ? { status: 500, body: { error: "upstream" } } : { status: 200, body: { ok: true } },
  );
  try {
    const outcome = await sendPieces({
      meetingId: "m1",
      mode: "minute",
      samples,
      pieces,
      indices: pieces.map((p) => p.idx),
      mark: () => {},
    });
    assert.deepEqual(outcome.failed, [1]);
    assert.equal(outcome.halted, false);
    assert.equal(server.calls.length, pieces.length);
  } finally {
    server.restore();
  }
});

test("a ceiling refusal stops the run rather than proving it fifty times", async () => {
  const server = stubFetch((idx) =>
    idx === 1 ? { status: 429, body: { error: "ceiling" } } : { status: 200, body: { ok: true } },
  );
  try {
    const outcome = await sendPieces({
      meetingId: "m1",
      mode: "minute",
      samples,
      pieces,
      indices: pieces.map((p) => p.idx),
      mark: () => {},
    });
    assert.equal(outcome.halted, true);
    assert.deepEqual(outcome.done, [0]);
    assert.equal(server.calls.length, 2);
  } finally {
    server.restore();
  }
});

test("only the pending indices are sent, which is what makes a resume a resume", async () => {
  const server = stubFetch(() => ({ status: 200, body: { ok: true } }));
  try {
    await sendPieces({
      meetingId: "m1",
      mode: "minute",
      samples,
      pieces,
      indices: [2],
      mark: () => {},
    });
    assert.deepEqual(server.calls.map((c) => c.url), ["/api/meetings/m1/segments/2"]);
  } finally {
    server.restore();
  }
});
