import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { readLastJson } from "./text.ts";
import {
  FIXED_LABELS, NOTES_LANGS, parseNotes, sectionLabel, sectionShape, sectionValue,
  writeSectionValue, type MeetingNotes, type NotesLang, type SectionDef,
} from "./notes-schema.ts";
import { sectionGuide } from "./proposal-guide.ts";
import { materialBlock } from "./notes.ts";
import { readSectionsFor } from "./templates-read.ts";
import { ask, ceilingFor, loadMaterial, openSeat, record, retryNote, type Refusal } from "./seat.ts";
import { nextStep, pause } from "./retry.ts";

/**
 * One section, written again — in both editions, with the rest of the draft as
 * context, and NOTHING SAVED.
 *
 * WHY IT DOES NOT SAVE. It used to, and that made a rewrite a gamble: the lines
 * you had were gone the moment the new ones arrived, and a rewrite that came
 * back worse cost you the version you were happy with. So this returns what it
 * would write and the reviewer decides. Accepting is `applySection`, which
 * takes no model and costs nothing, and is the only thing that writes.
 *
 * WHY A SECTION AND NOT THE WHOLE DRAFT. Redrawing a long meeting costs two
 * minutes and fifteen cents and rewrites twelve sections to change one. And the
 * reviewer's complaint is almost always about one: the summary is too long, the
 * phases are in the wrong order, the exclusions missed the thing the client
 * insisted on.
 */

/** The title is rewritable and belongs to no template, so it carries its own definition. */
export const TITLE_SECTION: SectionDef = {
  key: "title",
  label_fa: FIXED_LABELS.title.fa,
  label_en: FIXED_LABELS.title.en,
  kind: "text",
  optional: false,
  brief: "the engagement in a few words, as the proposal's heading.",
};

export type SectionProposal = {
  key: string;
  before: Record<NotesLang, unknown>;
  after: Record<NotesLang, unknown>;
};

export type ProposeResult =
  | { ok: true; proposal: SectionProposal; costUsd: number }
  | { ok: false; reason: Refusal; detail?: string };

/** Every section a reviewer may have written again: the template's, plus the title. */
export async function rewritableSections(templateId: string | null): Promise<SectionDef[]> {
  return [TITLE_SECTION, ...(await readSectionsFor(templateId))];
}

export async function proposeSection(
  meetingId: string,
  key: string,
  instruction: string,
): Promise<ProposeResult> {
  const loaded = await loadMaterial(meetingId);
  if (!loaded.ok) return loaded;
  const { meeting } = loaded;

  const supabase = db();
  if (!supabase) return { ok: false, reason: "no_database" };

  const sections = await readSectionsFor(meeting.templateId);
  const all = [TITLE_SECTION, ...sections];
  const section = all.find((s) => s.key === key);
  if (!section) return { ok: false, reason: "unreadable", detail: `no section «${key}» on this template` };

  const { data: row } = await supabase
    .from("shenava_meetings")
    .select("notes")
    .eq("id", meetingId)
    .maybeSingle();
  const held = row?.notes ? parseNotes(row.notes, sections) : null;
  if (!held?.success) return { ok: false, reason: "no_dialogue", detail: "there is no draft to rewrite" };
  const notes = held.data as MeetingNotes;

  const settings = await getSettings();

  const system = `You are revising ONE section of a proposal draft that has already been written from a consultation. You return that section only, in both languages, and nothing else.

${sectionGuide(sections)}

Rules that do not bend:
- Return only the section asked for, in the shape given, in both editions.
- NEVER invent a price, a timeline, a percentage, a headcount or a deadline. Only what the meeting contains. What it left open belongs in open questions, not here.
- Every line is a finished, formal sentence that could stand in the proposal unchanged.
- Persian is Persian prose — short sentences, «است» and «می‌شود», never «می‌باشد». The two editions are not translations of each other.
- Keep the voice of the rest of the draft, which is shown to you below.

Return JSON only, in exactly this shape:
{ "fa": ${sectionShape(section.kind)}, "en": ${sectionShape(section.kind)} }`;

  const before = Object.fromEntries(
    NOTES_LANGS.map((lang) => [lang, sectionValue(notes, key, section.kind, lang)]),
  ) as Record<NotesLang, unknown>;

  const whole = Object.fromEntries(
    NOTES_LANGS.map((lang) => [
      lang,
      {
        title: notes[lang].title,
        sections: Object.fromEntries(
          sections.map((s) => [s.key, writeSectionValue(s.kind, notes[lang].sections[s.key] ?? { text: "", lines: [], phases: [], scheduleNote: "" })]),
        ),
      },
    ]),
  );

  const prompt = [
    materialBlock(meeting),
    "",
    "The whole draft as it stands, for voice and for what the other sections already say:",
    JSON.stringify(whole),
    "",
    `The section to write again: ${key} — «${sectionLabel(section, "fa")}» / "${sectionLabel(section, "en")}".`,
    `What that section is for: ${section.brief}`,
    "It currently reads:",
    NOTES_LANGS.map((lang) => `${lang}: ${JSON.stringify(before[lang])}`).join("\n"),
    "",
    instruction.trim()
      ? `The reviewer's instruction, which governs:\n${instruction.trim()}`
      : "No instruction was given: write it better — tighter, more specific, closer to what the meeting actually supports.",
  ].join("\n");

  const opened = await openSeat(system);
  if (!opened.ok) return opened;
  const { seat } = opened;

  const totals = { tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0 };
  const attempts = 2;
  let problem = "";
  // True while the last attempt failed before the model answered — see notes.ts.
  let transport = false;
  let after: Record<NotesLang, unknown> | null = null;

  const AnswerSchema = z.object({ fa: z.unknown(), en: z.unknown() });

  for (let attempt = 1; attempt <= attempts && after === null; attempt += 1) {
    const answer = await ask(
      seat,
      problem && !transport ? prompt + retryNote(problem) : prompt,
      ceilingFor(prompt.length / 4, 4000),
    );
    if ("failed" in answer) {
      problem = answer.reason;
      transport = true;
      const step = nextStep(answer, attempt, attempts);
      if (!step.retry) break;
      await pause(step.waitMs);
      continue;
    }
    transport = false;
    totals.tokensIn += answer.tokensIn;
    totals.tokensOut += answer.tokensOut;
    totals.costUsd += answer.costUsd;
    totals.ms += answer.ms;

    const object = readLastJson(answer.text);
    if (object === null) {
      problem = answer.cutOff ? "it was cut off before the JSON closed" : "no JSON object in it";
      continue;
    }
    const parsed = AnswerSchema.safeParse(object);
    if (!parsed.success) {
      problem = parsed.error.issues[0]?.message ?? "the shape was wrong";
      continue;
    }
    after = { fa: parsed.data.fa, en: parsed.data.en };
  }

  await record(meetingId, "section", settings.writerModel, totals, after !== null, key, after === null ? problem : undefined);
  if (after === null) return { ok: false, reason: transport ? "transport" : "unreadable", detail: problem };

  // Nothing is written. The reviewer compares and decides; `applySection` saves.
  return { ok: true, proposal: { key, before, after }, costUsd: totals.costUsd };
}
