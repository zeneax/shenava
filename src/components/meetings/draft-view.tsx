"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  EMPTY_SECTION, ENGAGEMENT_LABELS, FIXED_LABELS, isEmptySection, sectionLabel,
  writeSectionValue,
  type MeetingNotes, type NotesLang, type Phase, type SectionDef, type SectionKind,
} from "@/lib/meetings/notes-schema";
import { saveSection, acceptSection, decideDraft } from "@/lib/actions/notes";
import { Check, Loader2, Pencil, RefreshCw, Sparkles, ThumbsDown, Undo2, X, FileSignature } from "lucide-react";

/**
 * The draft, and the five things a reviewer does to it.
 *
 * Edit a section by typing. Ask for one to be written again, with an
 * instruction. COMPARE what came back against what is there and accept or
 * discard it. Redraw the whole thing. Decide.
 *
 * THE COMPARISON IS THE POINT OF THIS SCREEN. A rewrite used to save itself,
 * which made asking for one a gamble: the lines you had were gone before you
 * could read the new ones, and a rewrite that came back worse cost you the
 * version you were happy with. Now nothing is written until you say so, the two
 * are shown side by side, and the instruction box stays open underneath so a
 * proposal you do not like can be asked for again without losing your place.
 *
 * The section list is a PROP, not a constant: it comes from the meeting's
 * template, so a clause a studio added last week appears here with everything
 * the built-in ones have.
 *
 * It opens on the reader's own language but shows either, because the two
 * editions are not translations of each other and a reviewer checks both before
 * anything goes to a client.
 *
 * A model call here goes through `fetch` with its own state, never a transition:
 * a two-minute await inside `useTransition` entangles every navigation on the
 * page and the dashboard stops answering its own links.
 */

type Busy = { what: "draw" | "section"; which?: string } | null;
type Proposal = { key: string; before: Record<NotesLang, unknown>; after: Record<NotesLang, unknown> };

const TITLE_KEY = "title";

