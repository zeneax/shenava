import { setRequestLocale, getTranslations } from "next-intl/server";
import { readTemplates } from "@/lib/meetings/templates-read";
import { TemplateForm } from "@/components/templates/template-form";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Templates({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("templates");
  const templates = await readTemplates();

  return (
    <section>
      <h1 className="text-2xl">{t("heading")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {t("lede")}
      </p>

      {templates.length === 0 ? (
        <div
          className="mt-8 flex gap-3 p-5"
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warm)" }} />
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {t("none")}
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {templates.map((template) => (
            <TemplateForm key={template.id} template={template} />
          ))}
        </div>
      )}
    </section>
  );
}
