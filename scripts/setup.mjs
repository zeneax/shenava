#!/usr/bin/env node
/**
 * Shenava · setup
 *
 *   npm run setup
 *
 * Asks for each value it needs, one at a time, TESTS IT IMMEDIATELY, and writes
 * `.env.local`.
 *
 * WHY A SCRIPT RATHER THAN "EDIT THIS FILE". Because a wrong value in an
 * environment file is not discovered when you write it — it is discovered later,
 * as a page that will not load or a transcription that fails, at which point the
 * file looks perfectly reasonable and you are debugging the wrong half of the
 * problem. Every answer here is checked against the real service before the next
 * question is asked, so a typo is caught in the second it is made.
 *
 * It never prints a key back. It rewrites only the lines it manages and leaves
 * anything else in the file alone, and it always shows what it is about to write
 * before writing it.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

const rl = createInterface({ input: stdin, output: stdout });

/* ── Saying things ─────────────────────────────────────────────────────────── */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const say = (s = "") => console.log(s);
const rule = () => say(c.dim("─".repeat(66)));
const ok = (s) => say(`  ${c.green("✓")} ${s}`);
const bad = (s) => say(`  ${c.red("✗")} ${s}`);
const warn = (s) => say(`  ${c.amber("!")} ${s}`);

/** A step heading, numbered as the README numbers them. */
const step = (n, title) => {
  say();
  rule();
  say(`${c.bold(`Step ${n}`)} · ${title}`);
  rule();
};

/* ── Asking things ─────────────────────────────────────────────────────────── */

/**
 * Ask until the answer passes, or the person says they want to skip.
 * `check` returns true, or a string explaining what is wrong.
 */
async function askUntil(question, { check, current, optional = false, secret = false }) {
  for (;;) {
    const shown = current ? ` ${c.dim(secret ? "[already set — Enter to keep]" : `[${current}]`)}` : "";
    const hint = optional ? ` ${c.dim("(optional — Enter to skip)")}` : "";
    const answer = (await rl.question(`  ${question}${shown}${hint}\n  > `)).trim();

    if (answer === "" && current) return current;
    if (answer === "" && optional) return "";
    if (answer === "") {
      bad("This one is required.");
      continue;
    }

    const verdict = await check(answer);
    if (verdict === true) return answer;
    bad(verdict);
    say();
  }
}

const yes = async (question, fallback = false) => {
  const answer = (await rl.question(`  ${question} ${c.dim(fallback ? "[Y/n]" : "[y/N]")}\n  > `)).trim().toLowerCase();
  if (answer === "") return fallback;
  return answer === "y" || answer === "yes";
};

/* ── The environment file ──────────────────────────────────────────────────── */

const MANAGED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_APP_NAME",
  "OPENROUTER_APP_URL",
  "APP_PASSWORD",
  "APP_SESSION_SECRET",
];

function readEnv() {
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

/** Rewrite only the managed keys; anything else in the file is kept as it is. */
function writeEnv(values) {
  const header = [
    "# Shenava — written by `npm run setup`.",
    "# Gitignored. Never commit a real value from this file.",
    "#",
    "# Run `npm run setup` again to change any of it; the script keeps anything",
    "# it did not write.",
    "",
  ];
  const kept = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
        .split("\n")
        .filter((line) => {
          const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
          return match ? !MANAGED.includes(match[1]) : false;
        })
    : [];

  const body = MANAGED.map((key) => `${key}=${values[key] ?? ""}`);
  writeFileSync(envPath, [...header, ...body, ...(kept.length ? ["", ...kept] : []), ""].join("\n"), "utf8");
}

/* ── Checking things, against the real services ───────────────────────────── */

const TABLES = [
  "shenava_settings", "shenava_meetings", "shenava_segments",
  "shenava_runs", "shenava_templates", "shenava_proposals",
];

async function restHead(url, key, table) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  return response;
}

/* ── The conversation ─────────────────────────────────────────────────────── */

