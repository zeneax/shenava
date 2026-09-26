"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { DialogueSchema, SPEAKERS, swapSides, withSide } from "@/lib/meetings/dialogue-schema";

/**
 * The three corrections, and NOT ONE OF THEM CALLS A MODEL.
 *
 * The speaker pass is right about most of a meeting and wrong about a line or
 * two — measured on a labelled consultation it placed 94.5% of sentences, and
 * the misses were mostly one-word back-channels swallowed by the turn around
 * them. Running the pass again costs a call, takes a minute, and rewrites labels
 * that were already right. Swapping the sides moves the whole meeting. Neither
 * is what "this paragraph is the client, not me" means.
 *
 * So each of these is a pure transform of the stored dialogue, read, applied,
 * written back.
 */

const SideSchema = z
  .object({
    id: z.string().uuid(),
    turnIndex: z.number().int().min(0),
    /** Null for the whole turn; a number splits the turn at that sentence. */
    sentenceIndex: z.number().int().min(0).nullable(),
    who: z.enum(SPEAKERS),
  })
  .strict();

export type SideResult = { ok: boolean; reason?: string };

async function load(id: string) {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("shenava_meetings")
    .select("dialogue")
    .eq("id", id)
    .maybeSingle();
  if (!data?.dialogue) return null;
  const parsed = DialogueSchema.safeParse(data.dialogue);
  return parsed.success ? { supabase, dialogue: parsed.data } : null;
}

export async function setSide(input: unknown): Promise<SideResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = SideSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first ? `${first.path.join(".")}: ${first.code}` : "invalid" };
  }
  const held = await load(parsed.data.id);
  if (!held) return { ok: false, reason: "no dialogue" };

  const next = withSide(
    held.dialogue,
    parsed.data.turnIndex,
    parsed.data.sentenceIndex,
    parsed.data.who,
  );
  await held.supabase
    .from("shenava_meetings")
    .update({ dialogue: next })
    .eq("id", parsed.data.id);
  revalidatePath(`/app/m/${parsed.data.id}`);
  return { ok: true };
}

export async function swapDialogueSides(id: string): Promise<SideResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const held = await load(id);
  if (!held) return { ok: false, reason: "no dialogue" };
  await held.supabase
    .from("shenava_meetings")
    .update({ dialogue: swapSides(held.dialogue) })
    .eq("id", id);
  revalidatePath(`/app/m/${id}`);
  return { ok: true };
}
