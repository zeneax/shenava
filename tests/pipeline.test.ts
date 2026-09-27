import { test } from "node:test";
import assert from "node:assert/strict";

import { implausiblyShort, assembleTranscript, continuation } from "../src/lib/meetings/assemble.ts";
import { costOf, PRICES } from "../src/lib/llm/pricing.ts";
import { outputCeilingFor, spansCeilingFor } from "../src/lib/meetings/ceiling.ts";
import { SETTING_DEFAULTS } from "../src/lib/settings-shape.ts";

test("a minute of speech answered in two words is recognised as not an answer", () => {
  // What the safety filter actually returned, on real audio, with HTTP 200.
  assert.equal(implausiblyShort("Thanks for", 47_000), true);
});

test("a real transcript of the same minute is not", () => {
  const real =
    "Thanks for making the time. Before we talk about what we could build, tell me how the shop runs today. " +
    "We have two people on the floor and me, and the stock lives in a spreadsheet.";
  assert.equal(implausiblyShort(real, 47_000), false);
});

test("a very short piece is never judged, because the last one is short by nature", () => {
  // The last piece ends where the recording ends. Three seconds answered with
  // one word is plausible and must not be retried forever.
  assert.equal(implausiblyShort("Right.", 3_000), false);
});

test("the threshold sits far below real speech, which is the point", () => {
  // Speech runs at ten to fifteen characters a second. Two a second means only
  // something that stopped is caught: a false positive costs one request, a
  // false negative costs a minute missing from the middle of a transcript.
  const seconds = 60;
  assert.equal(implausiblyShort("x".repeat(seconds * 2 - 1), seconds * 1000), true);
  assert.equal(implausiblyShort("x".repeat(seconds * 2), seconds * 1000), false);
});

test("the transcript is assembled in index order, whatever order the rows arrive in", () => {
  const rows = [
    { idx: 2, text: "third" },
    { idx: 0, text: "first" },
    { idx: 1, text: "second" },
  ];
  assert.equal(assembleTranscript(rows), "first\n\nsecond\n\nthird");
});

test("an empty or missing piece leaves no blank hole in the transcript", () => {
  const rows = [
    { idx: 0, text: "first" },
    { idx: 1, text: "   " },
    { idx: 2, text: null },
    { idx: 3, text: "fourth" },
  ];
  assert.equal(assembleTranscript(rows), "first\n\nfourth");
});

test("the context is the tail, and a short previous piece is passed whole", () => {
  assert.equal(continuation("a short sentence."), "a short sentence.");
  const long = "x".repeat(1000);
  assert.equal(continuation(long).length, 400);
  assert.equal(continuation(null), "");
  assert.equal(continuation("   "), "");
});

test("cost comes from the provider's counts, and an unpriced model says so", () => {
  const known = costOf("anthropic/claude-sonnet-5", 1_000_000, 1_000_000);
  assert.equal(known.known, true);
  assert.equal(known.usd, 18);
  const unknown = costOf("some/model-nobody-priced", 1_000_000, 1_000_000);
  assert.equal(unknown.known, false);
  assert.equal(unknown.usd, 0);
});

test("the seats' default models are both priced, or their spending is invisible", () => {
  assert.ok(PRICES[SETTING_DEFAULTS.sttModel], `${SETTING_DEFAULTS.sttModel} has no price`);
  assert.ok(PRICES[SETTING_DEFAULTS.writerModel], `${SETTING_DEFAULTS.writerModel} has no price`);
});

test("the output ceiling grows with the piece and never falls below the floor", () => {
  const floor = 4000;
  // One minute needs nothing beyond the floor.
  assert.equal(outputCeilingFor(60_000, floor), floor);
  // Nine minutes does. This is the bug it exists for: a long piece sent under a
  // one-minute ceiling comes back truncated, and a truncated transcript reads
  // like bad transcription rather than like an error.
  const long = outputCeilingFor(9 * 60_000, floor);
  assert.ok(long > floor * 4, `nine minutes got ${long} against a floor of ${floor}`);
  assert.ok(long <= 64_000);
});

test("the speaker pass asks for more room than the 4,000 that truncated a real meeting", () => {
  // The run that failed: 187 sentences in one chunk, against a flat 4,000. Both
  // attempts stopped at the ceiling — the ledger recorded tokens_out of exactly
  // 8,000 — and a half-written JSON object was reported as the model not
  // returning reliable JSON. With no floor at all, the sentence count alone has
  // to carry it past where it broke.
  assert.ok(
    spansCeilingFor(187, 0) > 4000,
    `187 sentences asked for ${spansCeilingFor(187, 0)}, which is what already failed`,
  );
  // And it has to clear the answer that succeeded, with room over: 163
  // sentences came back in 3,344 output tokens.
  assert.ok(spansCeilingFor(163, 0) > 3344 * 1.5);
});

test("a ceiling never falls below its floor, and never runs away", () => {
  // The floor is the reader's own setting; a short chunk must not quietly ask
  // for less than they configured.
  assert.equal(spansCeilingFor(1, 12_000), 12_000);
  assert.equal(outputCeilingFor(1000, 12_000), 12_000);
  // And nothing asks for more than the hard maximum, whatever the arithmetic.
  assert.equal(spansCeilingFor(100_000, 0), 64_000);
  assert.equal(outputCeilingFor(3 * 60 * 60_000, 0), 64_000);
});