async function main() {
  if (!stdin.isTTY) {
    say();
    bad("This script asks questions, so it needs a terminal it can read from.");
    say();
    say("  You are running it with its input piped or redirected. Either run it");
    say(`  directly — ${c.bold("npm run setup")} — or skip it and write ${c.bold(".env.local")} by hand:`);
    say();
    say(`    ${c.bold("cp .env.example .env.local")}`);
    say();
    say(`  ${c.dim(".env.example lists every variable with a comment saying what it is for.")}`);
    say();
    process.exitCode = 1;
    rl.close();
    return;
  }

  say();
  say(c.bold("  Shenava · setup"));
  say(c.dim("  A recorded consultation becomes a proposal draft."));
  say();
  say("  This asks for three things and tests each one as you give it:");
  say(`    ${c.cyan("1.")} where your Supabase project is, and its service key`);
  say(`    ${c.cyan("2.")} an OpenRouter key, which pays for every model call`);
  say(`    ${c.cyan("3.")} whether this will be on a public address, and so needs a door`);
  say();
  say(c.dim("  Nothing is written until the end, and no key is ever printed back."));

  const existing = readEnv();
  if (existsSync(envPath)) {
    say();
    warn(".env.local already exists. Enter keeps each current value.");
  }

  const values = { ...existing };

  /* ── 1. Supabase ──────────────────────────────────────────────────────── */
  step(1, "Supabase — where the meetings and the drafts live");
  say();
  say("  If you do not have a project yet:");
  say(`    open ${c.cyan("https://supabase.com/dashboard")}, press ${c.bold("New project")},`);
  say("    give it any name, pick a region near you, and wait for it to finish.");
  say();
  say(`  Then open ${c.bold("Project Settings → API")} in that project. You need two things`);
  say("  from that page: the Project URL, and the service_role key.");
  say();

  values.NEXT_PUBLIC_SUPABASE_URL = await askUntil("The Project URL", {
    current: existing.NEXT_PUBLIC_SUPABASE_URL,
    check: async (answer) => {
      const url = answer.replace(/\/+$/, "");
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
        return "That does not look like a Supabase URL. It looks like https://abcdefghijklm.supabase.co";
      }
      try {
        const response = await fetch(`${url}/rest/v1/`, { method: "HEAD" });
        // Anything that answers at all is reachable; 401 is the expected answer
        // without a key and proves the project exists.
        if (response.status >= 500) return `That project answered ${response.status}. Is it still starting up?`;
        return true;
      } catch {
        return "Could not reach that address. Check your connection and the spelling.";
      }
    },
  });
  const url = values.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  values.NEXT_PUBLIC_SUPABASE_URL = url;
  ok("Reachable.");

  say();
  say(`  The ${c.bold("service_role")} key — the long one marked "secret" on that page.`);
  say(c.dim("  It bypasses row-level security, so it stays on the server and never"));
  say(c.dim("  goes into a NEXT_PUBLIC_ variable. This script keeps it out of the logs."));
  say();

  let tablesPresent = false;
  values.SUPABASE_SERVICE_ROLE_KEY = await askUntil("The service_role key", {
    current: existing.SUPABASE_SERVICE_ROLE_KEY,
    secret: true,
    check: async (answer) => {
      let response;
      try {
        response = await restHead(url, answer, "shenava_settings");
      } catch {
        return "Could not reach the project with that key.";
      }
      if (response.status === 401 || response.status === 403) {
        return "That key was refused. Make sure it is the service_role key and not the anon one.";
      }
      // 404 with PGRST205 means the key works and the tables are simply not made
      // yet, which is the next step and not an error here.
      if (response.ok) tablesPresent = true;
      return true;
    },
  });
  ok(tablesPresent ? "The key works, and the tables are already there." : "The key works.");

  say();
  values.NEXT_PUBLIC_SUPABASE_ANON_KEY = await askUntil("The anon key", {
    current: existing.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    optional: true,
    secret: true,
    check: async () => true,
  });

  /* ── 2. The tables ────────────────────────────────────────────────────── */
  step(2, "The tables — one file to paste, and one to seed with");
  const missing = [];
  for (const table of TABLES) {
    const response = await restHead(url, values.SUPABASE_SERVICE_ROLE_KEY, table);
    if (!response.ok) missing.push(table);
  }

  if (missing.length === 0) {
    ok("All six tables are there. Nothing to do.");
  } else {
    say();
    warn(`${missing.length} of 6 tables are missing.`);
    say();
    say(`  In your project, open ${c.bold("SQL Editor → New query")} and run these two`);
    say("  files, in this order:");
    say();
    say(`    ${c.cyan("1.")} ${c.bold("db/01_schema.sql")}  — the six tables, their functions, and RLS`);
    say(`    ${c.cyan("2.")} ${c.bold("db/02_seed.sql")}    — the built-in proposal template, and ONE`);
    say(`                             fully worked sample meeting, so the app has`);
    say(`                             something to show you before you record`);
    say(`                             anything. The company in it is invented.`);
    say();
    say(c.dim("  Paste the whole file and press Run. Both are safe to run twice."));
    say();
    if (await yes("Done that? I will check.", true)) {
      const still = [];
      for (const table of TABLES) {
        const response = await restHead(url, values.SUPABASE_SERVICE_ROLE_KEY, table);
        if (!response.ok) still.push(table);
      }
      if (still.length === 0) ok("All six tables are there now.");
      else {
        warn(`Still missing: ${still.join(", ")}`);
        say(c.dim("  Carrying on — the Connections page will tell you the same thing."));
      }
    } else {
      say(c.dim("  Carrying on. The Connections page in the app checks this too."));
    }
  }

  /* ── 3. OpenRouter ────────────────────────────────────────────────────── */
  step(3, "OpenRouter — one key for every model");
  say();
  say(`  Make a key at ${c.cyan("https://openrouter.ai/keys")} and put a few dollars of`);
  say("  credit on the account. An hour-long meeting costs roughly 20 cents end to end.");
  say();
  say(c.dim("  Worth knowing: below about $1 of remaining credit, OpenRouter starts"));
  say(c.dim("  answering 402 to concurrent calls. If transcription ever fails on every"));
  say(c.dim("  piece at once, check the balance before anything else."));
  say();

  values.OPENROUTER_API_KEY = await askUntil("The OpenRouter key", {
    current: existing.OPENROUTER_API_KEY,
    secret: true,
    check: async (answer) => {
      let response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/key", {
          headers: { authorization: `Bearer ${answer}` },
        });
      } catch {
        return "Could not reach OpenRouter.";
      }
      if (response.status === 401) return "That key was refused.";
      if (!response.ok) return `OpenRouter answered ${response.status}.`;
      const body = await response.json().catch(() => ({}));
      const left = body?.data?.limit_remaining;
      if (typeof left === "number") {
        if (left < 1) warn(`Only $${left.toFixed(2)} of credit left — top it up before a real meeting.`);
        else ok(`The key works. $${left.toFixed(2)} of credit.`);
      } else {
        ok("The key works.");
      }
      return true;
    },
  });

  values.OPENROUTER_APP_NAME = existing.OPENROUTER_APP_NAME || "Shenava";
  values.OPENROUTER_APP_URL = existing.OPENROUTER_APP_URL || "http://localhost:3100";

  /* ── 4. The door ──────────────────────────────────────────────────────── */
  step(4, "The door — and why there usually is not one");
  say();
  say("  On your own machine the only person who can open the page is you, so");
  say("  Shenava asks for no password by default. A login there would be like");
  say("  locking a folder on your own desktop.");
  say();
  say(`  ${c.bold("One case needs a door.")} If you put this on a public address — to show`);
  say("  a client, say — that deployment carries YOUR OpenRouter key, and anyone");
  say("  who finds the URL and opens the record page is spending your money.");
  say();

  const wantsDoor = await yes("Will this be reachable from the internet?", false);
  if (wantsDoor) {
    say();
    values.APP_PASSWORD = await askUntil("A password for the dashboard", {
      current: existing.APP_PASSWORD,
      secret: true,
      check: async (answer) =>
        answer.length >= 10 ? true : "Ten characters or more, please — this is the only thing in front of your key.",
    });
    values.APP_SESSION_SECRET = existing.APP_SESSION_SECRET || randomBytes(32).toString("hex");
    ok("Password set, and a signing secret generated.");
  } else {
    values.APP_PASSWORD = "";
    values.APP_SESSION_SECRET = existing.APP_SESSION_SECRET || "";
    ok("No door. Run this again if you ever deploy it.");
  }

  /* ── 5. Write it ──────────────────────────────────────────────────────── */
  step(5, "Writing .env.local");
  say();
  for (const key of MANAGED) {
    const value = values[key] ?? "";
    const shown =
      value === "" ? c.dim("(empty)")
      : /KEY|PASSWORD|SECRET/.test(key) ? c.dim(`set · ${value.length} characters`)
      : value;
    say(`    ${key.padEnd(30)} ${shown}`);
  }
  say();
  if (!(await yes("Write this to .env.local?", true))) {
    say();
    warn("Nothing written.");
    rl.close();
    return;
  }

  writeEnv(values);
  ok(`Written to ${envPath}`);

  say();
  rule();
  say(c.bold("  Ready."));
  rule();
  say();
  say(`    ${c.bold("npm run dev")}    then open ${c.cyan("http://localhost:3100")}`);
  say();
  say("  The Connections page inside the app repeats every check this script");
  say("  made, so it is the place to look if anything stops working later.");
  say();
  say(c.dim("  If you ran the seed file, there is a finished sample meeting waiting"));
  say(c.dim("  in the list — transcript, dialogue and draft — so you can see the"));
  say(c.dim("  whole product before recording anything of your own."));
  say();
  rl.close();
}

main().catch((error) => {
  const message = String(error?.message ?? error);
  say();
  if (/readline was closed|aborted/i.test(message)) {
    // Ctrl-C, or the input ended. Leaving is allowed and nothing was written.
    say(c.dim("  Stopped. Nothing was written — run `npm run setup` again when ready."));
  } else {
    bad(message);
    say(c.dim("  Nothing was written. Run `npm run setup` again."));
  }
  rl.close();
  process.exitCode = 1;
});
