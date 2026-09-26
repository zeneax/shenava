import { test } from "node:test";
import assert from "node:assert/strict";

import {
  planSegments,
  planOptionsFor,
  inferMode,
  estimateMinutes,
  quietestCut,
  rmsDb,
  MAX_PIECE_SECONDS,
  LONG_PIECE_SECONDS,
  SECONDS_PER_PIECE,
} from "../src/lib/meetings/segments.ts";
import { encodeWav, downsample, toMono } from "../src/lib/meetings/wav-encode.ts";
import { halveWav, isKernelWav, wavDurationMs } from "../src/lib/meetings/wav.ts";
import { muxOpusOgg, parseOggPages, halveOgg, isOgg, oggDurationMs, OPUS_GRANULE_RATE } from "../src/lib/meetings/ogg.ts";

const RATE = 16_000;

/** Speech-ish noise with a deliberate silent gap, so a cut has somewhere to go. */
function signal(seconds: number, gapsAt: number[] = []): Float32Array {
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.sin(i * 0.05) * 0.4 + Math.sin(i * 0.011) * 0.2;
  }
  for (const at of gapsAt) {
    const from = Math.floor(at * RATE);
    out.fill(0, from, Math.min(out.length, from + Math.floor(0.6 * RATE)));
  }
  return out;
}

test("loudness of silence is minus infinity, and of a tone is not", () => {
  assert.equal(rmsDb(new Float32Array(1000), 0, 1000), -Infinity);
  assert.ok(rmsDb(signal(1), 0, RATE) > -20);
});

test("the cut lands in the silent gap, not at the cap", () => {
  const samples = signal(70, [52]);
  const frame = Math.floor(0.3 * RATE);
  const at = quietestCut(samples, 45 * RATE, 60 * RATE, frame);
  const seconds = at / RATE;
  assert.ok(seconds > 51.5 && seconds < 53.2, `cut at ${seconds}s, expected inside the gap near 52s`);
});

test("the pieces tile the recording with no gap and no overlap", () => {
  const samples = signal(200, [55, 115, 175]);
  const pieces = planSegments(samples, RATE);
  assert.ok(pieces.length >= 3);
  assert.equal(pieces[0]!.startSample, 0);
  assert.equal(pieces.at(-1)!.endSample, samples.length);
  for (let i = 1; i < pieces.length; i += 1) {
    assert.equal(pieces[i]!.startSample, pieces[i - 1]!.endSample, `piece ${i} does not continue from ${i - 1}`);
  }
});

test("no piece is longer than the mode allows", () => {
  const samples = signal(400, [55, 115, 175, 235, 295, 355]);
  for (const mode of ["minute", "long"] as const) {
    const cap = mode === "long" ? LONG_PIECE_SECONDS : MAX_PIECE_SECONDS;
    for (const piece of planSegments(samples, RATE, planOptionsFor(mode))) {
      const seconds = (piece.endSample - piece.startSample) / RATE;
      assert.ok(seconds <= cap + 0.001, `${mode}: a piece of ${seconds}s against a cap of ${cap}s`);
    }
  }
});

test("the long mode makes far fewer pieces, which is its whole point", () => {
  const samples = signal(39 * 60, [300, 900, 1500, 2100]);
  const minute = planSegments(samples, RATE, planOptionsFor("minute")).length;
  const long = planSegments(samples, RATE, planOptionsFor("long")).length;
  // More than one a minute, because a piece ends at the quiet point BEFORE the
  // cap rather than at it — 39 minutes comes to about 50 pieces, not 39.
  assert.ok(minute >= 39 && minute <= 60, `${minute} minute pieces for 39 minutes`);
  assert.equal(long, 5);
  assert.ok(minute > long * 7, "the long mode should be most of an order of magnitude fewer requests");
  assert.ok(estimateMinutes(long, SECONDS_PER_PIECE.long) < estimateMinutes(minute, SECONDS_PER_PIECE.minute));
});

