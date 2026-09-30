import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";

import { buildMeetingDocx, partTitle, studioName } from "../src/lib/meetings/docx.ts";
import { renderMeetingPrint } from "../src/lib/meetings/print.ts";
import { parseNotes, DEFAULT_SECTIONS } from "../src/lib/meetings/notes-schema.ts";
import { DialogueSchema } from "../src/lib/meetings/dialogue-schema.ts";

const studio = { name: "Nilgoon Works", nameFa: "کارگاه نیلگون" };

const meeting = {
  title: "جلسهٔ نمونه",
  client_name: "کتاب‌فروشی نیلگون",
  created_at: "2026-09-26T10:00:00.000Z",
  duration_ms: 39 * 60_000,
  transcript: "خط اول.\n\nخط دوم که ادامه دارد.",
  dialogue: DialogueSchema.parse({
    consultant: { name: "سارا", evidence: "مراحل را پیشنهاد می‌دهد" },
    client: { name: "رضا", evidence: "مغازه را توصیف می‌کند" },
    turns: [
      { who: "consultant", text: "بگو مغازه امروز چطور می‌گردد." },
      { who: "client", text: "موجودی در یک صفحه‌گسترده است." },
    ],
  }),
  sections: DEFAULT_SECTIONS,
  notes: parseNotes({
    fa: {
      title: "جدول موجودی و ربات پاسخ",
      engagement: "project",
      summary: "خلاصه‌ای در دو جمله. جملهٔ دوم.",
      understanding: ["موجودی در صفحه‌گسترده است."],
      goals: ["چهار پرسش خودکار جواب بگیرند."],
      phases: [{ title: "موجودی", when: "سه هفته", detail: "تبدیل به جدول." }],
      scheduleNote: "در کل سه هفته.",
      exclusions: ["پرداخت در این پیشنهاد نیست."],
    },
    en: {
      title: "Stock table and an answering bot",
      engagement: "project",
      summary: "Two sentences. The second one.",
      understanding: ["The stock lives in a spreadsheet."],
      goals: ["The four questions answer themselves."],
      phases: [{ title: "Stock", when: "three weeks", detail: "Into a table." }],
      scheduleNote: "Three weeks overall.",
      exclusions: ["Payment is not in this proposal."],
    },
    openQuestions: { fa: ["عدد چقدر است؟"], en: ["What figure?"] },
  }, DEFAULT_SECTIONS).data!,
};

/** A .docx is a zip; this reads the one part that holds the words. */
function documentXml(file: Buffer): string {
  const entries = unzipSync(new Uint8Array(file));
  const body = entries["word/document.xml"];
  assert.ok(body, "a .docx must contain word/document.xml");
  return strFromU8(body);
}

test("a Word file is a real zip with the document part in it", async () => {
  const file = await buildMeetingDocx({ meeting, part: "notes", lang: "fa", studio });
  assert.ok(file.byteLength > 2000, `only ${file.byteLength} bytes`);
  // The zip signature, so a truncated or plain-text answer fails loudly here.
  assert.equal(file[0], 0x50);
  assert.equal(file[1], 0x4b);
  const xml = documentXml(file);
  assert.match(xml, /w:document/);
});

test("the Persian draft carries its own words, its headings and the studio's name", async () => {
  const xml = documentXml(await buildMeetingDocx({ meeting, part: "notes", lang: "fa", studio }));
  assert.ok(xml.includes("جدول موجودی و ربات پاسخ"), "the title is missing");
  assert.ok(xml.includes("خلاصهٔ پیشنهاد"), "the summary heading is missing");
  assert.ok(xml.includes("موجودی در صفحه‌گسترده است."), "a line of the draft is missing");
  assert.ok(xml.includes("عدد چقدر است؟"), "the open questions are missing");
  assert.ok(xml.includes("کارگاه نیلگون"), "the studio's Persian name is missing");
  // Persian must be laid out as Persian, not as left-to-right text containing
  // Persian letters. Word needs both marks, and without them the document opens
  // with every line flush left and its punctuation on the wrong side.
  assert.match(xml, /w:bidi/);
  assert.match(xml, /w:rtl/);
});

