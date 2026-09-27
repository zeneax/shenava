"use client";

import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, Plus, SlidersHorizontal, Cable, LayoutTemplate, Loader2 } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The rail of doors, and the only reason it is a client component: every page
 * behind it is `force-dynamic`, so a click waits on a round trip to Postgres
 * before React has anything to render. Without a signal the rail looked dead
 * and the door arrived seconds later on its own.
 *
 * Two things answer that, and they cover different moments. `loading.tsx` at
 * the `app` segment swaps the page for a skeleton immediately, which is the
 * real fix. `useLinkStatus` below marks the door that was clicked, which is
 * what the eye was already on — and it is the whole signal for `/app/new`,
 * which reads no database and so renders before a skeleton would be seen.
 *
 * The hook only reports for the `Link` it sits inside, so the body of a door is
 * its own component. next-intl's `Link` renders `next/link`, so this works
 * through it.
 */
const DOORS = [
  { href: "/app", key: "meetings", icon: CalendarClock },
  { href: "/app/new", key: "new", icon: Plus },
  { href: "/app/templates", key: "templates", icon: LayoutTemplate },
  { href: "/app/settings", key: "settings", icon: SlidersHorizontal },
  { href: "/app/connections", key: "connections", icon: Cable },
] as const;

type Door = (typeof DOORS)[number];

/** A meeting lives under the meetings door, so `/app/m/…` lights that one up. */
function isHere(pathname: string, href: Door["href"]) {
  if (href === "/app") return pathname === "/app" || pathname.startsWith("/app/m");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The inside of one door. It must be a separate component because
 * `useLinkStatus` reads the state of the nearest `Link` above it.
 *
 * The icon becomes a spinner in the same 16-pixel box, so nothing moves — an
 * indicator that changes size inside a horizontal scroller shifts every door
 * beside it. A reader who has asked for no motion gets a still spinner, which
 * is why the colour changes too: that part is not an animation.
 */
function DoorBody({ label, icon: Icon, here }: { label: string; icon: Door["icon"]; here: boolean }) {
  const { pending } = useLinkStatus();
  const lit = here || pending;

  return (
    <span
      aria-busy={pending || undefined}
      className="flex items-center gap-2.5 rounded-full px-4 py-2 transition-colors duration-200 sm:rounded-lg"
      style={{
        color: lit ? "var(--cool)" : "var(--ink-soft)",
        background: "var(--paper-raised)",
        boxShadow: here ? "inset 0 0 0 1px var(--cool)" : undefined,
        cursor: pending ? "progress" : undefined,
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}
      {label}
    </span>
  );
}

/**
 * The rail is a horizontal scroller on a phone. It is `relative` on purpose —
 * an absolutely positioned descendant (a screen-reader-only label is
 * `position: absolute`) is laid out by the nearest positioned ancestor, and if
 * that ancestor is above the scroller then the scroller cannot clip it and the
 * document widens instead. In a right-to-left edition that pushes the page
 * off-screen on the side the reader starts from.
 */
export function DoorRail() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      className="relative -mx-4 flex gap-1 overflow-x-auto px-4 py-4 sm:mx-0 sm:w-48 sm:shrink-0 sm:flex-col sm:px-0"
      aria-label={t("dashboard")}
    >
      {DOORS.map(({ href, key, icon }) => {
        const here = isHere(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={here ? "page" : undefined}
            className="shrink-0 text-sm whitespace-nowrap"
          >
            <DoorBody label={t(key)} icon={icon} here={here} />
          </Link>
        );
      })}
    </nav>
  );
}