test("the mode is read back off the pieces, so a resumed upload cuts the same way", () => {
  const samples = signal(1200, [300, 600, 900]);
  for (const mode of ["minute", "long"] as const) {
    assert.equal(inferMode(planSegments(samples, RATE, planOptionsFor(mode))), mode);
  }
  assert.equal(inferMode([]), "minute");
});

test("a WAV halves at a byte, and both halves are still WAVs", () => {
  const wav = new Uint8Array(encodeWav(signal(30), RATE));
  assert.ok(isKernelWav(wav));
  assert.equal(wavDurationMs(wav), 30_000);
  const halves = halveWav(wav);
  assert.ok(halves, "a thirty-second WAV should be worth halving");
  const [a, b] = halves!;
  assert.ok(isKernelWav(a) && isKernelWav(b));
  assert.equal(wavDurationMs(a) + wavDurationMs(b), 30_000);
});

test("a WAV too short to be worth halving is refused rather than mangled", () => {
  assert.equal(halveWav(new Uint8Array(encodeWav(signal(1), RATE))), null);
  assert.equal(halveWav(new Uint8Array(10)), null);
});

test("downmixing and resampling reach the kernel's rate", () => {
  const left = signal(2);
  const right = signal(2);
  const mono = toMono([left, right]);
  assert.equal(mono.length, left.length);
  const out = downsample(mono, 48_000, 16_000);
  assert.equal(out.length, Math.floor(mono.length / 3));
});

/** Packets the way AudioEncoder hands them over: twenty milliseconds each. */
function opusPackets(count: number) {
  const perPacket = Math.round(0.02 * OPUS_GRANULE_RATE);
  return Array.from({ length: count }, (_, i) => ({
    data: new Uint8Array(Array.from({ length: 40 }, (_, j) => (i + j) % 251)),
    granule: (i + 1) * perPacket,
  }));
}

test("the Ogg stream carries its headers and every page checksums", () => {
  const ogg = muxOpusOgg(opusPackets(300), { channels: 1, inputRate: RATE });
  assert.ok(isOgg(ogg));
  const pages = parseOggPages(ogg);
  assert.ok(pages.length >= 4);
  assert.ok(pages.every((p) => p.crcOk), "a page failed its own CRC");
  assert.equal(String.fromCharCode(...pages[0]!.segments[0]!.subarray(0, 8)), "OpusHead");
  assert.equal(String.fromCharCode(...pages[1]!.segments[0]!.subarray(0, 8)), "OpusTags");
  assert.equal(pages.at(-1)!.flags & 0x04, 0x04, "the last page must be marked as the end");
  assert.equal(oggDurationMs(ogg), 6_000);
});

test("an Ogg halves at a page, and each half is a whole stream again", () => {
  const ogg = muxOpusOgg(opusPackets(300), { channels: 1, inputRate: RATE });
  const halves = halveOgg(ogg);
  assert.ok(halves, "six pages should be halveable");
  const [a, b] = halves!;
  for (const half of [a, b]) {
    const pages = parseOggPages(half);
    assert.ok(pages.every((p) => p.crcOk), "a half has a page that fails its CRC");
    assert.equal(String.fromCharCode(...pages[0]!.segments[0]!.subarray(0, 8)), "OpusHead");
    assert.equal(pages.at(-1)!.flags & 0x04, 0x04);
    // Renumbered from zero, or a decoder treats the stream as having holes.
    pages.forEach((p, i) => assert.equal(p.sequence, i));
  }
  // The second half is rebased to start at zero.
  assert.ok(oggDurationMs(a) > 0 && oggDurationMs(b) > 0);
  assert.equal(oggDurationMs(a) + oggDurationMs(b), 6_000);
});

test("a stream with too few pages is refused rather than cut to nothing", () => {
  assert.equal(halveOgg(muxOpusOgg(opusPackets(2), { channels: 1, inputRate: RATE })), null);
  assert.equal(halveOgg(new Uint8Array([1, 2, 3])), null);
});
