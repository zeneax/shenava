import { z } from "zod";
import { clampText } from "./text.ts";
import { LANGS, type Lang } from "./langs.ts";
import {
  DEFAULT_SECTIONS, EMPTY_SECTION, ENGAGEMENTS, isEmptySection, safeKey, sectionLabel,
  type Engagement, type MeetingNotes, type SectionDef, type SectionKind, type SectionValue,
} from "./notes-schema.ts";
import { SECTION_KINDS } from "./proposal-guide.ts";

/**
 * A proposal template: which sections a proposal has, what each one asks the
 * writer for, and the lines the document always ends with.
 *
 * IT USED TO DESCRIBE ONLY THE PRINTING. The writer produced twelve fixed
 * sections and a template chose which of them to show, under what headings, in
 * what order — so a studio could rename a heading but never add a clause, and
 * "add a clause" is the thing studios actually want. Now the template owns the
 * list: its sections are what the writer is asked for, what the draft stores,
 * what the page shows and what the document prints, and `brief` is the sentence
 * the writer is given for each one.
 *
 * A TEMPLATE WITH NO SECTIONS FALLS BACK TO THE BUILT-IN TWELVE rather than
 * producing an empty document. An empty list is what a half-finished edit looks
 * like, and the cost of guessing wrong here is a proposal with nothing in it.
 *
 * Client-safe and pure: the page renders from this and the tests exercise it.
 */

export { SECTION_KINDS, type SectionKind, type SectionDef };

export const TemplateSectionSchema = z.object({
  key: z.string().transform(safeKey),
  label_fa: z.string().default("").transform((s) => clampText(s, 120)),
  label_en: z.string().default("").transform((s) => clampText(s, 120)),
  kind: z.enum(SECTION_KINDS).catch("lines"),
  optional: z.boolean().default(false),
  /** What the writer is told this section wants. Empty means the studio has not said. */
  brief: z.string().default("").transform((s) => clampText(s, 1200)),
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
    .transform((arr) => {
      const seen = new Set<string>();
      const out: TemplateSection[] = [];
      for (const raw of arr) {
        const parsed = TemplateSectionSchema.safeParse(raw);
        if (!parsed.success || !parsed.data.key) continue;
        // A key twice over is one section with two headings and one value. The
        // second is dropped rather than silently overwriting the first.
        if (seen.has(parsed.data.key)) continue;
        seen.add(parsed.data.key);
        out.push(parsed.data);
      }
      return out.slice(0, 40);
    }),
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
  return lang === "fa" ? template.name_fa || template.name : template.name || template.name_fa;
}

/**
 * The sections this template actually asks for.
 *
 * The one place the fallback lives, so the writer, the page, the exports and the
 * pour cannot disagree about what a sectionless template means.
 */
export function templateSections(template: Template | null | undefined): SectionDef[] {
  const held = template?.sections ?? [];
  if (held.length === 0) return DEFAULT_SECTIONS;
  return held.map((s) => ({
    key: s.key,
    label_fa: s.label_fa,
    label_en: s.label_en,
    kind: s.kind,
    optional: s.optional,
    // A section the studio added without saying what it wants still needs a
    // brief, or the writer is asked for a key with no instruction and fills it
    // with whatever the heading suggests. The heading is the better guess.
    brief: s.brief || `whatever the meeting supports under the heading «${s.label_fa || s.label_en}». If the meeting holds nothing for it, leave it empty.`,
  }));
}

/** Which template fits this draft. A suggestion the page shows and the reader may override. */
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

export type PouredSection = SectionValue & {
  key: string;
  heading: string;
  kind: SectionKind;
};

export type Poured = {
  title: string;
  engagement: Engagement;
  lang: Lang;
  sections: PouredSection[];
  houseLines: string[];
};

/**
 * The draft poured into a template, in one language. Pure.
 *
 * An optional section with nothing in it is DROPPED; a required one with
 * nothing in it is kept, so the reader sees that the meeting left it empty
 * rather than wondering whether the section exists. That distinction is the
 * only thing `optional` means.
 */
export function pour(notes: MeetingNotes, template: Template, lang: Lang): Poured {
  const edition = notes[lang];
  const sections: PouredSection[] = [];

  for (const section of templateSections(template)) {
    const value = edition.sections[section.key] ?? EMPTY_SECTION;
    if (isEmptySection(value) && section.optional) continue;
    sections.push({
      ...value,
      key: section.key,
      heading: sectionLabel(section, lang),
      kind: section.kind,
    });
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
