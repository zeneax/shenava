# The journey of a file

*One recording, from the moment somebody chooses it to the moment a proposal
draft is waiting for them — every step, every number, and why each one is that
number and not another.*

This is the document to read before changing anything in `lib/meetings/`. The
code is commented, but a comment can only explain its own file; the interesting
decisions here are about the **sequence**, and no single file contains it.

The Persian edition is [`the-journey-of-a-file.fa.md`](the-journey-of-a-file.fa.md).

---

## The shape of the whole thing

```
  a file on someone's disk
        │
  ① decode          ─ in the browser, to raw samples
  ② downmix         ─ every channel averaged into one
  ③ resample        ─ to 16 kHz, by averaging
  ④ hash            ─ (actually taken before ①, and the reason is below)
  ⑤ plan            ─ where the cuts go, and how many pieces that makes
        │                    ← the person sees this and decides
  ⑥ write the rows  ─ one meeting, and every piece as `pending`
        │
  ⑦ send a piece ──┐
  ⑧ transcribe     │  one at a time, N times
  ⑨ write it down ─┘
        │
  ⑩ assemble        ─ the transcript, when the last piece lands
  ⑪ speakers        ─ one model call over the whole transcript
  ⑫ the draft       ─ one model call over the labelled dialogue
        │
  a draft, `pending`, waiting for a person
```

Steps ① to ⑤ happen **entirely in the browser** and upload nothing. That is
not an optimisation, it is the privacy claim: the whole file never goes
anywhere, and only pieces do, and only as they are needed.

---

## ① Decode

`AudioContext.decodeAudioData` takes the file's bytes and gives back an
`AudioBuffer`: 32-bit floating-point samples, at whatever rate the file was
recorded at, one array per channel.

Whatever the browser can play, this can decode — WAV, MP3, M4A, AAC, FLAC,
Ogg. What it cannot decode it refuses, and the form says so and names three
formats that work. That refusal is worth handling explicitly: the alternative
is a form that silently does nothing when you choose a file, which reads as the
page being broken.

**Memory is the real limit here.** An hour of 16 kHz mono 32-bit samples is
64 kB a second — about **230 MB an hour**. Three hours is 690 MB held in one
tab, which a laptop manages and a phone may not. That is where
`MAX_MEETING_SECONDS = 3 * 60 * 60` comes from: not a product decision, a
memory one. A longer recording is two recordings.

---

## ② Downmix, and ③ resample

`toMono` averages every channel into one. `downsample` then takes it to
`timing.audio.sampleRate` — 16 kHz, from the kernel.

**Resampling averages; it does not decimate.** Taking every third sample is one
line shorter and wrong: everything in the original above the new Nyquist
frequency folds back into the audible band as noise, and a speech recogniser
hears that as a worse microphone. Averaging the samples in each output window
is a crude low-pass filter, and crude is enough here.

Why 16 kHz at all, rather than sending the original: because the kernel says so,
and the kernel says so because that is what the macOS application that shares
it sends. One rate, one container, one path through the model, for every client.
The alternative — mapping each browser's native container to a format the
provider might accept — is a matrix that has to be re-tested every time a
browser changes its default.

---

## ④ The hash, which is taken first

`sha256Hex` over the file's bytes, as lowercase hex, stored on the meeting row.

It is in the code **before** `decodeAudioData`, and that ordering is not
cosmetic: `decodeAudioData` **detaches** the ArrayBuffer it is given. Hash
afterwards and you hash an empty buffer, silently, and every meeting gets the
same hash — the hash of nothing.

What it is for: a resumed upload proving it is the same file. The pieces that
have already come back are on the server, keyed by index; if the browser is
handed a different recording tomorrow, index 7 means something else entirely.
The hash is the check that says so.

---

## ⑤ The plan — the part that is not obvious

Two constraints, and everything here follows from them: **a transcription
request is capped at about 2 MiB of body**, and **its answer is capped by an
output token ceiling**. An hour of speech breaks both, so it must be cut.

### Where a cut goes

Not at the cap. At the **quietest moment in the stretch before it**.

