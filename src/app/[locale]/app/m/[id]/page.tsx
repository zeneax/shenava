import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { readMeeting } from "@/lib/meetings/read";
import { Listener } from "@/components/meetings/listener";
import { DeleteMeeting } from "@/components/meetings/delete-meeting";
import { DialogueView } from "@/components/meetings/dialogue-view";
import { RunSpeakers } from "@/components/meetings/run-speakers";
import { DialogueSchema } from "@/lib/meetings/dialogue-schema";
import { DraftView } from "@/components/meetings/draft-view";
import { RunDraft } from "@/components/meetings/run-draft";
import { parseNotes } from "@/lib/meetings/notes-schema";
import { PourIntoTemplate } from "@/components/meetings/pour-into-template";
import { readTemplates, readProposalNumber, readSectionsFor } from "@/lib/meetings/templates-read";
import { suggestTemplate } from "@/lib/meetings/template";
import { FileText, Clock, Coins, Scissors } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OneMeeting({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("meeting");
  const s = await getTranslations("status");

  const meeting = await readMeeting(id);
  if (!meeting) notFound();

  const minutes = Math.round(meeting.durationMs / 60_000);
  const done = meeting.pieces.filter((p) => p.status === "done").length;

  // Parsed rather than trusted: the column is jsonb and anything could be in it,
  // including a shape an older version of this code wrote.
  const parsedDialogue = meeting.dialogue ? DialogueSchema.safeParse(meeting.dialogue) : null;
  const dialogue = parsedDialogue?.success && parsedDialogue.data.turns.length > 0
    ? parsedDialogue.data
    : null;

  // The sections come from the meeting's template: they decide what the draft
  // holds, what this page shows, and what the documents print.
  const sections = await readSectionsFor(meeting.templateId);
  const parsedNotes = meeting.notes ? parseNotes(meeting.notes, sections) : null;
  const notes = parsedNotes?.success ? parsedNotes.data : null;

  // The templates are only read when there is a draft to pour into one.
  const templates = notes ? await readTemplates() : [];
  const suggested = notes ? suggestTemplate(templates, notes[locale === "fa" ? "fa" : "en"].engagement) : null;
  const number = notes ? await readProposalNumber(meeting.proposalId) : null;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl">{meeting.title || t("untitled")}</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            {meeting.clientName || "—"}
          </p>
        </div>
        <DeleteMeeting id={meeting.id} />
      </div>

      {/* ── What it is, in four figures ─────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-y py-3" style={{ borderColor: "var(--line)" }}>
        <span className="flex items-center gap-2 text-sm tnum" style={{ color: "var(--ink-soft)" }}>
          <Clock className="h-3.5 w-3.5" />
          {t("minutes", { minutes })}
        </span>
        <span className="flex items-center gap-2 text-sm tnum" style={{ color: "var(--ink-soft)" }}>
          <Scissors className="h-3.5 w-3.5" />
          {t("piecesOf", { done, total: meeting.pieces.length, mode: t(`mode.${meeting.mode}`) })}
        </span>
        <span className="flex items-center gap-2 text-sm tnum" style={{ color: "var(--ink-soft)" }}>
          <Coins className="h-3.5 w-3.5" />
          ${meeting.costUsd.toFixed(3)}
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs"
          style={{ background: "var(--paper-sunken)", color: "var(--ink-soft)" }}
        >
          {s(meeting.status)}
        </span>
      </div>

      {/* ── The pieces, as the server has them ─────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {meeting.pieces.map((piece) => (
          <span
            key={piece.idx}
            title={
              piece.error
                ? `${piece.idx + 1}: ${piece.error}`
                : `${piece.idx + 1} · ${Math.round((piece.endMs - piece.startMs) / 1000)}s · ${piece.characters} chars`
            }
            className="flex h-6 min-w-6 items-center justify-center rounded px-1 text-[10px] tnum"
            style={{
              background:
                piece.status === "done"
                  ? "var(--color-good)"
                  : piece.status === "error"
                    ? "var(--color-bad)"
                    : "var(--paper-sunken)",
              color: piece.status === "pending" ? "var(--ink-faint)" : "var(--paper-raised)",
            }}
          >
            {piece.idx + 1}
          </span>
        ))}
      </div>

      {/* ── Anything left to send ───────────────────────────────────────── */}
      {meeting.pending.length > 0 && (
        <Listener
          meetingId={meeting.id}
          sha256={meeting.audioSha256}
          mode={meeting.mode}
          pending={meeting.pending}
          pieceCount={meeting.pieces.length}
        />
      )}

      {/* ── The transcript ─────────────────────────────────────────────── */}
      {meeting.transcript && (
        <article className="mt-10">
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4" style={{ color: "var(--cool)" }} />
            <h2 className="text-base">{t("transcript")}</h2>
            <span className="text-xs tnum" style={{ color: "var(--ink-faint)" }}>
              {t("characters", { n: meeting.transcript.length })}
            </span>
          </div>
          <div
            className="mt-4 p-5 text-sm leading-loose whitespace-pre-wrap"
            style={{
              background: "var(--paper-raised)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-panel)",
            }}
          >
            {meeting.transcript}
          </div>
        </article>
      )}

      {/* ── Who said it ─────────────────────────────────────────────────── */}
      {meeting.status === "transcribed" && (
        <>
          <RunSpeakers id={meeting.id} again={dialogue !== null} />
          {dialogue && <DialogueView id={meeting.id} dialogue={dialogue} />}
        </>
      )}

      {/* ── The draft ───────────────────────────────────────────────────── */}
      {meeting.status === "transcribed" && !notes && (
        <RunDraft id={meeting.id} hasDialogue={dialogue !== null} />
      )}
      {notes && <DraftView id={meeting.id} notes={notes} sections={sections} status={meeting.draftStatus} />}

      {/* ── The template, and the documents ───────────────────────────── */}
      {notes && (
        <PourIntoTemplate
          id={meeting.id}
          templates={templates}
          suggested={suggested?.id ?? null}
          approved={meeting.draftStatus === "approved"}
          poured={number ? { number } : null}
        />
      )}
    </section>
  );
}
