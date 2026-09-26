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

/** SHA-256 of a file's bytes, as lowercase hex — how a resumed upload proves itself. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
