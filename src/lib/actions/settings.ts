"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { PRICES } from "@/lib/llm/pricing";

/**
 * Saving the settings, and saying exactly which field was refused.
 *
 * THE FAILURE THIS IS SHAPED AGAINST. A Zod object rejects the whole payload,
 * not the one bad field — so a schema that gains a required key the form does
 * not send makes EVERY save on the screen fail, and the symptom is never the new
 * field. It presents as "could not save, try again" on a card that was working
 * yesterday.
 *
 * Three things keep that from happening here. The schema is `.strict()`, so a
 * key the form sends that this does not name is refused loudly rather than
 * dropped. The call site is typed with `z.input`, so a missing key is a compile
 * error rather than a runtime refusal. And a refusal returns the parse's own
 * issues as `{ path, code }` pairs, which the form prints under the field — so
 * the screen names the key before anyone has to reach for this file.
 */
const SettingsSchema = z
  .object({
    studioName: z.string().trim().max(120),
    studioNameFa: z.string().trim().max(120),
    studioVoice: z.string().trim().max(2000),
    sttModel: z.string().trim().min(3).max(120),
    sttFallbackModel: z.string().trim().max(120),
    sttMaxOutputTokens: z.number().int().min(256).max(64_000),
    writerModel: z.string().trim().min(3).max(120),
    writerTemperature: z.number().min(0).max(2),
    writerMaxOutputTokens: z.number().int().min(1000).max(200_000),
    dailyCeilingUsd: z.number().min(0).max(10_000),
    monthlyCeilingUsd: z.number().min(0).max(100_000),
    retentionDays: z.number().int().min(0).max(3650),
  })
  .strict();

/** What the form must send. A missing key is a compile error at the call site. */
export type SettingsInput = z.input<typeof SettingsSchema>;

export type Issue = { path: string; code: string };
export type SaveSettingsResult =
  | { ok: true; warnings: string[] }
  | { ok: false; reason: "denied" | "no-database" | "invalid" | "write-failed"; issues?: Issue[]; detail?: string };

export async function saveSettings(input: SettingsInput): Promise<SaveSettingsResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };

  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    };
  }
  const value = parsed.data;

  const supabase = db();
  if (!supabase) return { ok: false, reason: "no-database" };

  const { error } = await supabase
    .from("shenava_settings")
    .update({
      studio_name: value.studioName,
      studio_name_fa: value.studioNameFa,
      studio_voice: value.studioVoice,
      stt_model: value.sttModel,
      stt_fallback_model: value.sttFallbackModel,
      stt_max_output_tokens: value.sttMaxOutputTokens,
      writer_model: value.writerModel,
      writer_temperature: value.writerTemperature,
      writer_max_output_tokens: value.writerMaxOutputTokens,
      daily_ceiling_usd: value.dailyCeilingUsd,
      monthly_ceiling_usd: value.monthlyCeilingUsd,
      retention_days: value.retentionDays,
    })
    .eq("id", 1);

  if (error) return { ok: false, reason: "write-failed", detail: error.message };

  /**
   * Saved, but worth saying. A model with no entry in the price table is billed
   * as FREE — every call it makes reports zero and the spending ceilings never
   * notice it. That is a setting somebody chose and is allowed to keep, so it is
   * a warning after the write and not a refusal before it.
   */
  const warnings: string[] = [];
  for (const [field, model] of [["sttModel", value.sttModel], ["writerModel", value.writerModel]] as const) {
    if (model && !PRICES[model]) warnings.push(field);
  }

  revalidatePath("/app/settings");
  return { ok: true, warnings };
}
