"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { timing } from "@mazarix/voice-kernel";
import { useRouter } from "@/i18n/navigation";
import { sha256Hex, planOptionsFor, planSegments, type PieceMode } from "@/lib/meetings/segments";
import { downsample, toMono } from "@/lib/meetings/wav-encode";
import { sendPieces } from "@/lib/meetings/send";
import { describeError } from "@/lib/describe-error";
import { PieceMarks, type Mark } from "./piece-marks";
import { Upload, Loader2, AlertTriangle } from "lucide-react";

/**
 * Finishing a meeting that was left half-sent.
 *
 * WHY IT ASKS FOR THE FILE AGAIN. The audio was never stored — not here, not in
 * the database, not anywhere — so resuming a half-finished meeting means the
 * person points at the same recording again. That is the cost of the privacy
 * claim and it is worth stating on the page rather than hiding.
 *
 * It appears only when something is actually left to send. The first pass does
 * not come through here: the create form still holds the samples it decoded
 * and sends them itself, so a meeting made and finished in one sitting asks
 * for the file exactly once.
 *
 * The hash is how "the same recording" is checked. Cutting is deterministic, so
 * the same bytes produce the same pieces and piece 7 is the same seven seconds
 * it was yesterday. A different file would silently fill index 7 with somebody
 * else's audio, which is why the hash is compared before a single byte is sent.
 *
 * The sending itself is `lib/meetings/send`, shared with the create form.
 */

/**
 * The four ways this can end badly. They are kept apart because they send the
 * reader to four different places: the wrong file, a changed cut, a recording
 * this browser cannot open, and a browser that gave out partway through the
 * sending. One message for all four — which is what a single catch produces —
 * points at the file when the fault was the encoder.
 */
type Problem = "mismatch" | "replanned" | "undecodable" | "sendFailed";

export function Listener({
  meetingId,
  sha256,
  mode,
  pending,
  pieceCount,
}: {
  meetingId: string;
  sha256: string;
  mode: PieceMode;
  pending: number[];
  pieceCount: number;
}) {
  const t = useTranslations("meeting");
  const router = useRouter();

  const [marks, setMarks] = useState<Mark[]>(pending.map((idx) => ({ idx, state: "waiting" })));
  const [problem, setProblem] = useState<Problem | null>(null);
  /** The machine's own words, under the sentence. Not translated: it is a clue. */
  const [detail, setDetail] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const mark = (idx: number, state: Mark["state"], note?: string) =>
    setMarks((current) => current.map((m) => (m.idx === idx ? { ...m, state, note } : m)));

  const send = async (file: File) => {
    setProblem(null);
    setDetail(null);
    setRunning(true);
    stop.current = false;
    const context = new AudioContext();
    // Everything up to here is the file being opened; everything after is the
    // sending. A throw means something different on each side of that line.
    let opened = false;
    try {
      const bytes = await file.arrayBuffer();
      const hash = await sha256Hex(bytes);
      if (sha256 && hash !== sha256) {
        // Refused before anything is sent. A different file would fill the
        // waiting indices with audio from somewhere else in the recording.
        setProblem("mismatch");
        return;
      }

      const decoded = await context.decodeAudioData(bytes);
      opened = true;
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c += 1) channels.push(decoded.getChannelData(c));
      const samples = downsample(toMono(channels), decoded.sampleRate, timing.audio.sampleRate);

      // The same plan the create form made, because the function is pure.
      const pieces = planSegments(samples, timing.audio.sampleRate, planOptionsFor(mode));
      if (pieces.length !== pieceCount) {
        setProblem("replanned");
        return;
      }

      await sendPieces({
        meetingId,
        mode,
        samples,
        pieces,
        indices: pending,
        mark,
        stopped: () => stop.current,
      });
      router.refresh();
    } catch (error) {
      setProblem(opened ? "sendFailed" : "undecodable");
      setDetail(describeError(error));
    } finally {
      setRunning(false);
      void context.close().catch(() => {});
    }
  };

  const done = marks.filter((m) => m.state === "done").length;

  return (
    <div
      className="mt-6 p-5"
      style={{
        background: "var(--paper-raised)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-panel)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <Upload className="h-4 w-4" style={{ color: "var(--warm)" }} />
        <h2 className="text-sm">{t("resumeTitle")}</h2>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {t("resumeBody", { pending: pending.length, total: pieceCount })}
      </p>

      <label className="mt-4 block">
        <input
          type="file"
          accept="audio/*"
          disabled={running}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
          className="w-full rounded-lg px-3 py-2.5 text-sm file:me-3 file:rounded-full file:border-0 file:px-4 file:py-1.5 file:text-sm"
          style={{ background: "var(--paper-sunken)", border: "1px solid var(--line)" }}
        />
      </label>

      {problem && (
        <p className="mt-3 flex items-start gap-2 text-sm" style={{ color: "var(--color-bad)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            {t(problem)}
            {detail && (
              <code className="mt-1 block text-xs break-words" style={{ color: "var(--ink-faint)" }}>
                {detail}
              </code>
            )}
          </span>
        </p>
      )}

      {running && (
        <p className="mt-3 flex items-center gap-2 text-sm tnum" style={{ color: "var(--ink-soft)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("sending", { done, total: marks.length })}
        </p>
      )}

      <PieceMarks marks={marks} />
    </div>
  );
}
