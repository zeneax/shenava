import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appPassword } from "./env.ts";

/**
 * The one function that answers "may this person use the dashboard".
 *
 * Everything else in the application calls `allowed()` and knows nothing about
 * how it decides. That is the point: adding real accounts later — Supabase
 * Auth, a magic link, several people — means changing this file and no other.
 *
 * With APP_PASSWORD empty there is no door, which is correct on localhost: the
 * only person who can open the page is the person at the machine. Set it before
 * putting this on a public domain, because a public deployment carries your own
 * OpenRouter key and anyone who opens the record page is spending your money.
 */
const COOKIE = "shenava-session";

export const doorIsOpen = () => appPassword().length === 0;

function sign(value: string): string {
  const secret = (process.env.APP_SESSION_SECRET ?? "").trim() || appPassword();
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function allowed(): Promise<boolean> {
  if (doorIsOpen()) return true;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value ?? "";
  const [stamp, mac] = token.split(".");
  if (!stamp || !mac) return false;
  const expected = sign(stamp);
  if (mac.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  // Thirty days.
  return Date.now() - Number(stamp) < 30 * 24 * 60 * 60 * 1000;
}

export function sessionCookie(): { name: string; value: string } {
  const stamp = String(Date.now());
  return { name: COOKIE, value: `${stamp}.${sign(stamp)}` };
}
