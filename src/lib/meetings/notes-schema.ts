import { z } from "zod";
import { clampText } from "./text.ts";
import { LANGS, type Lang } from "./langs.ts";

/**
 * What the extractor hands back: the notes a proposal is written from.
 *
 * The keys are the proposal template's own section keys, so pouring a draft
 * into a template is a copy and not a mapping. Two of them exist only because
 * a meeting can supply them and nothing else can: what was actually said about
 * money and time, and what the meeting left unsettled. Three that a proposal
 * also prints are deliberately absent — why us, the terms, and the priced
 * packages are the studio's own lines and live on the template as house lines,
 * which the writer is told about so it never proposes them itself.
 *
 * Client-safe: the page renders the notes from this shape and the document
 * exports print them, so nothing here may touch a database or the server.
 *
 * Lengths are clamped, not rejected:
 * a model cannot count characters, least of all in Persian, and a good set of
 * notes with one over-long line is a good set of notes. Missing sections
 * arrive empty rather than failing the parse — a meeting that never reached
 * exclusions has none. Unknown keys are dropped.
 */

/** The same two editions the dialogue uses; re-exported under the name this
 * module has always called them, so the shape reads as before. */
export const NOTES_LANGS = LANGS;
export type NotesLang = Lang;

export const ENGAGEMENTS = ["project", "consulting", "training", "retainer", "unknown"] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];

const LINE_MAX = 400;
const LINES_MAX = 40;

const line = z.string().transform((s) => clampText(s, LINE_MAX));
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

export const EditionSchema = z.object({
  title: text(160),
  engagement: z.enum(ENGAGEMENTS).catch("unknown"),
  summary: text(1500),
  understanding: lines,
  goals: lines,
  phases: z
    .array(z.unknown())
    .default([])
    .transform((arr) =>
      arr
        .map((p) => PhaseSchema.safeParse(p))
        .filter((r) => r.success)
        .map((r) => r.data)
        .filter((p) => p.title || p.detail)
        .slice(0, 12),
    ),
  scheduleNote: text(800),
  method: lines,
  deliverables: lines,
  budget: lines,
  exclusions: lines,
  assumptions: lines,
  nextSteps: lines,
});
export type NotesEdition = z.infer<typeof EditionSchema>;

export const MeetingNotesSchema = z.object({
  facts: lines,
  fa: EditionSchema,
  en: EditionSchema,
  openQuestions: z.object({ fa: lines, en: lines }).default({ fa: [], en: [] }),
});
export type MeetingNotes = z.infer<typeof MeetingNotesSchema>;

/** The list sections of an edition, in the order the proposal prints them. */
export const LIST_SECTIONS = [
  "understanding", "goals", "method", "deliverables", "budget",
  "exclusions", "assumptions", "nextSteps",
] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];

/** Every heading the notes print, in proposal order, in both languages. */
export const SECTION_LABELS: Record<
  "summary" | ListSection | "phases" | "openQuestions" | "facts" | "engagement",
  Record<NotesLang, string>
> = {
  summary: { fa: "خلاصهٔ پیشنهاد", en: "Summary" },
  understanding: { fa: "درک ما از نیاز شما", en: "What we heard" },
  goals: { fa: "اهداف این همکاری", en: "Goals of this engagement" },
  phases: { fa: "مراحل و زمان‌بندی", en: "Phases and timeline" },
  method: { fa: "روش اجرا، مشارکت و پشتیبانی", en: "How we work, together, and afterwards" },
  deliverables: { fa: "خروجی‌های تحویلی", en: "Deliverables" },
  budget: { fa: "بودجه و زمان، آن‌طور که گفته شد", en: "Budget and timing, as said" },
  exclusions: { fa: "آنچه در این پیشنهاد نیست", en: "What is not in this proposal" },
  assumptions: { fa: "پیش‌فرض‌ها", en: "Assumptions" },
  nextSteps: { fa: "گام‌های بعدی", en: "Next steps" },
  openQuestions: { fa: "پرسش‌های باز", en: "Open questions" },
  facts: { fa: "نکته‌های ثبت‌شده", en: "Facts on record" },
  engagement: { fa: "نوع همکاری", en: "Engagement" },
};

export const ENGAGEMENT_LABELS: Record<Engagement, Record<NotesLang, string>> = {
  project: { fa: "پروژه", en: "Project" },
  consulting: { fa: "مشاوره", en: "Consulting" },
  training: { fa: "آموزش", en: "Training" },
  retainer: { fa: "همکاری مستمر", en: "Retainer" },
  unknown: { fa: "در جلسه مشخص نشد", en: "Not settled in the meeting" },
};

/**
 * The shape, as the model is shown it. One literal, kept beside the schema
 * so the two cannot drift apart without being read together.
 */
