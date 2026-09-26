import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TemplateSchema, nextNumber, pour, suggestTemplate, templateName, TEMPLATE_KEYS,
} from "../src/lib/meetings/template.ts";
import { MeetingNotesSchema, LIST_SECTIONS } from "../src/lib/meetings/notes-schema.ts";
import { documentFileName, durationLabel } from "../src/lib/meetings/format.ts";

const template = TemplateSchema.parse({
  id: "t1",
  name: "Standard proposal",
  name_fa: "پیشنهاد استاندارد",
  is_default: true,
  sections: [
    { key: "summary", label_en: "Summary", label_fa: "خلاصه", kind: "text" },
    { key: "goals", label_en: "Goals", label_fa: "اهداف", kind: "lines" },
    { key: "phases", label_en: "Phases", label_fa: "مراحل", kind: "phases" },
    { key: "exclusions", label_en: "Not included", label_fa: "بیرون از دامنه", kind: "lines", optional: true },
    { key: "assumptions", label_en: "Assumptions", label_fa: "پیش‌فرض‌ها", kind: "lines" },
  ],
  house_lines: { fa: ["این پیشنهاد سی روز اعتبار دارد."], en: ["This proposal is valid for thirty days."] },
});

const notes = MeetingNotesSchema.parse({
  fa: {
    title: "عنوان فارسی", engagement: "project", summary: "خلاصهٔ فارسی.",
    goals: ["هدف یک", "هدف دو"],
    phases: [{ title: "مرحلهٔ یک", when: "سه هفته", detail: "توضیح" }],
    scheduleNote: "در کل سه هفته.",
    assumptions: ["یک پیش‌فرض"],
  },
  en: {
    title: "English title", engagement: "project", summary: "English summary.",
    goals: ["Goal one", "Goal two"],
    phases: [{ title: "Phase one", when: "three weeks", detail: "detail" }],
    scheduleNote: "Three weeks overall.",
    assumptions: ["One assumption"],
  },
  openQuestions: { fa: ["پرسش"], en: ["A question"] },
});

test("the poured sections follow the template's order, not the draft's", () => {
  const poured = pour(notes, template, "en");
  assert.deepEqual(poured.sections.map((s) => s.key), ["summary", "goals", "phases", "assumptions"]);
});

test("an optional section the meeting left empty is dropped; a required one is kept", () => {
  const poured = pour(notes, template, "en");
  // exclusions is empty AND optional, so it is gone.
  assert.equal(poured.sections.find((s) => s.key === "exclusions"), undefined);
  // assumptions has content; make a version where it does not and check it stays.
  const bare = MeetingNotesSchema.parse({ fa: {}, en: {} });
  const barePoured = pour(bare, template, "en");
  const kept = barePoured.sections.find((s) => s.key === "assumptions");
  assert.ok(kept, "a required empty section must still be printed, so the reader sees it is empty");
  assert.deepEqual(kept.lines, []);
});

test("the headings and the content come from the language asked for", () => {
  const fa = pour(notes, template, "fa");
  const en = pour(notes, template, "en");
  assert.equal(fa.sections[0]!.heading, "خلاصه");
  assert.equal(fa.sections[0]!.text, "خلاصهٔ فارسی.");
  assert.equal(en.sections[0]!.heading, "Summary");
  assert.equal(en.sections[0]!.text, "English summary.");
  assert.equal(fa.title, "عنوان فارسی");
  assert.equal(en.title, "English title");
});

test("a heading missing in one language falls back to the other rather than printing nothing", () => {
  const half = TemplateSchema.parse({
    id: "t2",
    sections: [{ key: "goals", label_en: "Goals", kind: "lines" }],
  });
  assert.equal(pour(notes, half, "fa").sections[0]!.heading, "Goals");
});

test("phases carry their schedule note, because the document prints them as one section", () => {
  const poured = pour(notes, template, "fa");
  const phases = poured.sections.find((s) => s.key === "phases")!;
  assert.equal(phases.phases.length, 1);
  assert.equal(phases.scheduleNote, "در کل سه هفته.");
});

