import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeLabel, routing, type Locale } from "@/i18n/routing";
import { Waveform } from "@/components/waveform";
import { ArrowRight, GitFork, Scissors, Users, FileText, ShieldCheck, Coins, FlaskConical } from "lucide-react";

/**
 * Where the Fork button goes: the repository's own page.
 *
 * It pointed at GitHub's `/fork` page for a while, which performs the act in a
 * single press — but only for somebody who does not already own the
 * repository. GitHub will not fork a repository to the account that holds it,
 * so the person who published this gets an empty page, and an empty page is
 * worse than one more click. The repository's front page carries a Fork button
 * of its own and it works for everybody who lands there.
 *
 * It stays pointed at the original even when this file is read from a fork.
 * Somebody on a copy of this page who presses Fork still means "give me my own
 * copy of the project", and a link that pointed at itself would hand them a
 * copy of a copy, one commit further from where the work happens.
 */
const FORK_URL = "https://github.com/zeneax/shenava";

export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const nav = await getTranslations("nav");
  const brand = await getTranslations("brand");
  const other = (routing.locales.find((l) => l !== locale) ?? "en") as Locale;

  const passes = [
    { key: "pass1", icon: Scissors },
    { key: "pass2", icon: Users },
    { key: "pass3", icon: FileText },
  ] as const;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
      {/* ── The bar ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <span className="text-lg" style={{ color: "var(--cool)" }}>
          {brand("name")}
        </span>
        <nav className="flex items-center gap-4 text-sm" style={{ color: "var(--ink-soft)" }}>
          <Link href="/" locale={other} className="hover:underline">
            {localeLabel[other]}
          </Link>
          <Link
            href="/app"
            className="rounded-full px-4 py-1.5 transition-colors duration-200"
            style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
          >
            {nav("dashboard")}
          </Link>
        </nav>
      </header>

      {/* ── The hero ────────────────────────────────────────────────────── */}
      <section className="rise pt-10 sm:pt-16">
        <p
          className="mb-5 text-xs tracking-wide uppercase"
          style={{ color: "var(--warm)" }}
        >
          {t("eyebrow")}
        </p>
        <h1 className="max-w-3xl text-3xl leading-tight sm:text-5xl sm:leading-[1.15]">
          {t("title")}
        </h1>
        <p
          className="mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
          style={{ color: "var(--ink-soft)" }}
        >
          {t("lede")}
        </p>

        <div className="mt-9 max-w-xl">
          <Waveform />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm transition-transform duration-200 hover:-translate-y-0.5"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            {t("openDashboard")}
            <ArrowRight className="h-4 w-4 flip" />
          </Link>
          <a
            href={FORK_URL}
            // A new tab: this leaves for somebody else's site, and the reader
            // who was halfway through the page should still have it when they
            // come back.
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm transition-colors duration-200"
            style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
          >
            <GitFork className="h-4 w-4" />
            {nav("fork")}
          </a>
        </div>
      </section>

      {/* ── The three passes ────────────────────────────────────────────── */}
      <section className="mt-24">
        <h2 className="text-xl sm:text-2xl">{t("passesTitle")}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {passes.map(({ key, icon: Icon }, i) => (
            <article
              key={key}
              className="rise rounded-(--radius-panel) p-6"
              style={{
                background: "var(--paper-raised)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-panel)",
                animationDelay: `${i * 0.09}s`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" style={{ color: "var(--warm)" }} />
                <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t(`${key}.n`)}
                </span>
              </div>
              <h3 className="mt-3 text-base">{t(`${key}.title`)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                {t(`${key}.body`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── The two modes ───────────────────────────────────────────────── */}
      <section className="mt-24">
        <h2 className="text-xl sm:text-2xl">{t("modesTitle")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {t("modesLede")}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(["modeMinute", "modeLong"] as const).map((key, i) => (
            <article
              key={key}
              className="overflow-hidden"
              style={{
                background: i === 1 ? "var(--paper-raised)" : "transparent",
                border: `1px solid ${i === 1 ? "var(--cool)" : "var(--line)"}`,
                borderRadius: "var(--radius-panel)",
              }}
            >
              <div className="px-6 pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base">{t(`${key}.title`)}</h3>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{
                      background: i === 1 ? "var(--cool)" : "var(--paper-sunken)",
                      color: i === 1 ? "var(--paper-raised)" : "var(--ink-soft)",
                    }}
                  >
                    {t(`${key}.for`)}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-col">
                {(["a", "b", "c", "d"] as const).map((line) => (
                  <p
                    key={line}
                    className="px-6 py-2.5 text-sm leading-relaxed tnum"
                    style={{ color: "var(--ink-soft)", borderTop: "1px solid var(--line)" }}
                  >
                    {t(`${key}.${line}`)}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Three plain statements ──────────────────────────────────────── */}
      <section className="mt-24 grid gap-4 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "privacyTitle", body: "privacyBody" },
          { icon: Coins, title: "costTitle", body: "costBody" },
          { icon: FlaskConical, title: "sampleTitle", body: "sampleBody" },
        ].map(({ icon: Icon, title, body }) => (
          <article key={title} className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
            <Icon className="h-4 w-4" style={{ color: "var(--cool)" }} />
            <h3 className="mt-3 text-sm">{t(title)}</h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {t(body)}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