export const NOTES_SHAPE = `{
  "facts": ["one fact per line: who said what, every number, every name, every date"],
  "fa": {
    "title": "عنوان کوتاه پیشنهاد",
    "engagement": "project | consulting | training | retainer | unknown",
    "summary": "دو تا سه جمله",
    "understanding": ["..."],
    "goals": ["..."],
    "phases": [{ "title": "...", "when": "فقط اگر در جلسه گفته شد، وگرنه خالی", "detail": "..." }],
    "scheduleNote": "",
    "method": ["..."],
    "deliverables": ["..."],
    "budget": ["فقط آنچه دربارهٔ پول و زمان گفته شد"],
    "exclusions": ["..."],
    "assumptions": ["..."],
    "nextSteps": ["..."]
  },
  "en": { "same keys, written in English for an English reader" },
  "openQuestions": { "fa": ["..."], "en": ["..."] }
}`;

/**
 * The sections the owner can have rewritten one at a time.
 *
 * Everything the page prints under a heading of its own, plus the title.
 * `phases` carries its schedule note with it, because the two are one
 * section on the proposal and a rewrite of one without the other reads as
 * two authors. `facts` is not here: it is the model's working, not prose.
 */
export const REWRITABLE_SECTIONS = [
  "title", "summary", ...LIST_SECTIONS, "phases", "openQuestions",
] as const;
export type RewritableSection = (typeof REWRITABLE_SECTIONS)[number];

export function isRewritableSection(value: unknown): value is RewritableSection {
  return typeof value === "string" && (REWRITABLE_SECTIONS as readonly string[]).includes(value);
}

/** The schema one section's value is read with, in either edition. */
export function sectionValueSchema(section: RewritableSection) {
  switch (section) {
    case "title": return EditionSchema.shape.title;
    case "summary": return EditionSchema.shape.summary;
    case "phases":
      return z.object({
        phases: EditionSchema.shape.phases,
        scheduleNote: EditionSchema.shape.scheduleNote,
      });
    case "openQuestions": return EditionSchema.shape.goals;
    default: return EditionSchema.shape[section];
  }
}

/** The value one section holds now, as the same shape the rewrite returns. */
export function sectionValue(notes: MeetingNotes, section: RewritableSection, lang: NotesLang): unknown {
  if (section === "phases") return { phases: notes[lang].phases, scheduleNote: notes[lang].scheduleNote };
  if (section === "openQuestions") return notes.openQuestions[lang];
  return notes[lang][section];
}

/**
 * The notes with one section replaced in both editions. Pure, so the merge
 * can be tested without a model; the values are expected to have been read
 * through `sectionValueSchema` already.
 */
export function withSection(
  notes: MeetingNotes,
  section: RewritableSection,
  /** A language left out is left alone; see the loop below for why that matters. */
  values: Partial<Record<NotesLang, unknown>>,
): MeetingNotes {
  const next: MeetingNotes = {
    facts: notes.facts,
    fa: { ...notes.fa },
    en: { ...notes.en },
    openQuestions: { ...notes.openQuestions },
  };
  for (const lang of NOTES_LANGS) {
    // A language the caller did not name is LEFT ALONE, and the check is for the
    // key's presence rather than for a value. Every section's schema carries a
    // default — `.default([])` for a list, `.default("")` for a line — so
    // parsing `undefined` SUCCEEDS and yields the empty default. Passing one
    // edition and omitting the other would therefore erase the other one, with
    // no error anywhere: a hand edit in Persian would silently empty the English
    // section it was not touching.
    if (!(lang in values)) continue;
    const parsed = sectionValueSchema(section).safeParse(values[lang]);
    if (!parsed.success) continue;
    const value = parsed.data;
    if (section === "phases") {
      const v = value as { phases: Phase[]; scheduleNote: string };
      next[lang].phases = v.phases;
      next[lang].scheduleNote = v.scheduleNote;
    } else if (section === "openQuestions") {
      next.openQuestions[lang] = value as string[];
    } else if (section === "title" || section === "summary") {
      next[lang][section] = value as string;
    } else {
      next[lang][section] = value as string[];
    }
  }
  return next;
}

/** The shape one rewrite answers in — the section's value, once per edition. */
export function sectionShape(section: RewritableSection): string {
  const value =
    section === "title" ? '"..."'
    : section === "summary" ? '"two or three sentences"'
    : section === "phases"
      ? '{ "phases": [{ "title": "...", "when": "only if the meeting settled it, else empty", "detail": "..." }], "scheduleNote": "" }'
    : '["one finished sentence per line", "..."]';
  return `{ "fa": ${value}, "en": ${value} }`;
}
