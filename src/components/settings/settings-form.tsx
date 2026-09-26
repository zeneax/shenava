"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PRICES } from "@/lib/llm/pricing";
import type { Settings } from "@/lib/settings-shape";
import { saveSettings, type Issue, type SettingsInput } from "@/lib/actions/settings";
import { Check, Loader2, AlertTriangle, Mic, PenLine, Coins, Building2, Trash2 } from "lucide-react";

/**
 * The two seats, the ceilings, and who the proposal speaks as.
 *
 * Two seats rather than one setting, because they want different models: the
 * transcriber wants a fast multimodal one and the writer wants judgement. A
 * single "model" field would force one of them to be wrong.
 *
 * The call to `saveSettings` is typed with `SettingsInput`, so a field added to
 * the schema and forgotten here is a COMPILE error. Without that, the failure is
 * a runtime parse inside a server action, every save on the card fails, and the
 * symptom is never the new field.
 */
export function SettingsForm({ settings, spent }: { settings: Settings; spent: { today: number; month: number } | null }) {
  const t = useTranslations("settings");
  const router = useRouter();

  const [form, setForm] = useState<SettingsInput>({
    studioName: settings.studioName,
    studioNameFa: settings.studioNameFa,
    studioVoice: settings.studioVoice,
    sttModel: settings.sttModel,
    sttFallbackModel: settings.sttFallbackModel,
    sttMaxOutputTokens: settings.sttMaxOutputTokens,
    writerModel: settings.writerModel,
    writerTemperature: settings.writerTemperature,
    writerMaxOutputTokens: settings.writerMaxOutputTokens,
    dailyCeilingUsd: settings.dailyCeilingUsd,
    monthlyCeilingUsd: settings.monthlyCeilingUsd,
    retentionDays: settings.retentionDays,
  });

  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = () =>
    start(async () => {
      setIssues(null);
      setProblem(null);
      setWarnings([]);
      setSaved(false);
      const result = await saveSettings(form);
      if (result.ok) {
        setSaved(true);
        setWarnings(result.warnings);
        router.refresh();
      } else if (result.reason === "invalid") {
        setIssues(result.issues ?? []);
      } else {
        setProblem(result.detail ? `${result.reason}: ${result.detail}` : result.reason);
      }
    });

  const issueFor = (path: keyof SettingsInput) => issues?.find((i) => i.path === path);

  const field = {
    background: "var(--paper-sunken)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  } as const;

  const panel = {
    background: "var(--paper-raised)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-panel)",
  } as const;

  /** One labelled control, with the parse's own verdict under it when refused. */
  const Row = ({
    name,
    hint,
    children,
  }: {
    name: keyof SettingsInput;
    hint?: string;
    children: React.ReactNode;
  }) => {
    const issue = issueFor(name);
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t(`field.${name}`)}</span>
        {children}
        {hint && (
          <span className="text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
            {hint}
          </span>
        )}
        {issue && (
          <span className="text-xs" style={{ color: "var(--color-bad)" }}>
            {t.has(`code.${issue.code}`) ? t(`code.${issue.code}`) : issue.code}
          </span>
        )}
      </label>
    );
  };

  const Card = ({
    icon: Icon,
    title,
    note,
    children,
  }: {
    icon: typeof Mic;
    title: string;
    note?: string;
    children: React.ReactNode;
  }) => (
    <article className="p-5" style={panel}>
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4" style={{ color: "var(--cool)" }} />
        <h2 className="text-base">{title}</h2>
      </div>
      {note && (
        <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          {note}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </article>
  );

  const models = Object.keys(PRICES);

  /** A model box that suggests the priced ones but does not insist on them. */
  const ModelBox = ({ name }: { name: "sttModel" | "writerModel" | "sttFallbackModel" }) => (
    <>
      <input
        list="shenava-models"
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        dir="ltr"
        className="rounded-lg px-3 py-2 text-sm"
        style={field}
      />
      {form[name] && !PRICES[form[name]] && (
        <span className="text-xs" style={{ color: "var(--warm)" }}>
          {t("unpriced")}
        </span>
      )}
    </>
  );

  return (
    <div className="mt-8 flex flex-col gap-5">
      <datalist id="shenava-models">
        {models.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>

      {/* ── Who the proposal speaks as ──────────────────────────────────── */}
      <Card icon={Building2} title={t("studio")} note={t("studioNote")}>
        <Row name="studioNameFa">
          <input value={form.studioNameFa} onChange={(e) => set("studioNameFa", e.target.value)}
            maxLength={120} className="rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
        <Row name="studioName">
          <input value={form.studioName} onChange={(e) => set("studioName", e.target.value)}
            maxLength={120} dir="ltr" className="rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
        <div className="sm:col-span-2">
          <Row name="studioVoice" hint={t("hint.studioVoice")}>
            <textarea value={form.studioVoice} onChange={(e) => set("studioVoice", e.target.value)}
              rows={3} maxLength={2000} className="rounded-lg p-3 text-sm leading-relaxed" style={field} />
          </Row>
        </div>
      </Card>

      {/* ── The transcriber ─────────────────────────────────────────────── */}
      <Card icon={Mic} title={t("transcriber")} note={t("transcriberNote")}>
        <Row name="sttModel"><ModelBox name="sttModel" /></Row>
        <Row name="sttFallbackModel" hint={t("hint.sttFallbackModel")}>
          <ModelBox name="sttFallbackModel" />
        </Row>
        <Row name="sttMaxOutputTokens" hint={t("hint.sttMaxOutputTokens")}>
          <input type="number" min={256} max={64000} step={256} value={form.sttMaxOutputTokens}
            onChange={(e) => set("sttMaxOutputTokens", Number(e.target.value))}
            dir="ltr" className="tnum rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
      </Card>

      {/* ── The writer ──────────────────────────────────────────────────── */}
      <Card icon={PenLine} title={t("writer")} note={t("writerNote")}>
        <Row name="writerModel"><ModelBox name="writerModel" /></Row>
        <Row name="writerTemperature" hint={t("hint.writerTemperature")}>
          <input type="number" min={0} max={2} step={0.1} value={form.writerTemperature}
            onChange={(e) => set("writerTemperature", Number(e.target.value))}
            dir="ltr" className="tnum rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
        <Row name="writerMaxOutputTokens" hint={t("hint.writerMaxOutputTokens")}>
          <input type="number" min={1000} max={200000} step={1000} value={form.writerMaxOutputTokens}
            onChange={(e) => set("writerMaxOutputTokens", Number(e.target.value))}
            dir="ltr" className="tnum rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
      </Card>

      {/* ── The ceilings ────────────────────────────────────────────────── */}
      <Card icon={Coins} title={t("ceilings")} note={t("ceilingsNote")}>
        <Row name="dailyCeilingUsd" hint={t("hint.zeroMeansNone")}>
          <input type="number" min={0} max={10000} step={0.5} value={form.dailyCeilingUsd}
            onChange={(e) => set("dailyCeilingUsd", Number(e.target.value))}
            dir="ltr" className="tnum rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
        <Row name="monthlyCeilingUsd" hint={t("hint.zeroMeansNone")}>
          <input type="number" min={0} max={100000} step={1} value={form.monthlyCeilingUsd}
            onChange={(e) => set("monthlyCeilingUsd", Number(e.target.value))}
            dir="ltr" className="tnum rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
        {spent && (
          <p className="tnum text-xs sm:col-span-2" style={{ color: "var(--ink-soft)" }}>
            {t("spent", { today: spent.today.toFixed(3), month: spent.month.toFixed(2) })}
          </p>
        )}
      </Card>

      {/* ── Keeping and clearing out ────────────────────────────────────── */}
      <Card icon={Trash2} title={t("retention")} note={t("retentionNote")}>
        <Row name="retentionDays" hint={t("hint.retentionDays")}>
          <input type="number" min={0} max={3650} step={1} value={form.retentionDays}
            onChange={(e) => set("retentionDays", Number(e.target.value))}
            dir="ltr" className="tnum rounded-lg px-3 py-2 text-sm" style={field} />
        </Row>
      </Card>

      {/* ── The bar ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 p-4" style={panel}>
        <button type="button" disabled={busy} onClick={save}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm disabled:opacity-60"
          style={{ background: "var(--ink)", color: "var(--paper)" }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("save")}
        </button>

        {saved && !busy && (
          <span className="text-sm" style={{ color: "var(--color-good)" }}>{t("saved")}</span>
        )}

        {/* The refusal names its keys. "Could not save" is what this replaces. */}
        {issues && issues.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm" style={{ color: "var(--color-bad)" }}>{t("didNotSave")}</span>
            {issues.map((issue) => (
              <span key={issue.path} className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t.has(`field.${issue.path}`) ? t(`field.${issue.path}`) : issue.path}
                {" — "}
                {t.has(`code.${issue.code}`) ? t(`code.${issue.code}`) : issue.code}
              </span>
            ))}
          </div>
        )}

        {problem && (
          <span className="text-sm" style={{ color: "var(--color-bad)" }}>
            {t.has(`reason.${problem}`) ? t(`reason.${problem}`) : problem}
          </span>
        )}

        {warnings.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--warm)" }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t("unpricedSaved")}
          </span>
        )}
      </div>
    </div>
  );
}
