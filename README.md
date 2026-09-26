<h1>Shenava · شنوا</h1>

**A recorded consultation becomes a transcript, a dialogue with the two
speakers told apart, and a draft of the proposal that meeting should produce —
in Persian and English at once.**

Fork it, run it locally, drop in an audio file, read the proposal it writes.

> **Status: complete and running locally. Not yet exercised against a real
> recording end to end** — the unit suite and the typecheck are green and every
> page renders, but the first real hour of audio has not gone through it yet. If
> you are that first person, [open an issue](../../issues) with whatever breaks.

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

## Getting it running — step by step

This is the whole thing, from an empty folder to a working dashboard. It takes
about ten minutes, and eight of those are waiting for Supabase to finish creating
a project.

You need **Node 20 or newer** (`node -v` to check) and a free
[Supabase](https://supabase.com) account.

---

### Step 1 · Fork it, clone it, install it

Press **Fork** at the top of this page, then:

```bash
git clone https://github.com/<your-username>/shenava.git
cd shenava
npm install
```

---

### Step 2 · Make a Supabase project

Supabase is the database. The free tier is enough for this.

Open **[supabase.com/dashboard](https://supabase.com/dashboard)** and press
**New project**.

Give it any name — `shenava` is fine. Set a database password; you will not need
it for this app, but save it somewhere anyway. Pick the region closest to you,
because every query in the app makes that round trip.

Press **Create new project** and wait. It takes two to five minutes, and the
dashboard will tell you when it is ready.

---

### Step 3 · Make the tables

In your project, open **SQL Editor** in the left sidebar, then **New query**.

**3a.** Open [`db/01_schema.sql`](db/01_schema.sql) from this repository, copy
the whole file, paste it into the editor, and press **Run**. It creates six
tables, three functions and the security rules. It is safe to run twice.

**3b.** Do the same with [`db/02_seed.sql`](db/02_seed.sql). This one gives you
the built-in proposal template and **one fully worked sample meeting** —
transcript, speaker-labelled dialogue and finished proposal draft — so the app has
something to show you before you have recorded anything. The bookshop in it is
invented; delete the meeting whenever you like.

You should see `Success. No rows returned` after each. If you see an error, read
it: the most common one is running `02_seed.sql` before `01_schema.sql`.

---

### Step 4 · Get an OpenRouter key

OpenRouter is how the app reaches every model — one key for all of them.

Make an account at **[openrouter.ai](https://openrouter.ai)**, then open
**[openrouter.ai/keys](https://openrouter.ai/keys)** and press **Create key**.
Copy it now; the page will not show it again.

Add a few dollars of credit under **Credits**. An hour-long meeting costs roughly
**20 cents** end to end — a few cents to transcribe and fifteen to twenty to
draft.

> One thing worth knowing in advance: below about **$1** of remaining credit,
> OpenRouter starts answering `402` to concurrent calls. If transcription ever
> fails on every piece at once, check the balance before looking at anything else.

---

### Step 5 · Tell Shenava about all of it

```bash
npm run setup
```

This asks for each value one at a time and **tests it immediately** — it fetches
your Supabase project, tries the key against a real table, calls OpenRouter and
reports the credit left, checks whether the six tables exist, and only then writes
`.env.local`. A typo is caught in the second you make it rather than three screens
later.

It will ask you three things:

**The Supabase Project URL and the `service_role` key.** Both are in your project
under **Project Settings → API**. The URL looks like
`https://abcdefghijklm.supabase.co`. The `service_role` key is the long one marked
*secret* — not the `anon` one. It bypasses row-level security, which is why it
stays on the server and never goes into a `NEXT_PUBLIC_` variable.

**The OpenRouter key** from step 4.

**Whether this will be reachable from the internet.** Say no if you are just
running it on your own machine — see the next section for why. Say yes and it will
ask for a password and generate a signing secret for you.

Run `npm run setup` again any time to change any of it. It keeps every value you
do not change, and it never prints a key back to the screen.

**If you would rather not use the script:**

```bash
cp .env.example .env.local
```

`.env.example` lists every variable with a comment explaining it. Three are
required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`OPENROUTER_API_KEY`. Leave `APP_PASSWORD` empty.

---

### Step 6 · Run it

```bash
npm run dev
```

Open **[http://localhost:3100](http://localhost:3100)**. Port 3100 rather than
3000, so it does not collide with whatever else you have running.

Press **Dashboard**. You should see the sample meeting in the list. Open it and
you can read its transcript, its dialogue with the two speakers told apart, and
its proposal draft in either language — all without a single model call, because
it came from the seed file.

**If something is wrong**, open **Connections** in the left rail. It repeats every
check the setup script made and answers line by line: which variables are set,
whether Supabase and OpenRouter actually respond, and whether all six tables
exist. It is the first place to look whenever anything stops working.

> Next.js reads the environment when it starts. If you change `.env.local`, stop
> the dev server and start it again.

---

### Step 7 · Put your own studio's name in

Open **Settings**. The draft is written against what is on this page, so filling it
in is what makes the output sound like your studio rather than nobody's.

Set your studio's name in both scripts, and write a line or two under *how your
studio writes* — words to avoid, how formal to be, whatever you would tell a new
writer on your team. It goes into the prompt as your own note.

While you are there: the two seats have their own models, the spending ceilings
default to **$3 a day and $30 a month**, and a call that would take you past
either is refused *before it is sent*.

---

### Step 8 · Your first real meeting

Press **New meeting**. Give it a title and the client's name, choose the language
spoken, and pick a recording.

Choosing the file **uploads nothing.** Your browser decodes it, cuts it, and shows
you the plan first — *"39 minutes of audio becomes 5 pieces, about 4 minutes of
waiting"* — with a bar for each piece. Only then does anything leave your machine,
and only one piece at a time.

**Choose the cutting mode deliberately.** *Long pieces* is what you want for a
real meeting: nine minutes per request, six or seven requests for an hour, four to
five minutes of waiting. *Minute pieces* is sixty requests and twelve to fifteen
minutes, and is there for short recordings and for browsers with no Opus encoder
(Safari, at the time of writing — the option disables itself and says so).

Press **Create the meeting**, open it, and the sending starts. Leave the tab open.
If you close it, nothing is lost: every piece is saved the moment it returns, and
reopening the meeting asks you to point at the same file again and carries on from
where it stopped. It checks the file's fingerprint before sending a single byte.

When the transcript lands: **tell the two speakers apart**, then **draft the
proposal**, then read it, fix what you want, approve it, and pour it into a
template. Word and print-sheet downloads are at the bottom.

---

### Step 9 · Deploying it, if you want to

You do not have to — this works perfectly well on your own machine, which is where
most people will keep it.

If you do deploy it (Vercel takes this repository as it is), **two things change
and both matter.** Set `APP_PASSWORD` and `APP_SESSION_SECRET` in the host's
environment variables, because a public deployment carries **your** OpenRouter key
and anyone who finds the URL and opens the record page is spending your money. And
set `OPENROUTER_APP_URL` to the real address, which is how OpenRouter labels your
usage.

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
scripts/   setup.mjs — `npm run setup`, which asks for each key and tests it
prompts/   PRD.md, PRD.fa.md, BUILD-PROMPT.md — the spec, and the prompt that builds it
docs/      the journey of a file, and notes on things that were hard to find
src/       the application
tests/     `npm test` — 88 of them, no browser and no network needed
```

```bash
npm run setup      # ask for the keys, test each one, write .env.local
npm run dev        # http://localhost:3100
npm test           # the unit suite
npm run typecheck
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
