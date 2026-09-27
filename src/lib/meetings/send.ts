import { timing } from "@mazarix/voice-kernel";
import { encodeWav } from "./wav-encode.ts";
import { encodeOpusOgg } from "./encode.ts";
import type { PieceMode, Segment } from "./segments.ts";

/**
 * Sending the pieces, one at a time — the one copy of the cadence.
 *
 * Two screens send: the create form, which still holds the samples it just
 * decoded, and the listener, which has been handed the same file again to
 * finish a meeting left half-sent. They differ only in how they came by the
 * samples, so the rhythm lives here and neither owns a second copy of it. Two
 * copies drift, and the symptom of a drifted copy is a transcript with a hole
 * in it that no test can see.
 *
 * ONE AT A TIME, IN INDEX ORDER, AWAITING EACH. Concurrent requests on a
 * single API key queue upstream anyway, so parallelism buys nothing and costs
 * the ability to stop cleanly.
 *
 * Nothing here touches the file or the plan. The samples are already decoded
 * and the pieces are already cut; this slices, encodes and posts. No audio is
 * kept anywhere on either side of the request.
 */

export type PieceState = "waiting" | "sending" | "done" | "error";

export type SendOutcome = {
  /** The pieces the server wrote down. */
  done: number[];
  /** The pieces it refused, or that never left. */
  failed: number[];
  /** True when the loop gave up early — a ceiling, a revoked key, or a stop. */
  halted: boolean;
};

export async function sendPieces({
  meetingId,
  mode,
  samples,
  pieces,
  indices,
  mark,
  stopped,
}: {
  meetingId: string;
  mode: PieceMode;
  samples: Float32Array;
  pieces: Segment[];
  /** Which indices to send, in the order they should go. */
  indices: number[];
  mark: (idx: number, state: PieceState, note?: string) => void;
  /** Asked before each piece; true ends the run where it stands. */
  stopped?: () => boolean;
}): Promise<SendOutcome> {
  const done: number[] = [];
  const failed: number[] = [];

  for (const idx of indices) {
    if (stopped?.()) return { done, failed, halted: true };
    const piece = pieces[idx];
    if (!piece) continue;
    mark(idx, "sending");

    const slice = samples.subarray(piece.startSample, piece.endSample);
    const body =
      mode === "long"
        ? await encodeOpusOgg(new Float32Array(slice), timing.audio.sampleRate)
        : new Uint8Array(encodeWav(slice, timing.audio.sampleRate));

    const response = await fetch(`/api/meetings/${meetingId}/segments/${idx}`, {
      method: "POST",
      headers: {
        "content-type": mode === "long" ? "audio/ogg" : "audio/wav",
        "x-shenava-format": mode === "long" ? "ogg" : "wav",
      },
      body: new Uint8Array(body),
    });

    const answer = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      note?: string;
      error?: string;
    };

    if (response.ok && answer.ok) {
      mark(idx, "done", answer.note || undefined);
      done.push(idx);
      continue;
    }

    mark(idx, "error", answer.error ?? `HTTP ${response.status}`);
    failed.push(idx);
    // A ceiling refusal or a revoked key will refuse every remaining piece the
    // same way, so stop rather than spending the next fifty requests proving it.
    if (response.status === 429 || response.status === 403) {
      return { done, failed, halted: true };
    }
  }

  return { done, failed, halted: false };
}
