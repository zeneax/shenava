# Four failures that render a 200 and look like nothing

None of these fails a test, and `npm run typecheck && npm test` is green through
all four. They are here for the commands at the end of each section.

The last two are the same symptom — a door in the rail that does not answer —
with two unrelated causes, and the second one hides behind the fix for the
first. Read both before concluding which you have.

---

## A `rounded-[--radius-panel]` corner is square

**Symptom.** A panel that should have the house 14-pixel corner is drawn with a
sharp one. Nothing in the console, the class is right there in the DOM, and the
variable is defined — `--radius-panel: 0.875rem` in `globals.css`.

**What it was.** Tailwind 4 does not read a bare custom property inside square
brackets as a variable. It copies it through as a literal, so
`rounded-[--radius-panel]` compiles to:

```css
.rounded-\[--radius-panel\] { border-radius: --radius-panel; }
```

`--radius-panel` is not a length, so the browser drops the whole declaration and
falls back to no radius. The rule exists, the class matches, and the corner is
square. In Tailwind 3 the bare form worked, which is why it is in the codebase at
all.

The v4 spelling is parentheses — `rounded-(--radius-panel)` — which compiles to
`border-radius: var(--radius-panel)`. `rounded-[var(--radius-panel)]` also works.
Most of this codebase sidesteps the question by writing
`style={{ borderRadius: "var(--radius-panel)" }}`, which was never affected.

**The command.** The source spelling:

```bash
grep -rn '\[--[a-z-]*\]' src/
```

And the proof, against a running `npm run dev` — every rule whose value is a bare
custom property, i.e. every one the browser is silently discarding:

```bash
css=$(curl -s http://localhost:3100/ | grep -o '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:3100$css" | grep -oE '\.[^{;]*\{[^}]*: *--[a-z-]+;[^}]*\}'
```

Empty output is the healthy answer. This catches the whole family, not just
`rounded-`: any `p-[--x]`, `text-[--y]`, `gap-[--z]` fails the same way.

---

## Clicking a door in the rail did nothing for several seconds

**Symptom.** Click **جلسه‌ها** or **قالب‌ها** and the page does not move. No
cursor change, no highlight, nothing on the door you just pressed — so you click
it again. Some seconds later the new page simply appears.

**What it was.** Two absences at once, and each hides the other.

Every page under `app/[locale]/app/` declares `export const dynamic =
"force-dynamic"`, because each one reads Postgres on the way in. A prefetch
cannot fetch a dynamic page, so a click has to wait for the round trip. There was
no `loading.tsx` anywhere in the tree, so React had no boundary to swap to and
correctly kept the old page fully on screen until the new one was ready. That is
the framework behaving as documented; it just looks exactly like a dead button.

And the rail was a server component, so it could not mark the door that was
clicked — it had no idea a click had happened.

The fix is both halves: `app/[locale]/app/loading.tsx` gives the router a
skeleton to show at once, and `components/door-rail.tsx` is a client component
whose door body reads `useLinkStatus()` from `next/link` and turns its icon into
a spinner. `useLinkStatus` only reports for the `Link` it is *inside*, which is
why the body of a door is its own component rather than markup in the loop.

**The command.** Any dynamic segment with no `loading.tsx` above it is a door
that will feel dead:

```bash
grep -rln 'dynamic = "force-dynamic"' src/app --include=page.tsx |
  while read p; do
    d=$(dirname "$p")
    while [ "$d" != src/app ]; do
      [ -f "$d/loading.tsx" ] && break
      d=$(dirname "$d")
    done
    [ "$d" = src/app ] && echo "no loading boundary: $p"
  done
```

And to see that the boundary is really being served as the fallback — the
skeleton's own class should come back in the prefetch payload:

```bash
curl -s -H 'RSC: 1' -H 'Next-Router-Prefetch: 1' \
  -H 'Next-Router-State-Tree: %5B%22%22%2C%7B%22children%22%3A%5B%22fa%22%2C%7B%22children%22%3A%5B%22app%22%2C%7B%7D%5D%7D%5D%7D%5D' \
  http://localhost:3100/app/templates | grep -c shimmer
```

---

## Clicking a door did nothing for the whole length of an upload

