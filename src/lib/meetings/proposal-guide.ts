/**
 * What each section of the proposal is for, as the writer is told it.
 *
 * THIS FILE USED TO BE ONE STRING. It is now a list, because a studio must be
 * able to add a clause, drop one, reword what a clause asks for, and have the
 * writer obey — from the templates page, without a deploy. A string cannot be
 * edited by a person who does not have the repository; a row can.
 *
 * So a section is DATA: a key, a heading in both languages, what kind of thing
 * it holds, and a `brief` — the one sentence that tells the writer what belongs
 * in it. The twelve below are what the built-in template ships with, and
 * `sectionGuide` composes them back into the block the prompt carries. A
 * template with its own sections composes the same way, from its own briefs.
 *
 * WHAT IS NOT DATA. `WRITER_RULES` is fixed and no template can reach it. It
 * holds the prohibition the whole product is judged on, and a studio that could
 * edit its own proposal template into permission to invent a price would be a
 * studio that had been handed the one thing this product exists to withhold.
 *
 * It lives in a file of its own, with no imports, because the modules that use
 * it are marked `server-only` — and `server-only` does not resolve outside Next,
 * which would put this beyond the reach of a test. A test asserts the phrasing
 * below, so softening it has to be a deliberate act with a failing test in front
 * of it.
 */

/** The kinds of thing a section can hold. A template says which. */
export const SECTION_KINDS = ["text", "lines", "phases"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export type SectionDef = {
  key: string;
  label_fa: string;
  label_en: string;
  kind: SectionKind;
  /** Dropped from the document when the meeting left it empty. */
  optional: boolean;
  /** What the writer is told this section wants. The editable part. */
  brief: string;
};

/**
 * The two keys that are not sections: they settle what the document IS rather
 * than what it says, every template needs them, and no template may drop them.
 */
export const FIXED_GUIDE = `- title: the engagement in a few words, as the proposal's heading.
- engagement: project (a scoped build with an end), consulting (advice by the hour or the day), training (teaching the client's people), retainer (ongoing work by the month); unknown if the meeting did not settle it.`;

/** What the built-in template ships with. A studio's own template may differ. */
export const DEFAULT_SECTIONS: SectionDef[] = [
  {
    key: "summary", label_fa: "خلاصهٔ پیشنهاد", label_en: "Summary", kind: "text", optional: false,
    brief: "two or three sentences — what the client needs, what the studio proposes, and what changes for them afterwards.",
  },
  {
    key: "understanding", label_fa: "درک ما از نیاز شما", label_en: "What we heard", kind: "lines", optional: false,
    brief: "the client's situation as THEY described it — their business, their team, their tools, what goes wrong today and what it costs them. Their words where you can; their numbers exactly.",
  },
  {
    key: "goals", label_fa: "اهداف این همکاری", label_en: "Goals of this engagement", kind: "lines", optional: false,
    brief: "what the client wants to be true afterwards. Outcomes, not features.",
  },
  {
    key: "phases", label_fa: "مراحل و زمان‌بندی", label_en: "Phases and timeline", kind: "phases", optional: false,
    brief: "the stages the CONSULTANT proposed and the client accepted, each with a title and a line of detail; \"when\" only if the meeting settled it. scheduleNote: one line on the overall timing, only if it was discussed.",
  },
  {
    key: "method", label_fa: "روش اجرا، مشارکت و پشتیبانی", label_en: "How we work, together, and afterwards", kind: "lines", optional: false,
    brief: "how the studio will work — discovery, iterations, what the client's side provides, how handover and support happen. From what the consultant said and the client agreed to.",
  },
  {
    key: "deliverables", label_fa: "خروجی‌های تحویلی", label_en: "Deliverables", kind: "lines", optional: false,
    brief: "what the client will hold at the end, one per line, concrete.",
  },
  {
    key: "budget", label_fa: "بودجه و زمان، آن‌طور که گفته شد", label_en: "Budget and timing, as said", kind: "lines", optional: false,
    brief: "ONLY what was actually said about money and time, by whom, in their terms. Never a figure the studio did not say or the client did not say.",
  },
  {
    key: "exclusions", label_fa: "آنچه در این پیشنهاد نیست", label_en: "What is not in this proposal", kind: "lines", optional: false,
    brief: "what was named as out of scope, and what the client said should not change.",
  },
  {
    key: "assumptions", label_fa: "پیش‌فرض‌ها", label_en: "Assumptions", kind: "lines", optional: false,
    brief: "what the studio would be relying on — accesses, data, a person on their side, a tool staying as it is — said or plainly implied.",
  },
  {
    key: "whyUs", label_fa: "چرا ما", label_en: "Why us", kind: "lines", optional: true,
    brief: "why this studio and why this way — ONLY from what the consultant said in the room about how they work, what they have built before, or why they proposed it in this shape. Never a year count, a client list, a track record or a credential the meeting did not contain. If nothing of the kind was said, leave it empty: a studio's standing lines belong on its template, not in a draft.",
  },
  {
    key: "nextSteps", label_fa: "گام‌های بعدی", label_en: "Next steps", kind: "lines", optional: false,
    brief: "what the two sides agreed to do next, in order.",
  },
  {
    key: "openQuestions", label_fa: "پرسش‌های باز", label_en: "Open questions", kind: "lines", optional: true,
    brief: "everything the meeting left unsettled that the proposal will need — as questions, one per line.",
  },
];

/**
 * The section block of the prompt, composed from whatever sections it is given.
 *
 * Pure, so a template's own sections can be composed and read in a test without
 * a model. The output for `DEFAULT_SECTIONS` is the string this file used to
 * hold as a literal, which is what lets the test that guards the wording keep
 * asserting the same phrases through the change.
 */
export function sectionGuide(sections: readonly SectionDef[]): string {
  const lines = sections.map((s) => `- ${s.key}: ${s.brief}`);
  return [
    "The proposal this draft feeds has these sections, in this order, and each wants exactly this:",
    FIXED_GUIDE,
    ...lines,
  ].join("\n");
}

/**
 * The rules no template can reach. Fixed on purpose — see the file comment.
 */
export const WRITER_RULES = `Write only what the meeting supports. NEVER invent a price, a timeline, a percentage, a headcount or a deadline. If a number was said, keep it exactly; if it was not, the section stays quieter and the question goes to the open questions.`;

/** The built-in template's guide, which is what the writer gets when a meeting has no template of its own. */
export const PROPOSAL_GUIDE = sectionGuide(DEFAULT_SECTIONS);
