"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  SPEAKER_LABELS,
  dialogueShare,
  splitAllSentences,
  type Dialogue,
  type Lang,
  type Speaker,
} from "@/lib/meetings/dialogue-schema";
import { setSide, swapDialogueSides } from "@/lib/actions/dialogue";
import { ArrowLeftRight, Loader2, Scissors, Users } from "lucide-react";

/**
 * The dialogue, and the three ways to correct it.
 *
 * Pressing the other side on a turn moves THAT TURN and nothing else. A turn of
 * several sentences also opens sentence by sentence, because the pass's usual
 * miss is a one-word answer swallowed by the turn around it — and a one-word
 * answer is exactly the sentence a reader reaches for, which is why the splitter
 * used here is `splitAllSentences` and not the one that numbers sentences for
 * the model (that one glues short fragments onto their neighbour).
 *
 * And either side can be read alone, which is what you do when you are about to
 * write down what the client actually asked for.
 */
export function DialogueView({ id, dialogue }: { id: string; dialogue: Dialogue }) {
  const t = useTranslations("dialogue");
  const locale = useLocale() as Lang;
  const router = useRouter();

  const [only, setOnly] = useState<Speaker | "both">("both");
  const [openTurn, setOpenTurn] = useState<number | null>(null);
  const [busy, start] = useTransition();

  const share = dialogueShare(dialogue);
  const total = share.consultant + share.client + share.unknown || 1;

  const move = (turnIndex: number, sentenceIndex: number | null, who: Speaker) =>
    start(async () => {
      await setSide({ id, turnIndex, sentenceIndex, who });
      setOpenTurn(null);
      router.refresh();
    });

  const colourOf = (who: Speaker) =>
    who === "consultant" ? "var(--cool)" : who === "client" ? "var(--warm)" : "var(--ink-faint)";

  return (
    <article className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Users className="h-4 w-4" style={{ color: "var(--cool)" }} />
          <h2 className="text-base">{t("heading")}</h2>
          <span className="text-xs tnum" style={{ color: "var(--ink-faint)" }}>
            {t("turns", { n: dialogue.turns.length })}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              await swapDialogueSides(id);
              router.refresh();
            })
          }
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs disabled:opacity-60"
          style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
          title={t("swapWhy")}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
          {t("swap")}
        </button>
      </div>

      {/* Who the model thought they were, and how it told. */}
      {(dialogue.consultant.name || dialogue.client.name || dialogue.consultant.evidence) && (
        <div className="mt-4 flex flex-col gap-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
          {(["consultant", "client"] as const).map((who) => (
            <p key={who}>
              <span style={{ color: colourOf(who) }}>{SPEAKER_LABELS[who][locale]}</span>
              {" — "}
              {dialogue[who].name || t("unnamed")}
              {dialogue[who].evidence ? ` · ${dialogue[who].evidence}` : ""}
            </p>
          ))}
        </div>
      )}

      {/* How much of the meeting each side held. A consultation where the
          consultant did eighty percent of the talking is worth noticing. */}
      <div className="mt-4 flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--paper-sunken)" }}>
        {(["consultant", "client", "unknown"] as const).map((who) => (
          <span
            key={who}
            title={`${SPEAKER_LABELS[who][locale]} ${Math.round((share[who] / total) * 100)}%`}
            style={{ width: `${(share[who] / total) * 100}%`, background: colourOf(who) }}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["both", "consultant", "client"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setOnly(value)}
            className="rounded-full px-3.5 py-1 text-xs transition-colors duration-200"
            style={{
              background: only === value ? "var(--ink)" : "var(--paper-raised)",
              color: only === value ? "var(--paper)" : "var(--ink-soft)",
              border: "1px solid var(--line)",
            }}
          >
            {value === "both" ? t("both") : SPEAKER_LABELS[value][locale]}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col">
        {dialogue.turns.map((turn, turnIndex) => {
          if (only !== "both" && turn.who !== only) return null;
          const sentences = splitAllSentences(turn.text);
          const other: Speaker = turn.who === "consultant" ? "client" : "consultant";
          const opened = openTurn === turnIndex;

          return (
            <div
              key={turnIndex}
              className="border-t py-4"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs" style={{ color: colourOf(turn.who) }}>
                  {SPEAKER_LABELS[turn.who][locale]}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => move(turnIndex, null, other)}
                  className="rounded-full px-2.5 py-0.5 text-[11px] disabled:opacity-60"
                  style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}
                  title={t("moveWhole")}
                >
                  {t("moveTo", { side: SPEAKER_LABELS[other][locale] })}
                </button>
                {sentences.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOpenTurn(opened ? null : turnIndex)}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]"
                    style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}
                    title={t("splitWhy")}
                  >
                    <Scissors className="h-3 w-3" />
                    {t("split", { n: sentences.length })}
                  </button>
                )}
              </div>

              {opened ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  {sentences.map((sentence, sentenceIndex) => (
                    <button
                      key={sentenceIndex}
                      type="button"
                      disabled={busy}
                      onClick={() => move(turnIndex, sentenceIndex, other)}
                      className="rounded-lg p-2.5 text-start text-sm leading-relaxed transition-colors duration-200 disabled:opacity-60"
                      style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                    >
                      {sentence}
                    </button>
                  ))}
                  <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {t("splitHint", { side: SPEAKER_LABELS[other][locale] })}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-loose">{turn.text}</p>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