The engine returns words, not timestamps. A boundary that lands mid-word leaves
half a word at the end of one piece and half at the start of the next, and
neither half is anything — not a word the model can read, not a word it can
guess. A boundary in a pause leaves two whole sentences.

So `planSegments` walks forward, and for each piece:

**It takes the hard end** at `pos + maxSeconds`.

**It searches backwards** over `searchBackSeconds` in frames of `frameMs`,
computing root-mean-square loudness for each frame, and takes the quietest
frame's centre as the cut.

**Ties go to the later frame.** A cut nearer the cap makes fewer pieces, and
fewer pieces is fewer requests and more context per request.

**The last piece ends where the recording does**, however short that leaves it.
A three-second last piece is normal and correct.

The frames are 300 ms. Shorter and a single syllable gap reads as silence;
longer and a real pause is averaged away by the speech on either side of it.

### Determinism, and why it is a requirement

Nothing in `planSegments` reads the clock, calls `Math.random`, or asks the
device anything. It is a pure function of the samples.

That is because a meeting is an hour of pieces sent one at a time, and a tab
closed halfway through is ordinary. Reopening the meeting means the browser is
handed the same file and must arrive at **exactly the same pieces**, or piece 7
is a different seven seconds than the one the server already has.

This is also why the mode is not stored anywhere. `inferMode()` reads it back
off the pieces' lengths — a piece longer than the kernel's cap can only be a
long one — so there is no column that can fall out of step with the plan.

### The two modes, in numbers

The whole difference is how much audio fits in one request, and the cap is on
**bytes**, not on seconds:

| | Minute pieces | Long pieces |
|---|---|---|
| Per piece | 60 s | 9 min (540 s) |
| Format | WAV, PCM16, 16 kHz mono | Opus at 24 kbit/s in Ogg |
| Bytes per piece | 32 kB/s → **1.92 MB** | 3 kB/s → **1.62 MB** |
| Search-back | 20 s | 120 s |
| Pieces for 39 min | about 50 | **5** |
| Seconds per request | 12 | 40 |
| Waiting for an hour | 12–15 min | **4–5 min** |

Read the *bytes per piece* row twice. One uncompressed minute nearly fills the
2 MiB cap; nine compressed minutes sit comfortably under it. Compression buys
**nine times the audio per request**, and that is the entire mode.

Three consequences, all of which are built:

**The encoder is `AudioEncoder` (WebCodecs), not a library.** It is in the
browser already, and a JavaScript Opus encoder would be megabytes of WASM doing
worse.

**The Ogg container is written by hand** — `lib/meetings/ogg.ts`, about 270
lines. WebCodecs hands over raw Opus packets and nothing in the browser will
page them into a stream. Two header pages (`OpusHead`, `OpusTags`), then data
pages of about fifty packets each, with lacing values, granule positions at
48 kHz regardless of the input rate, and Ogg's own CRC-32 — which is not the
usual one: polynomial `0x04c11db7`, no reflection, zero start, zero finish.

**No Opus encoder means the mode is disabled with a sentence.** Safari, at the
time of writing. The form asks `canEncodeOpus()` once on mount and shows the
reason. Offering a mode that fails halfway through an hour-long upload is worse
than not offering it.

### What the person sees

Before anything is committed to: *"39 minutes of audio becomes 5 pieces, sent
one after another — about 4 minutes of waiting"*, and a row of bars, one per
piece, each as wide as its own length. The short last bar is the tell that the
plan is sane.

Switching mode **re-cuts what is already decoded** rather than re-reading the
file. The samples are held in a ref; replanning is a few milliseconds of
arithmetic over them.

---

## ⑥ The rows

One `shenava_meetings` row, and **every** `shenava_segments` row, all as
`pending`, in one call each.

Writing all the piece rows up front is what makes the upload resumable: the
rows are the queue. Reopening the meeting reads the rows, finds the first one
still `pending`, and carries on from there.

If the piece rows fail to write, the meeting row is **deleted again**. A
meeting without its pieces is worse than no meeting — the page would show it as
plannable and plan it a second time, and now there are two sets of indices for
one recording.