test("the house lines come out in the language asked for", () => {
  assert.deepEqual(pour(notes, template, "fa").houseLines, ["این پیشنهاد سی روز اعتبار دارد."]);
  assert.deepEqual(pour(notes, template, "en").houseLines, ["This proposal is valid for thirty days."]);
});

test("a template naming a key the draft does not have prints nothing rather than failing", () => {
  // A template outliving a schema change is the normal case; a document that
  // refuses to print is not.
  const stale = TemplateSchema.parse({
    id: "t3",
    sections: [
      { key: "summary", label_en: "Summary", kind: "text" },
      { key: "aSectionThatNoLongerExists", label_en: "Gone", kind: "lines" },
    ],
  });
  const poured = pour(notes, stale, "en");
  assert.equal(poured.sections.length, 2);
  assert.deepEqual(poured.sections[1]!.lines, []);
});

test("every key a template may print is one the draft actually holds", () => {
  // The guard against the two drifting apart: the template's vocabulary is the
  // draft's own keys plus the two that live outside an edition.
  for (const key of TEMPLATE_KEYS) {
    const known =
      key === "summary" || key === "phases" || key === "openQuestions" ||
      (LIST_SECTIONS as readonly string[]).includes(key);
    assert.ok(known, `${key} is not a section the draft has`);
  }
});

test("the suggestion prefers a template made for the draft's engagement", () => {
  const consulting = TemplateSchema.parse({ id: "c", engagement: "consulting", name: "Consulting" });
  const list = [template, consulting];
  assert.equal(suggestTemplate(list, "consulting")!.id, "c");
  // "unknown" is not an engagement to match on: it falls through to the default.
  assert.equal(suggestTemplate(list, "unknown")!.id, "t1");
  assert.equal(suggestTemplate([], "project"), null);
});

test("the suggestion falls back to the default, then to whatever there is", () => {
  const plain = TemplateSchema.parse({ id: "p", name: "Plain" });
  assert.equal(suggestTemplate([plain], "retainer")!.id, "p");
});

test("a proposal number is never handed out twice, and the year is its own sequence", () => {
  // A duplicate number is two documents a client cannot tell apart, and it is
  // only noticed months later in somebody's records.
  assert.equal(nextNumber([], 2026), "SHP-2026-0001");
  assert.equal(nextNumber(["SHP-2026-0001"], 2026), "SHP-2026-0002");
  // Gaps do not reset it: the highest used wins, not the count.
  assert.equal(nextNumber(["SHP-2026-0001", "SHP-2026-0007"], 2026), "SHP-2026-0008");
  // Last year's numbers do not affect this year's.
  assert.equal(nextNumber(["SHP-2025-0042"], 2026), "SHP-2026-0001");
  // Nor does anything that is not one of ours.
  assert.equal(nextNumber(["INV-2026-0099", "", "SHP-2026-abc"], 2026), "SHP-2026-0001");
});

test("a name in one language falls back to the other", () => {
  assert.equal(templateName(template, "fa"), "پیشنهاد استاندارد");
  const english = TemplateSchema.parse({ id: "e", name: "Only English" });
  assert.equal(templateName(english, "fa"), "Only English");
});

test("a file name survives a Persian title and loses what a file system refuses", () => {
  const name = documentFileName('جلسهٔ آزمایشی: "نیلگون" / ۱', "notes", "fa", "docx");
  assert.ok(!/[\\/:*?"<>|]/.test(name), `a forbidden character survived: ${name}`);
  assert.ok(name.endsWith(".docx"));
  assert.ok(name.includes("پیش‌نویس"));
  // An empty title still produces a usable name rather than ".docx".
  assert.ok(documentFileName("", "transcript", "en", "docx").startsWith("meeting"));
});

test("a duration reads as its own language", () => {
  assert.match(durationLabel(39 * 60_000, "en"), /39 min/);
  assert.match(durationLabel(95 * 60_000, "en"), /1 h 35 min/);
  assert.ok(durationLabel(39 * 60_000, "fa").includes("دقیقه"));
  assert.ok(durationLabel(120 * 60_000, "fa").includes("ساعت"));
});
