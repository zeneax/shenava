/**
 * Loads pages in a headless Chrome and reports every promise that rejects.
 *
 *   node scripts/catch-rejections.mjs                       # the usual doors
 *   node scripts/catch-rejections.mjs /app/new /app/settings
 *   PORT=3000 node scripts/catch-rejections.mjs
 *
 * WHY IT EXISTS. A rejection whose value is not an `Error` reaches the
 * development overlay as the words `[object Object]` above two frames of
 * Next's own handler — it names neither the value nor where it came from, and
 * there is nothing to grep for. This attaches the FIRST `unhandledrejection`
 * listener on the page, before any framework script runs, and prints what the
 * value actually is: its constructor, its keys, its JSON, its stack if it has
 * one.
 *
 * It only opens pages. It presses nothing, uploads nothing, and cannot reach
 * the transcription route, so it never spends anything.
 */
const PORT = process.env.PORT ?? "3100";
const CDP = Number(process.env.CDP_PORT ?? 9222);
const paths = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ["/", "/app", "/app/new", "/app/templates", "/app/settings", "/app/connections"];

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const WATCH = `
  window.__rejections = [];
  window.addEventListener("unhandledrejection", (event) => {
    const r = event.reason;
    let shape;
    try {
      shape = {
        kind: typeof r,
        constructor: r && r.constructor ? r.constructor.name : null,
        isError: r instanceof Error,
        asString: String(r),
        keys: r && typeof r === "object" ? Object.keys(r).slice(0, 25) : null,
        json: (() => { try { return JSON.stringify(r)?.slice(0, 900); } catch { return "<circular>"; } })(),
        stack: r && r.stack ? String(r.stack).split("\\n").slice(0, 12) : null,
      };
    } catch (e) { shape = { unreadable: String(e) }; }
    window.__rejections.push(shape);
  }, true);
`;

const { spawn } = await import("node:child_process");
const { mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const profile = mkdtempSync(join(tmpdir(), "shenava-cdp-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch { /* not up yet */ }
    await wait(250);
  }
  throw new Error(`no Chrome on ${CDP} — is ${CHROME} there?`);
}

let bad = 0;
try {
  const page = await target();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const waiting = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const thrown = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg.result); waiting.delete(msg.id); return; }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      thrown.push(String(d.exception?.description ?? d.text).split("\n")[0]);
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: WATCH });

  for (const path of paths) {
    thrown.length = 0;
    await send("Page.navigate", { url: `http://localhost:${PORT}${path}` });
    await wait(5000);
    const got = await send("Runtime.evaluate", {
      expression: "JSON.stringify(window.__rejections || [])",
      returnByValue: true,
    });
    const rejections = JSON.parse(got.result.value);
    const clean = rejections.length === 0 && thrown.length === 0;
    console.log(`${clean ? "ok  " : "BAD "} ${path}`);
    for (const r of rejections) { bad += 1; console.log("     rejected:", JSON.stringify(r)); }
    for (const t of thrown) { bad += 1; console.log("     threw:   ", t.slice(0, 200)); }
  }
  ws.close();
} finally {
  // Waited for, not just signalled: exiting the moment after `kill()` leaves a
  // headless browser running on somebody's machine, which is its own small bug.
  chrome.kill();
  await Promise.race([
    new Promise((r) => chrome.once("exit", r)),
    wait(3000).then(() => chrome.kill("SIGKILL")),
  ]);
}

process.exit(bad > 0 ? 1 : 0);