export function DraftView({
  id,
  notes,
  sections,
  status,
}: {
  id: string;
  notes: MeetingNotes;
  sections: SectionDef[];
  status: "pending" | "approved" | "rejected";
}) {
  const t = useTranslations("draft");
  const locale = useLocale() as NotesLang;
  const router = useRouter();

  const [lang, setLang] = useState<NotesLang>(locale);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafted, setDrafted] = useState("");
  const [instruction, setInstruction] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [saving, startSaving] = useTransition();

  const edition = notes[lang];

  /** The title is a section for every purpose on this screen except storage. */
  const titleDef: SectionDef = {
    key: TITLE_KEY, label_fa: FIXED_LABELS.title.fa, label_en: FIXED_LABELS.title.en,
    kind: "text", optional: false, brief: "",
  };
  const all = [titleDef, ...sections];

  const valueOf = (def: SectionDef): unknown =>
    def.key === TITLE_KEY
      ? edition.title
      : writeSectionValue(def.kind, edition.sections[def.key] ?? EMPTY_SECTION);

  // A known refusal gets its sentence, and the provider's own words follow it,
  // because "transport" alone cannot tell a 429 from a revoked key.
  const refusalLine = (body: { reason?: string; detail?: string }, status: number) => {
    const reason = body.reason ?? `HTTP ${status}`;
    const said = t.has(`reason.${reason}`) ? t(`reason.${reason}`) : reason;
    return body.detail ? `${said} — ${body.detail}` : said;
  };

  const ask = async (key: string, note: string) => {
    setProblem(null);
    setBusy({ what: "section", which: key });
    try {
      const response = await fetch(`/api/meetings/${id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section: key, instruction: note }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        ok?: boolean; reason?: string; detail?: string; proposal?: Proposal;
      };
      if (response.ok && answer.ok && answer.proposal) {
        setProposal(answer.proposal);
        setAsking(null);
        setEditing(null);
      } else {
        setProblem(refusalLine(answer, response.status));
      }
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(null);
    }
  };

  const redraw = async (note: string) => {
    setProblem(null);
    setBusy({ what: "draw" });
    try {
      const response = await fetch(`/api/meetings/${id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: note }),
      });
      const answer = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string; detail?: string };
      if (response.ok && answer.ok) {
        setInstruction("");
        setProposal(null);
        router.refresh();
      } else {
        setProblem(refusalLine(answer, response.status));
      }
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(null);
    }
  };

  const accept = () =>
    startSaving(async () => {
      if (!proposal) return;
      const result = await acceptSection({
        id, section: proposal.key, fa: proposal.after.fa, en: proposal.after.en,
      });
      if (result.ok) {
        setProposal(null);
        setInstruction("");
        router.refresh();
      } else setProblem(result.reason ?? "invalid");
    });

  /** Typing into a section: lines one per line, prose as prose, phases as `title | when | detail`. */
  const asText = (kind: SectionKind, value: unknown): string => {
    if (kind === "text") return String(value ?? "");
    if (kind === "phases") {
      const held = (value ?? {}) as { phases?: Phase[] ; scheduleNote?: string };
      const rows = (held.phases ?? []).map((p) => [p.title, p.when, p.detail].join(" | "));
      return [...rows, ...(held.scheduleNote ? ["", held.scheduleNote] : [])].join("\n");
    }
    return Array.isArray(value) ? (value as string[]).join("\n") : "";
  };

  const fromText = (kind: SectionKind, raw: string): unknown => {
    if (kind === "text") return raw.trim();
    if (kind === "phases") {
      const [rows, note] = raw.split(/\n\s*\n/);
      const phases = (rows ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [title = "", when = "", detail = ""] = l.split("|").map((p) => p.trim());
          return { title, when, detail };
        });
      return { phases, scheduleNote: (note ?? "").trim() };
    }
    return raw.split("\n").map((l) => l.trim()).filter(Boolean);
  };

  const save = (def: SectionDef) =>
    startSaving(async () => {
      const result = await saveSection({ id, section: def.key, lang, value: fromText(def.kind, drafted) });
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

  const chip = {
    border: "1px solid var(--line)",
    color: "var(--ink-faint)",
  } as const;

  /** A section's value rendered for reading, whatever kind it is. */
  const Value = ({ kind, value, muted }: { kind: SectionKind; value: unknown; muted?: boolean }) => {
    const tone = muted ? { color: "var(--ink-faint)" } : undefined;
    if (kind === "text") {
      const held = String(value ?? "").trim();
      return held ? (
        <p className="text-sm leading-relaxed" style={tone}>{held}</p>
      ) : (
        <p className="text-sm" style={{ color: "var(--ink-faint)" }}>{t("emptySection")}</p>
      );
    }
    if (kind === "phases") {
      const held = (value ?? {}) as { phases?: Phase[]; scheduleNote?: string };
      const rows = held.phases ?? [];
      if (rows.length === 0 && !held.scheduleNote) {
        return <p className="text-sm" style={{ color: "var(--ink-faint)" }}>{t("emptySection")}</p>;
      }
      return (
        <div className="flex flex-col gap-2.5">
          {rows.map((p, i) => (
            <div key={i}>
              <p className="text-sm" style={tone}>
                <span style={{ color: muted ? "var(--ink-faint)" : "var(--ink)" }}>{p.title}</span>
                {p.when && (
                  <span className="ms-2 rounded-full px-2 py-0.5 text-[12px]" style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}>
                    {p.when}
                  </span>
                )}
              </p>
              {p.detail && (
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{p.detail}</p>
              )}
            </div>
          ))}
          {held.scheduleNote && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{held.scheduleNote}</p>
          )}
        </div>
      );
    }
    const lines = Array.isArray(value) ? (value as string[]) : [];
    return lines.length === 0 ? (
      <p className="text-sm" style={{ color: "var(--ink-faint)" }}>{t("emptySection")}</p>
    ) : (
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed" style={tone}>{line}</p>
        ))}
      </div>
    );
  };

  /**
   * What came back, against what is there.
   *
   * Two stacked panes rather than two columns: at 320 pixels a pair of columns
   * is two narrow gutters of Persian, and the comparison a reviewer actually
   * makes is sequential anyway — read the old, read the new, decide.
   */
  const Comparison = ({ def }: { def: SectionDef }) => {
    if (!proposal || proposal.key !== def.key) return null;
    return (
      <div className="mt-3 overflow-hidden" style={{ ...panel, background: "var(--paper)" }}>
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-sunken)" }}
        >
          <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--cool)" }} />
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("proposed")}</span>
        </div>

        <div className="p-4">
          <p className="text-[12px] uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>{t("nowReads")}</p>
          <div className="mt-2 opacity-70">
            <Value kind={def.kind} value={proposal.before[lang]} muted />
          </div>
        </div>

        <div className="p-4" style={{ borderTop: "1px solid var(--line)", background: "var(--paper-raised)" }}>
          <p className="text-[12px] uppercase tracking-wide" style={{ color: "var(--cool)" }}>{t("wouldRead")}</p>
          <div
            className="mt-2 ps-3"
            style={{ borderInlineStart: "2px solid var(--cool)" }}
          >
            <Value kind={def.kind} value={proposal.after[lang]} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={accept}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs disabled:opacity-60"
              style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t("accept")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setProposal(null); setInstruction(""); }}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs disabled:opacity-60"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
            >
              <X className="h-3.5 w-3.5" />
              {t("discard")}
            </button>
          </div>

          {/* The instruction stays open under a proposal: not liking this one is
              the commonest reason to have an instruction at all. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("againHint")}
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--paper-sunken)", border: "1px solid var(--line)", color: "var(--ink)" }}
            />
            <button
              type="button"
              disabled={busy !== null || saving}
              onClick={() => void ask(def.key, instruction)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs disabled:opacity-60"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
            >
              {busy?.what === "section" && busy.which === def.key
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              {t("again")}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /** One section: its heading, its lines, and the three ways to change it. */
  const Section = ({ def }: { def: SectionDef }) => {
    const value = valueOf(def);
    const reviewing = proposal?.key === def.key;
    const working = busy?.what === "section" && busy.which === def.key;

    return (
      <article className="border-t py-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h3 className="text-sm">{sectionLabel(def, lang)}</h3>

          {def.optional && isEmptySection(edition.sections[def.key] ?? EMPTY_SECTION) && def.key !== TITLE_KEY && (
            <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>{t("wontPrint")}</span>
          )}

          <button
            type="button"
            disabled={reviewing}
            onClick={() => {
              if (editing === def.key) return setEditing(null);
              setDrafted(asText(def.kind, value));
              setEditing(def.key);
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] disabled:opacity-40"
            style={chip}
          >
            <Pencil className="h-3 w-3" />
            {editing === def.key ? t("cancel") : t("edit")}
          </button>

          <button
            type="button"
            disabled={busy !== null || reviewing}
            onClick={() => setAsking(asking === def.key ? null : def.key)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] disabled:opacity-40"
            style={chip}
          >
            {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("writeAgain")}
          </button>
        </div>

        {editing === def.key ? (
          <div className="mt-3">
            <textarea
              value={drafted}
              onChange={(e) => setDrafted(e.target.value)}
              rows={Math.min(16, Math.max(4, drafted.split("\n").length + 1))}
              className="w-full rounded-lg p-3 text-sm leading-relaxed"
              style={{ background: "var(--paper-sunken)", border: "1px solid var(--line)", color: "var(--ink)" }}
            />
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-faint)" }}>
              {def.kind === "phases" ? t("phaseLine") : def.kind === "text" ? t("prose") : t("oneLine")}
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(def)}
              className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs disabled:opacity-60"
              style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t("save")}
            </button>
          </div>
        ) : (
          <div className="mt-2.5" style={reviewing ? { opacity: 0.45 } : undefined}>
            <Value kind={def.kind} value={value} />
          </div>
        )}

        {asking === def.key && !reviewing && (
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
              onClick={() => void ask(def.key, instruction)}
              className="rounded-full px-4 py-2 text-xs disabled:opacity-60"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              {t("writeAgain")}
            </button>
          </div>
        )}

        <Comparison def={def} />
      </article>
    );
  };

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

      <p className="mt-5 text-xs" style={{ color: "var(--ink-faint)" }}>
        {FIXED_LABELS.engagement[lang]}: {ENGAGEMENT_LABELS[edition.engagement][lang]}
      </p>

      <div className="mt-2">
        {all.map((def) => (
          <Section key={def.key} def={def} />
        ))}
      </div>

      {/* ── Redraw the whole thing, and decide ─────────────────────────── */}
      <div className="mt-6 flex flex-col gap-3 p-4" style={panel}>
        <div className="flex flex-wrap gap-2">
          <input
            value={proposal ? "" : instruction}
            disabled={proposal !== null}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t("redrawHint")}
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            style={{ background: "var(--paper-sunken)", border: "1px solid var(--line)", color: "var(--ink)" }}
          />
          <button
            type="button"
            disabled={busy !== null || proposal !== null}
            onClick={() => void redraw(instruction)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs disabled:opacity-50"
            style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
          >
            {busy?.what === "draw" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t("redraw")}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || status === "approved"}
            onClick={() => decide("approved")}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs disabled:opacity-50"
            style={{ background: "var(--color-good)", color: "var(--paper-raised)" }}
          >
            <Check className="h-3.5 w-3.5" />
            {t("approve")}
          </button>
          <button
            type="button"
            disabled={saving || status === "rejected"}
            onClick={() => decide("rejected")}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs disabled:opacity-50"
            style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {t("reject")}
          </button>
          {status !== "pending" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => decide("pending")}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs disabled:opacity-50"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              {t("undecide")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
