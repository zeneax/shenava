"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { timing } from "@mazarix/voice-kernel";
import { useRouter } from "@/i18n/navigation";
import {
  planSegments,
  planOptionsFor,
  estimateMinutes,
  sha256Hex,
  SECONDS_PER_PIECE,
  MAX_MEETING_SECONDS,
  type PieceMode,
  type Segment,
} from "@/lib/meetings/segments";
import { canEncodeOpus } from "@/lib/meetings/encode";
import { downsample, toMono } from "@/lib/meetings/wav-encode";
import { createMeeting } from "@/lib/actions/meetings";
import { sendPieces } from "@/lib/meetings/send";
import { describeError } from "@/lib/describe-error";
import { PieceMarks, type Mark } from "./piece-marks";
import { FileAudio, Loader2, AlertTriangle, Scissors } from "lucide-react";

/**
 * The form, and the browser's own plan of what it is about to do.
 *
 * Choosing a file does not upload it. The file is decoded here, downmixed to
 * mono at the kernel's rate, and cut — and what the person sees before they
 * commit to anything is the real plan: how many pieces, how long each one is,
 * and roughly how long the sending will take. That number is the difference
 * between the two modes, so showing it before the choice is the point.
 *
 * Nothing about the audio leaves this component. What is posted is the plan —
 * the piece boundaries in milliseconds — plus the file's shape and its hash.
 *
 * WHY IT SENDS THE PIECES HERE TOO. The samples are already decoded and held
 * in this component, so the moment the rows exist the sending can begin. A
 * first pass therefore asks for the recording exactly once. The listener on
 * the meeting page asks again only when the samples are genuinely gone — a
 * closed tab, another machine — which is what "the audio is never stored"
 * actually costs, and no more than that.
 */

type Plan = {
  pieces: Segment[];
  durationMs: number;
  sha256: string;
  name: string;
  bytes: number;
};

type Problem = "too-long" | "undecodable" | null;

