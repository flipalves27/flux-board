"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import type { BoardDefinitionOfDoneItem, BucketConfig } from "@/app/board/[id]/page";
import { useBoardStore } from "@/stores/board-store";
import { isSprintMethodology, type BoardMethodology } from "@/lib/board-methodology";

function stableItemId(label: string, idx: number): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base ? `dod-${base}-${idx}` : `dod-${idx}`;
}

type BoardScrumSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function BoardScrumSettingsModal({ open, onClose }: BoardScrumSettingsModalProps) {
  const t = useTranslations("kanban.board.scrumSettings");
  const db = useBoardStore((s) => s.db);
  const updateDb = useBoardStore((s) => s.updateDb);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const [productGoal, setProductGoal] = useState("");
  const [backlogKey, setBacklogKey] = useState("");
  const [dodEnabled, setDodEnabled] = useState(false);
  const [dodEnforce, setDodEnforce] = useState(false);
  const [dodLines, setDodLines] = useState("");
  const [doneKeys, setDoneKeys] = useState<string[]>([]);
  const [methodologyDraft, setMethodologyDraft] = useState<BoardMethodology>("scrum");
  const [requireAssignee, setRequireAssignee] = useState(false);
  const [wipEnforcement, setWipEnforcement] = useState<"strict" | "soft">("strict");

  const buckets: BucketConfig[] = db?.config?.bucketOrder ?? [];

  useEffect(() => {
    if (!open || !db) return;
    setMethodologyDraft(
      db.boardMethodology === "kanban"
        ? "kanban"
        : db.boardMethodology === "lean_six_sigma"
          ? "lean_six_sigma"
          : db.boardMethodology === "discovery"
            ? "discovery"
            : db.boardMethodology === "safe"
              ? "safe"
            : "scrum"
    );
    setProductGoal(db.config.productGoal ?? "");
    setBacklogKey(db.config.backlogBucketKey ?? "");
    const def = db.config.definitionOfDone;
    setDodEnabled(Boolean(def?.enabled));
    setDodEnforce(Boolean(def?.enforce));
    setDodLines((def?.items ?? []).map((i) => i.label).join("\n"));
    setDoneKeys([...(def?.doneBucketKeys ?? [])]);
    setRequireAssignee(Boolean(db.config.cardRules?.requireAssignee));
    const w = (db.config as { wipEnforcement?: string }).wipEnforcement;
    setWipEnforcement(w === "soft" ? "soft" : "strict");
  }, [open, db]);

  const toggleDoneKey = useCallback((key: string) => {
    setDoneKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const parsedItems: BoardDefinitionOfDoneItem[] = useMemo(() => {
    const lines = dodLines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((label, idx) => ({
      id: stableItemId(label, idx),
      label: label.slice(0, 300),
    }));
  }, [dodLines]);

  const handleSave = useCallback(() => {
    if (!db) return;
    updateDb((d) => {
      d.boardMethodology = methodologyDraft;

      const g = productGoal.trim().slice(0, 800);
      if (isSprintMethodology(methodologyDraft)) {
        if (g) d.config.productGoal = g;
        else delete d.config.productGoal;

        const bk = backlogKey.trim();
        if (bk && d.config.bucketOrder.some((b) => b.key === bk)) d.config.backlogBucketKey = bk;
        else delete d.config.backlogBucketKey;
      } else {
        delete d.config.productGoal;
        delete d.config.backlogBucketKey;
      }

      const items = parsedItems.slice(0, 20);
      const dk = doneKeys.filter((k) => d.config.bucketOrder.some((b) => b.key === k));
      if (dodEnabled || items.length > 0 || dk.length > 0) {
        d.config.definitionOfDone = {
          enabled: dodEnabled,
          enforce: dodEnforce,
          ...(dk.length ? { doneBucketKeys: dk } : {}),
          items,
        };
      } else {
        delete d.config.definitionOfDone;
      }
      d.config.cardRules = { ...(d.config.cardRules ?? {}), requireAssignee };

      if (
        methodologyDraft === "kanban" ||
        methodologyDraft === "lean_six_sigma" ||
        methodologyDraft === "discovery"
      ) {
        (d.config as { wipEnforcement?: string }).wipEnforcement = wipEnforcement;
      } else {
        delete (d.config as { wipEnforcement?: string }).wipEnforcement;
      }
    });
    onClose();
  }, [
    db,
    updateDb,
    methodologyDraft,
    productGoal,
    backlogKey,
    dodEnabled,
    dodEnforce,
    parsedItems,
    doneKeys,
    requireAssignee,
    wipEnforcement,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="scrum-settings-title"
        className="w-full max-w-lg rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-xl max-h-[min(90vh,720px)] overflow-y-auto scrollbar-kanban"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--flux-border-muted)]">
          <h2 id="scrum-settings-title" className="text-lg font-display font-bold text-[var(--flux-text)]">
            {t("titleAgile")}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-10)] hover:text-[var(--flux-text)]"
            aria-label={t("closeAria")}
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div className="rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-06)] p-3 space-y-2">
            <p className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">{t("methodologyLabel")}</p>
            <div className="flex flex-wrap gap-0.5 rounded-lg border border-[var(--flux-chrome-alpha-12)] p-0.5">
              <button
                type="button"
                onClick={() => setMethodologyDraft("scrum")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  methodologyDraft === "scrum"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("methodologyScrum")}
              </button>
              <button
                type="button"
                onClick={() => setMethodologyDraft("safe")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  methodologyDraft === "safe"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("methodologySafe")}
              </button>
              <button
                type="button"
                onClick={() => setMethodologyDraft("kanban")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  methodologyDraft === "kanban"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("methodologyKanban")}
              </button>
              <button
                type="button"
                onClick={() => setMethodologyDraft("lean_six_sigma")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  methodologyDraft === "lean_six_sigma"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("methodologyLss")}
              </button>
              <button
                type="button"
                onClick={() => setMethodologyDraft("discovery")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  methodologyDraft === "discovery"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("methodologyDiscovery")}
              </button>
            </div>
            <p className="text-[11px] text-[var(--flux-text-muted)] leading-relaxed">{t("methodologyHint")}</p>
            <p className="text-[11px] text-[var(--flux-text-muted)] flex flex-wrap gap-x-3 gap-y-1">
              <Link href="https://scrumguides.org" target="_blank" rel="noreferrer" className="underline hover:text-[var(--flux-primary-light)]">
                {t("refScrumGuide")}
              </Link>
              <Link
                href="https://www.scrum.org/resources/kanban-guide-scrum-teams"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-[var(--flux-primary-light)]"
              >
                {t("refKanbanGuide")}
              </Link>
              <Link href="https://scaledagile.com" target="_blank" rel="noreferrer" className="underline hover:text-[var(--flux-primary-light)]">
                {t("refScaledAgile")}
              </Link>
            </p>
          </div>

          {methodologyDraft === "kanban" || methodologyDraft === "lean_six_sigma" || methodologyDraft === "discovery" ? (
            <div className="rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-06)] p-3 space-y-2">
              <p className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">
                {t("wipEnforcementLabel")}
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--flux-text)]">
                <input
                  type="radio"
                  name="wip-enforcement"
                  checked={wipEnforcement === "strict"}
                  onChange={() => setWipEnforcement("strict")}
                  className="mt-1"
                />
                <span>{t("wipEnforcementStrict")}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--flux-text)]">
                <input
                  type="radio"
                  name="wip-enforcement"
                  checked={wipEnforcement === "soft"}
                  onChange={() => setWipEnforcement("soft")}
                  className="mt-1"
                />
                <span>{t("wipEnforcementSoft")}</span>
              </label>
            </div>
          ) : null}

          {isSprintMethodology(methodologyDraft) ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
                  {t("productGoal")}
                </label>
                <textarea
                  value={productGoal}
                  onChange={(e) => setProductGoal(e.target.value)}
                  rows={3}
                  maxLength={800}
                  className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)]"
                  placeholder={t("productGoalPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
                  {t("backlogColumn")}
                </label>
                <select
                  value={backlogKey}
                  onChange={(e) => setBacklogKey(e.target.value)}
                  className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)]"
                >
                  <option value="">{t("backlogAuto")}</option>
                  {buckets.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("backlogHint")}</p>
              </div>
            </>
          ) : null}

          <div className="rounded-xl border border-[var(--flux-border-muted)] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-[var(--flux-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={requireAssignee}
                onChange={(e) => setRequireAssignee(e.target.checked)}
                className="rounded border-[var(--flux-chrome-alpha-20)]"
              />
              Exigir responsável em todos os cards
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--flux-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={dodEnabled}
                  onChange={(e) => setDodEnabled(e.target.checked)}
                  className="rounded border-[var(--flux-chrome-alpha-20)]"
                />
                {t("dodEnabled")}
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--flux-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={dodEnforce}
                  onChange={(e) => setDodEnforce(e.target.checked)}
                  disabled={!dodEnabled}
                  className="rounded border-[var(--flux-chrome-alpha-20)]"
                />
                {t("dodEnforce")}
              </label>
            </div>
            {dodEnabled && dodEnforce ? (
              <p className="text-[11px] text-[var(--flux-text-muted)] leading-relaxed">{t("dodEnforceHint")}</p>
            ) : null}
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
                {t("dodItems")}
              </label>
              <textarea
                value={dodLines}
                onChange={(e) => setDodLines(e.target.value)}
                rows={5}
                disabled={!dodEnabled}
                className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)] disabled:opacity-50"
                placeholder={t("dodPlaceholder")}
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-2">
                {t("doneColumns")}
              </span>
              <div className="flex flex-wrap gap-2">
                {buckets.map((b) => (
                  <label
                    key={b.key}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={doneKeys.includes(b.key)}
                      onChange={() => toggleDoneKey(b.key)}
                      disabled={!dodEnabled}
                      className="rounded border-[var(--flux-chrome-alpha-20)]"
                    />
                    {b.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("doneColumnsHint")}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[var(--flux-border-muted)]">
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="btn-primary text-sm py-2 px-3" onClick={handleSave}>
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
