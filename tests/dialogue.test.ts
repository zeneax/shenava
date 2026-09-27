import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitAllSentences,
  splitSentences,
  chunkSentences,
  numberedSentences,
  labelsFromSpans,
  turnsFromLabels,
  splitForEditing,
  withSide,
  swapSides,
  linesOf,
  dialogueAsText,
  dialogueShare,
  DialogueSchema,
  SpansAnswerSchema,
  type Speaker,
} from "../src/lib/meetings/dialogue-schema.ts";
import { readLastJson, clampText } from "../src/lib/meetings/text.ts";

const TURNS = [
  { who: "consultant" as Speaker, text: "Tell me how the shop runs today." },
  { who: "client" as Speaker, text: "Stock is in a spreadsheet. Orders come by message." },
];
const dialogue = DialogueSchema.parse({ turns: TURNS });

test("the two splitters differ exactly where it matters: a one-word answer", () => {
  const text = "Right. بله. So the stock comes first.";
  // The model's splitter glues a short fragment onto its neighbour, because the
  // model cannot say who said "بله" on its own and asking wastes a line.
  assert.equal(splitSentences(text).length, 2);
  // The reader's splitter must not, because «بله» is precisely the sentence they
  // reach for when the pass swallowed it into the wrong turn.
  const all = splitAllSentences(text);
  assert.equal(all.length, 3);
  assert.equal(all[1], "بله.");
});

test("sentences end at either script's punctuation and at a line break", () => {
  assert.deepEqual(splitAllSentences("یک؟ دو! سه…\nچهار."), ["یک؟", "دو!", "سه…", "چهار."]);
});

