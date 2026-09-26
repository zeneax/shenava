import { defineRouting } from "next-intl/routing";

/**
 * Two editions, one domain. Persian is the default and sits at the bare root;
 * English is prefixed. Nothing about the product is chosen by language — the
 * two editions are the same application read by two readers.
 */
export const routing = defineRouting({
  locales: ["fa", "en"],
  defaultLocale: "fa",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const direction: Record<Locale, "rtl" | "ltr"> = { fa: "rtl", en: "ltr" };
export const localeLabel: Record<Locale, string> = { fa: "فارسی", en: "English" };
