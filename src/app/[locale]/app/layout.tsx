import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeLabel, routing, type Locale } from "@/i18n/routing";
import { Home } from "lucide-react";
import { DoorRail } from "@/components/door-rail";

/**
 * The dashboard shell: one rail of doors, the page beside it. The rail itself
 * is `door-rail.tsx`, a client component, because it has to show which door was
 * clicked while the page behind it is still being fetched.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const brand = await getTranslations("brand");
  const other = (routing.locales.find((l) => l !== locale) ?? "en") as Locale;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b py-5"
        style={{ borderColor: "var(--line)" }}
      >
        <Link href="/" className="flex items-center gap-2 text-lg" style={{ color: "var(--cool)" }}>
          <Home className="h-4 w-4" />
          {brand("name")}
        </Link>
        <Link href="/app" locale={other} className="text-sm hover:underline" style={{ color: "var(--ink-soft)" }}>
          {localeLabel[other]}
        </Link>
      </header>

      <div className="gap-10 sm:flex sm:pt-8">
        <DoorRail />

        <main className="min-w-0 flex-1 pt-2 sm:pt-0">{children}</main>
      </div>
    </div>
  );
}
