import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseNotes, DEFAULT_SECTIONS, NOTES_LANGS } from "../src/lib/meetings/notes-schema.ts";
import { DialogueSchema } from "../src/lib/meetings/dialogue-schema.ts";
import { TemplateSectionSchema } from "../src/lib/meetings/template.ts";

/**
 * The seed, read the way the application reads it.
 *
 * A `jsonb` column has no shape: Postgres accepts any valid JSON and the
 * schemas that do have a shape live in TypeScript, where `tsc` cannot see
 * inside a SQL string literal. So a seed can be valid SQL, valid JSON, and
 * still unreadable to every screen that loads it — which is exactly what
 * happened to the sample dialogue, and is written up in
 * `docs/a-shape-the-database-accepts.md`. These tests are the guard.
 */

const SQL = readFileSync(new URL("../db/02_seed.sql", import.meta.url), "utf8");

/** Every `'…'::jsonb` literal in the file, with `''` read back as one quote. */
function jsonbLiterals(sql: string): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < sql.length; i += 1) {
    if (sql[i] !== "'") continue;
    let j = i + 1;
    let buf = "";
    while (j < sql.length) {
      if (sql[j] === "'") {
        if (sql[j + 1] === "'") { buf += "'"; j += 2; continue; }
        break;
      }
      buf += sql[j];
      j += 1;
    }
    if (sql.slice(j, j + 8) === "'::jsonb") {
      try { out.push(JSON.parse(buf)); } catch { /* not every literal is JSON */ }
      i = j + 7;
    }
  }
  return out;
}

const literals = jsonbLiterals(SQL);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// A notes blob has two EDITIONS under fa/en; house_lines has two ARRAYS.
const notesBlobs = literals.filter(
  (v) => isRecord(v) && isRecord(v.fa) && isRecord(v.en),
);
const dialogueBlobs = literals.filter((v) => isRecord(v) && "turns" in v);
const sectionBlobs = literals.filter(
  (v): v is unknown[] => Array.isArray(v) && isRecord(v[0]) && "key" in (v[0] as object),
);

test("the seed holds a sample for every shape a draft has to survive", () => {
  // Three meetings on purpose: one where no figure was ever said, one where
  // both sides named figures and settled the weeks, one that settled almost
  // nothing. One sample cannot show that range.
  assert.equal(notesBlobs.length, 3, "expected three drafted sample meetings");
  assert.equal(dialogueBlobs.length, 3, "every sample carries a dialogue");
});

test("every sample dialogue is in the shape the readers accept, not merely valid JSON", () => {
  for (const blob of dialogueBlobs) {
    const parsed = DialogueSchema.safeParse(blob);
    assert.ok(parsed.success, `a dialogue the app cannot read: ${parsed.error?.issues[0]?.message}`);
    assert.ok(parsed.data.turns.length > 0, "a dialogue that parses to no turns is no dialogue");
    // A bare array of {side,text} parses to zero turns rather than throwing,
    // and the app then silently falls back to the transcript. Both sides must
    // actually be present for the sample to demonstrate anything.
    const sides = new Set(parsed.data.turns.map((t) => t.who));
    assert.ok(sides.has("consultant") && sides.has("client"), "both sides must speak");
  }
});

test("every sample draft fills all twelve sections, in both languages", () => {
  for (const blob of notesBlobs) {
    const parsed = parseNotes(blob, DEFAULT_SECTIONS);
    assert.ok(parsed.success, `a draft the app cannot read: ${parsed.error?.issues[0]?.message}`);
    const notes = parsed.data!;
    for (const lang of NOTES_LANGS) {
      const edition = notes[lang];
      assert.ok(edition.title.length > 0, `${lang}: no title`);
      for (const def of DEFAULT_SECTIONS) {
        const value = edition.sections[def.key];
        assert.ok(value, `${lang}: ${def.key} is missing from a sample that should show it`);
        const filled =
          def.kind === "text" ? value.text.length > 0
          : def.kind === "phases" ? value.phases.length > 0
          : value.lines.length > 0;
        assert.ok(filled, `${lang}: ${def.key} is empty in a sample that should show it`);
      }
    }
    // The two editions describe one meeting, so they must agree on what it was.
    assert.equal(notes.fa.engagement, notes.en.engagement, "the editions disagree on the engagement");
  }
});

/*
 * THE ONE INVARIANT THAT CANNOT BE TESTED HERE, and why — so that nobody
 * writes it again and deletes it again.
 *
 * "A draft never carries a figure the meeting did not contain" is the rule the
 * product is judged on, and asserting it on the shipped samples looks easy:
 * pull every run of digits out of a draft and require the transcript to
 * contain it. It fails immediately and correctly. «پخش رها» is spoken in
 * Persian and its transcript spells «سی» and «صد و بیست میلیون»; the English
 * edition of that same draft writes "30" and "120 million", which is the right
 * translation of what was said, not an invention. A numeral and the word for
 * it are the same figure and no string comparison knows that.
 *
 * So the rule is asserted where it can be: on the writer's own instructions, in
 * `dialogue.test.ts`, which holds the phrasing that carries it. Judging the
 * samples themselves is a reading job, and `docs/` records that it was done.
 */

test("the seeded template asks the writer for every section it prints", () => {
  // A template's keys are its own now — any key is legal, because that is the
  // point. What is NOT legal is a section with no brief: the writer would be
  // asked for a key with no instruction and would fill it from whatever the
  // heading suggests.
  assert.ok(sectionBlobs.length > 0, "no template sections in the seed");
  for (const sections of sectionBlobs) {
    for (const raw of sections) {
      const parsed = TemplateSectionSchema.safeParse(raw);
      assert.ok(parsed.success, "a template section the app cannot read");
      assert.ok(parsed.data.key.length > 0, "a template section with no key");
      assert.ok(parsed.data.brief.length > 0, `the seeded «${parsed.data.key}» tells the writer nothing`);
      assert.ok(
        parsed.data.label_fa.length > 0 && parsed.data.label_en.length > 0,
        `the seeded «${parsed.data.key}» is missing a heading in one language`,
      );
    }
  }
});
