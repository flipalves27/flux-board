"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiPost, ApiError } from "@/lib/api-client";
import { aiDraftToSnapshot } from "@/lib/template-ai";
import type { AiTemplateDraft, ConversationAnswers } from "@/lib/template-ai";
import type { BoardTemplateSnapshot } from "@/lib/template-types";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import { AiModelHint } from "@/components/ai-model-hint";
import { useToast } from "@/context/toast-context";

type Props = {
  getHeaders: () => Record<string, string>;
  localeRoot: string;
};

function currentQuarterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

function newBucketKey(): string {
  return `col_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
}

const PRESET_COLORS = [
  "var(--flux-template-preset-0)",
  "var(--flux-template-preset-1)",
  "var(--flux-template-preset-2)",
  "var(--flux-template-preset-3)",
  "var(--flux-template-preset-4)",
  "var(--flux-template-preset-5)",
  "var(--flux-template-preset-6)",
  "var(--flux-template-preset-7)",
];

export function AiTemplateConversation({ getHeaders, localeRoot }: Props) {
  const t = useTranslations("templates");
  const router = useRouter();
  const { pushToast } = useToast();

  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState({ teamType: "", process: "", metrics: "", automation: "" });
  const [draft, setDraft] = useState<AiTemplateDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBoardId, setExportBoardId] = useState<string | null>(null);
  const [publishAfterCreate, setPublishAfterCreate] = useState(false);
  const [lastLlmModel, setLastLlmModel] = useState<string | null>(null);
  const [aiTargetSafe, setAiTargetSafe] = useState(false);

  const snapshot: BoardTemplateSnapshot | null = useMemo(
    () => (draft ? aiDraftToSnapshot(draft, { boardMethodology: aiTargetSafe ? "safe" : undefined }) : null),
    [draft, aiTargetSafe]
  );

  const sampleCardTitles = useMemo(() => {
    const lp = draft?.labelPalette ?? [];
    if (lp.length >= 2) return [lp[0]!, lp[1]!];
    return [t("aiConv.sampleA"), t("aiConv.sampleB")];
  }, [draft?.labelPalette, t]);

  const updateBucket = useCallback((index: number, patch: Partial<{ label: string; color: string }>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const buckets = [...prev.buckets];
      const cur = buckets[index];
      if (!cur) return prev;
      buckets[index] = { ...cur, ...patch };
      return { ...prev, buckets };
    });
  }, []);

  const removeBucket = useCallback((index: number) => {
    setDraft((prev) => {
      if (!prev || prev.buckets.length <= 2) return prev;
      const buckets = prev.buckets.filter((_, i) => i !== index);
      return { ...prev, buckets };
    });
  }, []);

  const addBucket = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const color = PRESET_COLORS[prev.buckets.length % PRESET_COLORS.length] ?? "var(--flux-template-preset-0)";
      const key = newBucketKey();
      return {
        ...prev,
        buckets: [...prev.buckets, { key, label: t("aiConv.newColumn"), color }],
      };
    });
  }, [t]);

  async function submitStep() {
    const turnIndex = activeStep;
    if (turnIndex < 0 || turnIndex > 3) return;

    if (turnIndex === 0 && answers.teamType.trim().length < 2) return;
    if (turnIndex === 1 && answers.process.trim().length < 2) return;
    if (turnIndex === 2 && answers.metrics.trim().length < 2) return;

    setBusy(true);
    try {
      const baseAnswers: ConversationAnswers = {
        teamType: answers.teamType.trim(),
        process: answers.process.trim(),
        metrics: answers.metrics.trim(),
      };
      if (turnIndex >= 3) {
        baseAnswers.automation = answers.automation.trim() || t("aiConv.automationNone");
      }
      const payload = {
        mode: "conversation" as const,
        turnIndex,
        answers: baseAnswers,
        ...(aiTargetSafe ? { targetMethodology: "safe" as const } : {}),
      };
      const res = await apiPost<{ draft: AiTemplateDraft; snapshot: BoardTemplateSnapshot; llmModel?: string }>(
        "/api/templates/ai-generate",
        payload,
        getHeaders()
      );
      if (res?.draft) {
        setDraft(res.draft);
        setLastLlmModel(typeof res.llmModel === "string" ? res.llmModel : null);
        setActiveStep((s) => Math.min(s + 1, 4));
      }
    } catch (e) {
      console.error(e);
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : t("aiConv.errorGenerate"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function createBoard() {
    if (!draft || !snapshot) return;
    setBusy(true);
    try {
      const name = draft.title.trim().slice(0, 100) || t("aiConv.defaultBoardName");
      const res = await apiPost<{ board: { id: string } }>(
        "/api/boards",
        { name, templateSnapshot: snapshot },
        getHeaders()
      );
      const bid = res?.board?.id;
      if (!bid) return;

      await seedOkrsIfPossible(draft, bid, getHeaders);

      pushToast({ kind: "success", title: t("aiConv.boardCreated"), description: name });
      if (publishAfterCreate) {
        setExportBoardId(bid);
      } else {
        router.push(`${localeRoot}/board/${encodeURIComponent(bid)}`);
      }
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : t("aiConv.errorCreate"),
      });
    } finally {
      setBusy(false);
    }
  }

  function resetFlow() {
    setActiveStep(0);
    setAnswers({ teamType: "", process: "", metrics: "", automation: "" });
    setDraft(null);
    setPublishAfterCreate(false);
    setLastLlmModel(null);
    setAiTargetSafe(false);
  }

  const doneQuestions = activeStep >= 4;
  const questionLabels = [t("aiConv.q1"), t("aiConv.q2"), t("aiConv.q3"), t("aiConv.q4")] as const;
  const placeholders = [
    t("aiConv.ph1"),
    t("aiConv.ph2"),
    t("aiConv.ph3"),
    t("aiConv.ph4"),
  ] as const;

  const currentValue =
    activeStep === 0
      ? answers.teamType
      : activeStep === 1
        ? answers.process
        : activeStep === 2
          ? answers.metrics
          : activeStep === 3
            ? answers.automation
            : "";

  const setCurrentValue = (v: string) => {
    if (activeStep === 0) setAnswers((a) => ({ ...a, teamType: v }));
    else if (activeStep === 1) setAnswers((a) => ({ ...a, process: v }));
    else if (activeStep === 2) setAnswers((a) => ({ ...a, metrics: v }));
    else if (activeStep === 3) setAnswers((a) => ({ ...a, automation: v }));
  };

  const canSubmitStep =
    !busy &&
    activeStep < 4 &&
    (activeStep === 0
      ? answers.teamType.trim().length >= 2
      : activeStep === 1
        ? answers.process.trim().length >= 2
        : activeStep === 2
          ? answers.metrics.trim().length >= 2
          : true);

  return (
    <div className="space-y-5">
      <p className="text-xs text-[var(--flux-text-muted)]">{t("aiConv.intro")}</p>
      <label className="flex items-start gap-2 text-xs text-[var(--flux-text-muted)] cursor-pointer max-w-xl">
        <input
          type="checkbox"
          checked={aiTargetSafe}
          onChange={(e) => {
            setAiTargetSafe(e.target.checked);
            setDraft(null);
            setActiveStep(0);
            setLastLlmModel(null);
          }}
          className="mt-0.5"
        />
        <span>{t("aiConv.targetSafeHint")}</span>
      </label>

      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < activeStep ? "bg-[var(--flux-secondary)]" : i === activeStep ? "bg-[var(--flux-primary)]" : "bg-[var(--flux-chrome-alpha-12)]"
            }`}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
        <div className="space-y-3">
          {!doneQuestions ? (
            <>
              <p className="text-sm font-medium text-[var(--flux-text)]">
                {t("aiConv.step", { n: activeStep + 1 })}{" "}
                <span className="text-[var(--flux-text-muted)] font-normal">— {questionLabels[activeStep]}</span>
              </p>
              <textarea
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                rows={4}
                placeholder={placeholders[activeStep]}
                className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm min-h-[100px]"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={!canSubmitStep} onClick={() => void submitStep()}>
                  {busy ? t("aiBusy") : t("aiConv.continue")}
                </button>
                {(draft || activeStep > 0) && (
                  <button type="button" className="btn-secondary" onClick={resetFlow}>
                    {t("aiConv.restart")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--flux-secondary)] font-medium">{t("aiConv.ready")}</p>
              <label className="flex items-start gap-2 text-xs text-[var(--flux-text-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishAfterCreate}
                  onChange={(e) => setPublishAfterCreate(e.target.checked)}
                  className="mt-0.5"
                />
                <span>{t("aiConv.publishAfter")}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={busy || !draft} onClick={() => void createBoard()}>
                  {busy ? t("aiBusy") : t("aiCreateBoard")}
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={resetFlow}>
                  {t("aiConv.restart")}
                </button>
              </div>
            </div>
          )}
        </div>

        {draft && (
          <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)]/50 p-4 space-y-4">
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("aiConv.previewTitle")}</p>
                {lastLlmModel ? <AiModelHint model={lastLlmModel} provider="Together" /> : null}
              </div>
              <p className="text-sm font-display font-semibold text-[var(--flux-text)] mt-1">{draft.title}</p>
              <p className="text-xs text-[var(--flux-text-muted)] mt-1 leading-relaxed">{draft.description}</p>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="flex gap-2 min-w-min">
                {draft.buckets.map((b, i) => (
                  <div
                    key={b.key}
                    className="w-[132px] shrink-0 rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] overflow-hidden"
                  >
                    <div
                      className="text-[10px] font-semibold px-2 py-1.5 truncate border-b border-[var(--flux-chrome-alpha-08)]"
                      style={{ backgroundColor: `${b.color}28`, borderBottomColor: `${b.color}55` }}
                      title={b.label}
                    >
                      {b.label}
                    </div>
                    <div className="p-1.5 space-y-1">
                      <div className="rounded-md bg-[var(--flux-surface-dark)]/80 px-2 py-1 text-[10px] text-[var(--flux-text-muted)] truncate">
                        {sampleCardTitles[0]}
                      </div>
                      <div className="rounded-md bg-[var(--flux-surface-dark)]/80 px-2 py-1 text-[10px] text-[var(--flux-text-muted)] truncate">
                        {sampleCardTitles[1]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-[var(--flux-chrome-alpha-08)] pt-3">
              <p className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("aiConv.editColumns")}</p>
              {draft.buckets.map((b, i) => (
                <div key={b.key} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={b.label}
                    onChange={(e) => updateBucket(i, { label: e.target.value })}
                    className="flex-1 min-w-[100px] px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-dark)] border border-[var(--flux-control-border)] text-xs"
                    aria-label={t("aiConv.columnLabel")}
                  />
                  <input
                    type="color"
                    value={/^#([0-9a-fA-F]{6})$/.test(b.color) ? b.color : "#" + "6C5CE7"}
                    onChange={(e) => updateBucket(i, { color: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-[var(--flux-control-border)] bg-transparent p-0"
                    title={t("aiConv.color")}
                  />
                  <button
                    type="button"
                    className="text-xs text-[var(--flux-danger)]/90 px-2 py-1 disabled:opacity-30"
                    disabled={draft.buckets.length <= 2}
                    onClick={() => removeBucket(i)}
                  >
                    {t("aiConv.remove")}
                  </button>
                </div>
              ))}
              <button type="button" className="text-xs text-[var(--flux-secondary)] font-medium pt-1" onClick={addBucket}>
                + {t("aiConv.addColumn")}
              </button>
            </div>

            {draft.labelPalette.length > 0 && (
              <p className="text-[11px] text-[var(--flux-text-muted)]">
                <span className="font-semibold text-[var(--flux-text)]/90">{t("aiConv.labels")}: </span>
                {draft.labelPalette.join(", ")}
              </p>
            )}

            {draft.automationIdeas.length > 0 && (
              <div className="text-[11px] text-[var(--flux-text-muted)] space-y-1">
                <p className="font-semibold text-[var(--flux-text)]/90">{t("aiConv.automations")}</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {draft.automationIdeas.map((idea, i) => (
                    <li key={i}>{idea}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.initialOkrs.length > 0 && (
              <div className="text-[11px] border-t border-[var(--flux-chrome-alpha-08)] pt-3 space-y-2">
                <p className="font-semibold text-[var(--flux-text)]">{t("aiConv.okrsTitle")}</p>
                {draft.initialOkrs.map((o, i) => (
                  <div key={i}>
                    <p className="text-[var(--flux-secondary)] font-medium">{o.objective}</p>
                    <ul className="list-disc pl-4 mt-1 text-[var(--flux-text-muted)]">
                      {o.keyResults.map((kr, j) => (
                        <li key={j}>{kr}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BoardTemplateExportModal
        open={Boolean(exportBoardId)}
        onClose={() => {
          const id = exportBoardId;
          setExportBoardId(null);
          if (id) router.push(`${localeRoot}/board/${encodeURIComponent(id)}`);
        }}
        boardId={exportBoardId ?? ""}
        getHeaders={getHeaders}
      />
    </div>
  );
}

async function seedOkrsIfPossible(
  draft: AiTemplateDraft,
  boardId: string,
  getHeaders: () => Record<string, string>
): Promise<void> {
  const first = draft.initialOkrs[0];
  if (!first) return;
  const quarter = currentQuarterLabel();
  try {
    const objRes = await apiPost<{ objective?: { id: string } }>(
      "/api/okrs/objectives",
      { title: first.objective.slice(0, 200), quarter },
      getHeaders()
    );
    const objectiveId = objRes?.objective?.id;
    if (!objectiveId) return;
    for (const title of first.keyResults) {
      await apiPost(
        "/api/okrs/key-results",
        {
          objectiveId,
          title: title.slice(0, 200),
          metric_type: "Manual",
          target: 100,
          linkedBoardId: boardId,
          manualCurrent: 0,
        },
        getHeaders()
      );
    }
  } catch {
    /* Plano sem OKRs ou rede — preview já mostrou sugestões */
  }
}
