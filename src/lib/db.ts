import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseServiceKey, configured } from "./env";

/**
 * The one database client, holding the service role key.
 *
 * Every table has Row Level Security on with no policies, so the anon key can
 * read nothing at all and this is the only way in. That means this module is
 * server-only, and it is marked so: importing it from a component that ends up
 * in the browser is a build error rather than a leaked key.
 *
 * It returns null rather than throwing when the environment is empty, because
 * a fresh clone with no .env.local should render the Connections page and tell
 * the person what is missing — not crash on the first paint.
 */
let client: SupabaseClient | null = null;

export function db(): SupabaseClient | null {
  if (!configured()) return null;
  if (!client) {
    client = createClient(supabaseUrl(), supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export type TableCheck = { ok: boolean; missing: string[]; error?: string };

export const TABLES = [
  "shenava_settings",
  "shenava_meetings",
  "shenava_segments",
  "shenava_runs",
  "shenava_templates",
  "shenava_proposals",
] as const;

/**
 * Has the schema been pasted in yet? Asked by the Connections page, because
 * "the tables are not there" and "the key is wrong" produce the same empty
 * list otherwise, and the person cannot tell which they are looking at.
 */
export async function checkTables(): Promise<TableCheck> {
  const supabase = db();
  if (!supabase) return { ok: false, missing: [...TABLES], error: "not-configured" };

  const missing: string[] = [];
  for (const table of TABLES) {
    const { error } = await supabase.from(table).select("*", { head: true, count: "exact" });
    // PGRST205: the table is not in the schema cache, i.e. it does not exist.
    if (error && (error.code === "PGRST205" || /does not exist/i.test(error.message))) {
      missing.push(table);
    } else if (error) {
      return { ok: false, missing, error: error.message };
    }
  }
  return { ok: missing.length === 0, missing };
}
