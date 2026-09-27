/**
 * How much room an answer needs — for each seat that asks a model a question.
 *
 * This lives in its own file, with no imports at all, for one reason: the
 * modules that use it are marked `server-only`, and `server-only` does not
 * resolve outside Next — so anything inside them is unreachable from a plain
 * node test. Numbers this consequential must be testable, and the bugs they
 * exist for are exactly the kind a test catches and a reading does not.
 *
 * They are together in one file because they are one mistake made three times.
 * An answer stopped at its ceiling does not arrive labelled as such: it arrives
 * as a truncated transcript that reads like bad dictation, or as a half-written
 * JSON object that reads as "the model does not return reliable JSON". Both
 * send you to the model. Neither is the model.
 */

/** No answer is ever asked for beyond this, whatever the arithmetic says. */
const HARD_MAX = 64_000;

/** The shape every ceiling here takes: what it needs, never under the floor. */
function room(needed: number, floor: number): number {
  return Math.max(floor, Math.min(HARD_MAX, Math.ceil(needed)));
}

/**
 * The transcriber, sized by how much audio was sent.
 *
 * THE BUG. A nine-minute piece sent under a one-minute output ceiling comes back
 * truncated, and a truncated transcript reads like bad transcription rather than
 * like an error — so you go looking at the audio. Speech is roughly ten to
 * fifteen characters a second and a token is roughly three characters, so a
 * second of speech is about five output tokens; forty is set far above that,
 * because headroom costs nothing and being one token short costs an afternoon.
 */
export function outputCeilingFor(durationMs: number, floor: number): number {
  const perSecond = 40;
  return room((durationMs / 1000) * perSecond, floor);
}

/**
 * The speaker pass, sized by how many sentences are in the chunk.
 *
 * The answer is spans rather than text, but its length still follows the
 * sentence count: the worst case the model actually produces is close to one
 * span per sentence, and a span costs about twenty tokens to write.
 *
 * THE BUG, and it is the same one. This asked for a flat 4,000 whatever the
 * chunk held. A meeting of 187 sentences wanted more, so the answer stopped
 * mid-object, no closed JSON could be found in it, and the retry — at the same
 * flat 4,000 — stopped in the same place. What the reader was shown was that
 * the model may not return reliable JSON. What the ledger showed was tokens_out
 * of exactly 8,000 on that run: 2 × 4,000, to the token. A model that finished
 * does not land on the ceiling once, let alone twice.
 *
 * Forty a sentence is the measured 20.5 doubled — a chunk of 163 sentences
 * answered in 3,344 output tokens — because the number that has to hold is the
 * worst case, and an unused ceiling is not billed.
 */
export function spansCeilingFor(sentences: number, floor: number): number {
  const perSentence = 40;
  return room(sentences * perSentence, floor);
}

/**
 * The writer, sized by the material it was given.
 *
 * About a token a character of input, with a floor — two editions of a long
 * meeting plus a fact list is more than any fixed ceiling, and this was found
 * the way such things are: a draft that failed twice at exactly the configured
 * 12,000 tokens, with a cut-off JSON that read as "unreadable".
 */
export function ceilingFor(promptLength: number, floor: number): number {
  return room(promptLength, floor);
}
