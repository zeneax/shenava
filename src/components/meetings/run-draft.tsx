"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { FileSignature, Loader2, AlertTriangle } from "lucide-react";

/** The first press, before there is a draft to review. */
export function RunDraft({ id, hasDialogue }: { id: string; hasDialogue: boolean }) {
  const t = useTranslations("draft");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A known refusal gets its sentence, and the provider's own words follow it,
  // because "transport" alone cannot tell a 429 from a revoked key.
  const refusalLine = (body: { reason?: string; detail?: string }, status: number) => {
    const reason = body.reason ?? `HTTP ${status}`;
    const said = t.has(`reason.${reason}`) ? t(`reason.${reason}`) : reason;
    return body.detail ? `${said} — ${body.detail}` : said;
  };

  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/meetings/${id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string; detail?: string };
      if (response.ok && body.ok) router.refresh();
      else setProblem(refusalLine(body, response.status));
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--line)" }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        style={{ background: "var(--cool)", color: "var(--paper-raised)" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
        {busy ? t("drawing") : t("draw")}
      </button>
      <p className="mt-2.5 max-w-xl text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
        {hasDialogue ? t("drawNote") : t("drawWithoutDialogue")}
      </p>
      {problem && (
        <p className="mt-3 flex items-start gap-2 text-sm" style={{ color: "var(--color-bad)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {problem}
        </p>
      )}
    </div>
  );
}
