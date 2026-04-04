"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { SprintCadenceType, SprintData } from "@/lib/schemas";

type BoardOpt = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  boardId: string;
  boards: BoardOpt[];
  sprint: SprintData | null;
  getHeaders: () => Record<string, string>;
  onSaved: () => void;
};

const STEPS = 4;

function emptyForm() {
  return {
    name: "",
    goal: "",
    startDate: "",
    endDate: "",
    cadenceType: "timebox" as SprintCadenceType,
    reviewCadenceDays: "" as string,
    wipPolicyNote: "",
    plannedCapacity: "" as string,
    commitmentNote: "",
    programIncrementId: "",
    sprintTags: "",
    customKey: "",
    customVal: "",
  };
}

export function SprintFormDrawer({ open, onClose, mode, boardId, boards, sprint, getHeaders, onSaved }: Props) {
  const t = useTranslations("sprints.form");
  const [step, setStep] = useState(0);
  const [targetBoardId, setTargetBoardId] = useState(boardId);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);

  const effectiveBoardId = mode === "create" ? targetBoardId : boardId;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErr(null);
    setAiHint(null);
    setTargetBoardId(boardId);
    if (mode === "edit" && sprint) {
      setForm({
        name: sprint.name,
        goal: sprint.goal,
        startDate: sprint.startDate ?? "",
        endDate: sprint.endDate ?? "",
        cadenceType: sprint.cadenceType,
        reviewCadenceDays: sprint.reviewCadenceDays != null ? String(sprint.reviewCadenceDays) : "",
        wipPolicyNote: sprint.wipPolicyNote,
        plannedCapacity: sprint.plannedCapacity != null ? String(sprint.plannedCapacity) : "",
        commitmentNote: sprint.commitmentNote,
        programIncrementId: sprint.programIncrementId ?? "",
        sprintTags: sprint.sprintTags.join(", "),
        customKey: "",
        customVal: "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, mode, sprint, boardId]);

  const customFieldsObj = useMemo(() => {
    const o: Record<string, string> = {};
    if (mode === "edit" && sprint) Object.assign(o, sprint.customFields);
    if (form.customKey.trim() && form.customVal.trim()) {
      o[form.customKey.trim().slice(0, 60)] = form.customVal.trim().slice(0, 500);
    }
    return o;
  }, [mode, sprint, form.customKey, form.customVal]);

  const runPlanningAi = useCallback(async () => {
    if (!sprint || mode !== "edit") return;
    setAiLoading(true);
    setAiHint(null);
    setErr(null);
    try {
      const res = await apiFetch(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprint.id)}/planning-ai`,
        {
          method: "POST",
          headers: getApiHeaders(getHeaders()),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        suggestion?: { summary?: string; recommendedCardIds?: string[] };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "IA");
      const ids = data.suggestion?.recommendedCardIds ?? [];
      const summary = data.suggestion?.summary ?? "";
      setAiHint(summary + (ids.length ? `\n\nIDs sugeridos: ${ids.join(", ")}` : ""));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("aiError"));
    } finally {
      setAiLoading(false);
    }
  }, [boardId, getHeaders, mode, sprint, t]);

  const submit = async () => {
    if (!form.name.trim()) {
      setErr(t("nameRequired"));
      return;
    }
    if (mode === "create" && !effectiveBoardId) {
      setErr(t("boardRequired"));
      return;
    }

    const tags = form.sprintTags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);

    let reviewCadenceDays: number | null = null;
    if (form.reviewCadenceDays.trim()) {
      const n = parseInt(form.reviewCadenceDays, 10);
      reviewCadenceDays = Number.isFinite(n) && n > 0 ? n : null;
    }
    let plannedCapacity: number | null = null;
    if (form.plannedCapacity.trim()) {
      const n = Number(form.plannedCapacity);
      plannedCapacity = Number.isFinite(n) && n >= 0 ? n : null;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      goal: form.goal.trim() || undefined,
      startDate: form.startDate.trim() || null,
      endDate: form.endDate.trim() || null,
      cadenceType: form.cadenceType,
      reviewCadenceDays,
      wipPolicyNote: form.wipPolicyNote.trim() || undefined,
      plannedCapacity,
      commitmentNote: form.commitmentNote.trim() || undefined,
      programIncrementId: form.programIncrementId.trim() || null,
      sprintTags: tags,
      customFields: customFieldsObj,
    };

    setSaving(true);
    setErr(null);
    try {
      if (mode === "create") {
        const res = await apiFetch(`/api/boards/${encodeURIComponent(effectiveBoardId)}/sprints`, {
          method: "POST",
          headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "HTTP");
      } else if (sprint) {
        const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprint.id)}`, {
          method: "PATCH",
          headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "HTTP");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex justify-end">
      <button type="button" className="absolute inset-0 bg-[var(--flux-black-alpha-45)]" aria-label={t("close")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">{mode === "create" ? t("titleCreate") : t("titleEdit")}</h2>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
          {t("step", { current: step + 1, total: STEPS })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {err ? <p className="text-xs text-[var(--flux-danger)]">{err}</p> : null}

          {step === 0 ? (
            <div className="space-y-3">
              {mode === "create" ? (
                <label className="block text-xs text-[var(--flux-text-muted)]">
                  {t("fieldBoard")}
                  <select
                    value={targetBoardId}
                    onChange={(e) => setTargetBoardId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                  >
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldName")}
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldGoal")}
                <textarea
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-[var(--flux-text-muted)]">
                  {t("fieldStart")}
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-[var(--flux-text-muted)]">
                  {t("fieldEnd")}
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldCadence")}
                <select
                  value={form.cadenceType}
                  onChange={(e) => setForm((f) => ({ ...f, cadenceType: e.target.value as SprintCadenceType }))}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                >
                  <option value="timebox">{t("cadenceTimebox")}</option>
                  <option value="continuous">{t("cadenceContinuous")}</option>
                </select>
              </label>
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldReviewCadence")}
                <input
                  type="number"
                  min={1}
                  value={form.reviewCadenceDays}
                  onChange={(e) => setForm((f) => ({ ...f, reviewCadenceDays: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldWip")}
                <textarea
                  value={form.wipPolicyNote}
                  onChange={(e) => setForm((f) => ({ ...f, wipPolicyNote: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldCapacity")}
                <input
                  type="number"
                  min={0}
                  value={form.plannedCapacity}
                  onChange={(e) => setForm((f) => ({ ...f, plannedCapacity: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldCommitment")}
                <textarea
                  value={form.commitmentNote}
                  onChange={(e) => setForm((f) => ({ ...f, commitmentNote: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldPi")}
                <input
                  value={form.programIncrementId}
                  onChange={(e) => setForm((f) => ({ ...f, programIncrementId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--flux-text-muted)]">
                {t("fieldTags")}
                <input
                  value={form.sprintTags}
                  onChange={(e) => setForm((f) => ({ ...f, sprintTags: e.target.value }))}
                  placeholder={t("tagsPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-[var(--flux-text-muted)]">
                  {t("fieldCustomKey")}
                  <input
                    value={form.customKey}
                    onChange={(e) => setForm((f) => ({ ...f, customKey: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-[var(--flux-text-muted)]">
                  {t("fieldCustomVal")}
                  <input
                    value={form.customVal}
                    onChange={(e) => setForm((f) => ({ ...f, customVal: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              {mode === "edit" && sprint ? (
                <div className="rounded-xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-06)] p-3 space-y-2">
                  <p className="text-xs font-semibold text-[var(--flux-primary-light)]">{t("planningAiTitle")}</p>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-xs"
                    disabled={aiLoading}
                    onClick={() => void runPlanningAi()}
                  >
                    {aiLoading ? t("aiLoading") : t("planningAiCta")}
                  </button>
                  {aiHint ? <p className="text-xs whitespace-pre-wrap text-[var(--flux-text)]">{aiHint}</p> : null}
                </div>
              ) : (
                <p className="text-xs text-[var(--flux-text-muted)]">{t("planningAiCreateHint")}</p>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2 text-sm text-[var(--flux-text)]">
              <p>
                <span className="text-[var(--flux-text-muted)]">{t("fieldName")}:</span> {form.name}
              </p>
              <p>
                <span className="text-[var(--flux-text-muted)]">{t("fieldCadence")}:</span> {form.cadenceType}
              </p>
              <p className="text-xs text-[var(--flux-text-muted)]">{t("reviewSave")}</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <button
            type="button"
            className="btn-secondary px-3 py-2 text-xs"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            {t("back")}
          </button>
          <div className="flex gap-2">
            {step < STEPS - 1 ? (
              <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => setStep((s) => Math.min(STEPS - 1, s + 1))}>
                {t("next")}
              </button>
            ) : (
              <button type="button" className="btn-primary px-3 py-2 text-xs" disabled={saving} onClick={() => void submit()}>
                {saving ? t("saving") : t("save")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
