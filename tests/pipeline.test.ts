import { test } from "node:test";
import assert from "node:assert/strict";

import { implausiblyShort, assembleTranscript, continuation } from "../src/lib/meetings/assemble.ts";
import { costOf, PRICES } from "../src/lib/llm/pricing.ts";
import { outputCeilingFor } from "../src/lib/meetings/ceiling.ts";
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
