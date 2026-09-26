"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { timing } from "@mazarix/voice-kernel";
import { useRouter } from "@/i18n/navigation";
import { sha256Hex, planOptionsFor, planSegments, type PieceMode } from "@/lib/meetings/segments";
import { downsample, toMono, encodeWav } from "@/lib/meetings/wav-encode";
import { encodeOpusOgg } from "@/lib/meetings/encode";
import { Upload, Loader2, Check, X, AlertTriangle } from "lucide-react";

/**
 * Sending the pieces, one at a time.
 *
 * WHY IT ASKS FOR THE FILE AGAIN. The audio was never stored — not here, not in
 * the database, not anywhere — so resuming a half-finished meeting means the
 * person points at the same recording again. That is the cost of the privacy
 * claim and it is worth stating on the page rather than hiding.
 *
 * The hash is how "the same recording" is checked. Cutting is deterministic, so
 * the same bytes produce the same pieces and piece 7 is the same seven seconds
 * it was yesterday. A different file would silently fill index 7 with somebody
 * else's audio, which is why the hash is compared before a single byte is sent.
 *
 * One request at a time, in index order, awaiting each. Concurrent requests on
 * one API key queue upstream anyway.
 */

type Row = { idx: number; state: "waiting" | "sending" | "done" | "error"; note?: string };

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

  const [rows, setRows] = useState<Row[]>(pending.map((idx) => ({ idx, state: "waiting" })));
  const [problem, setProblem] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const mark = (idx: number, state: Row["state"], note?: string) =>
    setRows((current) => current.map((r) => (r.idx === idx ? { ...r, state, note } : r)));

  const send = async (file: File) => {
    setProblem(null);
    setRunning(true);
    stop.current = false;
    const context = new AudioContext();
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
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c += 1) channels.push(decoded.getChannelData(c));
      const samples = downsample(toMono(channels), decoded.sampleRate, timing.audio.sampleRate);

      // The same plan the create form made, because the function is pure.
      const pieces = planSegments(samples, timing.audio.sampleRate, planOptionsFor(mode));
      if (pieces.length !== pieceCount) {
        setProblem("replanned");
        return;
      }

      for (const idx of pending) {
        if (stop.current) break;
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
        if (response.ok && answer.ok) mark(idx, "done", answer.note || undefined);
        else {
          mark(idx, "error", answer.error ?? `HTTP ${response.status}`);
          // A ceiling refusal or a revoked key will refuse every remaining
          // piece the same way, so stop rather than spending the next fifty
          // requests proving it.
          if (response.status === 429 || response.status === 403) break;
        }
      }
      router.refresh();
    } catch {
      setProblem("undecodable");
    } finally {
      setRunning(false);
      void context.close().catch(() => {});
    }
  };

  const done = rows.filter((r) => r.state === "done").length;

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
          {t(problem === "mismatch" ? "mismatch" : problem === "replanned" ? "replanned" : "undecodable")}
        </p>
      )}

      {running && (
        <p className="mt-3 flex items-center gap-2 text-sm tnum" style={{ color: "var(--ink-soft)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("sending", { done, total: rows.length })}
        </p>
      )}

      {/* One mark per piece still to send. It is the only honest progress bar
          available: a piece is done when the server says it is written down. */}
      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {rows.map((row) => (
            <span
              key={row.idx}
              title={row.note ?? String(row.idx + 1)}
              className="flex h-6 w-6 items-center justify-center rounded text-[10px] tnum"
              style={{
                background:
                  row.state === "done"
                    ? "var(--color-good)"
                    : row.state === "error"
                      ? "var(--color-bad)"
                      : row.state === "sending"
                        ? "var(--warm)"
                        : "var(--paper-sunken)",
                color: row.state === "waiting" ? "var(--ink-faint)" : "var(--paper-raised)",
              }}
            >
              {row.state === "done" ? <Check className="h-3 w-3" /> : row.state === "error" ? <X className="h-3 w-3" /> : row.idx + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
