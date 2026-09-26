/**
 * How much room an answer needs, as a function of how much audio was sent.
 *
 * This lives in its own file, with no imports at all, for one reason: the module
 * that uses it is marked `server-only`, and `server-only` does not resolve
 * outside Next — so anything inside it is unreachable from a plain node test.
 * A number this consequential must be testable, and the bug it exists for is
 * exactly the kind a test catches and a reading does not.
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
  const needed = Math.ceil((durationMs / 1000) * perSecond);
  return Math.max(floor, Math.min(64_000, needed));
}
