import { z } from "zod";
import { clampText } from "./text.ts";
import { LANGS, type Lang } from "./langs.ts";

export { LANGS, type Lang };

/**
 * Who said what.
 *
 * The dictation engine returns words with no speakers in them. This is the
 * shape a second pass writes them back into: the two sides of a consultation
 * — the studio's consultant and the prospective client — and the transcript
 * as turns, each turn one side's run of sentences.
 *
 * HOW THE MODEL IS ASKED, AND WHY IT IS NOT ASKED TO REPEAT THE WORDS. A
 * labelled transcript is as long as the transcript; an hour of Persian is
 * thirty thousand tokens out, and a model rewriting thirty thousand tokens
 * drops and reshapes lines on the way. So the transcript is cut into
 * numbered sentences here, the model answers with SPANS — "sentences 12 to
 * 19 are the client" — and the turns are assembled from the original text.
 * The output is a few hundred tokens per chunk, the words are exactly the
 * transcriber's, and a wrong label is a wrong label rather than a lost
 * sentence.
 *
 * Client-safe: the page renders from this shape and the exports print it.
 */

export const SPEAKERS = ["consultant", "client", "unknown"] as const;
export type Speaker = (typeof SPEAKERS)[number];

/** A run of sentences by one side. */
export type Turn = { who: Speaker; text: string };

const TURN_MAX = 6000;
const NAME_MAX = 80;
const EVIDENCE_MAX = 300;

const text = (max: number) => z.string().default("").transform((s) => clampText(s, max));

const IdentitySchema = z.object({
  name: text(NAME_MAX),
  /** One line on how the model told: "asks about the pipeline and quotes weeks". */
  evidence: text(EVIDENCE_MAX),
});
export type Identity = z.infer<typeof IdentitySchema>;

const TurnSchema = z.object({
  who: z.enum(SPEAKERS).catch("unknown"),
  text: z.string().transform((s) => clampText(s, TURN_MAX)),
});

export const DialogueSchema = z.object({
  consultant: IdentitySchema.default({ name: "", evidence: "" }),
  client: IdentitySchema.default({ name: "", evidence: "" }),
  turns: z
    .array(z.unknown())
    .default([])
    .transform((arr) =>
      arr
        .map((t) => TurnSchema.safeParse(t))
        .filter((r) => r.success)
        .map((r) => r.data)
        .filter((t) => t.text)
        .slice(0, 6000),
    ),
});
export type Dialogue = z.infer<typeof DialogueSchema>;

/** What the model answers for one chunk: the identities (first chunk) and the spans. */
export const SpanSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  who: z.enum(SPEAKERS).catch("unknown"),
});
export type Span = z.infer<typeof SpanSchema>;

export const SpansAnswerSchema = z.object({
  consultant: IdentitySchema.optional(),
  client: IdentitySchema.optional(),
  spans: z
    .array(z.unknown())
    .default([])
    .transform((arr) =>
      arr.map((s) => SpanSchema.safeParse(s)).filter((r) => r.success).map((r) => r.data),
    ),
});
export type SpansAnswer = z.infer<typeof SpansAnswerSchema>;

/** The shape, as the model is shown it — beside the schema, so they are read together. */
export const SPANS_SHAPE = `{
  "consultant": { "name": "the consultant's name, if the meeting named them, else empty", "evidence": "one line: how you could tell" },
  "client": { "name": "the client's person, if named, else empty", "evidence": "one line: how you could tell" },
  "spans": [
    { "from": 0, "to": 3, "who": "consultant" },
    { "from": 4, "to": 11, "who": "client" }
  ]
}`;

/**
 * Every sentence boundary, with nothing glued together.
 *
 * A sentence ends at a full stop, a question mark (either script), an
 * exclamation mark, an ellipsis, or a line break. This is the split the
 * OWNER edits by: the pass's usual miss is a one-word answer — «بله», «باشد»,
 * "Right." — and those are precisely what the reader reaches for, so nothing
 * may be folded away here.
 */
