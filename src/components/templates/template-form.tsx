"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ENGAGEMENTS, ENGAGEMENT_LABELS } from "@/lib/meetings/notes-schema";
import { templateName, type Template } from "@/lib/meetings/template";
import type { Lang } from "@/lib/meetings/langs";
import { saveTemplate } from "@/lib/actions/templates";
import { Check, Loader2 } from "lucide-react";

/**
 * One template's names, what it is for, and the lines every proposal made from
 * it ends with.
 *
 * The house lines matter more than they look: the writer is told about them so
 * it never proposes them itself, which is why a studio's terms belong here and
 * not in the draft.
 */
export function TemplateForm({ template }: { template: Template }) {
  const t = useTranslations("templates");
  const locale = useLocale() as Lang;
  const router = useRouter();

  const [name, setName] = useState(template.name);
  const [nameFa, setNameFa] = useState(template.name_fa);
  const [engagement, setEngagement] = useState(template.engagement);
  const [fa, setFa] = useState(template.house_lines.fa.join("\n"));
  const [en, setEn] = useState(template.house_lines.en.join("\n"));
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      setProblem(null);
      setSaved(false);
      const result = await saveTemplate({
        id: template.id,
        name,
        nameFa,
        engagement,
        houseLinesFa: fa.split("\n").map((l) => l.trim()).filter(Boolean),
        houseLinesEn: en.split("\n").map((l) => l.trim()).filter(Boolean),
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else setProblem(result.reason ?? "invalid");
    });

  const field = {
    background: "var(--paper-sunken)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  } as const;

  return (
    <article
      className="p-5"
      style={{
        background: "var(--paper-raised)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-panel)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base">{templateName(template, locale) || t("untitled")}</h2>
        {template.is_default && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs"
            style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
          >
            {t("isDefault")}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm">{t("nameFa")}</span>
          <input value={nameFa} onChange={(e) => setNameFa(e.target.value)} maxLength={120}
            className="rounded-lg px-3 py-2 text-sm" style={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm">{t("nameEn")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
            className="rounded-lg px-3 py-2 text-sm" style={field} dir="ltr" />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm">{t("engagement")}</legend>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("engagementNote")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENGAGEMENTS.map((value) => (
            <button key={value} type="button" onClick={() => setEngagement(value)}
              className="rounded-full px-3.5 py-1 text-xs"
              style={{
                background: engagement === value ? "var(--ink)" : "var(--paper-sunken)",
                color: engagement === value ? "var(--paper)" : "var(--ink-soft)",
                border: "1px solid var(--line)",
              }}>
              {ENGAGEMENT_LABELS[value][locale]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <h3 className="text-sm">{t("houseLines")}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("houseLinesNote")}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("nameFa")}</span>
            <textarea value={fa} onChange={(e) => setFa(e.target.value)} rows={4}
              className="rounded-lg p-3 text-sm leading-relaxed" style={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("nameEn")}</span>
            <textarea value={en} onChange={(e) => setEn(e.target.value)} rows={4} dir="ltr"
              className="rounded-lg p-3 text-sm leading-relaxed" style={field} />
          </label>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>{t("oneLine")}</p>
      </div>

      {/* What it prints, and that it is not editable here — with the reason. */}
      <details className="mt-5">
        <summary className="cursor-pointer text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("sections", { n: template.sections.length })}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {template.sections.map((section) => (
            <span key={section.key} className="rounded-full px-2.5 py-0.5 text-xs"
              style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}>
              {(locale === "fa" ? section.label_fa : section.label_en) || section.key}
              {section.optional ? " ·" : ""}
            </span>
          ))}
        </div>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("sectionsNote")}
        </p>
      </details>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={save}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm disabled:opacity-60"
          style={{ background: "var(--cool)", color: "var(--paper-raised)" }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("save")}
        </button>
        {saved && !busy && (
          <span className="text-sm" style={{ color: "var(--color-good)" }}>{t("saved")}</span>
        )}
        {problem && <span className="text-sm" style={{ color: "var(--color-bad)" }}>{problem}</span>}
      </div>
    </article>
  );
}
