# Shenava — product requirements

**Shenava** (شنوا, "hearing") turns a recorded consultation into three things:
a transcript, a dialogue with the two speakers told apart, and a draft of the
proposal that meeting should produce — in Persian and English at once.

It is one Next.js application, one Postgres database, and one API key. Fork it,
run it locally, drop in an audio file, and read the proposal it writes.

This document is the specification. If you want the prompt that builds the whole
thing from an empty folder, that is [`BUILD-PROMPT.md`](BUILD-PROMPT.md) beside
this file.

---

## 1. The problem

A consultation is an hour of two people talking. Afterwards somebody has to
write a proposal from it, and that person is working from memory and a page of
handwriting. What the client actually said — their numbers, the thing they said
must not change, the deadline they mentioned in passing — is the most valuable
material in the room and the first thing lost.

Transcription alone does not fix it. An hour of raw transcript is harder to
write a proposal from than a page of notes, because nothing in it is marked:
you cannot tell who said a sentence, and the four sentences that matter are
buried in six thousand words.

So Shenava does three passes, each of which is useless without the one before
it, and stops before the part that needs a person.

---

## 2. What it does, end to end

**Pass one — the words.** The browser reads the audio file, cuts it into
pieces, and sends the pieces one at a time to a transcription model. Each piece
is written to the database the moment it returns. When the last one lands, the
transcript is assembled. Section 3 is entirely about how the cutting works,
because it is the part of this product that is not obvious.

**Pass two — who said it.** A model reads the transcript and decides which
sentences belong to the consultant and which to the client. It does not rewrite
anything: the transcript is numbered by sentence and the model answers with
*ranges* — "sentences 12 through 19 are the client" — and the turns are
assembled from the transcriber's own words. A wrong answer is therefore only
ever a wrong label, never lost text. The page lets you correct a label by
hand, split a turn sentence by sentence, or swap both sides at once.

**Pass three — the draft.** A model reads the labelled dialogue and writes the
proposal draft under eleven fixed headings, in both languages at once. It is
told, at length, never to invent a price, a date or a number: what the meeting
left unsettled goes under *open questions* instead. It reads the client's lines
for *what we heard*, *goals*, *budget* and *exclusions*, and the consultant's
lines for *phases*, *method* and *deliverables*.

**Then it stops.** The draft is `pending` and stays pending. You edit a section
by hand, ask for one section to be written again, redraw the whole thing with an
instruction ("shorter; lead with the bot"), and when you are satisfied you
approve it — which pours it into a proposal template and produces a numbered
document. Every rewrite sets it back to pending. Nothing is ever sent anywhere
on its own.

---

## 3. The two ways of cutting the audio — the heart of it

