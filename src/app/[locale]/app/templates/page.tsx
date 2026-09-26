import { setRequestLocale, getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";

export default async function Soon({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("soon");
  const nav = await getTranslations("nav");

  return (
    <section>
      <h1 className="text-2xl">{nav("templates")}</h1>
      <div
        className="mt-8 flex gap-3 p-5"
        style={{
          background: "var(--paper-raised)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-panel)",
        }}
      >
        <Construction className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warm)" }} />
        <div>
          <p className="text-sm">{t("title")}</p>
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("body")}
          </p>
        </div>
      </div>
    </section>
  );
}
