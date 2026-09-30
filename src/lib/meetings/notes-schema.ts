import { z } from "zod";
import { clampText } from "./text.ts";
import { LANGS, type Lang } from "./langs.ts";
import { DEFAULT_SECTIONS, type SectionDef, type SectionKind } from "./proposal-guide.ts";

/**
 * What the extractor hands back: the notes a proposal is written from.
 *
 * AN EDITION IS A MAP, NOT A RECORD OF FIXED FIELDS. It used to be twelve named
 * keys, which meant the section list lived in this file and adding a clause to a
 * proposal meant a deploy. A studio has to be able to add one from the templates
 * page, so the list moved to the template and what is stored here is
 * `sections: { <key>: value }` in whatever keys that template names.
 *
 * WHAT STAYED OUTSIDE THE MAP, and why each one had to. `title` and
 * `engagement` settle what the document IS rather than what it says, and the
 * engagement is what picks the template in the first place — a key that chooses
 * the template cannot live inside it. `facts` is the model's working, never
 * printed as a section. Everything else, open questions included, is an
 * ordinary section that a template may reorder, rename or drop.
 *
 * Client-safe: the page renders the notes from this shape and the document
 * exports print them, so nothing here may touch a database or the server.
 *
 * Lengths are clamped, not rejected: a model cannot count characters, least of
 * all in Persian, and a good set of notes with one over-long line is a good set
 * of notes. A missing section arrives empty rather than failing the parse — a
 * meeting that never reached exclusions has none.
 */

export const NOTES_LANGS = LANGS;
export type NotesLang = Lang;
export type { SectionDef, SectionKind };

export const ENGAGEMENTS = ["project", "consulting", "training", "retainer", "unknown"] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];

const LINE_MAX = 400;
const LINES_MAX = 40;

const lines = z
  .array(z.unknown())
  .default([])
  .transform((arr) =>
    arr
      .filter((v): v is string => typeof v === "string")
      .map((s) => clampText(s, LINE_MAX))
      .filter(Boolean)
      .slice(0, LINES_MAX),
  );
const text = (max: number) => z.string().default("").transform((s) => clampText(s, max));

export const PhaseSchema = z.object({
  title: text(160),
  when: text(80),
  detail: text(800),
});
export type Phase = z.infer<typeof PhaseSchema>;

const phases = z
  .array(z.unknown())
  .default([])
  .transform((arr) =>
    arr
      .map((p) => PhaseSchema.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data)
      .filter((p) => p.title || p.detail)
      .slice(0, 12),
  );

/**
 * One section's value, stored the same way whatever kind it is.
 *
 * All four fields are always present and mostly empty, which looks wasteful and
 * is the reason anything downstream can render a section without being told its
 * kind first. `pour`'s own `PouredSection` has had this shape all along; this
 * makes the stored draft agree with it.
 */
export const SectionValueSchema = z.object({
  text: text(1500),
  lines,
  phases,
  scheduleNote: text(800),
});
export type SectionValue = z.infer<typeof SectionValueSchema>;

export const EMPTY_SECTION: SectionValue = { text: "", lines: [], phases: [], scheduleNote: "" };

export function isEmptySection(value: SectionValue | undefined): boolean {
  if (!value) return true;
  return (
    value.text.trim().length === 0 &&
    value.lines.length === 0 &&
    value.phases.length === 0 &&
    value.scheduleNote.trim().length === 0
  );
}

/** A key the studio typed, reduced to something safe to use as a key. */
export function safeKey(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_]/g, "");
  return cleaned.slice(0, 40);
}

export const EditionSchema = z.object({
  title: text(160),
  engagement: z.enum(ENGAGEMENTS).catch("unknown"),
  sections: z
    .record(z.string(), z.unknown())
    .default({})
    .transform((map) => {
      const out: Record<string, SectionValue> = {};
      for (const [key, raw] of Object.entries(map)) {
        const k = safeKey(key);
        if (!k) continue;
        const parsed = SectionValueSchema.safeParse(raw);
        if (parsed.success) out[k] = parsed.data;
      }
      return out;
    }),
});
export type NotesEdition = z.infer<typeof EditionSchema>;