**Symptom.** Choose a recording, press **بساز**, and while the pieces are going
up, click **جلسه‌ها** in the rail. Nothing happens. Not a slow page — *nothing*:
no skeleton, no spinner on the door, no cursor change, and every other button on
the page is dead too. The marks on the pieces keep ticking over, so the tab is
plainly alive. It comes back the moment the last piece lands, which on a long
meeting is an hour later.

This is the section above's symptom with the fixes from the section above already
in place, which is what makes it confusing: `loading.tsx` exists, the door rail
reads `useLinkStatus`, and neither one ever gets a chance to run.

**What it was.** The sending loop was inside `useTransition`.

React keeps one lane for an async action that has not settled, and while it is
pending **every** transition raised anywhere in the tree is put on that same
lane — `peekEntangledActionLane` in React's scheduler — so none of them can
commit until the action finishes. App Router navigation is a transition. So is
`router.refresh()`. So is every other `startTransition` on the page. One await
that runs for an hour therefore freezes the navigation of the entire application
for an hour, and it freezes it *before* the router has anything to show, which is
why the loading boundary never appears.

`new-meeting-form.tsx` created the meeting and then sent every piece inside a
single `startSaving(async () => …)`. That await is the longest one in the
product. `test-connections.tsx` had a smaller copy of it — seconds, not an hour,
but the same dead rail.

The fix is plain `useState` for the busy flag and a bare `await` outside any
transition. `run-speakers.tsx` and `draft-view.tsx` were already written this
way, with a comment saying why; the two above were the ones that were not.

Keep short server actions in a transition — that is what it is for. The line is
whether the await can outlast a person's patience, not whether it is a server
action or a `fetch`.

**The command.** Every transition that awaits something that goes to the network:

```bash
grep -rn --include='*.tsx' -A10 -E '\b(start[A-Za-z]*|startTransition)\(async' src/ |
  grep -E 'await (fetch|sendPieces)\(|/api/'
```

Empty output is the healthy answer.

And to tell this apart from a genuinely slow server — the other thing that looks
like it. With a meeting transcribing in one tab, ask for a door directly:

```bash
time curl -s -o /dev/null -H 'RSC: 1' http://localhost:3100/fa/app
```

A fast answer here while the browser is frozen proves the server is fine and the
stall is React's, i.e. this bug. A slow answer is something else entirely.

---

## A red overlay reading `[object Object]`, with no stack

**Symptom.** The development overlay opens on a **Runtime Error** whose entire
message is `[object Object]`. The call stack is two frames, both of them
ignore-listed and both inside Next itself — `coerceError`, then
`onUnhandledRejection`. Nothing in `src/` appears. Two different failures in two
different files look identical, because neither of them is in the report.

**What it was.** A promise rejected with a value that is not an `Error`, and
nobody caught it.

The overlay does this to it:

```js
// next/dist/next-devtools/userspace/app/errors/stitched-error.js
function coerceError(value) {
  return isError(value) ? value : new Error('' + value);
}
```

`'' + {}` is `[object Object]`, and the `Error` is built *inside the handler*, so
the stack you are shown is the handler's — which is why it is always those same
two frames, whatever rejected. The stack is not truncated; it never had anything
else in it.

Two things produce this pair. A `throw` of something that is not an `Error`:
`encode.ts` rethrew whatever `AudioEncoder` handed its error callback, which the
type system calls `unknown` because it is. And a bare `await` in an event
handler with no `catch` — before, the same throw went through `startTransition`,
which surfaces it properly, so removing the transition (the section above) took
the reporting away with it.

The fix is three parts. `lib/describe-error.ts` turns any thrown value into a
line — an `Error`'s name and message, a `DOMException`'s name, a plain object's
JSON, or failing all of that its keys. Every `await` in a client component ends
in a `catch` that shows that line on the page rather than letting it reach the
window. And `src/instrumentation-client.ts`, which is dead in production, takes
the event before Next does and re-raises the same value as a real `Error`
carrying that line.

The file has to be `instrumentation-client`, not a component: it runs before the
application becomes interactive, so its listener is registered ahead of Next's
and `stopImmediatePropagation()` keeps the useless report from being made at
all. The same code in a `useEffect` runs *after* Next's handler, which cannot be
preempted — the overlay then shows `[object Object]` as error 1 of 2 and the
readable one as 2 of 2. Two pages where there should be one is how you can tell
which of the two arrangements a checkout has.

