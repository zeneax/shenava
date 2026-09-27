import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * The browser's errors in the same terminal as the server's.
   *
   * A client-side rejection whose value is not an `Error` reaches the
   * development overlay as the words `[object Object]`, above a stack two
   * frames deep, both of them the overlay's own handler — it names neither the
   * value nor where it came from, and there is nothing to grep for. Next
   * forwards the reason itself here instead, where it can be read.
   *
   * `"error"` rather than `true`: this terminal is where the server's own lines
   * go, and every `console.log` in the browser joining them would bury them.
   * Development only — `next build` ignores it.
   */
  logging: { browserToTerminal: "error" },
};

export default withNextIntl(nextConfig);
