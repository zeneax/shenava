import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun,
} from "docx";
import {
  ENGAGEMENT_LABELS, LIST_SECTIONS, SECTION_LABELS,
  type MeetingNotes, type NotesEdition, type NotesLang,
} from "./notes-schema.ts";
import { SPEAKER_LABELS, type Dialogue } from "./dialogue-schema.ts";
import { durationLabel, meetingDate } from "./format.ts";

/* Deliberately NOT `server-only`: `docx` builds the file in pure JavaScript and needs no server at all, and `server-only` does not resolve
   outside Next — marking it would put this beyond the reach of a test that
   builds a real document and reads it back. */

/**
 * A meeting as a Word document.
 *
 * `docx` builds the file in pure JavaScript, which is what lets this run in a
 * serverless function; the alternative — rendering HTML through a browser —
 * needs a Chromium the function does not have, and is why the PDF is the
 * browser's own print of the sheet in `./print` rather than a file from here.
 *
 * Persian paragraphs are marked bidirectional and aligned right, and every
 * run is marked right-to-left, so Word lays the text out as Persian rather
 * than as left-to-right text that happens to contain Persian letters. The
 * font is named, not embedded — Word substitutes when it lacks it, and a
 * document that names Vazirmatn opens correctly where it is installed and
 * readably everywhere else.
 *
 * The studio's name is an ARGUMENT, not a constant. It is printed on the
 * document and set as its author, and a forkable project cannot ship somebody
 * else's name in a file a client receives.
 */

/** Who the document is from. Read from the settings row by the route. */
export type Studio = { name: string; nameFa: string };

export function studioName(studio: Studio, lang: NotesLang): string {
  const chosen = lang === "fa" ? studio.nameFa || studio.name : studio.name || studio.nameFa;
  return chosen.trim();
}

export type MeetingForDocument = {
  title: string;
  client_name: string;
  created_at: string;
  duration_ms: number;
  transcript: string | null;
  notes: MeetingNotes | null;
  dialogue: Dialogue | null;
};

export type DocumentPart = "transcript" | "dialogue" | "notes";

export function partTitle(part: DocumentPart, lang: NotesLang): string {
  if (part === "transcript") return lang === "fa" ? "رونوشت جلسه" : "Meeting transcript";
  if (part === "dialogue") return lang === "fa" ? "گفت‌وگوی جلسه، به تفکیک گوینده" : "Meeting dialogue, by speaker";
  return lang === "fa" ? "پیش‌نویس پروپوزال از جلسه" : "Proposal draft from the meeting";
}

const FONT = "Vazirmatn";

type Heading = (typeof HeadingLevel)[keyof typeof HeadingLevel];

function run(text: string, lang: NotesLang, extra: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text, rightToLeft: lang === "fa", font: FONT, ...extra });
}

function para(
  text: string,
  lang: NotesLang,
  options: { heading?: Heading; bullet?: boolean; muted?: boolean } = {},
) {
  return new Paragraph({
    bidirectional: lang === "fa",
    alignment: lang === "fa" ? AlignmentType.RIGHT : AlignmentType.LEFT,
    heading: options.heading,
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: options.heading ? 120 : 80 },
    children: [run(text, lang, options.muted ? { size: 20 } : {})],
  });
}

/**
 * What the document is called.
 *
 * For the DRAFT, the draft's own title — the proposal's heading, in that
 * edition's own language. It was written for exactly this, and using the
 * meeting's title instead prints «جلسهٔ نمونه» at the top of a document whose
 * subject is a stock table, which is how this was found.
 *
 * For the transcript and the dialogue, the meeting's title, because those are
 * records of a meeting and not proposals.
 */
export function documentHeading(
  meeting: MeetingForDocument,
  lang: NotesLang,
  part: DocumentPart,
): string {
  if (part === "notes") {
    const drafted = meeting.notes?.[lang].title.trim();
    if (drafted) return drafted;
  }
  return meeting.title.trim();
}

