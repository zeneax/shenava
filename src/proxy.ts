import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Language routing, and nothing else.
 *
 * There is deliberately no authentication here. On localhost the only person
 * who can open a page is the person at the keyboard, so a door would be
 * theatre. If APP_PASSWORD is set — which is what you do before putting this
 * on a public domain — the check belongs in `lib/auth.ts`, which is the one
 * place that answers "who is asking".
 *
 * Next 16 renamed this file convention from `middleware` to `proxy`; the
 * import stays `next-intl/middleware` because next-intl has no `/proxy` entry
 * point, and the function it returns is unchanged.
 */
const proxy = createMiddleware(routing);

export default proxy;

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
