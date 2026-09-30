import "server-only";
import { db } from "@/lib/db";
import { getSettings, type Settings } from "@/lib/settings";
import { readLastJson } from "./text.ts";

import { DialogueSchema, dialogueAsText } from "./dialogue-schema.ts";
import { notesShape, parseNotes, type MeetingNotes, type SectionDef } from "./notes-schema.ts";
import { sectionGuide } from "./proposal-guide.ts";
import { readSectionsFor } from "./templates-read.ts";
import { ask, ceilingFor, loadMaterial, openSeat, record, retryNote, MATERIAL_GUARD, type Material, type Refusal } from "./seat.ts";
import { nextStep, pause } from "./retry.ts";

/**
 * The draft: the meeting in, the proposal's own sentences out, both languages
 * at once.
 *
 * This is the pass that needs judgement, so it gets the better model and the
 * higher ceiling. It is also the pass with one rule the whole product is judged
 * on, which is why that rule appears three times in the prompt below and is
 * phrased as a prohibition rather than a preference.
 */

export type NotesResult =
  | { ok: true; notes: MeetingNotes; model: string; costUsd: number }
  | { ok: false; reason: Refusal; detail?: string };

/**
 * The studio's own identity comes from the settings row, never from here.
 *
 * That is what makes this project forkable: somebody else's draft has to sound
 * like somebody else's studio, and nobody should have to edit a prompt in the
 * source to get that. An empty name reads as "the studio", which is neutral and
 * correct rather than a placeholder leaking into a client's document.
 */
