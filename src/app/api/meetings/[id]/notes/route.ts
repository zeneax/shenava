import { NextResponse } from "next/server";
import { z } from "zod";
import { allowed } from "@/lib/auth";
import { draftNotes } from "@/lib/meetings/notes";
import { rewriteSection } from "@/lib/meetings/rewrite";
import { REWRITABLE_SECTIONS } from "@/lib/meetings/notes-schema";

/**
 * The draft: drawn whole, or one section written again.
 *
 * One route for both because they are the same call to the same seat with a
 * different amount of material, and splitting them would duplicate the refusal
 * handling — which is the part that matters, since a refusal here is what the
 * reviewer sees.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    section: z.enum(REWRITABLE_SECTIONS).optional(),
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
    ? await rewriteSection(id, body.data.section, body.data.instruction ?? "")
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

  return NextResponse.json({ ok: true, costUsd: result.costUsd, section: body.data.section ?? null });
}
