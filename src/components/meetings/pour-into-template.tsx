"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { templateName, type Template } from "@/lib/meetings/template";
import type { Lang } from "@/lib/meetings/langs";
import { pourIntoTemplate } from "@/lib/actions/proposals";
import { chooseTemplate } from "@/lib/actions/templates";
import { LayoutTemplate, Loader2, Check, FileDown, Printer } from "lucide-react";

/**
 * The bottom of the meeting page: which template this draft fits, and the
 * documents.
 *
 * The suggestion is shown as a suggestion — the template it picked is selected
 * and every other one is one press away. A suggestion presented as a decision is
 * the kind of help nobody asked for.
 */
export function PourIntoTemplate({
  id,
  templates,
  suggested,
  approved,
  poured,
}: {
  id: string;
  templates: Template[];
  suggested: string | null;
  approved: boolean;
  poured: { number: string } | null;
}) {
  const t = useTranslations("pour");
  const locale = useLocale() as Lang;
  const router = useRouter();

  const [templateId, setTemplateId] = useState(suggested ?? templates[0]?.id ?? "");

  /**
   * Choosing a template RECORDS the choice, because the template decides what
   * the writer is asked for — not just what is printed. Redrawing afterwards
   * writes that template's sections, which is the loop a studio expects when it
   * adds a clause: edit the template, pick it here, redraw.
   */
  const choose = (next: string) => {
    setTemplateId(next);
    void chooseTemplate({ id, templateId: next }).then(() => router.refresh());
  };
  const [lang, setLang] = useState<Lang>(locale);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(poured?.number ?? null);
  const [busy, start] = useTransition();

  const run = () =>
    start(async () => {
      setProblem(null);
      const result = await pourIntoTemplate({ id, templateId, lang });
      if (result.ok) {
        setDone(result.number);
        router.refresh();
      } else setProblem(result.reason);
    });

  const panel = {
    background: "var(--paper-raised)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-panel)",
  } as const;

  return (
    <section className="mt-10 p-5" style={panel}>
      <div className="flex items-center gap-2.5">
        <LayoutTemplate className="h-4 w-4" style={{ color: "var(--cool)" }} />
        <h2 className="text-base">{t("heading")}</h2>
      </div>
      <p className="mt-2.5 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {t("lede")}
      </p>

      {templates.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--warm)" }}>
          {t("noTemplates")}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => choose(template.id)}
                className="rounded-full px-4 py-1.5 text-xs transition-colors duration-200"
                style={{
                  background: templateId === template.id ? "var(--cool)" : "var(--paper-sunken)",
                  color: templateId === template.id ? "var(--paper-raised)" : "var(--ink-soft)",
                  border: "1px solid var(--line)",
                }}
              >
                {templateName(template, locale) || template.id.slice(0, 8)}
                {template.id === suggested && templateId === template.id ? ` · ${t("suggested")}` : ""}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(["fa", "en"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLang(value)}
                className="rounded-full px-3.5 py-1 text-xs"
                style={{
                  background: lang === value ? "var(--ink)" : "var(--paper-sunken)",
                  color: lang === value ? "var(--paper)" : "var(--ink-soft)",
                  border: "1px solid var(--line)",
                }}
              >
                {t(`edition.${value}`)}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !approved || !templateId}
              onClick={run}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {done ? t("pourAgain") : t("pour")}
            </button>
            {!approved && (
              <span className="text-xs" style={{ color: "var(--warm)" }}>
                {t("approveFirst")}
              </span>
            )}
            {done && (
              <span className="text-sm tnum" style={{ color: "var(--color-good)" }}>
                {t("made", { number: done })}
              </span>
            )}
          </div>
        </>
      )}

      {problem && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-bad)" }}>
          {t.has(`reason.${problem}`) ? t(`reason.${problem}`) : problem}
        </p>
      )}

      {/* ── The documents ──────────────────────────────────────────────────── */}
      <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
        <h3 className="text-sm">{t("documents")}</h3>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("documentsNote")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["notes", "dialogue", "transcript"] as const).map((part) => (
            <span key={part} className="flex items-center gap-1.5">
              <a
                href={`/api/meetings/${id}/docx?part=${part}&lang=${lang}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs"
                style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
              >
                <FileDown className="h-3.5 w-3.5" />
                {t(`part.${part}`)}
              </a>
              <a
                href={`/api/meetings/${id}/print?part=${part}&lang=${lang}&print=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full p-1.5"
                style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}
                title={t("printTitle")}
              >
                <Printer className="h-3.5 w-3.5" />
              </a>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