function systemPrompt(settings: Settings, houseLines: string[], sections: readonly SectionDef[]): string {
  const name = settings.studioName.trim();
  const nameFa = settings.studioNameFa.trim();
  const named =
    name || nameFa
      ? `The studio is ${name || nameFa} in Latin script${nameFa ? ` and ${nameFa} in Persian` : ""} — those spellings exactly.`
      : "The studio's name was not given, so write «ما» / \"we\" and never invent a name for it.";

  return `You take the notes at a studio that builds automation, AI and software for businesses. You have just read a consultation between the studio and a prospective client, and you write the DRAFT of the proposal to that client: the sentences the proposal will carry, ready to be reviewed and pasted in.

The voice is engineered, direct, restrained and specific. No exclamation marks, no emoji, no "transform", no "revolutionary", no "AI-powered" as a benefit. ${named} The studio speaks as "we" (ما) and addresses the client as "you" (شما).${settings.studioVoice.trim() ? `\n\nThe studio's own note on how it writes, which governs where it applies:\n${settings.studioVoice.trim()}` : ""}

${sectionGuide(sections)}

What you write, and what you do not:
- Every line under a section is a finished, formal, fluent sentence that could stand in the proposal unchanged. Not a note, not a fragment, not a heading. Persian lines are Persian prose: short sentences, «می‌شود» and «است», never «می‌باشد», no English sentence structure.
- Write only what the meeting supports. NEVER invent a price, a timeline, a percentage, a headcount or a deadline. If a number was said, keep it exactly; if it was not, the section stays quieter and the question goes to openQuestions.
- Where the dialogue is marked, read the CLIENT lines for understanding, goals, budget and exclusions, and the CONSULTANT lines for phases, method and deliverables — and write down only what the client did not object to. A proposal the client already argued against in the meeting is not a proposal.
- Where the meeting says plain automation would do, or that something should not change, write that down. It is often the most useful line in the draft.
- Real industry terms keep their Latin spelling in the Persian edition (Postgres, TypeScript); consumer brands are written in Persian (تلگرام، گوگل).
- The two editions are not translations of each other. Each is written in its own language for its own reader.${houseLines.length > 0 ? `\n- These lines are already on the studio's proposal template and will be printed whatever you write. Do NOT propose them, repeat them, or write around them:\n${houseLines.map((l) => `  · ${l}`).join("\n")}` : ""}

How you work:
1. First, list the facts as short lines under "facts": who said what, every number, every name, every date, every tool named. Prefix each with CLIENT or CONSULTANT where the dialogue is marked. At most forty lines, each one line — the facts are your working, not the draft.
2. Then write the Persian edition and the English edition from that list and from nothing else.
3. Then list what the meeting did not settle, in both languages, under "openQuestions".

Return JSON only, in exactly this shape, and no other text:
${notesShape(sections)}`;
}

/**
 * What the model reads: the dialogue if the speakers have been told apart, the
 * raw transcript otherwise.
 *
 * The dialogue is much better material — the prompt above leans on CLIENT and
 * CONSULTANT marks for four of its sections — but a transcript alone still
 * produces a usable draft, so this does not refuse one.
 */
export function materialBlock(meeting: Material): string {
  const parsed = meeting.dialogue ? DialogueSchema.safeParse(meeting.dialogue) : null;
  const dialogue = parsed?.success && parsed.data.turns.length > 0 ? parsed.data : null;
  const body = dialogue ? dialogueAsText(dialogue) : meeting.transcript;
  const kind = dialogue ? "DIALOGUE" : "TRANSCRIPT";

  return [
    `Meeting: ${meeting.title || "(untitled)"}`,
    `Client: ${meeting.clientName || "(not recorded)"}`,
    `Spoken language, as the transcriber was told: ${meeting.language}`,
    dialogue
      ? `The two sides have been told apart. consultant: ${dialogue.consultant.name || "(unnamed)"}; client: ${dialogue.client.name || "(unnamed)"}.`
      : "The two sides have NOT been told apart, so read carefully for who is speaking and prefer the safer reading where it is unclear.",
    "",
    `=== ${kind} BEGINS ===`,
    body,
    `=== ${kind} ENDS ===`,
    "",
    MATERIAL_GUARD,
  ].join("\n");
}

async function houseLinesFor(): Promise<string[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data } = await supabase
    .from("shenava_templates")
    .select("house_lines")
    .eq("is_default", true)
    .maybeSingle();
  const held = data?.house_lines as { fa?: unknown; en?: unknown } | null | undefined;
  const flat = [...(Array.isArray(held?.fa) ? held.fa : []), ...(Array.isArray(held?.en) ? held.en : [])];
  return flat.filter((l): l is string => typeof l === "string" && l.trim().length > 0).slice(0, 20);
}

export async function draftNotes(
  meetingId: string,
  options: { instruction?: string } = {},
): Promise<NotesResult> {
  const loaded = await loadMaterial(meetingId);
  if (!loaded.ok) return loaded;
  const { meeting } = loaded;

  const settings = await getSettings();
  const houseLines = await houseLinesFor();
  // The sections the WRITER is asked for come from the meeting's template, so
  // adding a clause on the templates page and redrawing is the whole loop.
  const sections = await readSectionsFor(meeting.templateId);
  const opened = await openSeat(systemPrompt(settings, houseLines, sections));
  if (!opened.ok) return opened;
  const { seat } = opened;
  const model = settings.writerModel;

  const instruction = (options.instruction ?? "").trim();
  const prompt = [
    materialBlock(meeting),
    instruction
      ? `\nThe reviewer's instruction for this draft, which governs where it can:\n${instruction}`
      : "",
  ].join("\n");

  const totals = { tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0 };
  const attempts = 2;
  let problem = "";
  // True while the last attempt failed before the model said anything — a
  // status or a dropped connection, not an answer. The two want opposite
  // fixes, and were reported under one word until a 429 sent a reader off to
  // change the writer model.
  let transport = false;
  // Sized to the material, not fixed: two editions of a long meeting plus a
  // fact list is more than any constant, and a draft cut off at the ceiling
  // parses as "unreadable" — which sends you looking at the model rather than
  // at the number.
  let ceiling = ceilingFor(prompt.length, settings.writerMaxOutputTokens);
  let notes: MeetingNotes | null = null;

  for (let attempt = 1; attempt <= attempts && notes === null; attempt += 1) {
    // The verdict goes back to the model only when there was an answer to
    // pass a verdict on. After a refusal there was none, and the refusal's
    // body is not something to ask the model to correct.
    const answer = await ask(seat, problem && !transport ? prompt + retryNote(problem) : prompt, ceiling);
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

    if (answer.cutOff) {
      // Half again the room, and do not parse what was never finished.
      ceiling = Math.min(64_000, Math.ceil(ceiling * 1.5));
      problem = "it was cut off before the JSON closed";
      continue;
    }

    const object = readLastJson(answer.text);
    if (object === null) {
      problem = "no JSON object in it";
      continue;
    }
    const parsed = parseNotes(object, sections);
    if (!parsed.success) {
      problem = parsed.error.issues[0]?.message ?? "the shape was wrong";
      continue;
    }
    notes = parsed.data;
  }

  await record(
    meetingId,
    "writer",
    model,
    totals,
    notes !== null,
    instruction ? `redrawn: ${instruction.slice(0, 120)}` : "drawn",
    notes === null ? problem : undefined,
  );

  if (notes === null) return { ok: false, reason: transport ? "transport" : "unreadable", detail: problem };

  const supabase = db();
  if (supabase) {
    await supabase
      .from("shenava_meetings")
      .update({
        notes,
        notes_model: model,
        notes_at: new Date().toISOString(),
        // Every redraw returns the draft to pending. A draft that keeps an
        // approval it was not given is the one way this product could put a
        // sentence nobody read in front of a client.
        draft_status: "pending",
        draft_decided_at: null,
      })
      .eq("id", meetingId);
  }

  return { ok: true, notes, model, costUsd: totals.costUsd };
}
