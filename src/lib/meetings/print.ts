import {
  ENGAGEMENT_LABELS, FIXED_LABELS, EMPTY_SECTION, isEmptySection, sectionLabel,
  type MeetingNotes, type NotesLang, type SectionDef, type SectionValue,
} from "./notes-schema.ts";
import { SPEAKER_LABELS, type Dialogue } from "./dialogue-schema.ts";
import { durationLabel, meetingDate } from "./format.ts";
import { documentHeading, partTitle, studioName, type DocumentPart, type MeetingForDocument, type Studio } from "./docx.ts";

/* Deliberately NOT `server-only`: this only builds a string, and `server-only` does not resolve
   outside Next — marking it would put this beyond the reach of a test that
   builds a real document and reads it back. */

/**
 * The A4 sheet the browser prints to PDF.
 *
 * One self-contained HTML document: the styles are inline, the font comes from
 * Google Fonts, and `?print=1` opens the print dialog on load so "Save as PDF"
 * is one press.
 *
 * THERE IS NO SERVER-SIDE PDF, on purpose. A Persian PDF rendered without a
 * real browser is unreliable — the shaping and the bidi are what go wrong, and
 * they go wrong in ways that look fine in English — and a Chromium inside a
 * serverless function is fifty megabytes of cold start. The browser already
 * has a correct Persian renderer and a PDF writer; this hands it a sheet.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");
}

function dialogueBody(dialogue: Dialogue, lang: NotesLang): string {
  const named = [
    dialogue.consultant.name ? `${SPEAKER_LABELS.consultant[lang]}: ${dialogue.consultant.name}` : "",
    dialogue.client.name ? `${SPEAKER_LABELS.client[lang]}: ${dialogue.client.name}` : "",
  ].filter(Boolean).join(" · ");
  return [
    named ? `<p class="muted">${esc(named)}</p>` : "",
    ...dialogue.turns.map((t) =>
      `<p class="turn ${t.who}"><strong>${esc(SPEAKER_LABELS[t.who][lang])}:</strong> ${esc(t.text)}</p>`),
  ].filter(Boolean).join("\n");
}

function list(lines: string[]): string {
  return `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

/** One section, whatever kind it is. The order and headings come from the template. */
function section(value: SectionValue, def: SectionDef, lang: NotesLang): string {
  const heading = `<h2>${esc(sectionLabel(def, lang))}</h2>`;
  if (def.kind === "text") return [heading, `<p>${esc(value.text)}</p>`].join("\n");
  if (def.kind === "phases") {
    const items = value.phases.map((ph) => {
      const when = ph.when ? ` (${ph.when})` : "";
      const detail = ph.detail ? ` — ${ph.detail}` : "";
      return `${ph.title}${when}${detail}`;
    });
    return [heading, items.length ? list(items) : "", value.scheduleNote ? `<p>${esc(value.scheduleNote)}</p>` : ""]
      .filter(Boolean)
      .join("\n");
  }
  return [heading, list(value.lines)].join("\n");
}

function edition(notes: MeetingNotes, sections: readonly SectionDef[], lang: NotesLang): string {
  const e = notes[lang];
  const parts = [
    `<p class="muted">${esc(FIXED_LABELS.engagement[lang])}: ${esc(ENGAGEMENT_LABELS[e.engagement][lang])}</p>`,
  ];
  for (const def of sections) {
    const value = e.sections[def.key] ?? EMPTY_SECTION;
    if (isEmptySection(value)) continue;
    parts.push(section(value, def, lang));
  }
  return parts.filter(Boolean).join("\n");
}

export function renderMeetingPrint(input: {
  meeting: MeetingForDocument;
  part: DocumentPart;
  lang: NotesLang;
  autoPrint: boolean;
  studio: Studio;
}): string {
  const { meeting, part, lang, autoPrint, studio } = input;
  const what = partTitle(part, lang);
  const heading = documentHeading(meeting, lang, part) || what;
  const meta = [
    meeting.client_name
      ? (lang === "fa" ? `کلاینت: ${meeting.client_name}` : `Client: ${meeting.client_name}`)
      : "",
    meetingDate(meeting.created_at, lang),
    meeting.duration_ms > 0 ? durationLabel(meeting.duration_ms, lang) : "",
  ].filter(Boolean).map(esc).join(" · ");

  const body =
    part === "transcript" ? paragraphs(meeting.transcript ?? "")
    : part === "dialogue" ? (meeting.dialogue ? dialogueBody(meeting.dialogue, lang) : "")
    : meeting.notes ? edition(meeting.notes, meeting.sections, lang) : "";

  const hint = lang === "fa" ? "برای PDF: چاپ ← ذخیره به‌صورت PDF" : "For a PDF: Print → Save as PDF";
  // The studio's own name, or nothing at all. A document a client receives must
  // never carry the name of whoever wrote the software.
  const brand = studioName(studio, lang);
  const script = autoPrint
    ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>`
    : "";

  return `<!doctype html>
<html lang="${lang}" dir="${lang === "fa" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm; }
  html { color-scheme: light; }
  body { margin: 0 auto; padding: 14mm; font-family: Vazirmatn, Tahoma, system-ui, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.85; font-size: 11pt; max-width: 180mm; }
  header { border-bottom: 1px solid #d9d9d9; padding-bottom: 8pt; margin-bottom: 14pt; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 12.5pt; margin: 16pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 8pt; text-align: start; }
  .muted { color: #666; font-size: 9.5pt; margin: 0; }
  ul { margin: 0 0 8pt; padding-inline-start: 1.4em; }
  li { margin-bottom: 3pt; }
  .turn.client { border-inline-start: 2px solid #999; padding-inline-start: 8pt; }
  .brand { font-size: 9.5pt; color: #666; margin-top: 18pt; border-top: 1px solid #d9d9d9; padding-top: 6pt; }
  .hint { position: fixed; inset-inline-end: 12px; top: 12px; font-size: 12px; background: #f2f2f2; border-radius: 8px; padding: 6px 10px; color: #444; }
  @media print { .hint { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<div class="hint">${esc(hint)}</div>
<header>
  <h1>${esc(heading)}</h1>
  <p class="muted">${esc(what)}</p>
  <p class="muted">${meta}</p>
</header>
<main>
${body}
</main>
${brand ? `<p class="brand">${esc(brand)}</p>` : ""}
${script}
</body>
</html>`;
}