**And what it turned out to be, once it could say so: a browser extension.**
The named message read `Internal JSON-RPC error.` — the error object an injected
wallet provider rejects with, `{ code: -32603, message: … }`, on a page that has
nothing to do with wallets. No file in this repository was involved.

That is why it could not be reproduced. Every page, the whole upload — file
chosen, cut, Opus-encoded, posted, walked away from mid-send — a failed server
action, one held open, and a hot reload were all driven through a headless
Chrome with the first listener on the page, and nothing rejected. A headless
Chrome started for a test has no extensions.

So `isFromAnExtension` in `lib/describe-error.ts` recognises the two marks this
application cannot produce — a stack naming an extension URL, or a code in
JSON-RPC's reserved range or EIP-1193's — and those rejections are written to
the console and go no further. An overlay raised by somebody else's code, over a
page it has nothing to do with, stops the wrong person's work. The rule is
narrow on purpose: an ordinary object with a `code`, a Postgres error for
instance, is still ours and is still reported.

**The command.** Every throw in code the browser runs that is not an `Error`:

```bash
grep -rn 'throw ' src/ | grep -v 'throw new ' | grep -vE '^[^:]+:[0-9]+: *(//|\*)'
```

And every `void`-ed or unawaited call in a component, which is where one escapes:

```bash
grep -rn --include='*.tsx' -E 'void [a-z][A-Za-z]*\(|\.then\(' src/
```

Both want an empty answer, or a `catch` visible at each hit.

And the way to go looking, rather than waiting for it:

```bash
npm run dev                              # in one terminal
node scripts/catch-rejections.mjs        # in another
```

It drives a headless Chrome, attaches the first `unhandledrejection` listener on
the page before any framework script runs, opens each door, and prints the
constructor, keys, JSON and stack of anything that rejects. It exits non-zero if
anything did. Give it paths to narrow it: `node scripts/catch-rejections.mjs
/app/new`. It only opens pages — it presses nothing and cannot reach the
transcription route, so it costs nothing to run.

It is also the test for whose fault a thing is. It runs on a fresh profile with
no extensions: clean there and dirty in your own browser means the fault is in
your browser, not in the checkout. That is the whole diagnosis of the paragraph
above, and it takes one command.

Two standing arrangements back it up. `next.config.ts` sets
`logging.browserToTerminal` to `"error"`, so the reason itself — the object, not
`'' + object` — is printed in the `npm run dev` terminal; the setting is read at
startup, so changing it needs the dev server restarted. And the component above
means the overlay carries it too, for anyone who never looks at the terminal.

---

## Every button is dead — but only on the phone

**Symptom.** `npm run dev` prints a Network address. Open it from another
device on the same Wi-Fi and the page arrives complete: the dashboard, the
transcript, the dialogue with all its chips. Press anything and nothing
happens. Not one action on the whole site. On the laptop that runs the server,
the same page works.

**What it was.** Next.js blocks cross-origin requests for its dev-only assets
and endpoints — `/_next/*` scripts, HMR — from any hostname other than
`localhost` and the one it was started with. The HTML is served, because the
HTML is not a dev asset. The scripts that would hydrate it are refused. So the
device gets a page that looks finished and has no React in it, which is
indistinguishable from a page whose buttons do nothing.

The one word about it is a line in the server's own terminal, on the machine
you are not looking at:

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "192.168.100.13".
```

The fix is `allowedDevOrigins` in `next.config.ts`. It matches hostnames, and a
`*` is exactly one label, so `192.168.*.*` is the whole private range as four
labels. The dev server has to be restarted for it to take.

**The command.** Whether the running server is refusing anyone:

```bash
grep -c "Blocked cross-origin" <the dev server's output>
```

And whether the config covers the address you are about to type into the
phone — the hostname must fit one of these patterns:

```bash
grep -A1 allowedDevOrigins next.config.ts
```

Related, and not an error: the phone's browser marks the address **Not Secure**.
It is plain HTTP on a private network, which is what a dev server is. Nothing
to fix for local use.

**But the same address is not a secure context**, and that one does reach the
code. A browser withholds a whole family of APIs from plain `http://` on
anything other than `localhost`: `crypto.subtle`, `crypto.randomUUID`,
WebCodecs' `AudioEncoder`, `getUserMedia`. On the laptop every one of them is
there; on the phone every one of them is `undefined`, and nothing says so.

