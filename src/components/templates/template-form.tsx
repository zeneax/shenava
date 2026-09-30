"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ENGAGEMENTS, ENGAGEMENT_LABELS, safeKey } from "@/lib/meetings/notes-schema";
import { SECTION_KINDS, templateName, type SectionKind, type Template, type TemplateSection } from "@/lib/meetings/template";
import type { Lang } from "@/lib/meetings/langs";
import { saveTemplate } from "@/lib/actions/templates";
import { Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * One template: its names, what it is for, THE SECTIONS IT ASKS THE WRITER FOR,
 * and the lines every proposal made from it ends with.
 *
 * THE SECTION LIST IS THE POINT OF THIS SCREEN. What a template names is what
 * the writer is asked to produce, so adding a row here and redrawing a meeting
 * is how a studio adds a clause to its proposals. The `brief` is the field that
 * does the work: it is the sentence the model is given for that section, and a
 * section without one is a heading the model fills from guesswork.
 *
 * A KEY IS SHOWN, NOT TYPED. It is derived from the English heading when a
 * section is added and fixed after that, because the key is what a stored draft
 * holds its lines under: renaming one would orphan every draft already written
 * against it, and a key the template no longer names is dropped on read — so the
 * loss would be silent. Renaming the HEADING is free and is the thing people
 * actually want.
 *
 * Ordering is two buttons rather than dragging: a drag target is a poor one at
 * 320 pixels, worse with a screen reader, and a twelve-row list is not a place
 * anybody needs momentum.
 */

type Row = TemplateSection & { id: number };

let counter = 0;
const withIds = (sections: TemplateSection[]): Row[] => sections.map((s) => ({ ...s, id: counter++ }));

/** A heading, made into a key a draft can hold its lines under. */
function keyFrom(label: string, taken: Set<string>): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const camel = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  const base = safeKey(camel) || "section";
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}${n++}`;
  return key;
}

export function TemplateForm({ template }: { template: Template }) {
  const t = useTranslations("templates");
  const locale = useLocale() as Lang;
  const router = useRouter();

  const [name, setName] = useState(template.name);
  const [nameFa, setNameFa] = useState(template.name_fa);
  const [engagement, setEngagement] = useState(template.engagement);
  const [rows, setRows] = useState<Row[]>(() => withIds(template.sections));
  const [fa, setFa] = useState(template.house_lines.fa.join("\n"));
  const [en, setEn] = useState(template.house_lines.en.join("\n"));
  const [open, setOpen] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const dirty = () => { setSaved(false); setProblem(null); };

  const patch = (id: number, change: Partial<TemplateSection>) => {
    dirty();
    setRows((held) => held.map((r) => (r.id === id ? { ...r, ...change } : r)));
  };

  const move = (id: number, by: -1 | 1) => {
    dirty();
    setRows((held) => {
      const at = held.findIndex((r) => r.id === id);
      const to = at + by;
      if (at < 0 || to < 0 || to >= held.length) return held;
      const next = [...held];
      [next[at], next[to]] = [next[to]!, next[at]!];
      return next;
    });
  };

  const remove = (id: number) => {
    dirty();
    setRows((held) => held.filter((r) => r.id !== id));
    setOpen(null);
  };

  const add = () => {
    dirty();
    const row: Row = {
      id: counter++,
      key: "",
      label_fa: "",
      label_en: "",
      kind: "lines",
      optional: true,
      brief: "",
    };
    setRows((held) => [...held, row]);
    setOpen(row.id);
  };

  const save = () =>
    start(async () => {
      setProblem(null);
      setSaved(false);
      const taken = new Set<string>();
      const sections = rows
        .filter((r) => r.label_fa.trim() || r.label_en.trim())
        .map((r) => {
          // A row added on this screen has no key yet; one is derived from its
          // heading now and never changed again.
          const key = r.key || keyFrom(r.label_en || r.label_fa, taken);
          taken.add(key);
          return {
            key,
            label_fa: r.label_fa.trim(),
            label_en: r.label_en.trim(),
            kind: r.kind,
            optional: r.optional,
            brief: r.brief.trim(),
          };
        });

      const result = await saveTemplate({
        id: template.id,
        name,
        nameFa,
        engagement,
        sections,
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

  const KIND_LABEL: Record<SectionKind, string> = {
    text: t("kind.text"),
    lines: t("kind.lines"),
    phases: t("kind.phases"),
  };

  return (
    <article
      className="p-5"
      style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", borderRadius: "var(--radius-panel)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-base">{templateName(template, locale) || t("untitled")}</h2>
        {template.is_default && (
          <span className="rounded-full px-2.5 py-0.5 text-[12px]" style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}>
            {t("isDefault")}
          </span>
        )}
      </div>

      {/* ── Names and what it is for ──────────────────────────────────── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("nameFa")}</span>
          <input value={nameFa} onChange={(e) => { setNameFa(e.target.value); dirty(); }}
            className="rounded-lg px-3 py-2 text-sm" style={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("nameEn")}</span>
          <input value={name} onChange={(e) => { setName(e.target.value); dirty(); }}
            dir="ltr" className="rounded-lg px-3 py-2 text-sm" style={field} />
        </label>
      </div>

      <div className="mt-4">
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("engagement")}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENGAGEMENTS.map((value) => (
            <button key={value} type="button"
              onClick={() => { setEngagement(value); dirty(); }}
              className="rounded-full px-3 py-1 text-xs"
              style={{
                background: engagement === value ? "var(--ink)" : "var(--paper-sunken)",
                color: engagement === value ? "var(--paper)" : "var(--ink-soft)",
                border: "1px solid var(--line)",
              }}
            >
              {ENGAGEMENT_LABELS[value][locale]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>{t("engagementNote")}</p>
      </div>

      {/* ── The sections: what the writer is asked for ─────────────────── */}
      <div className="mt-6">
        <h3 className="text-sm">{t("sections", { n: rows.length })}</h3>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("sectionsNote")}
        </p>

        {rows.length === 0 && (
          <p className="mt-3 rounded-lg p-3 text-xs leading-relaxed" style={{ ...field, color: "var(--warm)" }}>
            {t("noSections")}
          </p>
        )}

        <ol className="mt-3 flex flex-col gap-2">
          {rows.map((row, i) => {
            const expanded = open === row.id;
            const heading = (locale === "fa" ? row.label_fa || row.label_en : row.label_en || row.label_fa).trim();
            return (
              <li key={row.id} className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--line)", background: "var(--paper)" }}>
                <div className="flex flex-wrap items-center gap-2 p-2.5">
                  <span className="text-[12px] tabular-nums" style={{ color: "var(--ink-faint)", minWidth: "1.25rem" }}>
                    {i + 1}
                  </span>

                  <button type="button" onClick={() => setOpen(expanded ? null : row.id)}
                    className="min-w-0 flex-1 text-start text-sm"
                    style={{ color: heading ? "var(--ink)" : "var(--ink-faint)" }}
                  >
                    {heading || t("newSection")}
                    {row.key && (
                      <span dir="ltr" className="ms-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>{row.key}</span>
                    )}
                  </button>

                  <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}>
                    {KIND_LABEL[row.kind]}
                  </span>

                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(row.id, -1)} disabled={i === 0}
                      aria-label={t("moveUp")}
                      className="rounded p-1 disabled:opacity-30" style={{ color: "var(--ink-faint)" }}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(row.id, 1)} disabled={i === rows.length - 1}
                      aria-label={t("moveDown")}
                      className="rounded p-1 disabled:opacity-30" style={{ color: "var(--ink-faint)" }}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(row.id)}
                      aria-label={t("removeSection")}
                      className="rounded p-1" style={{ color: "var(--color-bad)" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="flex flex-col gap-3 p-3 pt-0">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{t("headingFa")}</span>
                        <input value={row.label_fa} onChange={(e) => patch(row.id, { label_fa: e.target.value })}
                          className="rounded-lg px-3 py-1.5 text-sm" style={field} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{t("headingEn")}</span>
                        <input value={row.label_en} onChange={(e) => patch(row.id, { label_en: e.target.value })}
                          dir="ltr" className="rounded-lg px-3 py-1.5 text-sm" style={field} />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{t("brief")}</span>
                      <textarea value={row.brief} onChange={(e) => patch(row.id, { brief: e.target.value })}
                        rows={3} placeholder={t("briefHint")}
                        className="rounded-lg px-3 py-2 text-sm leading-relaxed" style={field} />
                      <span className="text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>{t("briefNote")}</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{t("kindLabel")}</span>
                        <div className="flex gap-1.5">
                          {SECTION_KINDS.map((kind) => (
                            <button key={kind} type="button" onClick={() => patch(row.id, { kind })}
                              className="rounded-full px-2.5 py-0.5 text-[12px]"
                              style={{
                                background: row.kind === kind ? "var(--cool)" : "var(--paper-sunken)",
                                color: row.kind === kind ? "var(--paper-raised)" : "var(--ink-soft)",
                                border: "1px solid var(--line)",
                              }}
                            >
                              {KIND_LABEL[kind]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-soft)" }}>
                        <input type="checkbox" checked={row.optional}
                          onChange={(e) => patch(row.id, { optional: e.target.checked })} />
                        {t("optional")}
                      </label>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <button type="button" onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs"
          style={{ border: "1px dashed var(--line)", color: "var(--ink-soft)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addSection")}
        </button>
      </div>

      {/* ── The lines every proposal ends with ─────────────────────────── */}
      <div className="mt-6">
        <h3 className="text-sm">{t("houseLines")}</h3>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("houseLinesNote")}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("nameFa")}</span>
            <textarea value={fa} onChange={(e) => { setFa(e.target.value); dirty(); }} rows={4}
              className="rounded-lg px-3 py-2 text-sm leading-relaxed" style={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("nameEn")}</span>
            <textarea value={en} onChange={(e) => { setEn(e.target.value); dirty(); }} rows={4} dir="ltr"
              className="rounded-lg px-3 py-2 text-sm leading-relaxed" style={field} />
          </label>
        </div>
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-faint)" }}>{t("oneLine")}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={save}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs disabled:opacity-60"
          style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t("save")}
        </button>
        {saved && <span className="text-xs" style={{ color: "var(--color-good)" }}>{t("saved")}</span>}
        {problem && <span className="text-xs" style={{ color: "var(--color-bad)" }}>{problem}</span>}
      </div>

      {saved && (
        <p className="mt-3 rounded-lg p-3 text-[12px] leading-relaxed" style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}>
          {t("thenRedraw")}
        </p>
      )}
    </article>
  );
}