test("the English edition is English, not a translation of the Persian one", async () => {
  const xml = documentXml(await buildMeetingDocx({ meeting, part: "notes", lang: "en", studio }));
  assert.ok(xml.includes("Stock table and an answering bot"));
  assert.ok(xml.includes("Nilgoon Works"));
  assert.ok(!xml.includes("جدول موجودی"), "the Persian title leaked into the English document");
});

test("the transcript and the dialogue each come out as their own document", async () => {
  const transcript = documentXml(await buildMeetingDocx({ meeting, part: "transcript", lang: "fa", studio }));
  assert.ok(transcript.includes("خط دوم که ادامه دارد."));
  const dialogue = documentXml(await buildMeetingDocx({ meeting, part: "dialogue", lang: "fa", studio }));
  assert.ok(dialogue.includes("مشاور"), "the speaker labels are missing");
  assert.ok(dialogue.includes("موجودی در یک صفحه‌گسترده است."));
  assert.ok(dialogue.includes("سارا"), "the names the pass found are missing");
});

test("a part with nothing in it produces a document rather than throwing", async () => {
  const bare = { ...meeting, transcript: null, notes: null, dialogue: null };
  const file = await buildMeetingDocx({ meeting: bare, part: "notes", lang: "en", studio });
  assert.ok(file.byteLength > 1000);
});

test("the print sheet is one self-contained A4 document", () => {
  const html = renderMeetingPrint({ meeting, part: "notes", lang: "fa", autoPrint: false, studio });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /@page \{ size: A4/);
  assert.ok(html.includes("جدول موجودی و ربات پاسخ"));
  assert.ok(html.includes("کارگاه نیلگون"));
});

test("the English sheet is left-to-right", () => {
  const html = renderMeetingPrint({ meeting, part: "notes", lang: "en", autoPrint: false, studio });
  assert.match(html, /<html lang="en" dir="ltr">/);
});

test("nothing a title or a transcript contains can close a tag", () => {
  const nasty = {
    ...meeting,
    title: "</title><script>alert(1)</script>",
    client_name: 'a & b "c"',
    transcript: "<img onerror=alert(2)> and 5 > 3",
  };
  // The transcript part, because that is the one headed by the MEETING's title;
  // the draft is headed by the draft's own title, which the model wrote.
  const html = renderMeetingPrint({ meeting: nasty, part: "transcript", lang: "en", autoPrint: false, studio });
  assert.ok(!html.includes("<script>alert(1)</script>"), "a script tag survived escaping");
  assert.ok(!html.includes("<img onerror"), "an attribute survived escaping");
  assert.ok(html.includes("&lt;/title&gt;"));
  assert.ok(html.includes("a &amp; b &quot;c&quot;"));
  assert.ok(html.includes("5 &gt; 3"));
});

test("a title the model wrote is escaped too, on the draft", () => {
  const drafted = {
    ...meeting,
    notes: { ...meeting.notes, en: { ...meeting.notes.en, title: "<b>bold</b> & bigger" } },
  };
  const html = renderMeetingPrint({ meeting: drafted, part: "notes", lang: "en", autoPrint: false, studio });
  assert.ok(!html.includes("<b>bold</b>"), "a tag from the model reached the page");
  assert.ok(html.includes("&lt;b&gt;bold&lt;/b&gt; &amp; bigger"));
});

test("only ?print=1 arms the print dialog", () => {
  const armed = renderMeetingPrint({ meeting, part: "notes", lang: "fa", autoPrint: true, studio });
  const quiet = renderMeetingPrint({ meeting, part: "notes", lang: "fa", autoPrint: false, studio });
  assert.match(armed, /window\.print\(\)/);
  assert.ok(!quiet.includes("window.print()"));
});

test("an unnamed studio prints nothing rather than a placeholder", () => {
  const anonymous = { name: "", nameFa: "" };
  const html = renderMeetingPrint({ meeting, part: "notes", lang: "fa", autoPrint: false, studio: anonymous });
  assert.equal(studioName(anonymous, "fa"), "");
  assert.ok(!html.includes('class="brand"'), "an empty brand line was printed anyway");
  assert.ok(!html.toLowerCase().includes("shenava"), "the software's name reached a client's document");
});

