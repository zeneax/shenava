import { NextResponse } from "next/server";
import { allowed } from "@/lib/auth";
import { loadForDocument } from "@/lib/meetings/documents";
import { buildMeetingDocx, type DocumentPart } from "@/lib/meetings/docx";
import { documentFileName } from "@/lib/meetings/format";
import { LANGS, type Lang } from "@/lib/meetings/langs";

/**
 * The meeting as a Word file: the transcript, the dialogue, or the draft.
 *
 * `?part=` and `?lang=` rather than three routes, because the three differ only
 * in which paragraphs go in the body and sharing the header is the point.
 */
export const dynamic = "force-dynamic";

const PARTS: DocumentPart[] = ["transcript", "dialogue", "notes"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed())) return NextResponse.json({ error: "denied" }, { status: 403 });
  const { id } = await params;

  const url = new URL(request.url);
  const asked = url.searchParams.get("part") ?? "notes";
  const part = (PARTS as string[]).includes(asked) ? (asked as DocumentPart) : "notes";
  const askedLang = url.searchParams.get("lang") ?? "fa";
  const lang = (LANGS as readonly string[]).includes(askedLang) ? (askedLang as Lang) : "fa";

  const held = await loadForDocument(id);
  if (!held) return NextResponse.json({ error: "no such meeting" }, { status: 404 });

  const missing =
    (part === "transcript" && !held.meeting.transcript) ||
    (part === "dialogue" && !held.meeting.dialogue) ||
    (part === "notes" && !held.meeting.notes);
  if (missing) return NextResponse.json({ error: `no ${part} yet` }, { status: 409 });

  const file = await buildMeetingDocx({ meeting: held.meeting, part, lang, studio: held.studio });
  const name = documentFileName(held.meeting.title, part, lang, "docx");

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // The filename is encoded because it may be Persian, and a bare Persian
      // filename in this header is mangled or dropped by most browsers.
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
