import "server-only";
import { db } from "@/lib/db";

/**
 * The ceiling, checked before the call, and the ledger, written after it.
 *
 * A limit enforced after a call is not a limit — the money is already gone. So
 * `withinCeiling()` is read first and a call that would take the day or the
 * month past its ceiling is never sent.
 *
 * The figures come from the ledger and not from the running total on a meeting
 * row, because a meeting drawn again next month must not count against last
 * month's ceiling.
 */
export type Seat = "transcriber" | "speakers" | "writer" | "section";

export type SpendStatus = {
  spentToday: number;
  spentMonth: number;
  dailyCeiling: number;
  monthlyCeiling: number;
  allowed: boolean;
};

export async function spendStatus(): Promise<SpendStatus | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("shenava_spend_status");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return {
    spentToday: Number(row.spent_today ?? 0),
    spentMonth: Number(row.spent_month ?? 0),
    dailyCeiling: Number(row.daily_ceiling ?? 0),
    monthlyCeiling: Number(row.monthly_ceiling ?? 0),
    allowed: Boolean(row.allowed),
  };
}

/**
 * True when there is room for one more call.
 *
 * A database that cannot answer returns null from `spendStatus`, and this
 * treats that as allowed — refusing every call because the ledger is briefly
 * unreachable would turn a transient database error into a product that has
 * stopped working, and the ledger row written afterwards still records the
 * spend. A ceiling of zero means no ceiling.
 */
export async function withinCeiling(): Promise<{ ok: boolean; status: SpendStatus | null }> {
  const status = await spendStatus();
  return { ok: status ? status.allowed : true, status };
}

export type RunRecord = {
  meetingId: string | null;
  seat: Seat;
  model: string;
  detail?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  ok: boolean;
  error?: string;
  ms: number;
};

/**
 * One row per call, whether it succeeded or not — a failed call that consumed
 * tokens still cost money, and a ledger that only holds successes under-reports
 * exactly on the days something is going wrong.
 */
export async function recordRun(run: RunRecord): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase.from("shenava_runs").insert({
    meeting_id: run.meetingId,
    seat: run.seat,
    model: run.model,
    detail: run.detail ?? "",
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    ok: run.ok,
    error: run.error ?? null,
    ms: run.ms,
  });
}
