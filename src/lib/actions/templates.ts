"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { safeKey } from "@/lib/meetings/notes-schema";
import { SECTION_KINDS } from "@/lib/meetings/proposal-guide";

/**
 * Editing a template: its names, what it is for, THE SECTIONS IT ASKS FOR, and
 * the lines it always ends with.
 *
 * The sections used to be fixed here and editable nowhere, because they were the
 * draft's own keys and a template naming a key the draft did not have printed
 * nothing. They are the template's keys now: what it names is what the writer is
 * asked for, so adding a clause and redrawing is the whole loop.
 *
 * A KEY IS NEVER REWRITTEN, only added or removed. The key is what a stored
 * draft holds its lines under, so renaming one would orphan every draft already
 * written against it — silently, since a key the template no longer names is
 * dropped on read. The page derives a key from the heading when a section is
 * added and shows it afterwards without letting it be typed.
 */

const SectionSchema = z.object({
  key: z.string().trim().min(1).max(40).transform(safeKey),
  label_fa: z.string().trim().max(120),
  label_en: z.string().trim().max(120),
  kind: z.enum(SECTION_KINDS),
  optional: z.boolean(),
  brief: z.string().trim().max(1200),
});

const SaveSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().max(120),
    nameFa: z.string().trim().max(120),
    engagement: z.enum(["project", "consulting", "training", "retainer", "unknown"]),
    sections: z.array(SectionSchema).max(40),
    houseLinesFa: z.array(z.string().trim().max(400)).max(20),
    houseLinesEn: z.array(z.string().trim().max(400)).max(20),
  })
  .strict();

export type SaveTemplateResult = { ok: boolean; reason?: string };

export async function saveTemplate(input: unknown): Promise<SaveTemplateResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: first ? `${first.path.join(".")}: ${first.code}` : "invalid" };
  }
  const supabase = db();
  if (!supabase) return { ok: false, reason: "no database" };

  // A key twice over is one section with two headings and one value, so the
  // second is dropped here rather than left for the reader to trip over.
  const seen = new Set<string>();
  const sections = parsed.data.sections
    .filter((s) => s.key && !seen.has(s.key) && (seen.add(s.key), true))
    .filter((s) => s.label_fa || s.label_en);

  // A template with no sections falls back to the built-in twelve on read, so
  // saving an empty list is not destructive — but it is almost never meant, and
  // the page says so before it gets here.
  const { error } = await supabase
    .from("shenava_templates")
    .update({
      name: parsed.data.name,
      name_fa: parsed.data.nameFa,
      engagement: parsed.data.engagement,
      sections,
      house_lines: {
        fa: parsed.data.houseLinesFa.filter(Boolean),
        en: parsed.data.houseLinesEn.filter(Boolean),
      },
    })
    .eq("id", parsed.data.id);

  revalidatePath("/app/templates");
  return error ? { ok: false, reason: error.message } : { ok: true };
}

const ChooseSchema = z
  .object({ id: z.string().uuid(), templateId: z.string().uuid() })
  .strict();

/**
 * Point a meeting at a template.
 *
 * It is what makes the loop the studio expects work: choose the template, redraw,
 * and the writer is asked for THAT template's sections. Without it a meeting
 * only acquires a template by being poured into one, which is the wrong way
 * round — the shape has to be chosen before the writing, not after.
 */
export async function chooseTemplate(input: unknown): Promise<SaveTemplateResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };
  const parsed = ChooseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = db();
  if (!supabase) return { ok: false, reason: "no database" };

  const { error } = await supabase
    .from("shenava_meetings")
    .update({ template_id: parsed.data.templateId })
    .eq("id", parsed.data.id);

  revalidatePath(`/app/m/${parsed.data.id}`);
  return error ? { ok: false, reason: error.message } : { ok: true };
}
