"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  ENGAGEMENT_LABELS, LIST_SECTIONS, SECTION_LABELS, sectionValue,
  type MeetingNotes, type NotesLang, type RewritableSection,
} from "@/lib/meetings/notes-schema";
import { saveSection, decideDraft } from "@/lib/actions/notes";
import { Check, Loader2, Pencil, RefreshCw, ThumbsDown, Undo2, X, FileSignature } from "lucide-react";

/**
 * The draft, and the four things a reviewer does to it.
 *
 * Edit a section by typing. Have one section written again, with an instruction.
 * Redraw the whole thing with an instruction. Decide.
 *
 * It opens on the reader's own language but shows either, because the two
 * editions are not translations of each other and a reviewer checks both before
 * anything goes to a client.
 *
 * A model call here goes through `fetch` with its own state, never a transition:
 * a two-minute await inside `useTransition` entangles every navigation on the
 * page and the dashboard stops answering its own links.
 */
type Busy = { what: "draw" | "section" | "save" | "decide"; which?: string } | null;

export function DraftView({
  id,
  notes,
  status,
}: {
  id: string;
  notes: MeetingNotes;
  status: "pending" | "approved" | "rejected";
}) {
  const t = useTranslations("draft");
  const locale = useLocale() as NotesLang;
  const router = useRouter();

  const [lang, setLang] = useState<NotesLang>(locale);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<RewritableSection | null>(null);
  const [drafted, setDrafted] = useState("");
  const [instruction, setInstruction] = useState("");
  const [asking, setAsking] = useState<RewritableSection | null>(null);
  const [saving, startSaving] = useTransition();

  const edition = notes[lang];

  const call = async (body: { section?: RewritableSection; instruction?: string }) => {
    setProblem(null);
    setBusy(body.section ? { what: "section", which: body.section } : { what: "draw" });
    try {
      const response = await fetch(`/api/meetings/${id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        ok?: boolean; reason?: string; detail?: string;
      };
      if (response.ok && answer.ok) {
        setAsking(null);
        setInstruction("");
        router.refresh();
      } else {
        setProblem(answer.detail ? `${answer.reason}: ${answer.detail}` : (answer.reason ?? `HTTP ${response.status}`));
      }
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(null);
    }
  };

  /** A list section is one line per line; the title and summary are prose. */
  const asLines = (section: RewritableSection) => section !== "title" && section !== "summary";

  const openEditor = (section: RewritableSection) => {
    const value = sectionValue(notes, section, lang);
    setDrafted(Array.isArray(value) ? value.join("\n") : String(value ?? ""));
    setEditing(section);
  };

  const save = (section: RewritableSection) =>
    startSaving(async () => {
      const value = asLines(section)
        ? drafted.split("\n").map((l) => l.trim()).filter(Boolean)
        : drafted.trim();
      const result = await saveSection({ id, section, lang, value });
      if (result.ok) {
        setEditing(null);
        router.refresh();
      } else setProblem(result.reason ?? "invalid");
    });

  const decide = (next: "pending" | "approved" | "rejected") =>
    startSaving(async () => {
      const result = await decideDraft({ id, status: next });
      if (result.ok) router.refresh();
      else setProblem(result.reason ?? "invalid");
    });

  const panel = {
    background: "var(--paper-raised)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-panel)",
  } as const;

  /** One section: its heading, its lines, and the two ways to change it. */
  const Section = ({ section, children }: { section: RewritableSection; children: React.ReactNode }) => (
    <article className="border-t py-5" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 className="text-sm">
          {section === "title" ? t("titleSection") : SECTION_LABELS[section][lang]}
        </h3>
        <button
          type="button"
          onClick={() => (editing === section ? setEditing(null) : openEditor(section))}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]"
          style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}
        >
          <Pencil className="h-3 w-3" />
          {editing === section ? t("cancel") : t("edit")}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setAsking(asking === section ? null : section)}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] disabled:opacity-50"
          style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}
        >
          {busy?.what === "section" && busy.which === section ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t("writeAgain")}
        </button>
      </div>

      {editing === section ? (
        <div className="mt-3">
          <textarea
            value={drafted}
            onChange={(e) => setDrafted(e.target.value)}
            rows={Math.min(16, Math.max(4, drafted.split("\n").length + 1))}
            className="w-full rounded-lg p-3 text-sm leading-relaxed"
            style={{ background: "var(--paper-sunken)", border: "1px solid var(--line)", color: "var(--ink)" }}
          />
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>
            {asLines(section) ? t("oneLine") : t("prose")}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => save(section)}
            className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs disabled:opacity-60"
            style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("save")}
          </button>
        </div>
      ) : (
        <div className="mt-2.5">{children}</div>
      )}

      {asking === section && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t("instructionHint")}
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--paper-sunken)", border: "1px solid var(--line)", color: "var(--ink)" }}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void call({ section, instruction })}
            className="rounded-full px-4 py-2 text-xs disabled:opacity-60"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            {t("writeAgain")}
          </button>
        </div>
      )}
    </article>
  );

  const Lines = ({ lines }: { lines: string[] }) =>
    lines.length === 0 ? (
      <p className="text-sm" style={{ color: "var(--ink-faint)" }}>
        {t("emptySection")}
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    );

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileSignature className="h-4 w-4" style={{ color: "var(--cool)" }} />
          <h2 className="text-base">{t("heading")}</h2>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs"
            style={{
              background: status === "approved" ? "var(--color-good)" : status === "rejected" ? "var(--color-bad)" : "var(--paper-sunken)",
              color: status === "pending" ? "var(--ink-soft)" : "var(--paper-raised)",
            }}
          >
            {t(`status.${status}`)}
          </span>
        </div>
        <div className="flex gap-2">
          {(["fa", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setLang(value); setEditing(null); }}
              className="rounded-full px-3.5 py-1 text-xs"
              style={{
                background: lang === value ? "var(--ink)" : "var(--paper-raised)",
                color: lang === value ? "var(--paper)" : "var(--ink-soft)",
                border: "1px solid var(--line)",
              }}
            >
              {t(`edition.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
        {t("waits")}
      </p>

      {problem && (
        <p className="mt-4 p-3 text-sm" style={{ ...panel, color: "var(--color-bad)" }}>
          {problem}
        </p>
      )}

      <div className="mt-5" dir={lang === "fa" ? "rtl" : "ltr"}>
        <Section section="title">
          <p className="text-base">{edition.title || t("emptySection")}</p>
          <p className="mt-1.5 text-xs" style={{ color: "var(--ink-faint)" }}>
            {SECTION_LABELS.engagement[lang]}: {ENGAGEMENT_LABELS[edition.engagement][lang]}
          </p>
        </Section>

        <Section section="summary">
          <p className="text-sm leading-relaxed">{edition.summary || t("emptySection")}</p>
        </Section>

        <Section section="phases">
          {edition.phases.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-faint)" }}>{t("emptySection")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {edition.phases.map((phase, i) => (
                <div key={i}>
                  <p className="text-sm">
                    {phase.title}
                    {phase.when ? (
                      <span className="ms-2 text-xs tnum" style={{ color: "var(--warm)" }}>{phase.when}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                    {phase.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
          {edition.scheduleNote && (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {edition.scheduleNote}
            </p>
          )}
        </Section>

        {LIST_SECTIONS.map((section) => (
          <Section key={section} section={section}>
            <Lines lines={edition[section]} />
          </Section>
        ))}

        <Section section="openQuestions">
          <Lines lines={notes.openQuestions[lang]} />
        </Section>
      </div>

      {/* The model's own working. Shown because it is how a reviewer checks a
          sentence against what was actually said, and it is the fastest way to
          catch a figure that was not in the meeting. */}
      {notes.facts.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm" style={{ color: "var(--ink-soft)" }}>
            {SECTION_LABELS.facts[lang]} · {notes.facts.length}
          </summary>
          <div className="mt-3 flex flex-col gap-1.5 p-4" style={panel}>
            {notes.facts.map((fact, i) => (
              <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                {fact}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* ── Redraw the whole thing, and decide ─────────────────────────────── */}
      <div className="mt-8 flex flex-col gap-4 border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t("redrawHint")}
            className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-sm"
            style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void call({ instruction })}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm disabled:opacity-60"
            style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
          >
            {busy?.what === "draw" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("redraw")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status !== "approved" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => decide("approved")}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm disabled:opacity-60"
              style={{ background: "var(--color-good)", color: "var(--paper-raised)" }}
            >
              <Check className="h-4 w-4" />
              {t("approve")}
            </button>
          )}
          {status !== "rejected" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => decide("rejected")}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
            >
              <ThumbsDown className="h-4 w-4" />
              {t("reject")}
            </button>
          )}
          {status !== "pending" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => decide("pending")}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
            >
              <Undo2 className="h-4 w-4 flip" />
              {t("backToReview")}
            </button>
          )}
          {saving && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--ink-faint)" }} />}
        </div>
      </div>
    </section>
  );
}
