import "server-only";
import { db } from "@/lib/db";
import { TemplateSchema, templateSections, type Template } from "./template.ts";
import { DEFAULT_SECTIONS, type SectionDef } from "./notes-schema.ts";

/**
 * Every template, validated. A row that does not parse is dropped rather than
 * failing the page: a template somebody edited into a bad shape should not take
 * the meeting page down with it.
 */
export async function readTemplates(): Promise<Template[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data } = await supabase
    .from("shenava_templates")
    .select("id,name,name_fa,engagement,sections,house_lines,is_default")
    .order("is_default", { ascending: false })
    .order("name");
  return (data ?? [])
    .map((row) => TemplateSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);
}

/** The number on the proposal this meeting already produced, if it has one. */
export async function readProposalNumber(proposalId: string | null): Promise<string | null> {
  if (!proposalId) return null;
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("shenava_proposals")
    .select("number")
    .eq("id", proposalId)
    .maybeSingle();
  return (data?.number as string | undefined) ?? null;
}

const COLUMNS = "id,name,name_fa,engagement,sections,house_lines,is_default";

/**
 * The template a meeting is written against.
 *
 * The meeting's own, if one has been chosen; otherwise the default. NOT the one
 * `suggestTemplate` would pick, because that reads the draft's engagement and
 * the draft is what this is about to write — a suggestion made from a draft
 * cannot choose the shape of the draft that makes it.
 */
export async function readTemplateFor(templateId: string | null): Promise<Template | null> {
  const supabase = db();
  if (!supabase) return null;
  const query = supabase.from("shenava_templates").select(COLUMNS);
  const { data } = templateId
    ? await query.eq("id", templateId).maybeSingle()
    : await query.eq("is_default", true).maybeSingle();
  if (!data) return null;
  const parsed = TemplateSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The sections a meeting is written against, with the built-in twelve as the floor. */
export async function readSectionsFor(templateId: string | null): Promise<SectionDef[]> {
  const template = await readTemplateFor(templateId);
  return template ? templateSections(template) : DEFAULT_SECTIONS;
}
