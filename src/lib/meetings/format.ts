import type { NotesLang } from "./notes-schema.ts";

/**
 * The few figures a meeting is described by, written the way each edition
 * writes them. Client-safe: the list, the documents and the print sheet all
 * say the same date and the same length.
 */

export function meetingDate(iso: string, lang: NotesLang): string {
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
    year: "numeric", month: "long", day: "numeric",
  }).format(new Date(iso));
}

export function durationLabel(ms: number, lang: NotesLang): string {
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const n = (v: number) => v.toLocaleString(lang === "fa" ? "fa-IR" : "en-US");
  if (lang === "fa") {
    if (h === 0) return `${n(m)} دقیقه`;
    return m === 0 ? `${n(h)} ساعت` : `${n(h)} ساعت و ${n(m)} دقیقه`;
  }
  if (h === 0) return `${n(m)} min`;
  return m === 0 ? `${n(h)} h` : `${n(h)} h ${n(m)} min`;
}

/** A file name a browser and Word both accept, from a title that may be Persian. */
export function documentFileName(
  title: string,
  part: "transcript" | "dialogue" | "notes",
  lang: NotesLang,
  ext: string,
): string {
  // Everything a file system refuses, and the ASCII control range.
  const base = (title || "meeting")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const suffix =
    part === "transcript" ? (lang === "fa" ? "رونوشت" : "transcript")
    : part === "dialogue" ? (lang === "fa" ? "گفت‌وگو" : "dialogue")
    : (lang === "fa" ? "پیش‌نویس" : "draft");
  return `${base} — ${suffix}.${ext}`;
}
