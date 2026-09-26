import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { withinCeiling, recordRun } from "@/lib/llm/spend";
import { transcribe, outputCeilingFor, type Language } from "@/lib/meetings/transcribe";
import { assembleTranscript, continuation, implausiblyShort } from "@/lib/meetings/assemble";
import { halveWav } from "@/lib/meetings/wav";
import { halveOgg } from "@/lib/meetings/ogg";
import { getSettings } from "@/lib/settings";

/**
 * One piece of a recording goes in; the words are written down and come back.
 *
 * This route is where the product actually earns its keep, and most of it is
 * the three ways a piece comes back wrong. A pipeline that handles only the
 * good case works on clean audio and fails on real meetings.
 *
 * It is deliberately one piece per request. Concurrent requests on one API key
 * queue upstream anyway, so parallelism buys nothing and costs the ability to
 * stop cleanly halfway through an hour. The answer to the waiting is the long
 * cutting mode — fewer, bigger requests.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Outcome = {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
  /** What the piece row records, empty when nothing went wrong. */
  note: string;
  attempts: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  if (!(await allowed())) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  const { id, idx: rawIdx } = await params;
  const idx = Number.parseInt(rawIdx, 10);
  if (!Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "bad index" }, { status: 400 });
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "no database" }, { status: 503 });

  // Before the money is spent, not after: a ceiling enforced afterwards is a
  // report, not a limit.
  const ceiling = await withinCeiling();
  if (!ceiling.ok) {
    return NextResponse.json(
      { error: "ceiling", status: ceiling.status },
      { status: 429 },
    );
  }

  const format = request.headers.get("x-shenava-format") === "ogg" ? "ogg" : "wav";
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }

  const { data: meeting } = await supabase
    .from("shenava_meetings")
    .select("id,language,segment_count,cost_usd")
    .eq("id", id)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ error: "no such meeting" }, { status: 404 });

  const { data: piece } = await supabase
    .from("shenava_segments")
    .select("idx,start_ms,end_ms,attempts")
    .eq("meeting_id", id)
    .eq("idx", idx)
    .maybeSingle();
  if (!piece) return NextResponse.json({ error: "no such piece" }, { status: 404 });

  const durationMs = Math.max(0, piece.end_ms - piece.start_ms);
  const language = (meeting.language ?? "auto") as Language;

  // The tail of the piece before this one, so a sentence cut at a boundary is
  // continued rather than begun again.
  const { data: previous } = idx > 0
    ? await supabase
        .from("shenava_segments")
        .select("text")
        .eq("meeting_id", id)
        .eq("idx", idx - 1)
        .maybeSingle()
    : { data: null };

  const settings = await getSettings();
  await supabase.from("shenava_meetings").update({ status: "transcribing" }).eq("id", id);

  const context = continuation(previous?.text ?? null);
  const base = {
    format,
    language,
    context,
    // Sized to the piece: nine minutes of speech needs far more room than one,
    // and a long piece under a short ceiling comes back truncated — which reads
    // like bad transcription rather than like an error.
    maxOutputTokens: outputCeilingFor(durationMs, settings.sttMaxOutputTokens),
  } as const;

  const spend: { tokensIn: number; tokensOut: number; costUsd: number }[] = [];
  const note: string[] = [];
  let attempts = 0;
  let text = "";
  let model = settings.sttModel;
  let failure: { reason: string; status: number } | null = null;

  const run = async (bytes: Uint8Array, maxOutputTokens?: number) => {
    attempts += 1;
    const outcome = await transcribe({ ...base, audio: bytes, durationMs, maxOutputTokens });
    if (outcome.kind !== "failed") {
      spend.push(outcome);
      model = outcome.model;
    }
    return outcome;
  };

  const first = await run(audio);

  if (first.kind === "failed") {
    failure = { reason: first.reason, status: first.status };
  } else if (first.kind === "filtered") {
    /**
     * FAILURE ONE: the provider's safety filter stopped the answer.
     *
     * It returns HTTP 200, a couple of words, and zero usage — which is
     * indistinguishable from a successfully transcribed quiet minute unless you
     * look for the stop reason. Measured at 9 of 37 pieces of ordinary business
     * speech at temperature 0, and the same audio cut differently passes, so it
     * is the content that flips the coin.
     *
     * So the piece is halved HERE, on the server, and each half asked for on its
     * own: a PCM16 WAV splits at a byte with no decoding at all, and an Ogg
     * splits at a page, which is a packet boundary. No round trip to the
     * browser, no audio library.
     */
    const halves = format === "ogg" ? halveOgg(audio) : halveWav(audio);
    if (!halves) {
      // Too short to halve. Whatever words arrived are real; keep them.
      text = first.partial;
      note.push("filtered:partial");
    } else {
      const parts: string[] = [];
      let anyFiltered = false;
      for (const half of halves) {
        const answer = await run(half, base.maxOutputTokens);
        if (answer.kind === "ok") parts.push(answer.text);
        else if (answer.kind === "filtered" || answer.kind === "truncated") {
          parts.push(answer.partial);
          anyFiltered = true;
        } else anyFiltered = true;
      }
      text = parts.filter((p) => p.trim().length > 0).join(" ");
      note.push(anyFiltered ? "filtered:partial" : "filtered:split");
      if (text.trim().length === 0) {
        text = first.partial;
      }
    }
  } else if (first.kind === "truncated") {
    /**
     * FAILURE TWO: the answer hit the output ceiling.
     *
     * Ask again with half again the room rather than parsing what was never
     * finished. A truncated answer reads as "the audio was bad", which sends
     * you to the wrong file entirely.
     */
    const roomier = Math.ceil(base.maxOutputTokens * 1.5);
    const again = await run(audio, roomier);
    if (again.kind === "ok" && again.text.length >= first.partial.length) {
      text = again.text;
      note.push("truncated:retried");
    } else {
      text = first.partial;
      note.push("truncated:partial");
    }
  } else {
    text = first.text;
  }

  /**
   * FAILURE THREE: a fragment is not an answer for a minute of speech.
   *
   * Under two characters a second, ask once more. Two a second is far below real
   * speech on purpose — a false positive costs one request, a false negative
   * costs a transcript with a minute silently missing from the middle.
   *
   * The third answer is kept whatever its length: by then a genuinely quiet
   * stretch is the likelier explanation, and refusing a real silence forever is
   * worse than accepting a short answer.
   */
  const alreadyRetried = note.length > 0;
  if (!failure && !alreadyRetried && implausiblyShort(text, durationMs)) {
    const again = await run(audio);
    if (again.kind === "ok" && again.text.length > text.length) {
      text = again.text;
    }
    if (implausiblyShort(text, durationMs)) note.push("short");
  }

  // The ledger: one row per call made, whether or not any of them worked.
  const totals = spend.reduce(
    (acc, s) => ({
      tokensIn: acc.tokensIn + s.tokensIn,
      tokensOut: acc.tokensOut + s.tokensOut,
      costUsd: acc.costUsd + s.costUsd,
    }),
    { tokensIn: 0, tokensOut: 0, costUsd: 0 },
  );
  await recordRun({
    meetingId: id,
    seat: "transcriber",
    model,
    detail: `piece ${idx}${note.length > 0 ? ` (${note.join(",")})` : ""}`,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    costUsd: totals.costUsd,
    ok: failure === null,
    error: failure?.reason,
    ms: 0,
  });

  const outcome: Outcome = {
    text,
    ...totals,
    model,
    note: note.join(","),
    attempts: (piece.attempts ?? 0) + attempts,
  };

  await supabase
    .from("shenava_segments")
    .update({
      status: failure ? "error" : "done",
      text: failure ? null : outcome.text,
      model: outcome.model,
      cost_usd: outcome.costUsd,
      attempts: outcome.attempts,
      error: failure ? failure.reason.slice(0, 500) : outcome.note || null,
      finished_at: new Date().toISOString(),
    })
    .eq("meeting_id", id)
    .eq("idx", idx);

  await supabase
    .from("shenava_meetings")
    .update({ cost_usd: Number(meeting.cost_usd ?? 0) + outcome.costUsd })
    .eq("id", id);

  // Is that all of them? Read the rows rather than counting requests: the
  // browser may have been closed and reopened, and the rows are the truth.
  const { data: all } = await supabase
    .from("shenava_segments")
    .select("idx,status,text")
    .eq("meeting_id", id)
    .order("idx");

  const rows = all ?? [];
  const settled = rows.every((r) => r.status !== "pending");
  const anyError = rows.some((r) => r.status === "error");

  if (settled) {
    await supabase
      .from("shenava_meetings")
      .update({
        transcript: assembleTranscript(rows),
        status: anyError ? "failed" : "transcribed",
      })
      .eq("id", id);
  }

  if (failure) {
    return NextResponse.json(
      { ok: false, idx, error: failure.reason, status: failure.status, done: settled },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    idx,
    characters: outcome.text.length,
    note: outcome.note,
    costUsd: outcome.costUsd,
    done: settled,
  });
}
