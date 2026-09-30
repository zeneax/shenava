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
  /**
   * Opening the dev server from a phone on the same Wi-Fi.
   *
   * `next dev` prints a Network address and then refuses to serve its own
   * scripts to it: cross-origin requests for dev assets are blocked unless the
   * hostname is listed here. The page still arrives — it is plain HTML — but
   * React never hydrates on that device, so every button on the site is dead
   * and the only word about it is one line in this terminal. See
   * docs/silent-css-and-dead-clicks.md.
   *
   * A `*` is exactly one label, so these are the two private ranges as four
   * labels each, and no address has to be edited in when the router hands out
   * a new one. Development only — `next build` ignores it.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default withNextIntl(nextConfig);
