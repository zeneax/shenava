import { setRequestLocale, getTranslations } from "next-intl/server";
import { serviceStates } from "@/lib/env";
import { doorIsOpen } from "@/lib/auth";
import { checkTables } from "@/lib/db";
import { TestConnections } from "@/components/test-connections";
import { Check, X, Minus, Database, KeyRound, DoorOpen, DoorClosed, Table2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Connections({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("conn");

  const services = serviceStates();
  const tables = await checkTables();
  const open = doorIsOpen();

  const icons = { supabase: Database, openrouter: KeyRound } as const;

  return (
    <section>
      <h1 className="text-2xl">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {t("lede")}
      </p>

      {/* ── The keys, as presence and never as value ─────────────────────── */}
      <div className="mt-8 flex flex-col gap-4">
        {services.map((service) => {
          const Icon = icons[service.name];
          return (
            <article
              key={service.name}
              className="p-5"
              style={{
                background: "var(--paper-raised)",
                border: `1px solid ${service.ready ? "var(--line)" : "var(--color-bad)"}`,
                borderRadius: "var(--radius-panel)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" style={{ color: "var(--cool)" }} />
                <h2 className="text-base">{t(service.name)}</h2>
              </div>
              <p className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(`${service.name}What`)}
              </p>
              <ul className="mt-4 flex flex-col">
                {service.vars.map((v) => (
                  <li
                    key={v.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 text-sm"
                    style={{ borderColor: "var(--line)" }}
                  >
                    {v.set ? (
                      <Check className="h-4 w-4 shrink-0" style={{ color: "var(--color-good)" }} />
                    ) : v.required ? (
                      <X className="h-4 w-4 shrink-0" style={{ color: "var(--color-bad)" }} />
                    ) : (
                      <Minus className="h-4 w-4 shrink-0" style={{ color: "var(--ink-faint)" }} />
                    )}
                    <code className="min-w-0 flex-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                      {v.key}
                    </code>
                    <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                      {v.set ? t("set") : v.required ? t("missing") : t("optional")}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {/* ── Really calling them ─────────────────────────────────────────── */}
      <div className="mt-8">
        <TestConnections />
      </div>

      {/* ── The schema ──────────────────────────────────────────────────── */}
      <article className="mt-10 border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center gap-2.5">
          <Table2 className="h-4 w-4" style={{ color: "var(--cool)" }} />
          <h2 className="text-base">{t("tablesTitle")}</h2>
        </div>
        {tables.ok ? (
          <p className="mt-2.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("tablesOk")}
          </p>
        ) : (
          <>
            <p className="mt-2.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("tablesMissing")}
            </p>
            <p className="mt-1.5 text-xs" style={{ color: "var(--ink-faint)" }}>
              <code>{tables.missing.join(", ") || tables.error}</code>
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("tablesHow")}
            </p>
          </>
        )}
      </article>

      {/* ── How to fill it in ───────────────────────────────────────────── */}
      <article className="mt-8 border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <h2 className="text-base">{t("howTitle")}</h2>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {t("howBody")}
        </p>
      </article>

      {/* ── The door ────────────────────────────────────────────────────── */}
      <article className="mt-8 border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center gap-2.5">
          {open ? (
            <DoorOpen className="h-4 w-4" style={{ color: "var(--warm)" }} />
          ) : (
            <DoorClosed className="h-4 w-4" style={{ color: "var(--color-good)" }} />
          )}
          <h2 className="text-base">{t("door")}</h2>
        </div>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {open ? t("doorOpen") : t("doorClosed")}
        </p>
        {open && (
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--warm)" }}>
            {t("doorWarn")}
          </p>
        )}
      </article>
    </section>
  );
}
