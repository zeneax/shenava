import { test } from "node:test";
import assert from "node:assert/strict";

import { describeError, isFromAnExtension } from "../src/lib/describe-error.ts";

/**
 * The case this file exists for: a rejection that is not an `Error`. The dev
 * overlay prints `[object Object]` for one, which is the least useful sentence
 * a failing upload can produce, so nothing here may return that.
 */
test("a plain object says what it holds rather than [object Object]", () => {
  assert.equal(describeError({ code: 11, detail: "encoder gone" }), '{"code":11,"detail":"encoder gone"}');
  assert.equal(describeError({}), "an object with nothing in it");
  assert.notEqual(describeError({ a: 1 }), "[object Object]");
});

test("an object that only looks like an error is read like one", () => {
  assert.equal(describeError({ name: "EncodingError", message: "unsupported" }), "EncodingError: unsupported");
  assert.equal(describeError({ message: "unsupported" }), "unsupported");
});

test("a DOMException keeps its name, which is the half that diagnoses it", () => {
  const dom = new Error("");
  dom.name = "NotSupportedError";
  assert.equal(describeError(dom), "NotSupportedError");
  assert.equal(describeError(new Error("no_encoder")), "no_encoder");
});

test("a circular object still names its keys", () => {
  const loop: Record<string, unknown> = { side: "a" };
  loop.self = loop;
  assert.equal(describeError(loop), "object with keys: side, self");
});

test("strings, nothings and numbers come back as themselves", () => {
  assert.equal(describeError("plain words"), "plain words");
  assert.equal(describeError(undefined), "undefined");
  assert.equal(describeError(null), "null");
  assert.equal(describeError(502), "502");
});

test("a very long line is clipped, because it is printed inside a page", () => {
  const long = describeError(new Error("x".repeat(1000)));
  assert.equal(long.length, 300);
  assert.ok(long.endsWith("…"));
});

/**
 * A wallet extension injects itself into every page and rejects with a
 * JSON-RPC error object. It is not this application's fault and must not take
 * over this application's error overlay — but a `code` on its own means
 * nothing, so the rule has to stay narrow.
 */
test("a wallet extension's rejection is recognised as not ours", () => {
  assert.ok(isFromAnExtension({ code: -32603, message: "Internal JSON-RPC error." }));
  assert.ok(isFromAnExtension({ code: 4001, message: "User rejected the request." }));
  assert.ok(isFromAnExtension({ message: "boom", stack: "at f (chrome-extension://abcdef/inpage.js:1:1)" }));
  assert.ok(isFromAnExtension({ message: "boom", stack: "at f (moz-extension://abcdef/inpage.js:1:1)" }));
});

test("an ordinary failure of ours is never blamed on an extension", () => {
  assert.equal(isFromAnExtension({ code: "PGRST116", message: "no rows" }), false);
  assert.equal(isFromAnExtension({ code: 502, message: "bad gateway" }), false);
  assert.equal(isFromAnExtension({ code: -1, detail: "ours" }), false);
  assert.equal(isFromAnExtension(new Error("ours")), false);
  assert.equal(isFromAnExtension("a string"), false);
  assert.equal(isFromAnExtension(null), false);
});
