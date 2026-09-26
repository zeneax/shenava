"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Users, Loader2, AlertTriangle } from "lucide-react";

/**
 * The one press that starts the speaker pass.
 *
 * It calls the route with `fetch` and its own `useState`, NOT a transition. A
 * call of a minute or two inside `useTransition` entangles every other
 * navigation in the same transition, and the whole dashboard stops responding to
 * its own links while it waits — which reads as the application having frozen.
 */
export function RunSpeakers({ id, again }: { id: string; again: boolean }) {
  const t = useTranslations("dialogue");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/meetings/${id}/speakers`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (response.ok && body.ok) router.refresh();
      else setProblem(body.reason ?? `HTTP ${response.status}`);
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        style={{ background: again ? "transparent" : "var(--cool)", color: again ? "var(--ink-soft)" : "var(--paper-raised)", border: again ? "1px solid var(--line)" : "none" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
        {busy ? t("running") : again ? t("runAgain") : t("run")}
      </button>
      {!busy && !again && (
        <p className="mt-2.5 max-w-xl text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {t("runNote")}
        </p>
      )}
      {problem && (
        <p className="mt-3 flex items-start gap-2 text-sm" style={{ color: "var(--color-bad)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {/* A known refusal gets a sentence; anything else is shown raw, because
              a message the reader cannot act on is still better than "failed". */}
          {t.has(`reason.${problem}`) ? t(`reason.${problem}`) : problem}
        </p>
      )}
    </div>
  );
}
