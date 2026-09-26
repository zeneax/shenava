import "server-only";
import { db } from "@/lib/db";
import { TemplateSchema, type Template } from "./template.ts";

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
