import "server-only";
import { db } from "@/lib/db";
import { inferMode, type PieceMode } from "./segments";

/**
 * Reading one meeting and its pieces. Server-side, behind the same door as
 * everything else.
 */
export type Piece = {
  idx: number;
  startMs: number;
  endMs: number;
  status: "pending" | "done" | "error";
  characters: number;
  error: string | null;
  costUsd: number;
};

export type Meeting = {
  id: string;
  title: string;
  clientName: string;
  language: "farsi" | "english" | "auto";
  audioName: string;
  audioBytes: number;
  audioSha256: string;
  durationMs: number;
  status: "planned" | "transcribing" | "transcribed" | "failed";
  transcript: string | null;
  draftStatus: "pending" | "approved" | "rejected";
  costUsd: number;
  createdAt: string;
  pieces: Piece[];
  /** Read off the pieces' lengths, never stored. */
  mode: PieceMode;
  pending: number[];
};

export async function readMeeting(id: string): Promise<Meeting | null> {
  const supabase = db();
  if (!supabase) return null;

  const { data: row } = await supabase
    .from("shenava_meetings")
    .select(
      "id,title,client_name,language,audio_name,audio_bytes,audio_sha256,duration_ms,status,transcript,draft_status,cost_usd,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  const { data: segmentRows } = await supabase
    .from("shenava_segments")
    .select("idx,start_ms,end_ms,status,text,error,cost_usd")
    .eq("meeting_id", id)
    .order("idx");

  const pieces: Piece[] = (segmentRows ?? []).map((s) => ({
    idx: s.idx,
    startMs: s.start_ms,
    endMs: s.end_ms,
    status: s.status,
    // The text itself is not sent to the page for every piece — the assembled
    // transcript is what the reader wants, and an hour of pieces twice over is
    // a payload for nothing.
    characters: (s.text ?? "").length,
    error: s.error,
    costUsd: Number(s.cost_usd ?? 0),
  }));

  return {
    id: row.id,
    title: row.title,
    clientName: row.client_name,
    language: row.language,
    audioName: row.audio_name,
    audioBytes: Number(row.audio_bytes ?? 0),
    audioSha256: row.audio_sha256,
    durationMs: row.duration_ms,
    status: row.status,
    transcript: row.transcript,
    draftStatus: row.draft_status,
    costUsd: Number(row.cost_usd ?? 0),
    createdAt: row.created_at,
    pieces,
    mode: inferMode(pieces),
    pending: pieces.filter((p) => p.status !== "done").map((p) => p.idx),
  };
}