test("each part is named in both editions", () => {
  for (const part of ["transcript", "dialogue", "notes"] as const) {
    assert.ok(partTitle(part, "fa").length > 0);
    assert.ok(partTitle(part, "en").length > 0);
  }
});

/* ── Persian, as Word lays it out ──────────────────────────────────────── */

test("every Persian run names its language, so Word proofs it as Persian and not as misspelt English", async () => {
  const xml = documentXml(await buildMeetingDocx({ meeting, part: "dialogue", lang: "fa", studio }));
  assert.match(xml, /<w:lang [^>]*w:bidi="fa-IR"/, "no complex-script language on the runs");
  const en = documentXml(await buildMeetingDocx({ meeting, part: "dialogue", lang: "en", studio }));
  assert.doesNotMatch(en, /w:bidi="fa-IR"/, "the English edition is tagged Persian");
});

test("the Persian metadata line is joined with a Persian comma, never a middle dot", async () => {
  // A middle dot beside a Persian digit is read as a zero: «· ۸ مهر» is «۸۰ مهر».
  const fa = documentXml(await buildMeetingDocx({ meeting, part: "notes", lang: "fa", studio }));
  assert.ok(!fa.includes(" · "), "a middle dot survived in the Persian document");
  assert.ok(fa.includes("، "), "the Persian comma is missing");
  const en = documentXml(await buildMeetingDocx({ meeting, part: "notes", lang: "en", studio }));
  assert.ok(en.includes(" · "), "the English document lost its separator");
});

test("the print sheet joins its Persian metadata the same way", () => {
  const fa = renderMeetingPrint({ meeting, part: "dialogue", lang: "fa", autoPrint: false, studio });
  assert.ok(!fa.includes(" · "), "a middle dot survived on the Persian sheet");
  assert.ok(fa.includes("، "), "the Persian comma is missing from the sheet");
  const en = renderMeetingPrint({ meeting, part: "dialogue", lang: "en", autoPrint: false, studio });
  assert.ok(en.includes(" · "), "the English sheet lost its separator");
});


/* ── The face travels with the file ─────────────────────────────────────── */

import { documentFonts } from "../src/lib/meetings/fonts.ts";

test("the Persian face is embedded, so the document looks the same on a machine without it", async () => {
  const file = await buildMeetingDocx({ meeting, part: "dialogue", lang: "fa", studio, fonts: documentFonts() });
  const entries = unzipSync(new Uint8Array(file));
  const embedded = Object.keys(entries).filter((k) => /^word\/fonts\/.+\.odttf$/.test(k));
  assert.equal(embedded.length, 1, "exactly one embedded font part");
  const table = strFromU8(entries["word/fontTable.xml"]!);
  assert.match(table, /w:name="Vazirmatn"/, "the font table does not name the face");
  assert.match(table, /w:embedRegular/, "the face is named but not embedded");
  // The face is 120 KB before the zip squeezes it; the same document without
  // it is a few kilobytes, so the difference is the face and nothing else.
  const plain = await buildMeetingDocx({ meeting, part: "dialogue", lang: "fa", studio });
  assert.ok(file.byteLength > plain.byteLength + 50_000, `no room for a face: ${file.byteLength} vs ${plain.byteLength}`);
});

test("without the font handed over, the document only names the face", async () => {
  const file = await buildMeetingDocx({ meeting, part: "dialogue", lang: "fa", studio });
  const entries = unzipSync(new Uint8Array(file));
  assert.ok(!Object.keys(entries).some((k) => k.startsWith("word/fonts/")), "a font part appeared unasked");
});

test("Persian paragraphs align to START, because Word reads right as the left edge of a bidi line", async () => {
  const fa = documentXml(await buildMeetingDocx({ meeting, part: "dialogue", lang: "fa", studio }));
  assert.ok(!/<w:jc w:val="right"\/>/.test(fa), "a Persian paragraph is jc=right, which Word sets flush left");
  assert.match(fa, /<w:jc w:val="start"\/>/, "Persian paragraphs carry no start alignment");
  const en = documentXml(await buildMeetingDocx({ meeting, part: "dialogue", lang: "en", studio }));
  assert.match(en, /<w:jc w:val="left"\/>/, "the English document lost its alignment");
});
