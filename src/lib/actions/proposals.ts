"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { parseNotes } from "@/lib/meetings/notes-schema";
import { TemplateSchema, templateSections, nextNumber, pour } from "@/lib/meetings/template";

/**
 * An approved draft poured into a template, as a numbered proposal.
 *
 * A SECOND POUR DOES NOT MAKE A SECOND PROPOSAL. It rewrites the one this
 * meeting already produced, keeping its number. A meeting that quietly minted
 * MZP-0007, MZP-0008 and MZP-0009 for the same client because somebody pressed
 * the button three times is a records problem nobody notices for months.
 */
const PourSchema = z
  .object({
    id: z.string().uuid(),
    templateId: z.string().uuid(),
    lang: z.enum(["fa", "en"]),
  })
  .strict();

export type PourResult =
  | { ok: true; number: string; proposalId: string }
  | { ok: false; reason: string };

export async function pourIntoTemplate(input: unknown): Promise<PourResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = PourSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first ? `${first.path.join(".")}: ${first.code}` : "invalid" };
  }
  const { id, templateId, lang } = parsed.data;

  const supabase = db();
  if (!supabase) return { ok: false, reason: "no database" };

  const { data: meeting } = await supabase
    .from("shenava_meetings")
    .select("id,client_name,notes,draft_status,proposal_id")
    .eq("id", id)
    .maybeSingle();
  if (!meeting) return { ok: false, reason: "no such meeting" };

  // Held until the template is read: the draft is read against the sections of
  // the template it is being poured into, so a clause that template names and
  // the draft does not pours empty rather than being silently absent.
  let notes: ReturnType<typeof parseNotes> | null = null;
  // The draft has to have been read by a person first. This is the one gate
  // between a model's sentences and a document with a number on it.
  if (meeting.draft_status !== "approved") return { ok: false, reason: "not approved" };

  const { data: templateRow } = await supabase
    .from("shenava_templates")
    .select("id,name,name_fa,engagement,sections,house_lines,is_default")
    .eq("id", templateId)
    .maybeSingle();
  const template = templateRow ? TemplateSchema.safeParse(templateRow) : null;
  if (!template?.success) return { ok: false, reason: "no such template" };

  notes = meeting.notes ? parseNotes(meeting.notes, templateSections(template.data)) : null;
  if (!notes?.success) return { ok: false, reason: "no draft" };

  const poured = pour(notes.data, template.data, lang);

  // Rewrite the proposal this meeting already has, rather than minting another.
  if (meeting.proposal_id) {
    const { error } = await supabase
      .from("shenava_proposals")
      .update({
        template_id: templateId,
        lang,
        client_name: meeting.client_name,
        title: poured.title,
        body: poured,
      })
      .eq("id", meeting.proposal_id);
    if (error) return { ok: false, reason: error.message };
    const { data: existing } = await supabase
      .from("shenava_proposals")
      .select("number")
      .eq("id", meeting.proposal_id)
      .maybeSingle();
    revalidatePath(`/app/m/${id}`);
    return { ok: true, number: existing?.number ?? "", proposalId: meeting.proposal_id };
  }

  const year = new Date().getFullYear();
  const { data: used } = await supabase.from("shenava_proposals").select("number");
  const number = nextNumber((used ?? []).map((r) => r.number as string), year);

  const { data: created, error } = await supabase
    .from("shenava_proposals")
    .insert({
      number,
      meeting_id: id,
      template_id: templateId,
      lang,
      client_name: meeting.client_name,
      title: poured.title,
      body: poured,
      status: "draft",
    })
    .select("id,number")
    .single();
  if (error || !created) return { ok: false, reason: error?.message ?? "write failed" };

  await supabase
    .from("shenava_meetings")
    .update({ proposal_id: created.id, template_id: templateId })
    .eq("id", id);

  revalidatePath(`/app/m/${id}`);
  return { ok: true, number: created.number as string, proposalId: created.id as string };
}