function header(
  meeting: MeetingForDocument,
  lang: NotesLang,
  kind: DocumentPart,
  studio: Studio,
): Paragraph[] {
  const what = partTitle(kind, lang);
  const meta = [
    meeting.client_name
      ? (lang === "fa" ? `کلاینت: ${meeting.client_name}` : `Client: ${meeting.client_name}`)
      : "",
    meetingDate(meeting.created_at, lang),
    meeting.duration_ms > 0 ? durationLabel(meeting.duration_ms, lang) : "",
    studioName(studio, lang),
  ].filter(Boolean).join(" · ");
  return [
    para(documentHeading(meeting, lang, kind) || what, lang, { heading: HeadingLevel.TITLE }),
    para(what, lang, { muted: true }),
    para(meta, lang, { muted: true }),
    new Paragraph({ text: "" }),
  ];
}

function transcriptBody(text: string, lang: NotesLang): Paragraph[] {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => para(p, lang));
}

/** Who said what: the side in bold, then the turn. Names, when the pass found them, in the heading. */
function dialogueBody(dialogue: Dialogue, lang: NotesLang): Paragraph[] {
  const out: Paragraph[] = [];
  const named = [
    dialogue.consultant.name ? `${SPEAKER_LABELS.consultant[lang]}: ${dialogue.consultant.name}` : "",
    dialogue.client.name ? `${SPEAKER_LABELS.client[lang]}: ${dialogue.client.name}` : "",
  ].filter(Boolean).join(" · ");
  if (named) out.push(para(named, lang, { muted: true }));
  for (const turn of dialogue.turns) {
    out.push(new Paragraph({
      bidirectional: lang === "fa",
      alignment: lang === "fa" ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [
        run(`${SPEAKER_LABELS[turn.who][lang]}: `, lang, { bold: true }),
        run(turn.text, lang),
      ],
    }));
  }
  return out;
}

/** The phases, which the proposal prints between deliverables and the money. */
function phases(e: NotesEdition, lang: NotesLang): Paragraph[] {
  if (!e.phases.length && !e.scheduleNote) return [];
  const out = [para(SECTION_LABELS.phases[lang], lang, { heading: HeadingLevel.HEADING_2 })];
  for (const ph of e.phases) {
    const when = ph.when ? ` (${ph.when})` : "";
    const detail = ph.detail ? ` — ${ph.detail}` : "";
    out.push(para(`${ph.title}${when}${detail}`, lang, { bullet: true }));
  }
  if (e.scheduleNote) out.push(para(e.scheduleNote, lang));
  return out;
}

function edition(notes: MeetingNotes, lang: NotesLang): Paragraph[] {
  const e = notes[lang];
  const out: Paragraph[] = [];
  const h = (key: keyof typeof SECTION_LABELS) =>
    para(SECTION_LABELS[key][lang], lang, { heading: HeadingLevel.HEADING_2 });

  out.push(para(
    `${SECTION_LABELS.engagement[lang]}: ${ENGAGEMENT_LABELS[e.engagement][lang]}`,
    lang, { muted: true },
  ));
  if (e.summary) out.push(h("summary"), para(e.summary, lang));

  for (const key of LIST_SECTIONS) {
    if (key === "budget") out.push(...phases(e, lang));
    const lines = e[key];
    if (!lines.length) continue;
    out.push(h(key));
    for (const line of lines) out.push(para(line, lang, { bullet: true }));
  }

  const open = notes.openQuestions[lang];
  if (open.length) {
    out.push(h("openQuestions"));
    for (const line of open) out.push(para(line, lang, { bullet: true }));
  }
  return out;
}

export async function buildMeetingDocx(input: {
  meeting: MeetingForDocument;
  part: DocumentPart;
  lang: NotesLang;
  studio: Studio;
}): Promise<Buffer> {
  const { meeting, part, lang, studio } = input;
  const body =
    part === "transcript" ? transcriptBody(meeting.transcript ?? "", lang)
    : part === "dialogue" ? (meeting.dialogue ? dialogueBody(meeting.dialogue, lang) : [])
    : meeting.notes ? edition(meeting.notes, lang) : [];

  const doc = new Document({
    creator: studioName(studio, lang) || "Shenava",
    title: meeting.title || partTitle(part, "en"),
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
    },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [...header(meeting, lang, part, studio), ...body],
    }],
  });
  return Packer.toBuffer(doc);
}
