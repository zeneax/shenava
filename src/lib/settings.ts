import "server-only";
import { db } from "@/lib/db";
import { SETTING_DEFAULTS, type Settings } from "@/lib/settings-shape";

export { SETTING_DEFAULTS, type Settings };

/**
 * The one settings row, and what to do when there isn't one.
 *
 * A fresh clone has no database yet, and the dashboard still has to render and
 * explain itself. So every field has a default here and a missing row is not an
 * error — it is the defaults. The Settings page writes the row; nothing reads a
 * setting through any other path.
 */
type Row = {
  studio_name: string; studio_name_fa: string; studio_voice: string;
  stt_model: string; stt_fallback_model: string; stt_max_output_tokens: number;
  writer_model: string; writer_temperature: number | string; writer_max_output_tokens: number;
  daily_ceiling_usd: number | string; monthly_ceiling_usd: number | string;
  retention_days: number;
};

export async function getSettings(): Promise<Settings> {
  const supabase = db();
  if (!supabase) return SETTING_DEFAULTS;
  const { data } = await supabase.from("shenava_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return SETTING_DEFAULTS;
  const row = data as Row;
  return {
    studioName: row.studio_name,
    studioNameFa: row.studio_name_fa,
    studioVoice: row.studio_voice,
    sttModel: row.stt_model,
    sttFallbackModel: row.stt_fallback_model,
    sttMaxOutputTokens: row.stt_max_output_tokens,
    writerModel: row.writer_model,
    writerTemperature: Number(row.writer_temperature),
    writerMaxOutputTokens: row.writer_max_output_tokens,
    dailyCeilingUsd: Number(row.daily_ceiling_usd),
    monthlyCeilingUsd: Number(row.monthly_ceiling_usd),
    retentionDays: row.retention_days,
  };
}
