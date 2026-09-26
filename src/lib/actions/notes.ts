"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import {
  MeetingNotesSchema, REWRITABLE_SECTIONS, sectionValueSchema, withSection,
} from "@/lib/meetings/notes-schema";

/**
 * The reviewer's own hands: editing a section by typing, and deciding.
 *
 * Neither calls a model. A reviewer who knows the sentence they want should not
 * have to ask for it twice.
 */

const EditSchema = z
  .object({
    id: z.string().uuid(),
    section: z.enum(REWRITABLE_SECTIONS),
    lang: z.enum(["fa", "en"]),
    /** Lines for a list section, a string for the title and summary. */
    value: z.unknown(),
  })
  .strict();

export type EditResult = { ok: boolean; reason?: string };

export async function saveSection(input: unknown): Promise<EditResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first ? `${first.path.join(".")}: ${first.code}` : "invalid" };
  }

  // The section's own schema decides whether what was typed is a valid value for
  // it, so a list section cannot be saved as a paragraph by accident.
  const value = sectionValueSchema(parsed.data.section).safeParse(parsed.data.value);
  if (!value.success) {
    const first = value.error.issues[0];
    return { ok: false, reason: first ? `value: ${first.code}` : "value: invalid" };
  }

  const supabase = db();
  if (!supabase) return { ok: false, reason: "no database" };
  const { data } = await supabase
    .from("shenava_meetings")
    .select("notes")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const held = data?.notes ? MeetingNotesSchema.safeParse(data.notes) : null;
  if (!held?.success) return { ok: false, reason: "no draft" };

  // Only the edited edition changes, and the other one's KEY IS ABSENT rather
  // than undefined — `withSection` skips a language it was not given, and an
  // `undefined` would have parsed as that section's empty default and erased it.
  const next = withSection(held.data, parsed.data.section, {
    [parsed.data.lang]: value.data,
  } as Partial<Record<"fa" | "en", unknown>>);

  await supabase
    .from("shenava_meetings")
    .update({
      notes: next,
      notes_edited_at: new Date().toISOString(),
      draft_status: "pending",
      draft_decided_at: null,
    })
    .eq("id", parsed.data.id);
  revalidatePath(`/app/m/${parsed.data.id}`);
  return { ok: true };
}

const DecideSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["pending", "approved", "rejected"]),
  })
  .strict();

export async function decideDraft(input: unknown): Promise<EditResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = db();
  if (!supabase) return { ok: false, reason: "no database" };

  const { error } = await supabase
    .from("shenava_meetings")
    .update({
      draft_status: parsed.data.status,
      draft_decided_at: parsed.data.status === "pending" ? null : new Date().toISOString(),
    })
    .eq("id", parsed.data.id);
  revalidatePath(`/app/m/${parsed.data.id}`);
  return error ? { ok: false, reason: error.message } : { ok: true };
}