The meeting row holds the *shape* of the audio and never the audio: name,
bytes, sha256, duration, piece count.

**The rows are written and the sending begins, on the same page, without a
second look at the file.** The samples are still in the create form's ref —
they were decoded there — so the handoff is a function call, not a navigation.
The listener on the meeting page exists for the other case only: the tab was
closed, or this is another machine, and the samples really are gone. Asking for
the recording a second time when the browser is still holding it buys the
privacy claim nothing and costs the person a step they cannot explain.

The cadence itself is one function, `lib/meetings/send.ts`, used by both. Two
copies of a send loop drift, and the symptom of a drifted copy is a piece that
was never sent under a progress display that says it was.

---

## ⑦⑧⑨ The rhythm — one piece at a time

**One at a time. Never in parallel.** Concurrent requests on a single API key
queue upstream anyway, so parallelism buys nothing and costs the ability to
stop cleanly. The answer to the waiting is the long mode — fewer, bigger
requests — not more of them at once.

So the cadence, per piece:

**The browser slices** its held samples between the piece's start and end.

**It encodes** — `encodeWav` for a minute piece, `encodeOpusOgg` for a long
one.

**It posts** those bytes to the segment route, with the piece's index.

**The route transcribes**, and attaches the **tail of the previous piece** to
the prompt as one paragraph of context, so a sentence cut at a boundary is
continued rather than begun again.

**It sizes the output ceiling to the piece.** Nine minutes of Persian is
roughly ten thousand output tokens. A long piece sent under a one-minute
ceiling comes back truncated — and a truncated transcript reads like a bad
transcription rather than like an error, which sends you looking at the audio.

**It writes the piece down immediately** — text, model, cost, attempts — and
answers.

An hour in the long mode is therefore seven round trips of about forty seconds,
sequential: four to five minutes with the tab open. In the minute mode it is
fifty round trips of twelve: twelve to fifteen minutes.

### The three ways a piece comes back wrong

All three were found by running this against live providers. None of them is an
edge case.

**The safety filter stops the answer.** The provider returns
`finish_reason: "content_filter"` — or `native_finish_reason: "SAFETY"`, so
read both spellings — with a couple of words of text, zero usage and zero cost.
Unless you look for it, that is *indistinguishable from a successfully
transcribed quiet minute*. It happened on **9 of 37 pieces** of ordinary
business speech at temperature 0, and the same audio cut differently passes —
so it is the content that flips the coin, not the settings.

The handling: a stopped answer is its own return value. The piece is **halved
on the server** and each half asked for separately — a PCM16 WAV splits at a
byte with no decoding at all, and an Ogg splits at a page, which is a packet
boundary, so each half is a whole stream again once sequence numbers, flags,
granule positions and checksums are rewritten. If a half is stopped too, the
words that did arrive are kept. The piece row says `filtered:split` or
`filtered:partial`.

**A fragment is not an answer.** Under about two characters per second of
audio, ask once more. Still short: mark the piece `short` and let the person
retry, and keep the third answer whatever its length — by then a genuinely
quiet stretch is the likelier explanation, and refusing a real silence forever
is worse than accepting a short one.

**The answer is cut off at the ceiling.** On a `length` finish, ask again with
half again the room. Do **not** parse what was never finished: a truncated JSON
reads as "unreadable", and "unreadable" sends you to the wrong file.

---

## ⑩ Assembly

When the last piece is `done`, the texts are joined in index order and written
to `meetings.transcript`. From that moment the transcript is the owner's to
edit, and the pieces are only history.

---

## ⑪ Who said it

One model call — or a few, for a long transcript — over the whole transcript at
once. Over the *whole* transcript, rather than per piece, because a speaker
labelled per piece is labelled inconsistently across boundaries, and that is
worse than no labels.