/**
 * The value a model returns for a section, made into the stored shape.
 *
 * The model answers with the natural thing — a string, an array of lines, or
 * `{ phases, scheduleNote }` — and never with the four-field wrapper, because
 * asking it to wrap is a instruction it will get wrong on some meetings and the
 * wrapper carries no information the template does not already have. The kind
 * comes from the template, which is the only place that knows it.
 */
export function readSectionValue(kind: SectionKind, raw: unknown): SectionValue {
  // It reads BOTH the flat value the model returns and the four-field value
  // already in storage, because the alternative is telling the two apart by
  // guessing, and a stored `phases` value and a returned one look alike.
  const held = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  if (kind === "text") {
    const value = typeof raw === "string" ? raw : typeof held?.text === "string" ? held.text : "";
    return { ...EMPTY_SECTION, text: clampText(value, 1500) };
  }
  if (kind === "phases") {
    return {
      ...EMPTY_SECTION,
      phases: phases.safeParse(Array.isArray(raw) ? raw : held?.phases).data ?? [],
      scheduleNote: typeof held?.scheduleNote === "string" ? clampText(held.scheduleNote, 800) : "",
    };
  }
  return { ...EMPTY_SECTION, lines: lines.safeParse(Array.isArray(raw) ? raw : held?.lines).data ?? [] };
}

/**
 * A whole draft read against the sections a template names.
 *
 * The one entry point for turning anything — fresh model output, a stored row,
 * a draft written before the section list moved to the template — into notes.
 * A key the template does not name is DROPPED: a model that invents a thirteenth
 * section should not have it printed, and a template that dropped a section
 * should not keep showing it from an old draft.
 */
export function parseNotes(raw: unknown, sections: readonly SectionDef[]) {
  const lifted = lift(raw);
  if (!lifted || typeof lifted !== "object") return MeetingNotesSchema.safeParse(lifted);
  const held = lifted as Record<string, unknown>;
  const out: Record<string, unknown> = { facts: held.facts ?? [] };

  for (const lang of NOTES_LANGS) {
    const edition = (held[lang] ?? {}) as Record<string, unknown>;
    const given = (edition.sections ?? {}) as Record<string, unknown>;
    const mapped: Record<string, SectionValue> = {};
    for (const section of sections) {
      if (!(section.key in given)) continue;
      mapped[section.key] = readSectionValue(section.kind, given[section.key]);
    }
    out[lang] = { title: edition.title ?? "", engagement: edition.engagement ?? "unknown", sections: mapped };
  }
  return MeetingNotesSchema.safeParse(out);
}

/** The other direction: the stored value as the model is shown and returns it. */
export function writeSectionValue(kind: SectionKind, value: SectionValue): unknown {
  if (kind === "text") return value.text;
  if (kind === "phases") return { phases: value.phases, scheduleNote: value.scheduleNote };
  return value.lines;
}

export const MeetingNotesSchema = z.preprocess(
  (raw) => lift(raw),
  z.object({
    facts: lines,
    fa: EditionSchema,
    en: EditionSchema,
  }),
);
export type MeetingNotes = { facts: string[]; fa: NotesEdition; en: NotesEdition };

/**
 * A draft stored before the section list moved to the template, read as one
 * stored after.
 *
 * Every draft written before this change has twelve named keys on each edition
 * and an `openQuestions` pair at the top level. They are real drafts belonging
 * to real meetings and they must keep opening, so they are lifted on the way in
 * rather than migrated in SQL — a migration can only reach the rows that
 * existed when it ran, and this reaches a row restored from a backup next year.
 *
 * Pure, and exercised against a fixture of the old shape in the tests.
 */
const LEGACY_LIST = [
  "understanding", "goals", "method", "deliverables", "budget",
  "exclusions", "assumptions", "whyUs", "nextSteps",
] as const;

