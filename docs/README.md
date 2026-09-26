# docs/

**[`the-journey-of-a-file.md`](the-journey-of-a-file.md)** — the one to read
before changing anything in `lib/meetings/`. A recording from the moment it is
chosen to the moment a proposal draft is waiting: every step, every number, and
why each number is that number. It covers the sequence, which no single source
file can, and the rhythm — one piece at a time, what each request costs in
seconds, and where the waiting actually goes. The Persian edition is
[`the-journey-of-a-file.fa.md`](the-journey-of-a-file.fa.md).

Anything else in this folder is a note on something that was hard to find: the
symptom as it appeared, what it turned out to be, and the command that would
find it again. That last part is the point — a note that only names a past bug
saves nobody.

Two kinds of bug, and only one belongs here. A bug that was hard because the fix
was hard needs no note: the fix is in the history and the code explains itself
afterwards. A bug that was hard because **nothing in the repository could have
told you what was wrong** — the state that mattered lived somewhere the code
does not describe — is the kind worth writing down, because reading the code
more carefully would never have found it.