The model **never rewrites anything**. The transcript is cut into numbered
sentences on the server and the model answers with ranges —
`{"from": 12, "to": 19, "side": "client"}` — and the turns are assembled from
the transcriber's own words. So the worst a bad answer can be is a wrong label.
A model asked to rewrite an hour of speech with labels attached drops lines on
the way, and a dropped line is unrecoverable.

Chunks of about 16,000 characters, each shown the identities settled so far and
the tail of the chunk before it.

Corrections afterwards call no model at all: a side button per turn moves that
turn only; a turn of several sentences opens sentence by sentence and splits in
place; and swap-sides moves the whole meeting, for a pass that had the two
people the wrong way round from the start.

Two details that look like oversights and are not. **Adjacent turns of the same
side are deliberately not merged** after an edit — two paragraphs marked
*Consultant* read exactly like one, and leaving them apart keeps every earlier
turn at the index the page just used, so a second edit lands where the reader
pointed. And **the editing splitter is a different function from the model's
splitter**: the one that numbers sentences for a model glues fragments under
six characters onto their neighbour, which is right for numbering and wrong for
a person, because a one-word agreement is exactly the sentence a reader reaches
for.

---

## ⑫ The draft

One call, both languages at once, the template's headings, finished formal
sentences that could stand in the proposal unchanged.

The model writes a list of **facts** first — who said what, every number, name,
date and tool, each prefixed CLIENT or CONSULTANT — and then writes both
editions from that list and from nothing else. That ordering is the guard: a
model that drafts first and checks later invents a plausible figure; a model
that must write the figures down before it drafts has nothing to invent from.

It reads the **client's** lines for what we heard, goals, budget and
exclusions, and the **consultant's** lines for phases, method and deliverables,
and writes down only what the client did not object to. A proposal the client
already argued against in the meeting is not a proposal.

**Never a price, a date, a percentage, a headcount or a deadline that was not
said.** A number that was said is kept exactly. A number that was not said
means the section stays quieter and a question goes to *open questions*. This
is the one rule the whole product is judged on.

The output ceiling is sized to the material here too — roughly a token per
character of input, with a floor — and on a `length` finish it asks once more
with half again the room rather than parsing a cut-off JSON. Two editions of a
long meeting plus a fact list is more than a fixed 12,000-token ceiling, which
is how that was found.

Then `draft_status` is `pending`, and it stays pending. Every accepted rewrite
and every redraw returns it to pending. Approval is the only thing that moves it
forward, and approval is a person pressing a button.

A rewrite of ONE section does not write at all until it is accepted. It costs
about two cents against thirteen for a redraw, and it comes back as a proposal —
the new lines beside the ones they would replace, with accept and discard. It
used to save itself, which made asking for one a gamble: the lines you had were
gone before you could read the new ones, and a rewrite that came back worse cost
you the version you were happy with.

---

## Where the money goes

Every model call is preceded by a read of `shenava_spend_status()` and refused
before it is sent if it would take the day or the month past its ceiling. A
limit enforced after the call is not a limit.

Cost is computed from the provider's own token counts against a per-model price
table and written to `shenava_runs` **whether the call succeeded or not** — a
failed call that consumed tokens still cost money.

The ceilings are read from the ledger and not from the figure on the meeting
row, because a meeting redrawn next month must not count against last month's
ceiling.

For an hour of meeting: a few cents of transcription, fifteen to twenty of
drafting.

---

## If you change one thing, know this

**The kernel owns the numbers.** `@mazarix/voice-kernel` holds the 60 seconds,
the sample rate, the WAV header, the prompt, the retry policy, the timeout
curve, the rescue engine and the bidi algorithm. Nothing here may carry its own
copy of one of those. Two programs with their own copies drift apart silently,
and no test can see the drift — they simply start transcribing differently.

**Determinism in the planner is load-bearing.** Anything you add to
`planSegments` that reads the clock, the device or a random number breaks
resumption, and it breaks it quietly: the failure is a transcript with a
seven-second hole in it.

**The failure handling is the product.** A transcription pipeline that works on
clean audio is a weekend. The nine-in-thirty-seven safety filter, the truncated
long piece and the two-word answer are what the remaining ninety percent of
this code is for.
