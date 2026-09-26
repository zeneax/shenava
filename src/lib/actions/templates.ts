"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";

/**
 * Editing a template: its names, what it is for, and the lines it always ends
 * with.
 *
 * The SECTIONS are not editable from here yet. They are the draft's own keys and
 * a template naming a key the draft does not have prints nothing — which is the
 * right behaviour for a template that outlived a schema change, and the wrong
 * thing to hand somebody a free-text box for. The house lines and the names are
 * what a fork actually needs to change on day one.
 */
const SaveSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().max(120),
    nameFa: z.string().trim().max(120),
    engagement: z.enum(["project", "consulting", "training", "retainer", "unknown"]),
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

  const { error } = await supabase
    .from("shenava_templates")
    .update({
      name: parsed.data.name,
      name_fa: parsed.data.nameFa,
      engagement: parsed.data.engagement,
      house_lines: {
        fa: parsed.data.houseLinesFa.filter(Boolean),
        en: parsed.data.houseLinesEn.filter(Boolean),
      },
    })
    .eq("id", parsed.data.id);

  revalidatePath("/app/templates");
  return error ? { ok: false, reason: error.message } : { ok: true };
}
