import { NextResponse } from "next/server";
import { allowed } from "@/lib/auth";
import { labelSpeakers } from "@/lib/meetings/speakers";

/**
 * Telling the two speakers apart. One press, one or a few model calls.
 *
 * A route rather than a server action because it can take a couple of minutes on
 * a long meeting, and a server action that long entangles every other navigation
 * in the same React transition — the panel stops responding to its own links
 * while it waits.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed())) return NextResponse.json({ error: "denied" }, { status: 403 });
  const { id } = await params;

  const result = await labelSpeakers(id);
  if (!result.ok) {
    // A missing database or key is this deployment's own configuration, not a
    // bad gateway — the same status the segments route answers for it.
    const status =
      result.reason === "over_ceiling" ? 429
      : result.reason === "no_meeting" ? 404
      : result.reason === "no_database" || result.reason === "no_key" ? 503
      : result.reason === "no_transcript" ? 409
      : 502;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }
  return NextResponse.json({
    ok: true,
    turns: result.dialogue.turns.length,
    sentences: result.sentences,
    costUsd: result.costUsd,
  });
}
