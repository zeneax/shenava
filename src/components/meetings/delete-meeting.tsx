"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deleteMeeting } from "@/lib/actions/meetings";
import { Trash2, Loader2 } from "lucide-react";

/**
 * Two presses, not a dialog.
 *
 * A transcript is the product and deleting one is not undoable, so the button
 * asks. It asks inline, because a modal over a page the reader is looking at
 * hides the very thing they are deciding about.
 */
export function DeleteMeeting({ id }: { id: string }) {
  const t = useTranslations("meeting");
  const router = useRouter();
  const [asked, setAsked] = useState(false);
  const [busy, start] = useTransition();

  if (!asked) {
    return (
      <button
        type="button"
        onClick={() => setAsked(true)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
      >
        <Trash2 className="h-4 w-4" />
        {t("delete")}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            await deleteMeeting(id);
            router.push("/app");
          })
        }
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        style={{ background: "var(--color-bad)", color: "var(--paper-raised)" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {t("deleteConfirm")}
      </button>
      <button
        type="button"
        onClick={() => setAsked(false)}
        className="rounded-full px-4 py-2 text-sm"
        style={{ color: "var(--ink-soft)" }}
      >
        {t("cancel")}
      </button>
    </div>
  );
}
