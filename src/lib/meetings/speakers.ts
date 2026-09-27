import "server-only";
import { db } from "@/lib/db";
import { readLastJson } from "./text.ts";
import {
  DialogueSchema, SPANS_SHAPE, SpansAnswerSchema, chunkSentences, labelsFromSpans,
  numberedSentences, splitSentences, turnsFromLabels,
  type Dialogue, type Identity, type Speaker,
} from "./dialogue-schema.ts";
import { ask, loadMaterial, openSeat, record, retryNote, MATERIAL_GUARD, type Refusal } from "./seat.ts";
import { spansCeilingFor } from "./ceiling.ts";
import { getSettings } from "@/lib/settings";

/**
 * The speaker pass: the transcript in, the dialogue out.
 *
 * The transcript is cut into numbered sentences and shown to the model a chunk
 * at a time; it answers with SPANS — which numbers are the consultant, which the
 * client — and names the two if the meeting named them. The turns are assembled
 * HERE, from the transcriber's own words, so the model never rewrites a line.
 *
 * WHY SPANS AND NOT A LABELLED TRANSCRIPT. A labelled transcript is as long as
 * the transcript: an hour of Persian is thirty thousand tokens out, and a model
 * rewriting thirty thousand tokens drops and reshapes lines on the way. A
 * dropped line is unrecoverable. Spans are a few hundred tokens per chunk, the
 * words stay exactly the transcriber's, and the worst a bad answer can be is a
 * wrong label — which a person fixes in one press.
 *
 * Chunks go one after another, each shown the identities settled so far and the
 * tail of the chunk before it, so a turn crossing a cut is continued rather than
 * guessed again.
 */

export type SpeakersResult =
  | { ok: true; dialogue: Dialogue; model: string; costUsd: number; sentences: number }
  | { ok: false; reason: Refusal };

/** About twenty minutes of speech per chunk. */
export const CHUNK_CHARS = 16_000;

/**
 * The studio's name is not in this prompt, and must not be.
 *
 * A forkable project cannot name a studio, and it does not need to: the two
 * sides of a consultation are told apart by WHAT THEY DO in the conversation,
 * not by who they are. The consultant asks and proposes; the client describes
 * and decides. That holds for every studio, which is why this prompt works
 * unchanged for anybody who forks it.
 */
const SPEAKERS_SYSTEM = `You read the transcript of a consultation between a studio that builds software and automation for businesses, and a prospective client. The transcript has no speaker marks. Your one job is to say which sentences the studio's CONSULTANT said and which the CLIENT said.

How to tell them apart:
- The consultant asks about the business, explains what the studio does and has built, proposes how the work could be done, talks about phases, options, pricing and what happens next, and steers the conversation.
- The client describes their own business, team, tools, problem and history, says what they want to be true afterwards, answers the consultant's questions, and raises budget, timing and worries.
- A sentence usually belongs with the sentences around it: a speaker keeps the floor for several sentences at a time. Change the label only where the floor visibly changes hands — a question answered, "so what you are saying is…", a new topic introduced by the other side.
- The meeting may be in Persian, in English, or both. Names, if said ("من رضا هستم", "this is Sara from the studio"), tell you who is who; put them in "name". Otherwise leave "name" empty and say in "evidence" how you told.

Answer with spans of sentence numbers, in order, covering every number from the first to the last exactly once. Prefer a side; use "unknown" only for a sentence that genuinely cannot be placed — a stray fragment, a third voice. Return JSON only, in exactly this shape, and no other text:
${SPANS_SHAPE}`;

function chunkPrompt(input: {
  title: string;
  client: string;
  language: string;
  from: number;
  to: number;
  total: number;
  identities: { consultant: Identity; client: Identity } | null;
  tail: string;
  sentences: string;
}): string {
  const lines = [
    `Meeting: ${input.title || "(untitled)"}`,
    `Client, as recorded on the meeting: ${input.client || "(not recorded)"}`,
    `Spoken language, as the transcriber was told: ${input.language}`,
    `Sentences ${input.from} to ${input.to} of 0 to ${input.total - 1}.`,
  ];
  if (input.identities) {
    lines.push(
      "",
      "Already settled from the earlier part of this meeting — keep to it:",
      `consultant: ${input.identities.consultant.name || "(unnamed)"} — ${input.identities.consultant.evidence}`,
      `client: ${input.identities.client.name || "(unnamed)"} — ${input.identities.client.evidence}`,
    );
  }
  if (input.tail) {
    lines.push("", "The last lines before this part, already labelled, for continuity:", input.tail);
  }
  lines.push(
    "",
    "=== SENTENCES BEGIN ===",
    input.sentences,
    "=== SENTENCES END ===",
    "",
    MATERIAL_GUARD,
    input.identities ? "Answer with the spans for these sentence numbers only." : "",
  );
  return lines.join("\n");
}

