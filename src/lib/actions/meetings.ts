"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowed } from "@/lib/auth";
import { MAX_MEETING_SECONDS, PIECE_MODES } from "@/lib/meetings/segments";

/**
 * Creating a meeting from a plan the browser made.
 *
 * The browser has already decoded the file, cut it, and knows exactly which
 * pieces it will send — so the plan comes with the request and the segment
 * rows are written here, all of them, as `pending`. That is what makes an
 * upload resumable: the same file opened tomorrow finds its rows, sees which
 * ones are still pending, and carries on. Nothing about the audio itself is
 * stored; the hash is only how a resumed upload proves it is the same file.
 *
 * The schema is `.strict()` on purpose. A key the browser sends that this
 * object does not name is a refusal rather than a silent drop, because a
 * silently dropped field is the failure that presents as a setting that will
 * not save and sends you looking at the wrong half of the call.
 */
const PieceSchema = z.object({
  idx: z.number().int().min(0),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

const CreateSchema = z
  .object({
    title: z.string().trim().max(160),
    clientName: z.string().trim().max(160),
    language: z.enum(["farsi", "english", "auto"]),
    mode: z.enum(PIECE_MODES),
    audioName: z.string().trim().max(255),
    audioBytes: z.number().int().min(0),
    audioSha256: z.string().trim().max(64),
    durationMs: z.number().int().min(0).max(MAX_MEETING_SECONDS * 1000),
    pieces: z.array(PieceSchema).min(1).max(600),
  })
  .strict();

export type CreateInput = z.input<typeof CreateSchema>;

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "denied" | "no-database" | "invalid" | "write-failed"; detail?: string };

export async function createMeeting(input: unknown): Promise<CreateResult> {
  if (!(await allowed())) return { ok: false, reason: "denied" };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    // The verdict, not a generic message: a refusal that does not name the key
    // costs an afternoon of reading the wrong file.
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: "invalid",
      detail: first ? `${first.path.join(".")}: ${first.code}` : "unreadable",
    };
  }
  const value = parsed.data;

  const supabase = db();
  if (!supabase) return { ok: false, reason: "no-database" };

  const { data, error } = await supabase
    .from("shenava_meetings")
    .insert({
      title: value.title,
      client_name: value.clientName,
      language: value.language,
      audio_name: value.audioName,
      audio_bytes: value.audioBytes,
      audio_sha256: value.audioSha256,
      duration_ms: value.durationMs,
      segment_count: value.pieces.length,
      status: "planned",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, reason: "write-failed", detail: error?.message };
  }

  const { error: piecesError } = await supabase.from("shenava_segments").insert(
    value.pieces.map((piece) => ({
      meeting_id: data.id,
      idx: piece.idx,
      start_ms: piece.startMs,
      end_ms: piece.endMs,
      status: "pending",
    })),
  );

  if (piecesError) {
    // The meeting without its pieces is worse than no meeting: the page would
    // show it as plannable and plan it again. Take it back.
    await supabase.from("shenava_meetings").delete().eq("id", data.id);
    return { ok: false, reason: "write-failed", detail: piecesError.message };
  }

  revalidatePath("/app");
  return { ok: true, id: data.id };
}

export async function deleteMeeting(id: string): Promise<{ ok: boolean }> {
  if (!(await allowed())) return { ok: false };
  const supabase = db();
  if (!supabase) return { ok: false };
  // The segments cascade from the foreign key.
  const { error } = await supabase.from("shenava_meetings").delete().eq("id", id);
  revalidatePath("/app");
  return { ok: !error };
}