export function splitAllSentences(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?؟…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The transcript as the sentences the MODEL is numbered on.
 *
 * The same boundaries, with one rule on top: a fragment of a few characters —
 * a stray "…", a lone number left by a cut — is glued to the sentence before
 * it rather than numbered on its own, because the model cannot say who said
 * "3." and asking wastes a line of the answer on a coin toss.
 *
 * That rule is wrong for a person, which is why they are two functions: a
 * one-word answer must never be numbered away from the reader who wants to
 * move it. See `splitAllSentences` and `withSide`.
 */
export function splitSentences(transcript: string): string[] {
  const out: string[] = [];
  for (const piece of splitAllSentences(transcript)) {
    if (piece.length < 6 && out.length > 0) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** Windows of sentences whose text fits under `maxChars`, as index ranges (inclusive). */
export function chunkSentences(
  sentences: readonly string[],
  maxChars: number,
): Array<{ from: number; to: number }> {
  const chunks: Array<{ from: number; to: number }> = [];
  let from = 0;
  let size = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    const len = (sentences[i] ?? "").length + 8;
    if (size + len > maxChars && i > from) {
      chunks.push({ from, to: i - 1 });
      from = i;
      size = 0;
    }
    size += len;
  }
  if (sentences.length > 0) chunks.push({ from, to: sentences.length - 1 });
  return chunks;
}

/** The numbered form one chunk is shown in. */
export function numberedSentences(sentences: readonly string[], from: number, to: number): string {
  const lines: string[] = [];
  for (let i = from; i <= to && i < sentences.length; i += 1) lines.push(`[${i}] ${sentences[i]}`);
  return lines.join("\n");
}

/**
 * Spans in, one label per sentence out. Later spans win where they overlap;
 * a sentence no span names takes the label of the sentence before it, so a
 * model that skips one line does not produce a hole — and the first sentence
 * with nothing before it is `unknown`, which is the honest word.
 */
export function labelsFromSpans(
  count: number,
  spans: readonly Span[],
  offset = 0,
  before: Speaker = "unknown",
): Speaker[] {
  const labels: Array<Speaker | null> = Array.from({ length: count }, () => null);
  for (const span of spans) {
    const a = Math.max(0, Math.min(span.from, span.to) - offset);
    const b = Math.min(count - 1, Math.max(span.from, span.to) - offset);
    for (let i = a; i <= b; i += 1) labels[i] = span.who;
  }
  const out: Speaker[] = [];
  let last: Speaker = before;
  for (const label of labels) {
    last = label ?? last;
    out.push(last);
  }
  return out;
}

/** Sentences and their labels folded into turns: one turn per run of one speaker. */
export function turnsFromLabels(sentences: readonly string[], labels: readonly Speaker[]): Turn[] {
  const turns: Turn[] = [];
  sentences.forEach((sentence, i) => {
    const who = labels[i] ?? "unknown";
    const last = turns[turns.length - 1];
    if (last && last.who === who) last.text += ` ${sentence}`;
    else turns.push({ who, text: sentence });
  });
  return turns;
}

/** Every sentence one side said, as the page and the exports list them. */
export function linesOf(dialogue: Dialogue, who: Speaker): string[] {
  return dialogue.turns.filter((t) => t.who === who).map((t) => t.text);
}

/** The two sides exchanged — the owner's fix for a model that got them backwards. */
export function swapSides(dialogue: Dialogue): Dialogue {
  const flip = (who: Speaker): Speaker =>
    who === "consultant" ? "client" : who === "client" ? "consultant" : "unknown";
  return {
    consultant: dialogue.client,
    client: dialogue.consultant,
    turns: dialogue.turns.map((t) => ({ who: flip(t.who), text: t.text })),
  };
}

export const SPEAKER_LABELS: Record<Speaker, Record<Lang, string>> = {
  consultant: { fa: "مشاور", en: "Consultant" },
  client: { fa: "کلاینت", en: "Client" },
  unknown: { fa: "نامشخص", en: "Unclear" },
};

/**
 * The dialogue as the extractor reads it: one line per turn, the side in
 * capitals first. English labels in every language, because they are labels
 * for the model and not for a reader, and the prompt names them.
 */
export function dialogueAsText(dialogue: Dialogue): string {
  const tag: Record<Speaker, string> = { consultant: "CONSULTANT", client: "CLIENT", unknown: "UNCLEAR" };
  return dialogue.turns.map((t) => `${tag[t.who]}: ${t.text}`).join("\n");
}

/** How much of the dialogue is on each side — the page's one-line summary. */
export function dialogueShare(dialogue: Dialogue): Record<Speaker, number> {
  const share: Record<Speaker, number> = { consultant: 0, client: 0, unknown: 0 };
  for (const t of dialogue.turns) share[t.who] += t.text.length;
  return share;
}

/**
 * One turn's side changed, or one sentence inside it — and nothing else.
 *
 * WHY THIS AND NOT A SECOND PASS. The speaker pass is right about most of a
 * meeting and wrong about a line or two; measured on a labelled consultation
 * it placed 94.5 % of sentences and missed mostly one-word back-channels
 * («بله», «باشد») that were swallowed by the neighbouring turn. Running it
 * again costs a model call, takes a minute, and rewrites labels that were
 * already correct; swapping the sides moves the whole meeting. Neither is
 * what "this paragraph is the client, not me" means. This is: a pure edit of
 * one turn, no model, no other turn touched.
 *
 * `sentenceIndex` is null for the whole turn. Given one, the turn is split at
 * that sentence — what comes before and after keeps the turn's side, the
 * sentence takes the new one — which is how a back-channel absorbed into a
 * long turn is pulled out of it.
 *
 * Adjacent turns of the same side are deliberately NOT merged afterwards.
 * Two paragraphs marked مشاور read exactly like one, and leaving them apart
 * keeps every earlier turn at the index the page just used — so a second
 * edit lands where the reader pointed rather than one row away.
 */
export function withSide(
  dialogue: Dialogue,
  turnIndex: number,
  sentenceIndex: number | null,
  who: Speaker,
): Dialogue {
  const target = dialogue.turns[turnIndex];
  if (!target) return dialogue;

  const replacement: Turn[] = [];
  if (sentenceIndex === null) {
    replacement.push({ who, text: target.text });
  } else {
    // splitAllSentences, not splitSentences: the model's numbering folds a
    // one-word answer into its neighbour, and a one-word answer is the very
    // thing this edit exists to pull back out.
    const sentences = splitAllSentences(target.text);
    if (!sentences[sentenceIndex]) return dialogue;
    const before = sentences.slice(0, sentenceIndex).join(" ");
    const after = sentences.slice(sentenceIndex + 1).join(" ");
    if (before) replacement.push({ who: target.who, text: before });
    replacement.push({ who, text: sentences[sentenceIndex] });
    if (after) replacement.push({ who: target.who, text: after });
  }

  return {
    consultant: dialogue.consultant,
    client: dialogue.client,
    turns: [
      ...dialogue.turns.slice(0, turnIndex),
      ...replacement,
      ...dialogue.turns.slice(turnIndex + 1),
    ],
  };
}
