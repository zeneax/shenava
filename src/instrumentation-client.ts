import { describeError, isFromAnExtension } from "@/lib/describe-error";

/**
 * The first listener on the page, and the only reason this file exists.
 *
 * A promise that rejects with a value which is not an `Error` — and a plain
 * object is the common case — reaches Next's overlay through `coerceError`,
 * which builds `new Error('' + value)`. For an object that expression is the
 * string `[object Object]`, and because the `Error` is constructed inside the
 * handler, the stack shown is the handler's own two frames. The report names
 * neither the value nor where it came from, and two unrelated failures in two
 * unrelated files produce an identical screen.
 *
 * `instrumentation-client` runs before the application becomes interactive,
 * which is the whole point: the listener registered here is ahead of Next's
 * own, so `stopImmediatePropagation()` keeps the useless report from being
 * made at all, and the value is re-raised as a real `Error` carrying
 * `describeError`'s reading of it. One entry on the overlay, and it says what
 * happened.
 *
 * Development only. In production there is no overlay to correct, and an
 * error reporter that swallows the browser's own event is a liability.
 *
 * It corrects the report, never the fault. Every await in this application
 * ends in a `catch`; if the overlay ever speaks from here, one of them has been
 * missed — and the message now says which.
 *
 * The exception is a rejection that was never ours. A wallet extension injects
 * a provider into every page it can reach and its failures reject with a
 * JSON-RPC error object; the first one this cost us a day of looking read
 * `Internal JSON-RPC error.` and came from an extension, not from any file in
 * this repository. Those are written to the console and go no further, because
 * an overlay raised by somebody else's code, over a page it has nothing to do
 * with, stops the wrong person's work.
 */
if (process.env.NODE_ENV !== "production") {
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      // An `Error` already reports itself properly, and a router signal —
      // a redirect, a not-found — is Next's to handle, not ours.
      if (reason instanceof Error) return;
      if (reason !== null && typeof reason === "object" && "digest" in reason) return;

      event.stopImmediatePropagation();
      event.preventDefault();

      if (isFromAnExtension(reason)) {
        // Said once, in the console, where whoever cares can find it. Not the
        // overlay: this page did not cause it and cannot fix it.
        console.warn(`[browser extension] ${describeError(reason)} — not from this application`);
        return;
      }

      const named = new Error(`unhandled rejection — ${describeError(reason)}`);
      // The value carried no stack, and the one this line would capture points
      // at this file, which is nowhere. Saying so beats a stack that misleads.
      named.stack = `${named.message}\n    at (the rejected value was not an Error and carried no stack)`;
      // Thrown rather than rejected again: an exception reaches the overlay
      // through the other door, so it cannot come back through this one.
      queueMicrotask(() => {
        throw named;
      });
    },
    true,
  );
}
