"use client";

import { Check, X } from "lucide-react";
import type { PieceState } from "@/lib/meetings/send";

/**
 * One mark per piece being sent. It is the only honest progress bar available:
 * a piece is done when the server says it is written down.
 *
 * Both senders show it — the create form on the first pass, the listener on a
 * resumed one — so it is one component rather than two that will diverge.
 */
export type Mark = { idx: number; state: PieceState; note?: string };

export function PieceMarks({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {marks.map((mark) => (
        <span
          key={mark.idx}
          title={mark.note ?? String(mark.idx + 1)}
          className="flex h-6 w-6 items-center justify-center rounded text-[11px] tnum"
          style={{
            background:
              mark.state === "done"
                ? "var(--color-good)"
                : mark.state === "error"
                  ? "var(--color-bad)"
                  : mark.state === "sending"
                    ? "var(--warm)"
                    : "var(--paper-sunken)",
            color: mark.state === "waiting" ? "var(--ink-faint)" : "var(--paper-raised)",
          }}
        >
          {mark.state === "done" ? (
            <Check className="h-3 w-3" />
          ) : mark.state === "error" ? (
            <X className="h-3 w-3" />
          ) : (
            mark.idx + 1
          )}
        </span>
      ))}
    </div>
  );
}
