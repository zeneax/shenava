# prompts/

Three files, for three different readers.

**[`PRD.md`](PRD.md)** — the specification. What Shenava is, the two ways it
cuts audio and why, the three failure modes of live transcription providers,
the data model, the screens, and what is deliberately left out of version one.
Read this to understand the product.

**[`PRD.fa.md`](PRD.fa.md)** — the same thing in Persian. Not a translation:
each edition is written for its own reader, which is also the rule the product
itself follows when it writes a proposal.

**[`BUILD-PROMPT.md`](BUILD-PROMPT.md)** — a complete instruction for a coding
agent to build this project from an empty folder. Paste it into Claude Code, or
any agent that can write files and run commands, and it has everything it needs
to decide: the stack, every tuned number, the algorithms, the eleven proposal
sections, the writer's rules, the schema, the screens, the order of work, and
what proves it is finished.

It is long on purpose. Every paragraph that reads like an over-specification is
a thing that was got wrong once against real audio. An agent given a short
version of it will write something that looks right and fails on the first
real recording.

---

## The prompts the product itself uses

These are not here — they live in the code, because they are read by it. But
they are deliberately kept in one place per seat so they can be found and
changed:

The **transcription** prompt is not ours at all: it comes from
`@mazarix/voice-kernel`, along with the retry policy, the timeout curve and the
bidi algorithm. Changing transcription behaviour means changing the package, not
the app — that is the point of it being a package.

The **speaker pass** prompt asks for sentence ranges, never rewritten text.

The **writer** prompt is the long one, and the rule it exists to enforce is:
never invent a price, a date or a number. Section 4 of `BUILD-PROMPT.md` has it
in full, including the eleven headings and what each is for.

The **studio's own voice** is not in any prompt. It comes from
`shenava_settings` — the studio name in both scripts and a free-text note on
tone — so that a fork sounds like its own studio without editing code.