export async function labelSpeakers(meetingId: string): Promise<SpeakersResult> {
  const loaded = await loadMaterial(meetingId);
  if (!loaded.ok) return loaded;
  const { meeting } = loaded;

  const sentences = splitSentences(meeting.transcript);
  if (sentences.length === 0) return { ok: false, reason: "no_transcript" };
  const chunks = chunkSentences(sentences, CHUNK_CHARS);

  const opened = await openSeat(SPEAKERS_SYSTEM);
  if (!opened.ok) return opened;
  const { seat } = opened;
  const settings = await getSettings();
  const model = settings.writerModel;

  const totals = { tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0 };
  let identities: { consultant: Identity; client: Identity } | null = null;
  const labels: Speaker[] = [];
  let failure: Refusal | null = null;
  /** The verdict behind `failure`, kept for the ledger. */
  let why = "";

  for (const chunk of chunks) {
    // What the model is shown of what came before: the label the last sentence
    // took, and the last three turns as text. Without it, a chunk that opens
    // mid-answer has nothing to continue from and guesses.
    const before = labels[labels.length - 1] ?? "unknown";
    const tail = turnsFromLabels(sentences.slice(0, labels.length), labels)
      .slice(-3)
      .map((t) => `${t.who.toUpperCase()}: ${t.text.length > 300 ? `…${t.text.slice(-300)}` : t.text}`)
      .join("\n");

    const prompt = chunkPrompt({
      title: meeting.title,
      client: meeting.clientName,
      language: meeting.language,
      from: chunk.from,
      to: chunk.to,
      total: sentences.length,
      identities,
      tail,
      sentences: numberedSentences(sentences, chunk.from, chunk.to),
    });

    let problem = "";
    let parsed: ReturnType<typeof SpansAnswerSchema.safeParse> | null = null;

    // Sized to the chunk, and not a constant — see `spansCeilingFor` for the
    // failure that flat 4,000 produced and how the ledger showed it.
    let ceiling = spansCeilingFor(chunk.to - chunk.from + 1, settings.writerMaxOutputTokens);

    // Two attempts. The second carries the first one's verdict, because "answer
    // again" without saying what was wrong usually produces the same answer.
    for (let attempt = 1; attempt <= 2 && !parsed?.success; attempt += 1) {
      const answer = await ask(seat, attempt === 1 ? prompt : prompt + retryNote(problem), ceiling);
      if ("failed" in answer) {
        problem = answer.reason;
        continue;
      }
      totals.tokensIn += answer.tokensIn;
      totals.tokensOut += answer.tokensOut;
      totals.costUsd += answer.costUsd;
      totals.ms += answer.ms;

      if (answer.cutOff) {
        // Half again the room, and do not read what was never finished: a
        // retry at the same ceiling is the same failure at the same cost.
        ceiling = Math.min(64_000, Math.ceil(ceiling * 1.5));
        problem = "it was cut off before the JSON closed";
        continue;
      }

      const object = readLastJson(answer.text);
      if (object === null) {
        problem = "no JSON object in it";
        continue;
      }
      const candidate = SpansAnswerSchema.safeParse(object);
      if (!candidate.success) {
        problem = candidate.error.issues[0]?.message ?? "the shape was wrong";
        continue;
      }
      parsed = candidate;
    }

    if (!parsed?.success) {
      failure = problem.length > 0 ? "unreadable" : "transport";
      why = problem;
      break;
    }

    if (!identities && (parsed.data.consultant || parsed.data.client)) {
      identities = {
        consultant: parsed.data.consultant ?? { name: "", evidence: "" },
        client: parsed.data.client ?? { name: "", evidence: "" },
      };
    }

    const count = chunk.to - chunk.from + 1;
    labels.push(...labelsFromSpans(count, parsed.data.spans, chunk.from, before));
  }

  await record(
    meetingId,
    "speakers",
    model,
    totals,
    failure === null,
    `${sentences.length} sentences, ${chunks.length} chunk(s)`,
    // The reason and the verdict that produced it. "unreadable" alone cannot
    // tell a cut-off answer from a wrong shape, and those want opposite fixes.
    failure ? (why ? `${failure}: ${why}` : failure) : undefined,
  );

  if (failure) return { ok: false, reason: failure };

  const dialogue = DialogueSchema.parse({
    consultant: identities?.consultant ?? { name: "", evidence: "" },
    client: identities?.client ?? { name: "", evidence: "" },
    turns: turnsFromLabels(sentences, labels),
  });

  const supabase = db();
  if (supabase) {
    await supabase
      .from("shenava_meetings")
      .update({
        dialogue,
        dialogue_model: model,
        dialogue_at: new Date().toISOString(),
      })
      .eq("id", meetingId);
  }

  return { ok: true, dialogue, model, costUsd: totals.costUsd, sentences: sentences.length };
}
