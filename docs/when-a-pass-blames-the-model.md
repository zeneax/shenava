# When a pass says the model returned bad JSON

**Symptom.** Press **دو گوینده را از هم جدا کن** and the panel answers:

> جواب مدل دو بار به شکلی که خواسته شده بود خوانده نشد. باز امتحان کن؛ اگر تکرار
> شد، مدل نویسنده در صفحهٔ تنظیمات شاید مدلی نباشد که JSON قابل‌اعتماد برگردانند.

Which sends you to the settings page to change the model. The model was fine.
The same model had labelled the meeting before this one without complaint.

**What it was.** The answer was not badly shaped, it was *unfinished*.
`speakers.ts` asked for a flat 4,000 output tokens per chunk whatever the chunk
held. A meeting of 187 sentences wanted more than that, so the answer stopped
mid-object; `readLastJson` only returns balanced objects, so a truncated answer
yields `null`; and the retry, asking again at the same flat 4,000, stopped in
exactly the same place. Two failures, one cause, and the message named neither.

**How to see it in one query.** The ledger records every call, failed ones
included, and `tokens_out` is the tell — a run that stopped at its ceiling lands
on a round number, and lands on it *again* on the retry:

```
seat        detail                     tokens_in  tokens_out  ok     error
speakers    187 sentences, 1 chunk(s)  19382      8000        false  unreadable
speakers    163 sentences, 1 chunk(s)  9448       3344        true   null
```

8,000 is 2 × 4,000, to the token. A model that finished does not land on the
ceiling once, let alone twice. The row below it is the same seat succeeding at
3,344 — under the cap, and nowhere near a round number. That contrast is the
whole diagnosis, and it takes about ten seconds once you are looking at it.

There is no page in the app that shows this. Read it straight from Postgres with
the service key already in `.env.local`:

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n")
  .filter(l => l.includes("=") && !l.startsWith("#"))
  .map(l => [l.slice(0,l.indexOf("=")), l.slice(l.indexOf("=")+1).trim().replace(/^["\x27]|["\x27]$/g,"")]));
const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/shenava_runs`
  + "?select=seat,model,detail,tokens_in,tokens_out,ok,error,ms,created_at"
  + "&order=created_at.desc&limit=15",
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
               Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
console.table(await r.json());
'
```

**What changed because of it.** All three seats size their ceiling to their
material, and all three now live in [`src/lib/meetings/ceiling.ts`](../src/lib/meetings/ceiling.ts)
— one file, no imports, so `server-only` cannot put them out of a test's reach.
`tests/pipeline.test.ts` holds the 187-sentence case directly. The speaker pass
also grows its ceiling by half on a cut-off before retrying, which the writer
seat already did, and the ledger now records the verdict (`unreadable: it was
cut off before the JSON closed`) rather than only `unreadable` — so the next
one of these does not need the query above at all.

**The rule underneath.** An answer stopped at its ceiling never arrives labelled
as such. It arrives as a truncated transcript that reads like bad dictation, or
as half a JSON object that reads as a model that cannot follow a schema. Both
point at the model. Neither is the model. Any new seat that asks for a fixed
number of output tokens is this bug waiting:

```bash
grep -rn 'await ask(' src/lib/meetings/
```

Every hit should be passing a variable, not a literal.
