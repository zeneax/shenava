/**
 * Joining the pieces, and recognising a piece that is not an answer.
 *
 * Pure: no database, no network. The route decides what to do about a short
 * piece; this only says that it is one.
 */

/**
 * A transcript that is too short for the seconds it covers.
 *
 * Speech runs at roughly ten to fifteen characters a second in either language.
 * Under two is not a quiet stretch, it is an answer that stopped — which is
 * what a safety filter produces, and what a truncated response produces, and
 * both of those return HTTP 200 with a couple of words in them.
 *
 * Two characters a second is deliberately far below real speech: the cost of a
 * false positive is one extra request, and the cost of a false negative is a
 * transcript with a minute silently missing from the middle of it.
 */
export function implausiblyShort(text: string, audioMs: number): boolean {
  const seconds = audioMs / 1000;
  if (seconds < 5) return false;
  return text.trim().length < seconds * 2;
}

/** The pieces in index order, joined into one transcript. */
export function assembleTranscript(
  pieces: ReadonlyArray<{ idx: number; text: string | null }>,
): string {
  return [...pieces]
    .sort((a, b) => a.idx - b.idx)
    .map((p) => (p.text ?? "").trim())
    .filter((t) => t.length > 0)
    .join("\n\n");
}

/**
 * The tail of the previous piece, as context for the next one.
 *
 * It goes into the prompt so a sentence cut at a boundary is continued rather
 * than begun again. Kept short on purpose: a long tail invites the model to
 * repeat it back as part of its answer, which is worse than no context at all.
 */
export function continuation(previous: string | null, characters = 400): string {
  const text = (previous ?? "").trim();
  if (text.length === 0) return "";
  return text.length <= characters ? text : text.slice(-characters);
}
