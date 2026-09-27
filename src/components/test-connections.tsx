"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, Loader2, Play } from "lucide-react";

type Line = { name: string; ok: boolean; detail: string };

export function TestConnections() {
  const t = useTranslations("conn");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The test is a plain fetch rather than a server action on purpose: this
   * button is the thing a person presses when nothing else works, and it must
   * report what happened even when what happened is that the server threw.
   *
   * Its own state rather than a transition, for the same reason: the route
   * really calls each provider, so this is seconds of await, and seconds of
   * await inside a transition are seconds in which no door in the rail answers.
   */
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/connections/test", { method: "POST" });
      const body = (await res.json()) as { lines: Line[] };
      setLines(body.lines);
    } catch (error) {
      setLines([{ name: "request", ok: false, detail: String(error) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60"
        style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 flip" />}
        {busy ? t("testing") : t("test")}
      </button>

      {lines && (
        <ul className="mt-5 flex flex-col">
          {lines.map((line) => (
            <li
              key={line.name}
              className="rise flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-3 text-sm"
              style={{ borderColor: "var(--line)" }}
            >
              {line.ok ? (
                <Check className="h-4 w-4 shrink-0" style={{ color: "var(--color-good)" }} />
              ) : (
                <X className="h-4 w-4 shrink-0" style={{ color: "var(--color-bad)" }} />
              )}
              <span>{line.name}</span>
              <span style={{ color: "var(--ink-soft)" }}>
                {line.ok ? t("ok") : t("failed")}
              </span>
              <span className="min-w-0 flex-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                {line.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
