import { NextResponse } from "next/server";
import { allowed } from "@/lib/auth";
import { loadForDocument } from "@/lib/meetings/documents";
import { renderMeetingPrint } from "@/lib/meetings/print";
import type { DocumentPart } from "@/lib/meetings/docx";
import { LANGS, type Lang } from "@/lib/meetings/langs";

/**
 * The A4 sheet the browser saves as a PDF.
 *
 * With `?print=1` it opens the print dialog itself, so "Save as PDF" is one
 * press. There is no server-side PDF here on purpose — see `lib/meetings/print`.
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

  const html = renderMeetingPrint({
    meeting: held.meeting,
    part,
    lang,
    autoPrint: url.searchParams.get("print") === "1",
    studio: held.studio,
  });

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
