import { z } from "zod";
import { clampText } from "./text.ts";
import { LANGS, type Lang } from "./langs.ts";
import { ENGAGEMENTS, LIST_SECTIONS, type Engagement, type MeetingNotes } from "./notes-schema.ts";

/**
 * A proposal template: the shape of the document a draft is poured into.
 *
 * WHY A TEMPLATE AT ALL, when the draft already has eleven sections. Because
 * they are not the same thing. The draft is what the MEETING supports; the
 * template is what YOUR proposals look like — which sections you print, in what
 * order, under what headings, and the lines you always end with. Two studios
 * reading the same meeting should get the same draft and different documents.
 *
 * The section keys are the draft's own keys, so pouring is a copy and not a
 * mapping. A template naming a key the draft does not have prints nothing for it
 * rather than failing, because a template outliving a schema change is the
 * normal case and a document that refuses to print is not.
 *
 * Client-safe and pure: the page renders from this and the tests exercise it.
 */

export const SECTION_KINDS = ["text", "lines", "phases"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** Every key a template may print, in the order the draft holds them. */
export const TEMPLATE_KEYS = ["summary", ...LIST_SECTIONS, "phases", "openQuestions"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TemplateSectionSchema = z.object({
  key: z.string().transform((s) => clampText(s, 40)),
  label_fa: z.string().default("").transform((s) => clampText(s, 120)),
  label_en: z.string().default("").transform((s) => clampText(s, 120)),
  kind: z.enum(SECTION_KINDS).catch("lines"),
  optional: z.boolean().default(false),
});
export type TemplateSection = z.infer<typeof TemplateSectionSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().default("").transform((s) => clampText(s, 120)),
  name_fa: z.string().default("").transform((s) => clampText(s, 120)),
  engagement: z.enum(ENGAGEMENTS).catch("unknown"),
  sections: z
    .array(z.unknown())
    .default([])
    .transform((arr) =>
      arr.map((s) => TemplateSectionSchema.safeParse(s)).filter((r) => r.success).map((r) => r.data),
    ),
  house_lines: z
    .object({
      fa: z.array(z.string()).default([]),
      en: z.array(z.string()).default([]),
    })
    .default({ fa: [], en: [] }),
  is_default: z.boolean().default(false),
});
export type Template = z.infer<typeof TemplateSchema>;

export function templateName(template: Template, lang: Lang): string {
  const chosen = lang === "fa" ? template.name_fa || template.name : template.name || template.name_fa;
  return chosen;
}

/**
 * Which template fits this draft.
 *
 * A template declaring the draft's own engagement wins; otherwise the default
 * one; otherwise the first there is. This is a suggestion, not a decision — the
 * page shows which it picked and lets the reader choose another, because a
 * suggestion presented as a fact is the kind of help nobody asked for.
 */
export function suggestTemplate(
  templates: readonly Template[],
  engagement: Engagement,
): Template | null {
  if (templates.length === 0) return null;
  return (
    templates.find((t) => t.engagement === engagement && engagement !== "unknown") ??
    templates.find((t) => t.is_default) ??
    templates[0] ??
    null
  );
}

export type PouredSection = {
  key: string;
  heading: string;
  kind: SectionKind;
  /** For `text`. */
  text: string;
  /** For `lines`. */
  lines: string[];
  /** For `phases`. */
  phases: { title: string; when: string; detail: string }[];
  scheduleNote: string;
};

export type Poured = {
  title: string;
  engagement: Engagement;
  lang: Lang;
  sections: PouredSection[];
  houseLines: string[];
};

const EMPTY = { text: "", lines: [] as string[], phases: [] as PouredSection["phases"], scheduleNote: "" };

/**
 * The draft poured into a template, in one language. Pure.
 *
 * An optional section with nothing in it is DROPPED; a required one with nothing
 * in it is kept, so the reader sees that the meeting left it empty rather than
 * wondering whether the section exists. That distinction is the only thing
 * `optional` means.
 */
export function pour(notes: MeetingNotes, template: Template, lang: Lang): Poured {
  const edition = notes[lang];
  const sections: PouredSection[] = [];

  for (const section of template.sections) {
    const heading = (lang === "fa" ? section.label_fa || section.label_en : section.label_en || section.label_fa).trim();
    const base = { key: section.key, heading, kind: section.kind, ...EMPTY };

    let filled: PouredSection = base;
    if (section.key === "phases") {
      filled = { ...base, phases: edition.phases, scheduleNote: edition.scheduleNote };
    } else if (section.key === "openQuestions") {
      filled = { ...base, lines: notes.openQuestions[lang] };
    } else if (section.key === "summary") {
      filled = { ...base, text: edition.summary };
    } else if ((LIST_SECTIONS as readonly string[]).includes(section.key)) {
      filled = { ...base, lines: edition[section.key as (typeof LIST_SECTIONS)[number]] };
    }
    // A key the draft does not have prints nothing rather than failing: a
    // template outliving a schema change is the normal case.

    const empty =
      filled.text.trim().length === 0 &&
      filled.lines.length === 0 &&
      filled.phases.length === 0 &&
      filled.scheduleNote.trim().length === 0;
    if (empty && section.optional) continue;
    sections.push(filled);
  }

  return {
    title: edition.title,
    engagement: edition.engagement,
    lang,
    sections,
    houseLines: template.house_lines[lang] ?? [],
  };
}

/**
 * The next proposal number, from the highest one already used this year.
 *
 * `SHP-2026-0007`. Pure so the numbering is testable: a number handed out twice
 * is two documents a client cannot tell apart, and the failure only shows up
 * months later in someone's records.
 */
export function nextNumber(existing: readonly string[], year: number, prefix = "SHP"): string {
  const head = `${prefix}-${year}-`;
  const highest = existing
    .filter((n) => n.startsWith(head))
    .map((n) => Number.parseInt(n.slice(head.length), 10))
    .filter((n) => Number.isInteger(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${head}${String(highest + 1).padStart(4, "0")}`;
}

export { LANGS, type Lang };
