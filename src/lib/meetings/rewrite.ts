import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { readLastJson } from "./text.ts";
import {
  MeetingNotesSchema, NOTES_LANGS, SECTION_LABELS, sectionShape, sectionValue,
  sectionValueSchema, withSection, type MeetingNotes, type RewritableSection,
} from "./notes-schema.ts";
import { PROPOSAL_GUIDE } from "./proposal-guide.ts";
import { materialBlock } from "./notes.ts";
import { ask, ceilingFor, loadMaterial, openSeat, record, retryNote, type Refusal } from "./seat.ts";

/**
 * One section, written again — in both editions, with the rest of the draft as
 * context and nothing else touched.
 *
 * WHY A SECTION AND NOT THE WHOLE DRAFT. Redrawing a long meeting costs two
 * minutes and fifteen cents and rewrites twelve sections to change one. And the
 * reviewer's complaint is almost always about one: the summary is too long, the
 * phases are in the wrong order, the exclusions missed the thing the client
 * insisted on. So the section goes back on its own, the whole draft goes with it
 * as context so the new lines still sound like their neighbours, and the merge
 * is a pure function that the tests exercise without a model.
 */

export type RewriteResult =
  | { ok: true; notes: MeetingNotes; costUsd: number }
  | { ok: false; reason: Refusal; detail?: string };

export async function rewriteSection(
  meetingId: string,
  section: RewritableSection,
  instruction: string,
): Promise<RewriteResult> {
  const loaded = await loadMaterial(meetingId);
  if (!loaded.ok) return loaded;
  const { meeting } = loaded;

  const supabase = db();
  if (!supabase) return { ok: false, reason: "no_database" };
  const { data: row } = await supabase
    .from("shenava_meetings")
    .select("notes")
    .eq("id", meetingId)
    .maybeSingle();
  const held = row?.notes ? MeetingNotesSchema.safeParse(row.notes) : null;
  if (!held?.success) return { ok: false, reason: "no_dialogue", detail: "there is no draft to rewrite" };
  const notes = held.data;

  const settings = await getSettings();
  const heading = SECTION_LABELS[section === "title" ? "summary" : section];

  const system = `You are revising ONE section of a proposal draft that has already been written from a consultation. You return that section only, in both languages, and nothing else.

${PROPOSAL_GUIDE}

Rules that do not bend:
- Return only the section asked for, in the shape given, in both editions.
- NEVER invent a price, a timeline, a percentage, a headcount or a deadline. Only what the meeting contains. What it left open belongs in open questions, not here.
- Every line is a finished, formal sentence that could stand in the proposal unchanged.
- Persian is Persian prose — short sentences, «است» and «می‌شود», never «می‌باشد». The two editions are not translations of each other.
- Keep the voice of the rest of the draft, which is shown to you below.

Return JSON only, in exactly this shape:
${sectionShape(section)}`;

  const current = NOTES_LANGS.map(
    (lang) => `${lang}: ${JSON.stringify(sectionValue(notes, section, lang))}`,
  ).join("\n");

  const prompt = [
    materialBlock(meeting),
    "",
    `The whole draft as it stands, for voice and for what the other sections already say:`,
    JSON.stringify({ fa: notes.fa, en: notes.en, openQuestions: notes.openQuestions }),
    "",
    `The section to write again: ${section} — «${heading.fa}» / "${heading.en}".`,
    "It currently reads:",
    current,
    "",
    instruction.trim()
      ? `The reviewer's instruction, which governs:\n${instruction.trim()}`
      : "No instruction was given: write it better — tighter, more specific, closer to what the meeting actually supports.",
  ].join("\n");

  const opened = await openSeat(system);
  if (!opened.ok) return opened;
  const { seat } = opened;

  const totals = { tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0 };
  let problem = "";
  let values: Record<string, unknown> | null = null;

  const AnswerSchema = z.object({
    fa: sectionValueSchema(section),
    en: sectionValueSchema(section),
  });

  for (let attempt = 1; attempt <= 2 && values === null; attempt += 1) {
    const answer = await ask(
      seat,
      attempt === 1 ? prompt : prompt + retryNote(problem),
      ceilingFor(prompt.length / 4, 4000),
    );
    if ("failed" in answer) {
      problem = answer.reason;
      continue;
    }
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
    values = { fa: parsed.data.fa, en: parsed.data.en };
  }

  await record(meetingId, "section", settings.writerModel, totals, values !== null, section, values === null ? problem : undefined);
  if (values === null) return { ok: false, reason: "unreadable", detail: problem };

  const next = withSection(notes, section, values as Record<"fa" | "en", unknown>);
  await supabase
    .from("shenava_meetings")
    .update({
      notes: next,
      notes_edited_at: new Date().toISOString(),
      // Rewritten means unreviewed again.
      draft_status: "pending",
      draft_decided_at: null,
    })
    .eq("id", meetingId);

  return { ok: true, notes: next, costUsd: totals.costUsd };
}
