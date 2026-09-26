import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { Plus, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  client_name: string;
  status: string;
  draft_status: string;
  cost_usd: number;
  created_at: string;
};

export default async function Meetings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dash");
  const s = await getTranslations("status");

  const supabase = db();
  let rows: Row[] = [];
  let unreachable = supabase === null;

  if (supabase) {
    const { data, error } = await supabase
      .from("shenava_meetings")
      .select("id,title,client_name,status,draft_status,cost_usd,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) unreachable = true;
    else rows = (data ?? []) as Row[];
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{t("title")}</h1>
        <Link
          href="/app/new"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <Plus className="h-4 w-4" />
          {t("newMeeting")}
        </Link>
      </div>

      {unreachable ? (
        <div
          className="mt-8 flex gap-3 p-5"
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warm)" }} />
          <div>
            <p className="text-sm">{t("notReady")}</p>
            <p className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("notReadyHint")}
            </p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm">{t("empty")}</p>
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col">
          {rows.map((row, i) => (
            <li key={row.id} className="rise" style={{ animationDelay: `${i * 0.04}s` }}>
              <Link
                href={`/app/m/${row.id}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t py-4 transition-colors duration-200"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="min-w-0 flex-1 text-sm">{row.title || "—"}</span>
                <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {row.client_name || "—"}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}
                >
                  {s(row.status)}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{
                    background:
                      row.draft_status === "approved" ? "var(--cool)" : "var(--paper-sunken)",
                    color: row.draft_status === "approved" ? "var(--paper-raised)" : "var(--ink-soft)",
                  }}
                >
                  {s(row.draft_status)}
                </span>
                <span className="tnum text-xs" style={{ color: "var(--ink-faint)" }}>
                  ${Number(row.cost_usd).toFixed(2)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
