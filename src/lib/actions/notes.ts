"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { parseNotes, withSection, type MeetingNotes } from "@/lib/meetings/notes-schema";
import { readSectionsFor } from "@/lib/meetings/templates-read";
import { TITLE_SECTION } from "@/lib/meetings/rewrite";
import { db as _db } from "@/lib/db";

/**
 * The reviewer's own hands: editing a section by typing, accepting one the
 * model proposed, and deciding.
 *
 * NONE OF THESE CALL A MODEL. A reviewer who knows the sentence they want
 * should not have to ask for it twice, and accepting a proposal is a write, not
 * a second opinion — the model has already been paid for that answer.
 */

const EditSchema = z
  .object({
    id: z.string().uuid(),
    section: z.string().min(1).max(40),
    lang: z.enum(["fa", "en"]),
    /** Lines for a list section, a string for prose, an object for phases. */
    value: z.unknown(),
  })
  .strict();

/**
 * The meeting's draft, its sections, and the definition of the one being
 * changed — the three things every write below needs, read once.
 */
async function open(id: string, key: string) {
  const supabase = _db();
  if (!supabase) return { ok: false as const, reason: "no database" };
  const { data } = await supabase
    .from("shenava_meetings")
    .select("notes,template_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false as const, reason: "no such meeting" };

  const sections = await readSectionsFor((data.template_id as string | null) ?? null);
  const section = [TITLE_SECTION, ...sections].find((s) => s.key === key);
  if (!section) return { ok: false as const, reason: `no section «${key}» on this template` };

  const held = data.notes ? parseNotes(data.notes, sections) : null;
  if (!held?.success) return { ok: false as const, reason: "no draft" };
  return { ok: true as const, supabase, notes: held.data as MeetingNotes, section };
}

/** Every write here returns the draft to pending: rewritten means unreviewed. */
async function store(supabase: ReturnType<typeof _db>, id: string, notes: MeetingNotes) {
  await supabase!
    .from("shenava_meetings")
    .update({
      notes,
      notes_edited_at: new Date().toISOString(),
      draft_status: "pending",
      draft_decided_at: null,
    })
    .eq("id", id);
  revalidatePath(`/app/m/${id}`);
}

export type EditResult = { ok: boolean; reason?: string };

export async function saveSection(input: unknown): Promise<EditResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first ? `${first.path.join(".")}: ${first.code}` : "invalid" };
  }

  const opened = await open(parsed.data.id, parsed.data.section);
  if (!opened.ok) return opened;

  // Only the edited edition changes, and the other one's KEY IS ABSENT rather
  // than undefined — `withSection` skips a language it was not given, and an
  // `undefined` would have read as that section's empty value and erased it.
  const next = withSection(opened.notes, parsed.data.section, opened.section.kind, {
    [parsed.data.lang]: parsed.data.value,
  } as Partial<Record<"fa" | "en", unknown>>);

  await store(opened.supabase, parsed.data.id, next);
  return { ok: true };
}

const AcceptSchema = z
  .object({
    id: z.string().uuid(),
    section: z.string().min(1).max(40),
    /** What the model proposed, in both editions, as the page received it. */
    fa: z.unknown(),
    en: z.unknown(),
  })
  .strict();

/**
 * A proposed rewrite, accepted.
 *
 * BOTH EDITIONS AT ONCE, because a proposal is made for both and accepting one
 * would leave the draft saying two different things in two languages. The value
 * is re-read through the section's own kind here rather than trusted from the
 * page: it arrived over the wire and the page is not the authority on shape.
 */
export async function acceptSection(input: unknown): Promise<EditResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = AcceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const opened = await open(parsed.data.id, parsed.data.section);
  if (!opened.ok) return opened;

  const next = withSection(opened.notes, parsed.data.section, opened.section.kind, {
    fa: parsed.data.fa,
    en: parsed.data.en,
  });
  await store(opened.supabase, parsed.data.id, next);
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
