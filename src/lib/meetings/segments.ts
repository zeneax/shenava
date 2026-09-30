import { timing } from "@mazarix/voice-kernel";

/**
 * How a long recording becomes pieces the dictation engine will take.
 *
 * Client-safe on purpose — no `server-only`, no database, no DOM. The browser
 * runs this over the decoded samples before anything is uploaded, and the
 * tests run it over a synthetic signal; both have to see the same cuts.
 *
 * WHY IT CUTS AT SILENCE. The engine returns words, not timestamps, so a piece
 * boundary that lands mid-word produces half a word at the end of one piece and
 * half at the start of the next, and neither half is anything. A boundary in a
 * pause produces two whole sentences. So each piece runs as long as the engine
 * allows, and the cut is moved back to the quietest moment in the last stretch
 * before that limit.
 *
 * WHY IT IS DETERMINISTIC. A meeting is an hour of pieces sent one at a time,
 * and a tab closed halfway is ordinary. The server keeps which pieces have
 * returned; the browser, handed the same file again, has to arrive at the same
 * pieces to continue — so nothing here depends on time, randomness or the
 * device, only on the samples.
 */

export type Segment = {
  idx: number;
  startSample: number;
  endSample: number;
  startMs: number;
  endMs: number;
};

export type PlanOptions = {
  /** The longest a piece may be. The kernel's recording cap, never more. */
  maxSeconds?: number;
  /** How far back from the cap to look for a pause. */
  searchBackSeconds?: number;
  /** The window a loudness reading is taken over. */
  frameMs?: number;
};

/** The kernel's own recording cap: what one piece may be. */
export const MAX_PIECE_SECONDS = timing.recording.maxSeconds;

/**
 * The longest meeting the page will take, in seconds.
 *
 * Three hours. The whole recording is decoded in the browser's memory as
 * 32-bit samples at the kernel's rate — about 230 MB an hour — and three hours
 * is where a laptop still copes and a longer meeting is two recordings anyway.
 */
export const MAX_MEETING_SECONDS = 3 * 60 * 60;

export const PLAN_DEFAULTS: Required<PlanOptions> = {
  maxSeconds: MAX_PIECE_SECONDS,
  searchBackSeconds: 20,
  frameMs: 300,
};

/** Root-mean-square loudness of a stretch of samples, in decibels below full scale. */
export function rmsDb(samples: Float32Array, from: number, to: number): number {
  const start = Math.max(0, from);
  const end = Math.min(samples.length, to);
  if (end <= start) return -Infinity;
  let sum = 0;
  for (let i = start; i < end; i += 1) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / (end - start));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * The quietest frame in [from, to), as a sample index at its centre.
 *
 * Ties go to the later frame: a cut nearer the cap makes fewer pieces, and
 * fewer pieces is fewer requests and more context per request.
 */
export function quietestCut(
  samples: Float32Array,
  from: number,
  to: number,
  frameSamples: number,
): number {
  let bestDb = Infinity;
  let bestAt = to;
  for (let start = from; start + frameSamples <= to; start += frameSamples) {
    const db = rmsDb(samples, start, start + frameSamples);
    if (db <= bestDb) {
      bestDb = db;
      bestAt = start + Math.floor(frameSamples / 2);
    }
  }
  return bestAt;
}

/**
 * The pieces, tiling the whole recording with no gap and no overlap.
 *
 * Each piece ends at the quietest moment in the last `searchBackSeconds`
 * before `maxSeconds`, or exactly at `maxSeconds` when the stretch is too
 * short to search. The last piece ends where the recording does, however
 * short that leaves it.
 */
export function planSegments(
  samples: Float32Array,
  sampleRate: number,
  options: PlanOptions = {},
): Segment[] {
  const o = { ...PLAN_DEFAULTS, ...options };
  const max = Math.max(1, Math.floor(o.maxSeconds * sampleRate));
  const back = Math.max(0, Math.floor(o.searchBackSeconds * sampleRate));
  const frame = Math.max(1, Math.floor((o.frameMs / 1000) * sampleRate));
  const total = samples.length;

  const out: Segment[] = [];
  let pos = 0;
  while (pos < total) {
    const hardEnd = Math.min(total, pos + max);
    let end = hardEnd;
    if (hardEnd < total) {
      const from = Math.max(pos + frame, hardEnd - back);
      if (from + frame <= hardEnd) end = quietestCut(samples, from, hardEnd, frame);
    }
    // A cut can never go backwards or fail to advance; the search window
    // starts a frame past `pos`, so this only guards arithmetic.
    if (end <= pos) end = hardEnd;
    out.push({
      idx: out.length,
      startSample: pos,
      endSample: end,
      startMs: Math.round((pos / sampleRate) * 1000),
      endMs: Math.round((end / sampleRate) * 1000),
    });
    pos = end;
  }
  return out;
}