export function NewMeetingForm() {
  const t = useTranslations("new");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [language, setLanguage] = useState<"farsi" | "english" | "auto">("auto");
  const [mode, setMode] = useState<PieceMode>("long");
  const [opusReady, setOpusReady] = useState<boolean | null>(null);

  const samples = useRef<{ data: Float32Array; rate: number } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [reading, setReading] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [sending, setSending] = useState(false);
  /**
   * Creating the rows and sending the pieces are one motion to the person, and
   * plain state is what holds it — NOT `useTransition`.
   *
   * That motion is an hour long on a long meeting. An await that long inside a
   * transition entangles every other transition in the application, and every
   * door in the rail navigates in one, so the whole dashboard stops answering
   * its own links until the last piece lands. The symptom is not a slow page:
   * it is a click that does nothing whatsoever — no skeleton, no lit door — for
   * the length of the meeting, which reads as the browser having hung.
   * `run-speakers.tsx` and `draft-view.tsx` keep their model calls out of a
   * transition for the same reason; this is the longest await in the product
   * and was the last one still inside one.
   */
  const [saving, setSaving] = useState(false);
  const busy = saving || sending;

  /**
   * Ask the browser once, on mount, whether it can encode Opus at all. Safari
   * cannot, at the time of writing — so the long mode is disabled with a
   * sentence saying why rather than offered and failed halfway through an
   * hour-long upload. Long pieces are the default, so on such a browser the
   * choice falls back to minute pieces: the default must never be the disabled
   * one. Nothing is decoded yet at mount, so there is no plan to re-cut.
   */
  useEffect(() => {
    let alive = true;
    void canEncodeOpus(timing.audio.sampleRate)
      .then((ok) => {
        if (!alive) return;
        setOpusReady(ok);
        if (!ok) setMode("minute");
      })
      // A browser that cannot answer the question has no encoder to offer.
      .catch(() => {
        if (!alive) return;
        setOpusReady(false);
        setMode("minute");
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Re-cut what is already decoded. Changing mode must not re-read the file.
   *
   * Deliberately not `async`: it awaits nothing, and an `async` function called
   * from a click handler is a promise nobody catches — a throw inside one
   * reaches the window instead of the error boundary.
   */
  const replan = useCallback((next: PieceMode, file?: { name: string; bytes: number; sha: string }) => {
    const held = samples.current;
    if (!held) return;
    const pieces = planSegments(held.data, held.rate, planOptionsFor(next));
    setPlan((previous) => ({
      pieces,
      durationMs: Math.round((held.data.length / held.rate) * 1000),
      sha256: file?.sha ?? previous?.sha256 ?? "",
      name: file?.name ?? previous?.name ?? "",
      bytes: file?.bytes ?? previous?.bytes ?? 0,
    }));
  }, []);

  const onFile = async (file: File | undefined) => {
    setProblem(null);
    setRefusal(null);
    setPlan(null);
    samples.current = null;
    if (!file) return;

    setReading(true);
    const context = new AudioContext();
    try {
      const bytes = await file.arrayBuffer();
      const sha = await sha256Hex(bytes);
      // decodeAudioData consumes the buffer, so the hash is taken first.
      const decoded = await context.decodeAudioData(bytes);
      if (decoded.duration > MAX_MEETING_SECONDS) {
        setProblem("too-long");
        return;
      }
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c += 1) channels.push(decoded.getChannelData(c));
      const mono = downsample(toMono(channels), decoded.sampleRate, timing.audio.sampleRate);
      samples.current = { data: mono, rate: timing.audio.sampleRate };
      replan(mode, { name: file.name, bytes: file.size, sha });
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setProblem("undecodable");
    } finally {
      setReading(false);
      // Closed on every path: an AudioContext left open holds the audio
      // hardware awake and the tab shows as playing.
      void context.close().catch(() => {});
    }
  };

  const chooseMode = (next: PieceMode) => {
    if (busy) return;
    setMode(next);
    replan(next);
  };

  const mark = (idx: number, state: Mark["state"], note?: string) =>
    setMarks((current) => current.map((m) => (m.idx === idx ? { ...m, state, note } : m)));

  /**
   * Whether this form is still on screen. Assigned on mount as well as cleared
   * on unmount: in development the effects run twice, and a flag only cleared
   * would read false for the whole life of the second mount.
   */
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const submit = async () => {
    const held = samples.current;
    if (!plan || !held) return;
    setRefusal(null);

    setSaving(true);
    // Its own catch, because nothing above catches one any more: a transition
    // surfaces a thrown action, a bare await swallows it into the console.
    const result = await createMeeting({
      title,
      clientName,
      language,
      mode,
      audioName: plan.name,
      audioBytes: plan.bytes,
      audioSha256: plan.sha256,
      durationMs: plan.durationMs,
      pieces: plan.pieces.map((p) => ({ idx: p.idx, startMs: p.startMs, endMs: p.endMs })),
    }).catch((error: unknown) => ({
      ok: false as const,
      reason: "write-failed" as const,
      detail: describeError(error),
    }));
    setSaving(false);
    if (!result.ok) {
      setRefusal(result.detail ? `${result.reason} — ${result.detail}` : result.reason);
      return;
    }

    // The rows exist and the samples are still here, so the pieces go now.
    setMarks(plan.pieces.map((piece) => ({ idx: piece.idx, state: "waiting" as const })));
    setSending(true);
    let broke = false;
    try {
      await sendPieces({
        meetingId: result.id,
        mode,
        samples: held.data,
        pieces: plan.pieces,
        indices: plan.pieces.map((piece) => piece.idx),
        mark,
      });
    } catch (error) {
      /**
       * A refused piece is not an exception — `sendPieces` marks it and carries
       * on — so reaching here means the browser itself gave out: its Opus
       * encoder, or the network under the request. Nothing above catches it any
       * more, and an escaped rejection is a red overlay reading `[object
       * Object]` rather than a sentence on the page.
       */
      broke = true;
      setRefusal(describeError(error));
    } finally {
      setSending(false);
    }

    // Staying put on a break, unlike on a refusal: the reason is on this page
    // and the samples are still in this component, so leaving would cost both.
    if (broke) return;

    // Whatever came back, the meeting is where the rest of it happens: the
    // transcript, and — if a piece was refused — the listener offering to
    // send the rest. Landing on the list instead is how a person ends up
    // hunting for the meeting they just made.
    //
    // Only if they are still on this form. Now that the rail answers during the
    // sending, walking off to the meetings list mid-upload is an ordinary thing
    // to do, and a push twenty minutes later would haul them off whatever page
    // they had chosen instead. The loop itself is left running: it still holds
    // the decoded samples, and stopping it would cost them the file again.
    if (live.current) router.push(`/app/m/${result.id}`);
  };

  const sent = marks.filter((m) => m.state === "done").length;

  const minutes = plan ? estimateMinutes(plan.pieces.length, SECONDS_PER_PIECE[mode]) : 0;
  const field = {
    background: "var(--paper-raised)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  } as const;

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-6">
      {/* ── Who and what ─────────────────────────────────────────────────── */}
      <label className="flex flex-col gap-2">
        <span className="text-sm">{t("title")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          className="rounded-lg px-3 py-2.5 text-base"
          style={field}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm">{t("client")}</span>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          maxLength={160}
          className="rounded-lg px-3 py-2.5 text-base"
          style={field}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">{t("language")}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(["auto", "farsi", "english"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLanguage(value)}
              className="rounded-full px-4 py-1.5 text-sm transition-colors duration-200"
              style={{
                background: language === value ? "var(--cool)" : "var(--paper-raised)",
                color: language === value ? "var(--paper-raised)" : "var(--ink-soft)",
                border: "1px solid var(--line)",
              }}
            >
              {t(`lang.${value}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── How it will be cut ───────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">{t("modeLabel")}</legend>
        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("modeNote")}
        </p>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {(["long", "minute"] as const).map((value) => {
            const blocked = busy || (value === "long" && opusReady === false);
            const chosen = mode === value;
            return (
              <button
                key={value}
                type="button"
                disabled={blocked}
                onClick={() => chooseMode(value)}
                className="p-4 text-start transition-colors duration-200 disabled:opacity-55"
                style={{
                  background: chosen ? "var(--paper-raised)" : "transparent",
                  border: `1px solid ${chosen ? "var(--cool)" : "var(--line)"}`,
                  borderRadius: "var(--radius-panel)",
                }}
              >
                <span className="text-sm">{t(`mode.${value}.title`)}</span>
                <span className="mt-1.5 block text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                  {t(`mode.${value}.body`)}
                </span>
                {value === "long" && opusReady === false && (
                  <span className="mt-2 block text-xs leading-relaxed" style={{ color: "var(--warm)" }}>
                    {t("mode.long.unavailable")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── The file, which does not leave the browser ───────────────────── */}
      <label className="flex flex-col gap-2">
        <span className="text-sm">{t("file")}</span>
        <input
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="rounded-lg px-3 py-2.5 text-sm file:me-3 file:rounded-full file:border-0 file:px-4 file:py-1.5 file:text-sm"
          style={field}
        />
        <span className="text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("fileNote")}
        </span>
      </label>

      {/* ── The plan, before anything is sent ───────────────────────────── */}
      {reading && (
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("reading")}
        </p>
      )}

      {problem && (
        <p className="flex items-start gap-2 text-sm" style={{ color: "var(--color-bad)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t(problem === "too-long" ? "tooLong" : "undecodable")}
        </p>
      )}

      {plan && (
        <div
          className="rise p-5"
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--cool)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <Scissors className="h-4 w-4" style={{ color: "var(--warm)" }} />
            <h2 className="text-sm">{t("planTitle")}</h2>
          </div>
          <p className="tnum mt-3 text-sm leading-relaxed">
            {t("planLine", {
              pieces: plan.pieces.length,
              minutes,
              duration: Math.round(plan.durationMs / 60000),
            })}
          </p>
          <p className="tnum mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
            {t("planBytes", { mb: (plan.bytes / 1_048_576).toFixed(1) })}
          </p>

          {/* Each piece as a bar, proportional to its length. The last one is
              short by nature — the recording ends where it ends — and seeing
              that is how a person recognises a plan as sane. */}
          <div className="mt-4 flex gap-[2px]">
            {plan.pieces.map((piece) => (
              <span
                key={piece.idx}
                title={`${piece.idx + 1} · ${Math.round((piece.endMs - piece.startMs) / 1000)}s`}
                className="h-2 rounded-full"
                style={{
                  flex: piece.endMs - piece.startMs,
                  background: "var(--warm)",
                  opacity: 0.75,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {refusal && (
        <p className="text-sm" style={{ color: "var(--color-bad)" }}>
          {t("refused")} <code className="text-xs">{refusal}</code>
        </p>
      )}

      {/* ── The sending, from the samples this page already holds ───────── */}
      {marks.length > 0 && (
        <div
          className="p-5"
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <p className="flex items-center gap-2 text-sm tnum" style={{ color: "var(--ink-soft)" }}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("sending", { done: sent, total: marks.length })}
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
            {t("sendingNote")}
          </p>
          <PieceMarks marks={marks} />
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!plan || busy}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4" />}
          {t("create")}
        </button>
      </div>
    </div>
  );
}