function lift(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const held = raw as Record<string, unknown>;
  const editions = ["fa", "en"] as const;
  // A draft already in the new shape has `sections` on an edition. Leave it.
  const already = editions.some((l) => {
    const e = held[l];
    return e && typeof e === "object" && "sections" in (e as object);
  });
  if (already) return raw;

  const openQuestions = (held.openQuestions ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { facts: held.facts ?? [] };

  for (const lang of editions) {
    const old = (held[lang] ?? {}) as Record<string, unknown>;
    const sections: Record<string, unknown> = {};
    if (old.summary !== undefined) sections.summary = readSectionValue("text", old.summary);
    if (old.phases !== undefined || old.scheduleNote !== undefined) {
      sections.phases = readSectionValue("phases", { phases: old.phases, scheduleNote: old.scheduleNote });
    }
    for (const key of LEGACY_LIST) {
      if (old[key] !== undefined) sections[key] = readSectionValue("lines", old[key]);
    }
    const asked = openQuestions[lang];
    if (asked !== undefined) sections.openQuestions = readSectionValue("lines", asked);
    out[lang] = { title: old.title ?? "", engagement: old.engagement ?? "unknown", sections };
  }
  return out;
}

/** Headings for the two keys no template owns, plus the model's working. */
export const FIXED_LABELS = {
  engagement: { fa: "نوع همکاری", en: "Engagement" },
  facts: { fa: "نکته‌های ثبت‌شده", en: "Facts on record" },
  title: { fa: "عنوان", en: "Title" },
} as const;

export const ENGAGEMENT_LABELS: Record<Engagement, Record<NotesLang, string>> = {
  project: { fa: "پروژه", en: "Project" },
  consulting: { fa: "مشاوره", en: "Consulting" },
  training: { fa: "آموزش", en: "Training" },
  retainer: { fa: "همکاری مستمر", en: "Retainer" },
  unknown: { fa: "در جلسه مشخص نشد", en: "Not settled in the meeting" },
};

/** A section's heading in one language, falling back to the other rather than printing nothing. */
export function sectionLabel(section: SectionDef, lang: NotesLang): string {
  return (lang === "fa" ? section.label_fa || section.label_en : section.label_en || section.label_fa).trim();
}

/** What one section's value looks like in the JSON the model returns. */
export function sectionShape(kind: SectionKind): string {
  if (kind === "text") return '"two or three sentences"';
  if (kind === "phases") {
    return '{ "phases": [{ "title": "...", "when": "only if the meeting settled it, else empty", "detail": "..." }], "scheduleNote": "" }';
  }
  return '["one finished sentence per line", "..."]';
}

/**
 * The shape the model is shown for a whole draft, composed from the sections
 * the template names. Pure, so a template's shape can be read in a test.
 */
export function notesShape(sections: readonly SectionDef[]): string {
  const body = sections.map((s) => `      "${s.key}": ${sectionShape(s.kind)}`).join(",\n");
  return `{
  "facts": ["one fact per line: who said what, every number, every name, every date"],
  "fa": {
    "title": "عنوان کوتاه پیشنهاد",
    "engagement": "project | consulting | training | retainer | unknown",
    "sections": {
${body}
    }
  },
  "en": { "the same keys, written in English for an English reader" }
}`;
}

/** The value one section holds now, in the shape a rewrite returns. */
export function sectionValue(notes: MeetingNotes, key: string, kind: SectionKind, lang: NotesLang): unknown {
  if (key === "title") return notes[lang].title;
  return writeSectionValue(kind, notes[lang].sections[key] ?? EMPTY_SECTION);
}

/**
 * The notes with one section replaced in both editions. Pure, so the merge can
 * be tested without a model.
 */
export function withSection(
  notes: MeetingNotes,
  key: string,
  kind: SectionKind,
  /** A language left out is left alone; see the loop below for why that matters. */
  values: Partial<Record<NotesLang, unknown>>,
): MeetingNotes {
  const next: MeetingNotes = {
    facts: notes.facts,
    fa: { ...notes.fa, sections: { ...notes.fa.sections } },
    en: { ...notes.en, sections: { ...notes.en.sections } },
  };
  for (const lang of NOTES_LANGS) {
    // A language the caller did not name is LEFT ALONE, and the check is for
    // the key's presence rather than for a value. Every reader here carries a
    // default — the empty section, the empty string — so reading `undefined`
    // SUCCEEDS and yields the empty default. Passing one edition and omitting
    // the other would therefore erase the other one, with no error anywhere: a
    // hand edit in Persian would silently empty the English it was not touching.
    if (!(lang in values)) continue;
    if (key === "title") {
      next[lang].title = typeof values[lang] === "string" ? clampText(values[lang] as string, 160) : next[lang].title;
      continue;
    }
    next[lang].sections[key] = readSectionValue(kind, values[lang]);
  }
  return next;
}

/** The built-in sections, re-exported so callers need one import rather than two. */
export { DEFAULT_SECTIONS };
