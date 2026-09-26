import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Vazirmatn } from "next/font/google";

import { routing, direction, type Locale } from "@/i18n/routing";
import "../globals.css";

/**
 * One face for both editions. Vazirmatn carries Latin as well as Arabic
 * script, so the Persian and English editions stay recognisably one
 * application. Only 400 and 500 are loaded and nothing goes heavier: Persian
 * letterforms carry a lot of ink already and 700 closes the counters up.
 */
const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500"],
  variable: "--font-vazir",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shenava · شنوا",
  description:
    "A recorded consultation becomes a transcript, a labelled dialogue, and a proposal draft — in Persian and English at once.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={direction[locale as Locale]} className={vazir.variable}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
