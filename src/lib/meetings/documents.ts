import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { DialogueSchema } from "./dialogue-schema.ts";
import { parseNotes } from "./notes-schema.ts";
import { readSectionsFor } from "./templates-read.ts";
import type { MeetingForDocument, Studio } from "./docx.ts";

/**
 * A meeting in the shape the two document writers take, with the studio beside
 * it. One reader for both, so a Word file and a print sheet can never disagree
 * about what the meeting said.
 */
export async function loadForDocument(
  id: string,
): Promise<{ meeting: MeetingForDocument; studio: Studio } | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("shenava_meetings")
    .select("title,client_name,created_at,duration_ms,transcript,dialogue,notes,template_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const settings = await getSettings();
  const dialogue = data.dialogue ? DialogueSchema.safeParse(data.dialogue) : null;
  // The sections come from the meeting's template, so a document prints the
  // clauses that template names — including ones added after the draft was
  // written, which then print empty rather than not at all.
  const sections = await readSectionsFor((data.template_id as string | null) ?? null);
  const notes = data.notes ? parseNotes(data.notes, sections) : null;

  return {
    meeting: {
      title: data.title,
      client_name: data.client_name,
      created_at: data.created_at,
      duration_ms: data.duration_ms,
      transcript: data.transcript,
      dialogue: dialogue?.success ? dialogue.data : null,
      notes: notes?.success ? notes.data : null,
      sections,
    },
    studio: { name: settings.studioName, nameFa: settings.studioNameFa },
  };
}
