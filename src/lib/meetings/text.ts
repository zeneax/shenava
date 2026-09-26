/**
 * Two text helpers the schemas need, with no imports of their own.
 *
 * They live here rather than beside the schema because the schema is reached by
 * both the browser and a plain node test, and a helper that drags a dependency
 * in behind it is how a pure module stops being one.
 */

/**
 * A string cut to a length, ending on a whole word wherever it can.
 *
 * A model asked for one line occasionally writes four. Storing what came back
 * would put a paragraph in a field the page lays out as a line; cutting it
 * mid-word makes the cut look like a bug. So the cut prefers the last space,
 * unless that would throw away more than a third of the room.
 */
export function clampText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const onBoundary = /\s/.test(t[max - 1] ?? "");
  const lastSpace = slice.lastIndexOf(" ");
  const base = onBoundary ? slice : lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}…`;
}

/**
 * The last complete JSON object in a model's answer.
 *
 * THE LAST, not the first, and not the whole string parsed. A model asked for
 * JSON only will sometimes think out loud first, or wrap the object in a fenced
 * block, or produce one object, reconsider, and produce a better one. The last
 * one that parses is the answer it settled on.
 *
 * It walks the string tracking brace depth and string state rather than using a
 * regular expression, because a brace inside a quoted string — which a Persian
 * transcript contains often enough — would end the object early.
 *
 * Null when nothing in the answer parses, which the caller treats as a refusal
 * worth one retry rather than as an empty result.
 */
export function readLastJson(text: string): unknown | null {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"' && depth > 0) { inString = true; continue; }
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) { objects.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(objects[i] ?? "") as unknown;
    } catch {
      /* not this one; try the object before it */
    }
  }
  return null;
}
