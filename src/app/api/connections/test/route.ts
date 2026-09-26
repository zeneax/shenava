import { NextResponse } from "next/server";
import { db, checkTables } from "@/lib/db";
import { openRouterKey, openRouterApp } from "@/lib/env";

/**
 * Really call all three, and answer per line.
 *
 * A page that reads the environment can only say "a value is present", and a
 * present value that is wrong is the failure people actually hit. So this route
 * spends one cheap request on each service: a HEAD count against a table, and
 * OpenRouter's own key endpoint, which costs nothing and returns the credit
 * left — which is worth seeing, because below about a dollar OpenRouter starts
 * answering 402 to concurrent calls and every transcription piece fails at once.
 */
export const dynamic = "force-dynamic";

type Line = { name: string; ok: boolean; detail: string };

export async function POST() {
  const lines: Line[] = [];

  const supabase = db();
  if (!supabase) {
    lines.push({ name: "supabase", ok: false, detail: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is empty" });
  } else {
    const { error } = await supabase.from("shenava_meetings").select("id", { head: true, count: "exact" });
    lines.push(
      error
        ? { name: "supabase", ok: false, detail: `${error.code ?? ""} ${error.message}`.trim() }
        : { name: "supabase", ok: true, detail: "reachable, and shenava_meetings answered" },
    );
  }

  const key = openRouterKey();
  if (!key) {
    lines.push({ name: "openrouter", ok: false, detail: "OPENROUTER_API_KEY is empty" });
  } else {
    try {
      const app = openRouterApp();
      const res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: {
          authorization: `Bearer ${key}`,
          "http-referer": app.url,
          "x-title": app.name,
        },
      });
      if (!res.ok) {
        lines.push({ name: "openrouter", ok: false, detail: `HTTP ${res.status}` });
      } else {
        const body = (await res.json()) as { data?: { limit_remaining?: number | null; usage?: number } };
        const left = body.data?.limit_remaining;
        lines.push({
          name: "openrouter",
          ok: true,
          detail:
            left === null || left === undefined
              ? "the key is valid"
              : `the key is valid, $${Number(left).toFixed(2)} of credit left`,
        });
      }
    } catch (error) {
      lines.push({ name: "openrouter", ok: false, detail: String(error) });
    }
  }

  const tables = await checkTables();
  lines.push({
    name: "tables",
    ok: tables.ok,
    detail: tables.ok
      ? "all six are there"
      : tables.error
        ? tables.error
        : `missing: ${tables.missing.join(", ")}`,
  });

  return NextResponse.json({ lines });
}