/**
 * The two ways a recording is cut.
 *
 * `minute` is the dictation engine's own shape: WAV pieces no longer than the
 * kernel's cap, about sixty a meeting-hour, sent one after another. `long` is
 * the second way: Opus in Ogg, pieces of up to nine minutes, six or seven an
 * hour — fewer requests, more context for punctuation, and a fraction of the
 * time with the tab open. Nine minutes at 24 kbit/s is about 1.6 MB, which
 * keeps a long piece under the same two-mebibyte cap as a WAV minute.
 *
 * The mode is not stored on the meeting: it is read back from the pieces (a
 * piece longer than the kernel's cap can only be a long one), so a resumed
 * upload plans the same cuts without a column to keep in step.
 */
export const PIECE_MODES = ["minute", "long"] as const;
export type PieceMode = (typeof PIECE_MODES)[number];

export const LONG_PIECE_SECONDS = 9 * 60;
/** Opus, mono, speech: what the browser is asked to encode at. */
export const LONG_PIECE_BITRATE = 24_000;

export function planOptionsFor(mode: PieceMode): Required<PlanOptions> {
  return mode === "long"
    ? { maxSeconds: LONG_PIECE_SECONDS, searchBackSeconds: 120, frameMs: 300 }
    : PLAN_DEFAULTS;
}

/** Which mode a meeting's pieces were cut in. Empty pieces read as `minute`. */
export function inferMode(pieces: ReadonlyArray<{ startMs: number; endMs: number }>): PieceMode {
  return pieces.some((p) => p.endMs - p.startMs > (MAX_PIECE_SECONDS + 1) * 1000) ? "long" : "minute";
}

/** Roughly how long the pieces will take to send, one after another. */
export function estimateMinutes(pieces: number, secondsPerPiece = 12): number {
  return Math.max(1, Math.ceil((pieces * secondsPerPiece) / 60));
}

/** What one piece takes the engine, measured: twelve seconds a minute piece, about forty a long one. */
export const SECONDS_PER_PIECE: Record<PieceMode, number> = { minute: 12, long: 40 };

/**
 * SHA-256 of a file's bytes, as lowercase hex — how a resumed upload proves
 * itself.
 *
 * `crypto.subtle` exists only in a secure context: HTTPS, or `localhost`. Open
 * the dev server from a phone at `http://192.168.…` and it is undefined, so
 * choosing a recording threw a TypeError that the form caught and reported as
 * "could not read the file" — the file was fine. The pure implementation below
 * is used there instead. It must produce the identical digest, because the
 * fingerprint is stored and compared on resume; the test holds it to WebCrypto.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256HexPure(bytes);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* FIPS 180-4, straight from the specification. Unsigned 32-bit throughout:
   a Uint32Array wraps on write, and `>>> 0` keeps the locals unsigned. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/** SHA-256 with no platform API at all. Same digest as `crypto.subtle`; see `sha256Hex`. */
export function sha256HexPure(bytes: ArrayBuffer): string {
  const msg = new Uint8Array(bytes);
  // Pad to a 64-byte block: the message, one 0x80 byte, zeros, then the bit
  // length as a big-endian 64-bit integer. A file is far below 2^53 bits.
  const padded = new Uint8Array((((msg.length + 9 + 63) / 64) | 0) * 64);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = msg.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h[0] ?? 0, b = h[1] ?? 0, c = h[2] ?? 0, d = h[3] ?? 0;
    let e = h[4] ?? 0, f = h[5] ?? 0, g = h[6] ?? 0, hh = h[7] ?? 0;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] ?? 0) + a; h[1] = (h[1] ?? 0) + b; h[2] = (h[2] ?? 0) + c; h[3] = (h[3] ?? 0) + d;
    h[4] = (h[4] ?? 0) + e; h[5] = (h[5] ?? 0) + f; h[6] = (h[6] ?? 0) + g; h[7] = (h[7] ?? 0) + hh;
  }

  return Array.from(h)
    .map((x) => x.toString(16).padStart(8, "0"))
    .join("");
}
