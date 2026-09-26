import { setRequestLocale, getTranslations } from "next-intl/server";
import { NewMeetingForm } from "@/components/meetings/new-meeting-form";

export default async function NewMeeting({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("new");

  return (
    <section>
      <h1 className="text-2xl">{t("heading")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {t("lede")}
      </p>
      <NewMeetingForm />
    </section>
  );
}
