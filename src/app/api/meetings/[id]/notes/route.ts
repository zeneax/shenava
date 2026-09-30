import { NextResponse } from "next/server";
import { z } from "zod";
import { allowed } from "@/lib/auth";
import { draftNotes } from "@/lib/meetings/notes";
import { proposeSection } from "@/lib/meetings/rewrite";

/**
 * The draft: drawn whole and saved, or one section PROPOSED and not saved.
 *
 * One route for both because they are the same call to the same seat with a
 * different amount of material, and splitting them would duplicate the refusal
 * handling — which is the part that matters, since a refusal here is what the
 * reviewer sees.
 *
 * THE TWO DIFFER IN WHAT THEY LEAVE BEHIND. A whole redraw replaces the draft,
 * because there is no useful way to show a reviewer twelve sections side by side
 * and ask which to keep. A single section comes back as a proposal with the
 * lines it would replace, and nothing is written until the reviewer accepts it
 * through `acceptSection`.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    // Any key the meeting's template names, plus `title`. The route does not
    // hold the list — the template does, and `proposeSection` refuses a key
    // that template has never heard of.
    section: z.string().min(1).max(40).optional(),
    instruction: z.string().max(2000).optional(),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed())) return NextResponse.json({ error: "denied" }, { status: 403 });
  const { id } = await params;

  const raw: unknown = await request.json().catch(() => ({}));
  const body = BodySchema.safeParse(raw);
  if (!body.success) {
    const first = body.error.issues[0];
    return NextResponse.json(
      { ok: false, reason: "invalid", detail: first ? `${first.path.join(".")}: ${first.code}` : "unreadable" },
      { status: 400 },
    );
  }

  const result = body.data.section
    ? await proposeSection(id, body.data.section, body.data.instruction ?? "")
    : await draftNotes(id, { instruction: body.data.instruction });

  if (!result.ok) {
    const status =
      result.reason === "over_ceiling" ? 429
      : result.reason === "no_meeting" ? 404
      : result.reason === "no_database" || result.reason === "no_key" ? 503
      : result.reason === "no_transcript" || result.reason === "no_dialogue" ? 409
      : 502;
    return NextResponse.json({ ok: false, reason: result.reason, detail: result.detail }, { status });
  }

  return NextResponse.json({
    ok: true,
    costUsd: result.costUsd,
    proposal: "proposal" in result ? result.proposal : null,
  });
}
