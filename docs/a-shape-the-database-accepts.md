# A shape the database accepts and the application rejects

**Symptom.** The sample meeting looks complete. `shenava_meetings.dialogue`
holds seventeen turns — you can read them in the Supabase table editor — and the
row says `dialogue_model = 'sample'`. But the meeting page shows no dialogue,
`GET /api/meetings/<id>/docx?part=dialogue` answers `409 no dialogue yet`, and
redrawing the meeting produces a draft that is subtly worse than the one already
stored, with the client's and the consultant's material mixed together.

Nothing has failed. The seed ran without error, the JSON is valid, the column is
`jsonb` and took it happily, `npm run typecheck && npm test` is green.

**What it was.** `db/02_seed.sql` wrote the dialogue as a bare array of
`{side, text}`:

```json
[{"side": "consultant", "text": "…"}, {"side": "client", "text": "…"}]
```

`DialogueSchema` wants an object — two identities and `turns`, and each turn's
speaker under `who`, not `side`:

```json
{"consultant": {…}, "client": {…}, "turns": [{"who": "consultant", "text": "…"}]}
```

`safeParse` returns `success: false` on the array, and every reader treats a
dialogue that does not parse as **no dialogue at all**, which is the right
behaviour for a row somebody edited into a bad shape and the wrong outcome
here. `materialBlock` in `lib/meetings/notes.ts` then falls back to the raw
transcript and tells the writer the two sides have *not* been told apart — so
the draft is still produced, from worse material, and says nothing about it.

**Why nothing could have told you.** A `jsonb` column has no shape. The schema
that does have one lives in TypeScript, and `tsc` cannot see inside a SQL string
literal. The tests never load the seed. The three places that read a dialogue
all degrade politely rather than throwing, because each of them is right to.

**The command that finds it again.** Parse what the seed actually writes through
the schema that actually reads it. Any file holding a dialogue — a seed, a
fixture, a hand-repaired row — is worth one run of this:

```bash
node --experimental-strip-types - <<'JS'
import fs from "node:fs";
const { DialogueSchema } = await import("./src/lib/meetings/dialogue-schema.ts");
const sql = fs.readFileSync("db/02_seed.sql", "utf8");
for (const [, block] of sql.matchAll(/'(\{[^']*"turns"[^']*\})'::jsonb/g)) {
  const r = DialogueSchema.safeParse(JSON.parse(block));
  console.log(r.success ? `ok — ${r.data.turns.length} turns` : `REJECTED — ${r.error.issues[0].message}`);
}
JS
```

A run that prints nothing is the same finding: no block in the seed is in the
shape the reader wants.

**The general case.** Every `jsonb` column in this schema — `dialogue`, `notes`,
`sections`, `house_lines`, `body` — is a place where the database will accept
what the application will not. When you write one by hand, parse it through its
own schema before believing it.
