/**
 * Whatever was thrown, as a line a person can act on.
 *
 * WHY THIS EXISTS. Next's development overlay turns a rejection that is not an
 * `Error` into `new Error("" + value)` — see `coerceError` in
 * `next/dist/next-devtools/.../stitched-error.js` — so a plain object arrives on
 * a red screen as the words **[object Object]**, with a two-frame stack that
 * points at the overlay's own handler and nothing else. It names neither what
 * failed nor where, and there is nothing to grep for.
 *
 * Two kinds of value get thrown here that are not `Error`s. A `DOMException`,
 * which is what the browser's own APIs raise — WebCodecs, `decodeAudioData` —
 * and whose `name` is the useful half. And whatever a callback-style API hands
 * its error callback, which the type system calls `unknown` because it is.
 *
 * The output is developer-facing and goes inside a `<code>`, so it is not
 * translated and it is capped: an error carrying a whole response body should
 * not push the page sideways.
 */
const LIMIT = 300;

export function describeError(error: unknown): string {
  return clip(read(error));
}

function read(error: unknown): string {
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return String(error);

  if (error instanceof Error) {
    // `DOMException` puts the whole diagnosis in the name — `EncodingError`,
    // `NotSupportedError` — and beside it the message is often empty, so the
    // two are joined only when there are two. A name followed by a colon and
    // nothing reads like a line that was cut off.
    const named = error.name && error.name !== "Error" ? error.name : "";
    const said = error.message.trim();
    if (named && said) return `${named}: ${said}`;
    return named || said || String(error);
  }

  if (typeof error === "object") {
    const { name, message } = error as { name?: unknown; message?: unknown };
    if (typeof message === "string" && message.trim().length > 0) {
      return typeof name === "string" && name.length > 0 ? `${name}: ${message}` : message;
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      // Circular, or a getter that throws. The keys still say what it was.
    }
    const keys = Object.keys(error as object);
    return keys.length > 0 ? `object with keys: ${keys.join(", ")}` : "an object with nothing in it";
  }

  return String(error);
}

function clip(line: string): string {
  return line.length > LIMIT ? `${line.slice(0, LIMIT - 1)}…` : line;
}

/**
 * Whether a rejected value came from a browser extension rather than from this
 * application.
 *
 * A wallet extension injects a provider into every page it can reach, ours
 * included, and its failures reject with a JSON-RPC error object — `{ code:
 * -32603, message: "Internal JSON-RPC error." }` is the famous one. It is not
 * an `Error`, so it lands on the development overlay as `[object Object]`, on
 * a page that has nothing to do with it, and it interrupts whoever is working.
 *
 * Two marks give it away, and this application can produce neither. A stack
 * that names an extension URL. And a code in JSON-RPC's reserved range
 * (-32768 to -32000) or EIP-1193's provider range (4000 to 4999) — nothing
 * here speaks either protocol.
 *
 * Deliberately narrow: an ordinary object with a `code`, such as a Postgres
 * error, is this application's problem and must still be reported.
 */
export function isFromAnExtension(reason: unknown): boolean {
  if (reason === null || typeof reason !== "object") return false;
  const { code, stack } = reason as { code?: unknown; stack?: unknown };
  if (typeof stack === "string" && /(chrome|moz|safari-web)-extension:\/\//.test(stack)) return true;
  if (typeof code !== "number") return false;
  return (code <= -32000 && code >= -32768) || (code >= 4000 && code <= 4999);
}