A transcription model takes audio in a single request and answers with text.
Two limits bite: the request body has a size cap (about 2 MiB once base64'd)
and the answer has a token ceiling. An hour of speech breaks both. So the
recording must be cut, and **how** you cut it is the entire performance
characteristic of this product.

Shenava offers two modes, chosen on the form when the meeting is created.
Mode B is the one offered first and chosen by default; a browser with no Opus
encoder falls back to mode A, since the default must never be the disabled one.
Neither is stored as a setting: `inferMode()` reads the mode back off the
lengths of the pieces, so a resumed upload plans exactly the same cuts.

### Mode A — minute pieces (short recordings)

Pieces of at most **60 seconds**, sent as uncompressed **WAV**.

The 60 comes from `@mazarix/voice-kernel`, a small MIT package on npm
(`timing.recording.maxSeconds`). That package is the shared source of every
tuned number in this pipeline — the prompt that decides how an embedded Latin
word comes out of Persian speech, the retry policy, the timeout curve, the
rescue engine for a refused answer, and the bidi algorithm that keeps Latin
words where they were spoken. **Nothing in Shenava may hard-code one of those
numbers.** A local copy is how two programs silently start transcribing
differently, and no test can see the drift. Read them from the package.

The cut is not at the 60-second mark. It is at the **quietest moment in the
20 seconds before it** — root-mean-square over short frames, lowest wins — so
a piece almost never ends mid-word. Each piece is sent with the **tail of the
previous piece appended to its prompt as context**, so a sentence cut at a
boundary is continued rather than begun again.

**Cost of this mode:** an hour of audio is about sixty requests, one after
another, roughly twelve seconds each — so twelve to fifteen minutes of waiting.

**Use it when:** the recording is short (under ten minutes), or the browser has
no Opus encoder, or a piece in mode B failed and you want the smaller unit.

### Mode B — long pieces (default; fast; long recordings)

Pieces of up to **nine minutes**, compressed **in the browser** to Opus at
**24 kbit/s** and wrapped in an Ogg container written by hand.

Nine minutes at 24 kbit/s is about 1.6 MB, which is still under the same 2 MiB
cap that one uncompressed minute nearly fills. That is the whole trick: the cap
is on bytes, not on seconds, so compression buys you nine times the audio per
request.

Three things follow and all three must be built:

**The encoder is `AudioEncoder` (WebCodecs), not a library.** It is in the
browser already. Safari, at the time of writing, has no Opus encoder — so the
option must be *disabled with a sentence explaining why*, not offered and
failed.

**The Ogg container is written by hand.** WebCodecs hands you raw Opus packets;
nothing in the browser will page them into an Ogg stream for you. It is about
270 lines: the two header pages, then data pages with granule positions and a
CRC. This is the single most fiddly file in the project.

**The output ceiling must scale with the piece.** Nine minutes of Persian is
roughly ten thousand output tokens. A route that sends a nine-minute piece
under a one-minute ceiling gets a truncated answer that reads like a bad
transcription rather than like an error.

**Cost of this mode:** an hour of audio is six or seven requests, about forty
seconds each — four or five minutes of waiting instead of fifteen. Measured on
a 39-minute recording: transcript complete, five pieces.

**Use it when:** the recording is longer than about ten minutes and the browser
has an Opus encoder. This is what you want for a real consultation.

### When a piece comes back wrong

Three failures are real, all three were found by running this against live
providers, and all three need handling in the route:

**The provider's safety filter stops the answer.** It returns
`finish_reason: content_filter` (or `native_finish_reason: SAFETY`) with two
words of text, zero usage, zero cost — and unless you look for it, that reads
as a successful transcription of a quiet minute. It happened on 9 of 37 pieces
of ordinary business speech at temperature 0. It is a coin the *content*
flips: the same audio cut differently passes. So: recognise the stop as its own
outcome, **halve the piece on the server** and ask for each half (PCM16 WAV
splits at a byte with no decoding; Ogg splits at a page boundary), and keep
whatever words arrived if a half is stopped too. Optionally send the same bytes
to a second, dedicated speech-to-text engine — the kernel names one.

**A fragment for a minute of speech is not an answer.** Under about two
characters per second, ask once more. Still short, mark the piece `short` and
let the person retry; keep the third answer whatever its length, because by
then a genuinely quiet stretch is the likelier explanation.

**The answer is cut off at the ceiling.** On a `length` finish, ask again with
half again the room rather than parsing what was never finished. A truncated
JSON reads as "unreadable", which sends you looking in the wrong place.

---

## 4. Audio is never stored

Not in the database, not in object storage, not on disk. The browser decodes
the file locally, cuts it locally, and uploads one piece at a time to a function
that transcribes that piece and forgets it. The whole file is never uploaded
anywhere.

The **text** is stored, and that is a deliberate difference: the text is the
product. You come back to it days later, edit it, hand it to a model, download
it. A transcript that is not kept cannot be any of those things.

State this in the README. It is the first question anyone sensible asks.

---

## 5. Data model

Six tables, every one prefixed `shenava_` so the schema can be pasted into a
Supabase project that already has tables of its own. The full DDL is
[`db/01_schema.sql`](../db/01_schema.sql); what each one is *for*:

**`shenava_settings`** — one row, id 1. The studio's name and voice, and one
set of numbers per seat: the transcriber's model and output ceiling, the
writer's model, temperature and ceiling, the daily and monthly dollar limits,
and how many days a meeting is kept.

**`shenava_meetings`** — one row per consultation. The shape of the audio
(name, bytes, sha256, duration, piece count) but never the audio. The
transcript, the dialogue, the notes, each with the model and time that produced
it. `draft_status`, which is `pending` until a person decides. Running cost.

**`shenava_segments`** — one row per piece, written the moment that piece
returns. This is why it is a second table and not a column: a tab closed
halfway through an hour loses nothing, and reopening the meeting carries on
from the first piece still `pending`.

**`shenava_runs`** — the ledger: one row per model call, dated by the call,
tagged by seat. The spending ceilings are read from **here**, not from the
figure on the meeting row, because a meeting redrawn next month must not count
against last month's ceiling.

**`shenava_templates`** — the shape of the document a draft is poured into:
which sections, in which order, under which headings, in both languages. Plus
`house_lines`, the lines your proposals always end with; the writer is told
about them so it never proposes them itself.

**`shenava_proposals`** — what an approved draft becomes: a numbered document
in one language with the template's sections filled in.

Row Level Security is on for every table with **no policies**, which locks the
anon key out of everything. All access is server-side through the service role
key. That is tighter than the usual starting point, not looser.

---

## 6. Spending

Every model call is preceded by a read of `shenava_spend_status()` and refused
before it is sent if it would take the day or the month past its ceiling. A
limit enforced after the call is not a limit.

Cost is computed from the provider's own token counts against a per-model price
table, and written to `shenava_runs` whether the call succeeded or not — a
failed call that consumed tokens still cost money.

Defaults: three dollars a day, thirty a month. An hour of meeting in mode B is
a few cents of transcription and fifteen to twenty cents of drafting.

---

## 7. Screens

**The landing page** (`/`) — a public single page. What it does, the three
passes as a diagram, the two modes side by side with their real numbers, what
it costs, and two buttons: open the dashboard, and fork it. Animated:
a waveform resolving into lines of text, the three passes arriving on scroll.
Bilingual, Persian right-to-left.

**Meetings** (`/app`) — the list. Title, client, when, status, cost,
draft status. A row per meeting, newest first.

**New meeting** (`/app/new`) — title, client name, language, **mode**, and the
file. Choosing the file plans the cuts in the browser and shows you what it
will do: "7 pieces, about 4 minutes" — before anything is sent.

**One meeting** (`/app/m/[id]`) — the whole working surface, in stages:
a strip of pieces with their state while it transcribes; the transcript, and an
editor for it; the dialogue, with either side alone, per-turn side buttons,
sentence-level splitting, swap-both; the draft, section by section, each with
*edit* and *write again*; a redraw box for an instruction; and at the bottom
the **suggested template** with *pour the draft into this* — plus Word and
print-sheet downloads of transcript, dialogue or notes.

**Settings** (`/app/settings`) — the studio's name and voice, the two seats,
the ceilings, retention. Every field saved by one server action that returns
the validation's own verdict on refusal, so a refusal names the field.

**Connections** (`/app/connections`) — the Supabase URL and keys and the
OpenRouter key, read from the environment and shown as *set* or *missing*
(never their values), with a **test** button that actually calls all three and
answers green or red per line. Plus the schema file to paste, with a check for
whether the tables exist yet.

**Templates** (`/app/templates`) — the built-in template, and your own:
sections, headings in both languages, and the house lines.

---

## 8. Settings, connections, and keys

No key is ever in code, in the database, or in the browser. All three come from
the environment:

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`
are required. `APP_PASSWORD` is optional: empty means no door at all, which is
right on `localhost`; set it before you put this on a public domain, because a
public deployment carries **your** OpenRouter key and anyone who opens the
record page is spending your money.

`.env.example` lists all of them with comments.

---

## 9. Non-goals for version one

**Speaker labels from the transcription engine.** It returns plain text. The
labels come from pass two, over the whole transcript at once, which is why they
are consistent across piece boundaries.

**Parallel pieces.** Concurrent requests on one key queue upstream anyway.
Mode B is the answer to the waiting instead: fewer, longer pieces, still one at
a time.

**Transcripts past about 400,000 characters.** One reading, no map-reduce.

**Live recording in the browser as the primary path.** File upload is the path
that works for a meeting that already happened. Recording is a convenience.

**Accounts and multi-tenancy.** One person, one database. The place to add
accounts is the single function that answers "who is asking".

**Editing a proposal after approval from the meeting page.** Approval copies
the draft into a proposal once. A second approval re-marks the draft and points
at the same proposal rather than making another.

---

## 10. What to verify before calling it done

The sample meeting renders every stage with no key set at all. Planning a
39-minute file in mode B shows 5 pieces; the same file in mode A shows 39. A
Safari session sees mode B disabled with a reason. A piece stopped by the
filter produces two halved requests and a piece row saying so. The draft never
contains a figure the transcript does not. Approving pours the draft into the
template and produces a numbered proposal. Both languages hold the same key
set, and the Persian pages have no horizontal scroll at 320 pixels wide.

---

## 11. Credits

`@mazarix/voice-kernel` (MIT, on npm) is the shared source of the recording,
retry, timeout, rescue and bidi constants. It is published from a separate
project and is deliberately a dependency rather than a copy, so that the
numbers cannot drift.
