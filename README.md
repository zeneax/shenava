<h1>Shenava · شنوا</h1>

**A recorded consultation becomes a transcript, a dialogue with the two
speakers told apart, and a draft of the proposal that meeting should produce —
in Persian and English at once.**

Fork it, run it locally, drop in an audio file, read the proposal it writes.

> **Status: pass one works end to end. Passes two and three are being built.**
>
> Working: the landing page, the dashboard, Connections with a live test of all
> three services, creating a meeting with the cut planned in your browser,
> **transcribing** — pieces sent one at a time, each written down as it returns,
> the transcript assembled when the last one lands, with the three real failure
> modes handled and every call in a ledger against a spending ceiling — and
> **telling the two speakers apart**, with the three corrections that call no
> model: move one turn, split a turn at one sentence, or swap both sides.
>
> Not yet: the proposal draft, the Settings and Templates screens, and the Word
> and print-sheet exports. All four are specified
> in [`prompts/PRD.md`](prompts/PRD.md), and
> [`prompts/BUILD-PROMPT.md`](prompts/BUILD-PROMPT.md) is a prompt that builds
> the whole thing from an empty folder.

---

## What it does

**One — the words.** Your browser cuts the recording into pieces and sends them
one at a time to a transcription model. Each piece is saved the moment it comes
back, so a closed tab halfway through an hour loses nothing.

**Two — who said it.** A model decides which sentences are the consultant's and
which are the client's. It never rewrites anything: it answers with sentence
ranges, and the turns are assembled from the transcriber's own words, so a wrong
answer is only ever a wrong label. You can fix a label, split a turn sentence by
sentence, or swap both sides — none of which calls a model.

**Three — the draft.** A model reads the labelled dialogue and writes the
proposal under eleven headings, in both languages at once, as finished sentences
you could paste into a document. It is told never to invent a price, a date or a
number: what the meeting left unsettled goes under *open questions*.

**Then it stops.** The draft waits for you. Edit a section, ask for one section
to be written again, redraw the whole thing with an instruction, and when you
are satisfied, pour it into a proposal template and download it as Word or a
print sheet.

---

## Two ways of cutting the audio

This is the part of the product that is not obvious, so it is worth a paragraph
before you choose.

A transcription request is capped at about 2 MiB. An hour of speech does not
fit, so the recording is cut — and how it is cut decides how long you wait.

**Minute pieces** — 60-second uncompressed WAV pieces, cut at the quietest
moment in the 20 seconds before each minute so a piece rarely ends mid-word,
each one carrying the tail of the one before it as context. An hour is about
sixty requests, twelve to fifteen minutes of waiting. Use it for short
recordings, or when the long mode is unavailable.

**Long pieces** — up to 9 minutes per piece, compressed in your browser to Opus
at 24 kbit/s. Nine minutes comes to about 1.6 MB, still under the cap that one
uncompressed minute nearly fills, which is the whole trick. An hour becomes six
or seven requests and four or five minutes of waiting. **Use this for a real
meeting.** It needs `AudioEncoder` (WebCodecs), which Safari does not yet
provide for Opus — there the option is disabled with a reason rather than
offered and failed.

Both modes read their tuned constants — the 60 seconds, the prompt, the retry
policy, the timeout curve, the rescue engine, the bidi algorithm that keeps
embedded Latin words where they were spoken — from
[`@mazarix/voice-kernel`](https://www.npmjs.com/package/@mazarix/voice-kernel),
a small MIT package on npm. It is a dependency rather than a copy on purpose:
two programs with their own copies of a number drift apart silently, and no test
can see it.

---

## Your audio is never stored

Not in the database, not in object storage, not on disk. Your browser decodes
and cuts the file locally and uploads one piece at a time to a function that
transcribes that piece and forgets it. The whole file is never uploaded
anywhere.

The **text** is kept — the transcript, the dialogue, the draft — deliberately,
because the text is the product. You come back to it days later, edit it, hand
it to a model, download it. A transcript that is not kept cannot be any of
those things.

---

## Running it

You need Node 20 or newer, a free Supabase project, and an OpenRouter key with a
few dollars on it.

**1. Clone and install.**

```bash
git clone <your fork> shenava && cd shenava
npm install
```

**2. Make the tables.** Open your Supabase project → SQL Editor → New query,
paste [`db/01_schema.sql`](db/01_schema.sql) and run it, then do the same with
[`db/02_seed.sql`](db/02_seed.sql). The second one gives you the built-in
proposal template and **one fully worked sample meeting**, so the app has
something to show you before you have recorded anything.

**3. Fill in the environment.**

```bash
cp .env.example .env.local
```

The file explains each variable. Two are required (`NEXT_PUBLIC_SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY`), one is required to transcribe anything
(`OPENROUTER_API_KEY`), and `APP_PASSWORD` should be left **empty** — see below.

**4. Run it.**

```bash
npm run dev
```

Open http://localhost:3000. The Connections page tells you which of the three
services answered, and the sample meeting shows you every stage of the product
with no key set at all.

---

## There is no login, and that is on purpose

On your own machine, the only person who can open `localhost:3000` is you. A
password there would be like locking a folder on your own desktop.

**One case needs a door.** If you deploy this to a public domain — to show a
client, say — the deployment carries **your** OpenRouter key, and anyone who
finds the URL and opens the record page is spending your money. So before you
deploy publicly, set `APP_PASSWORD` and `APP_SESSION_SECRET` in the
environment. With `APP_PASSWORD` empty there is no door; with a value, there is
one.

The whole decision of "who is asking" lives in one function in one file. If you
want real accounts — Supabase Auth, a magic link, several people — that is the
only place to change.

---

## What it costs

Transcription is a few cents an hour of audio. The draft is fifteen to twenty
cents, because it is the pass that needs judgement and gets a better model. Both
seats have their own model, temperature and ceiling on the Settings page.

Every model call is preceded by a check against a daily and a monthly dollar
ceiling and refused before it is sent if it would go over — a limit enforced
after the call is not a limit. The defaults are three dollars a day and thirty a
month, and every call is a row in a ledger you can read.

---

## Repository layout

```
db/        01_schema.sql, 02_seed.sql — paste into the Supabase SQL Editor
prompts/   PRD.md, PRD.fa.md, BUILD-PROMPT.md — the spec, and the prompt that builds it
docs/      the journey of a file, and notes on things that were hard to find
src/       the application
tests/     node --test; the audio layer is covered
```

**If you are about to change how the audio is cut, read
[`docs/the-journey-of-a-file.md`](docs/the-journey-of-a-file.md) first** (or
[the Persian edition](docs/the-journey-of-a-file.fa.md)). It walks one recording
from the moment it is chosen to the moment a draft is waiting, with every number
and the reason for it — including the three ways a piece comes back wrong, which
are most of what that code is for.

---

## The prompt that built this

[`prompts/BUILD-PROMPT.md`](prompts/BUILD-PROMPT.md) is a complete instruction
for a coding agent to build this project from an empty folder — the stack, the
two cutting modes with their real numbers, the three failure modes of live
transcription providers, the eleven proposal sections, the writer's rules, the
schema, the screens and the order of work.

Take it, change the stack, change the sections, and build your own. That is
what it is there for. [`prompts/PRD.md`](prompts/PRD.md) is the specification it
is written against, and [`prompts/PRD.fa.md`](prompts/PRD.fa.md) is the Persian
edition.

---

## Licence

MIT. See [`LICENSE`](LICENSE).
