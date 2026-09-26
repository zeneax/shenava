import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeLabel, routing, type Locale } from "@/i18n/routing";
import { CalendarClock, Plus, SlidersHorizontal, Cable, LayoutTemplate, Home } from "lucide-react";

/**
 * The dashboard shell: one rail of doors, the page beside it.
 *
 * The rail is a horizontal scroller on a phone. It is `relative` on purpose —
 * an absolutely positioned descendant (a screen-reader-only label is
 * `position: absolute`) is laid out by the nearest positioned ancestor, and if
 * that ancestor is above the scroller then the scroller cannot clip it and the
 * document widens instead. In a right-to-left edition that pushes the page
 * off-screen on the side the reader starts from.
 */
const DOORS = [
  { href: "/app", key: "meetings", icon: CalendarClock },
  { href: "/app/new", key: "new", icon: Plus },
  { href: "/app/templates", key: "templates", icon: LayoutTemplate },
  { href: "/app/settings", key: "settings", icon: SlidersHorizontal },
  { href: "/app/connections", key: "connections", icon: Cable },
] as const;

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const nav = await getTranslations("nav");
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
        <nav
          className="relative -mx-4 flex gap-1 overflow-x-auto px-4 py-4 sm:mx-0 sm:w-48 sm:shrink-0 sm:flex-col sm:px-0"
          aria-label={nav("dashboard")}
        >
          {DOORS.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors duration-200 sm:rounded-lg"
              style={{ color: "var(--ink-soft)", background: "var(--paper-raised)" }}
            >
              <Icon className="h-4 w-4" />
              {nav(key)}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 pt-2 sm:pt-0">{children}</main>
      </div>
    </div>
  );
}