test("chunks cover every sentence exactly once, in order", () => {
  const sentences = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} of the meeting.`);
  const chunks = chunkSentences(sentences, 1000);
  assert.ok(chunks.length > 1, "200 sentences should not fit in one 1000-character chunk");
  assert.equal(chunks[0]!.from, 0);
  assert.equal(chunks.at(-1)!.to, sentences.length - 1);
  for (let i = 1; i < chunks.length; i += 1) {
    assert.equal(chunks[i]!.from, chunks[i - 1]!.to + 1, `chunk ${i} does not continue from ${i - 1}`);
  }
});

test("the numbering the model sees starts at the chunk's own offset", () => {
  const sentences = ["a.", "b.", "c.", "d."];
  assert.equal(numberedSentences(sentences, 2, 3), "[2] c.\n[3] d.");
});

test("a sentence no span names inherits the label before it, so a skipped line is not a hole", () => {
  // The model answered for 0-1 and 3, and silently skipped 2.
  const labels = labelsFromSpans(4, [
    { from: 0, to: 1, who: "consultant" },
    { from: 3, to: 3, who: "client" },
  ]);
  assert.deepEqual(labels, ["consultant", "consultant", "consultant", "client"]);
});

test("the very first sentence with nothing before it is unknown, which is the honest word", () => {
  assert.deepEqual(labelsFromSpans(2, []), ["unknown", "unknown"]);
});

test("a chunk continues from the label the previous chunk ended on", () => {
  const labels = labelsFromSpans(3, [{ from: 12, to: 12, who: "client" }], 10, "consultant");
  // Offset 10, so indices 10, 11, 12. Nothing names 10 or 11: they continue the
  // previous chunk's speaker rather than resetting to unknown.
  assert.deepEqual(labels, ["consultant", "consultant", "client"]);
});

test("later spans win where two overlap", () => {
  const labels = labelsFromSpans(3, [
    { from: 0, to: 2, who: "consultant" },
    { from: 1, to: 1, who: "client" },
  ]);
  assert.deepEqual(labels, ["consultant", "client", "consultant"]);
});

test("a span written backwards is still read", () => {
  assert.deepEqual(labelsFromSpans(3, [{ from: 2, to: 0, who: "client" }]), ["client", "client", "client"]);
});

test("turns are runs of one speaker, and no word is lost or added", () => {
  const sentences = ["One.", "Two.", "Three.", "Four."];
  const labels: Speaker[] = ["consultant", "consultant", "client", "consultant"];
  const turns = turnsFromLabels(sentences, labels);
  assert.deepEqual(turns.map((t) => t.who), ["consultant", "client", "consultant"]);
  assert.equal(turns.map((t) => t.text).join(" "), sentences.join(" "));
});

test("moving a whole turn moves that turn and nothing else", () => {
  const next = withSide(dialogue, 0, null, "client");
  assert.equal(next.turns[0]!.who, "client");
  assert.equal(next.turns[1]!.who, "client");
  assert.equal(next.turns.length, dialogue.turns.length);
  // The words are untouched. This is the whole promise of the correction.
  assert.equal(dialogueAsText(next).replace(/^\w+: /gm, ""), dialogueAsText(dialogue).replace(/^\w+: /gm, ""));
});

test("moving one sentence splits the turn in place and keeps its neighbours' side", () => {
  const next = withSide(dialogue, 1, 0, "consultant");
  assert.deepEqual(next.turns.map((t) => t.who), ["consultant", "consultant", "client"]);
  assert.equal(next.turns[1]!.text, "Stock is in a spreadsheet.");
  assert.equal(next.turns[2]!.text, "Orders come by message.");
});

test("a Persian paragraph of clauses can be edited, not only moved whole", () => {
  // The shape a real consultation comes back in: one full stop, at the end.
  // The model's splitter sees one sentence here, which left the reader with no
  // correction but moving all 150 characters to the other side.
  const paragraph =
    "مراجعین مرکز ما معمولاً از طریق واتساپ یا تماس تلفنی با منشی ارتباط می‌گیرن، " +
    "سؤال‌هایی که مطرح می‌کنن درباره درمانگرشونه، و هزینه‌ای که باید پرداخت کنن.";

  assert.equal(splitAllSentences(paragraph).length, 1);
  const pieces = splitForEditing(paragraph);
  assert.ok(pieces.length >= 3, `expected clauses, got ${pieces.length}`);
  // Nothing is invented and nothing is dropped.
  assert.equal(pieces.join(" ").replace(/\s+/g, " "), paragraph.replace(/\s+/g, " "));
});

test("a short turn is never chopped into clauses", () => {
  // Under the length worth breaking, a comma is just a comma.
  assert.deepEqual(splitForEditing("بله، درست است."), ["بله، درست است."]);
  assert.deepEqual(splitForEditing("بله."), ["بله."]);
});

test("a decimal survives the full stop that lost its space", () => {
  assert.deepEqual(splitForEditing("قیمت ۱۲.۵ میلیون است."), ["قیمت ۱۲.۵ میلیون است."]);
  assert.deepEqual(splitForEditing("The budget is 2.5 million."), ["The budget is 2.5 million."]);
  assert.deepEqual(splitForEditing("سلام.من شهرام هستم."), ["سلام.", "من شهرام هستم."]);
});

test("the reader's splitter and withSide agree on what index 1 means", () => {
  // The invariant the whole correction rests on: the button pressed on screen
  // and the clause moved in the database are the same clause.
  const paragraph =
    "ما یک تیم چهار نفره داریم، کارها را خودمان انجام می‌دهیم، و وقت کافی نداریم.";
  const held = DialogueSchema.parse({ turns: [{ who: "consultant" as Speaker, text: paragraph }] });
  const shown = splitForEditing(paragraph);
  const next = withSide(held, 0, 1, "client");
  const moved = next.turns.find((t) => t.who === "client");
  assert.equal(moved!.text, shown[1]);
});

test("adjacent turns of the same side are deliberately not merged", () => {
  // Merging would renumber every later turn, so a reader's second correction
  // would land one row away from where they pointed.
  const next = withSide(dialogue, 1, null, "consultant");
  assert.equal(next.turns.length, 2);
  assert.deepEqual(next.turns.map((t) => t.who), ["consultant", "consultant"]);
});

test("an out-of-range edit changes nothing rather than throwing", () => {
  assert.equal(withSide(dialogue, 99, null, "client"), dialogue);
  assert.equal(withSide(dialogue, 0, 99, "client"), dialogue);
});

test("swapping the sides moves every turn and the identities with them", () => {
  const named = DialogueSchema.parse({
    consultant: { name: "Sara", evidence: "proposes phases" },
    client: { name: "Reza", evidence: "describes the shop" },
    turns: TURNS,
  });
  const swapped = swapSides(named);
  assert.equal(swapped.consultant.name, "Reza");
  assert.equal(swapped.client.name, "Sara");
  assert.deepEqual(swapped.turns.map((t) => t.who), ["client", "consultant"]);
  // Twice is the identity, which is what makes it safe to press by mistake.
  assert.deepEqual(swapSides(swapped), named);
});

test("either side can be read alone", () => {
  assert.deepEqual(linesOf(dialogue, "client"), ["Stock is in a spreadsheet. Orders come by message."]);
  assert.deepEqual(linesOf(dialogue, "unknown"), []);
});

test("the share is measured in characters, so it says who held the floor", () => {
  const share = dialogueShare(dialogue);
  assert.ok(share.client > share.consultant);
  assert.equal(share.unknown, 0);
});

test("an answer with a rogue turn in it loses that turn, not the whole dialogue", () => {
  const parsed = DialogueSchema.parse({
    turns: [{ who: "consultant", text: "Kept." }, { who: "consultant", text: "" }, "not a turn at all"],
  });
  assert.equal(parsed.turns.length, 1);
});

test("an unknown side falls back to unknown rather than failing the parse", () => {
  const parsed = SpansAnswerSchema.parse({ spans: [{ from: 0, to: 1, who: "the boss" }] });
  assert.equal(parsed.spans[0]!.who, "unknown");
});

test("the last JSON object wins, and a brace inside a string does not end it early", () => {
  const answer = 'Thinking... {"spans":[]} then reconsidering: {"spans":[{"from":0,"to":1,"who":"client"}]}';
  const object = readLastJson(answer) as { spans: unknown[] };
  assert.equal(object.spans.length, 1);
  const withBrace = readLastJson('{"evidence":"said \\"} now\\" mid-sentence","name":"Reza"}') as { name: string };
  assert.equal(withBrace.name, "Reza");
});

test("nothing parseable answers null, which the caller retries rather than storing", () => {
  assert.equal(readLastJson("I am afraid I cannot do that."), null);
  assert.equal(readLastJson('{"spans": [ truncated'), null);
});

test("a long line is cut on a word boundary and marked as cut", () => {
  const cut = clampText("one two three four five six seven eight nine ten", 20);
  assert.ok(cut.endsWith("…"));
  assert.ok(cut.length <= 20);
  assert.ok(!cut.includes("fiv…"), `cut mid-word: ${cut}`);
});

/* ── The draft ─────────────────────────────────────────────────────────────
   Kept in this file because the notes and the dialogue share their splitters
   and their JSON reader, and a reader of one wants the other in view. */

test("a section rewritten in one language leaves the other one alone", async () => {
  const { MeetingNotesSchema, withSection } = await import("../src/lib/meetings/notes-schema.ts");
  const notes = MeetingNotesSchema.parse({
    fa: { title: "عنوان", goals: ["هدف فارسی"] },
    en: { title: "Title", goals: ["English goal"] },
  });

  // THE BUG THIS EXISTS FOR: every section's schema carries a default, so
  // parsing `undefined` succeeds and yields the empty default. Passing one
  // edition and leaving the other as `undefined` would erase it, silently.
  const next = withSection(notes, "goals", { fa: ["هدف تازه"] });
  assert.deepEqual(next.fa.goals, ["هدف تازه"]);
  assert.deepEqual(next.en.goals, ["English goal"], "the English edition was erased");
});

test("passing both editions replaces both", async () => {
  const { MeetingNotesSchema, withSection } = await import("../src/lib/meetings/notes-schema.ts");
  const notes = MeetingNotesSchema.parse({ fa: { goals: ["a"] }, en: { goals: ["b"] } });
  const next = withSection(notes, "goals", { fa: ["x"], en: ["y"] });
  assert.deepEqual([next.fa.goals, next.en.goals], [["x"], ["y"]]);
});

test("phases and their schedule note move together, because the proposal prints them as one", async () => {
  const { MeetingNotesSchema, withSection, sectionValue } = await import("../src/lib/meetings/notes-schema.ts");
  const notes = MeetingNotesSchema.parse({
    fa: { phases: [{ title: "یک", detail: "..." }], scheduleNote: "سه هفته" },
    en: { phases: [{ title: "One", detail: "..." }], scheduleNote: "three weeks" },
  });
  const next = withSection(notes, "phases", {
    fa: { phases: [{ title: "دو", when: "", detail: "…" }], scheduleNote: "چهار هفته" },
  });
  assert.equal(next.fa.phases[0]!.title, "دو");
  assert.equal(next.fa.scheduleNote, "چهار هفته");
  assert.equal(next.en.scheduleNote, "three weeks");
  assert.deepEqual(sectionValue(next, "phases", "en"), {
    phases: notes.en.phases,
    scheduleNote: "three weeks",
  });
});

test("open questions are stored once for both editions, not inside an edition", async () => {
  const { MeetingNotesSchema, withSection } = await import("../src/lib/meetings/notes-schema.ts");
  const notes = MeetingNotesSchema.parse({ fa: {}, en: {}, openQuestions: { fa: ["الف"], en: ["a"] } });
  const next = withSection(notes, "openQuestions", { en: ["b", "c"] });
  assert.deepEqual(next.openQuestions.fa, ["الف"]);
  assert.deepEqual(next.openQuestions.en, ["b", "c"]);
});

test("a draft missing whole sections parses, because a meeting may never reach them", async () => {
  const { MeetingNotesSchema } = await import("../src/lib/meetings/notes-schema.ts");
  const parsed = MeetingNotesSchema.safeParse({ fa: {}, en: {} });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data!.fa.exclusions, []);
  assert.equal(parsed.data!.fa.engagement, "unknown");
});

test("an engagement the model invented falls back to unknown rather than failing the draft", async () => {
  const { MeetingNotesSchema } = await import("../src/lib/meetings/notes-schema.ts");
  const parsed = MeetingNotesSchema.parse({ fa: { engagement: "partnership" }, en: {} });
  assert.equal(parsed.fa.engagement, "unknown");
});

test("an over-long line is clamped, not rejected — a model cannot count characters", async () => {
  const { MeetingNotesSchema } = await import("../src/lib/meetings/notes-schema.ts");
  const parsed = MeetingNotesSchema.parse({ fa: { goals: ["x".repeat(900)] }, en: {} });
  assert.ok(parsed.fa.goals[0]!.length <= 400);
  assert.ok(parsed.fa.goals[0]!.endsWith("…"));
});

test("every rewritable section has a heading in both languages", async () => {
  const { REWRITABLE_SECTIONS, SECTION_LABELS } = await import("../src/lib/meetings/notes-schema.ts");
  for (const section of REWRITABLE_SECTIONS) {
    if (section === "title") continue;
    const label = SECTION_LABELS[section];
    assert.ok(label, `${section} has no heading`);
    assert.ok(label.fa.length > 0 && label.en.length > 0, `${section} is missing an edition`);
  }
});

test("the writer is told never to invent a figure, in those words", async () => {
  const { PROPOSAL_GUIDE } = await import("../src/lib/meetings/proposal-guide.ts");
  // The one rule the product is judged on. If this phrasing is ever softened,
  // that should be a deliberate act with a failing test in front of it.
  assert.match(PROPOSAL_GUIDE, /ONLY what was actually said about money and time/);
  assert.match(PROPOSAL_GUIDE, /Never a figure the studio did not say/);
});