Two symptoms of it, seen on the same afternoon:

- The dev overlay shows `crypto.randomUUID is not a function` with a call stack
  entirely inside `chrome-extension://…/inject.js`. That is a browser extension
  tripping over the missing API, not this application; the overlay reports any
  error on the page. Esc dismisses it, or open the site in a window where the
  extension is off.
- Choosing a recording failed as "could not read the file". The file was fine.
  `sha256Hex` called `crypto.subtle.digest` and threw, and the form's `catch`
  reported it as an unreadable file. It now falls back to a pure SHA-256 when
  `crypto.subtle` is absent, held to WebCrypto's output by a test.
- The long cutting mode was greyed out in Chrome, with a note blaming Safari.
  It needs `AudioEncoder`, which the same Chrome has on `localhost` and not on
  `http://192.168.…`. The note was written when Safari was the only known
  cause; `canEncodeOpus` now tells the two apart and the form says which.

**The command.** Every secure-context-only API this code reaches for, so a new
one is caught before a phone does:

```bash
grep -rnE "crypto\.subtle|randomUUID|AudioEncoder|getUserMedia" src --include="*.ts" --include="*.tsx"
```

Each hit must either guard on the API's absence or be reached only from a
server module.

---

## The Persian Word file says the meeting was 110 minutes

**Symptom.** Download the Persian edition of any document. The line under the
title reads «کلاینت: پخش مواد غذایی رها ۸۰ مهر ۱۴۰۵ ۱۱۰ دقیقه ۰ استودیوی شما»:
the eightieth of Mehr, a hundred and ten minutes, and a stray zero before the
studio's name. The meeting was eleven minutes long, on the eighth. The English
edition of the same meeting is right. Word and Quick Look agree, so it is not a
renderer.

**What it was.** The pieces of that line were joined with a middle dot, `·`
U+00B7, in both languages. The Persian digit zero, «۰», is a small circle.
So is a middle dot. Beside a Persian numeral the separator *is* a digit —
«۸ · ۱۱» is «۸۰ ۱۱» — and there is nothing to grep for, because the text is
correct; only the glyph is wrong. `metaJoin` in `lib/meetings/format.ts` now
joins Persian with the Persian comma «،», which is what Persian uses for a
list and is not a digit, and English with the dot as before.

**The command.** A middle dot anywhere it could sit next to a Persian numeral:

```bash
grep -rn '·' src/lib/meetings/ messages/fa.json
```

Running it today finds three in `messages/fa.json` and they are fine, for a
reason worth stating so nobody "fixes" them: the pages keep Latin figures in
Persian prose on purpose (see `.tnum` in `globals.css`), and a dot beside a
Latin `4` looks nothing like a zero. The hazard is a dot beside a *Persian*
digit, «۴», and only the documents produce those — `meetingDate` and
`durationLabel` format with `fa-IR`. So the rule is: no middle dot on any
string that reaches a document in Persian, and `metaJoin` is the only place
those strings are joined.

---

## The Persian Word file is flush left — in Word, and only in Word

**Symptom.** Open the Persian edition in Word: the title, the metadata line
and every paragraph sit against the left margin, reading right-to-left from
the wrong side of the page. Quick Look on the same file shows everything
against the right margin, so the file "looks fine" to anyone previewing it.

**What it was.** Every Persian paragraph was `<w:bidi/>` with
`<w:jc w:val="right"/>`. In a bidi paragraph Word reads `left` and `right` as
*logical* — `right` is the end of the line, which for right-to-left is the
left edge. Apple's importer reads the same value physically. The XML was the
same in both; the readers disagree, and Word is the one the client opens.

Measured in Word 16.112, one paragraph per value, all `w:bidi`:
`right` → left edge · `left` → right edge · `start` → right edge ·
`end` → left edge · none → right edge. `docx.ts` now aligns Persian to
`START`, which is the logical value the spec means and the one Word honours.

**The command.** A `right` on any bidi paragraph in a file this code built —
build one and look, since the value is correct XML and no lint sees it:

```bash
node --test tests/documents.test.ts 2>&1 | grep -E "START|flush"
```

And the general lesson: for a Word file, Quick Look is not a preview. It is a
different implementation. Check Word.
