import { setRequestLocale, getTranslations } from "next-intl/server";
import { getSettings } from "@/lib/settings";
import { spendStatus } from "@/lib/llm/spend";
import { configured } from "@/lib/env";
import { SettingsForm } from "@/components/settings/settings-form";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");

  // The defaults render with no database at all, so the page can explain itself
  // rather than crashing on a fresh clone. It just cannot save.
  const settings = await getSettings();
  const status = await spendStatus();
  const ready = configured();

  return (
    <section>
      <h1 className="text-2xl">{t("heading")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {t("lede")}
      </p>

      {!ready && (
        <div
          className="mt-6 flex gap-3 p-5"
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--color-bad)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-bad)" }} />
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {t("noDatabase")}
          </p>
        </div>
      )}

      <SettingsForm
        settings={settings}
        spent={status ? { today: status.spentToday, month: status.spentMonth } : null}
      />
    </section>
  );
}
