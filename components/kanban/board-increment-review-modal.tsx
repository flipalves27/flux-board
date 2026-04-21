"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useToast } from "@/context/toast-context";
import type { CardData } from "@/app/board/[id]/page";
import type { SprintData } from "@/lib/schemas";
import { useBoardStore } from "@/stores/board-store";

const ROLLING_MS = 14 * 24 * 60 * 60 * 1000;

type BoardIncrementReviewModalProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  activeSprint: SprintData | null;
};

export function BoardIncrementReviewModal({
  open,
  onClose,
  boardId,
  activeSprint,
}: BoardIncrementReviewModalProps) {
  const t = useTranslations("kanban.board.incrementReview");
  const { pushToast } = useToast();
  const db = useBoardStore((s) => s.db);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const [tab, setTab] = useState<"rolling" | "sprint">("rolling");

  const cards = db?.cards ?? [];
  const portal = db?.portal;

  const rollingDone = useMemo(() => {
    const now = Date.now();
    const from = now - ROLLING_MS;
    return cards.filter((c) => {
      if (c.progress !== "Concluída") return false;
      const ts = c.completedAt ? new Date(c.completedAt).getTime() : 0;
      return ts >= from && ts <= now;
    });
  }, [cards]);

  const sprintDone = useMemo(() => {
    if (!activeSprint || activeSprint.boardId !== boardId) return [];
    const doneIds = new Set(activeSprint.doneCardIds ?? []);
    return cards.filter((c) => doneIds.has(c.id));
  }, [cards, activeSprint, boardId]);

  const list = tab === "rolling" ? rollingDone : sprintDone;

  const markdown = useMemo(() => {
    const title =
      tab === "rolling"
        ? t("exportTitleRolling")
        : t("exportTitleSprint", { name: activeSprint?.name ?? "—" });
    const lines = [title, "", ...list.map((c) => `- **${c.title}** (${c.id}) — ${c.bucket}`)];
    return lines.join("\n");
  }, [list, tab, t, activeSprint?.name]);

  const copyMd = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      pushToast({ kind: "success", title: t("copied") });
    } catch {
      pushToast({ kind: "error", title: t("copyFailed") });
    }
  }, [markdown, pushToast, t]);

  if (!open) return null;

  const portalHint =
    portal?.enabled && portal.token && typeof window !== "undefined"
      ? `${window.location.origin}/portal/${encodeURIComponent(portal.token)}`
      : null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="increment-review-title"
        className="w-full max-w-lg rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-xl max-h-[min(90vh,640px)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--flux-border-muted)]">
          <h2 id="increment-review-title" className="text-lg font-display font-bold text-[var(--flux-text)]">
            {t("title")}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-10)]"
            aria-label={t("closeAria")}
          >
            ✕
          </button>
        </div>

        <div className="p-4 border-b border-[var(--flux-border-muted)] flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              tab === "rolling"
                ? "border-[var(--flux-primary)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]"
            }`}
            onClick={() => setTab("rolling")}
          >
            {t("tabRolling")}
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              tab === "sprint"
                ? "border-[var(--flux-primary)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]"
            }`}
            onClick={() => setTab("sprint")}
            disabled={!activeSprint || activeSprint.status !== "active"}
          >
            {t("tabSprint")}
          </button>
          <button type="button" className="btn-secondary text-xs py-1.5 px-2.5 ml-auto" onClick={() => void copyMd()}>
            {t("copyMarkdown")}
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 scrollbar-kanban min-h-[120px]">
          {list.length === 0 ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {list.map((c: CardData) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-08)] px-3 py-2"
                >
                  <div className="text-sm font-semibold text-[var(--flux-text)]">{c.title}</div>
                  <div className="text-[11px] font-mono text-[var(--flux-text-muted)] mt-0.5">
                    {c.id} · {c.bucket}
                    {c.completedAt ? ` · ${c.completedAt.slice(0, 10)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {portalHint ? (
          <div className="px-4 pb-4 text-[11px] text-[var(--flux-text-muted)]">
            {t("portalHint")}{" "}
            <code className="text-[var(--flux-primary-light)] break-all">{portalHint}</code>
          </div>
        ) : null}

        <div className="p-4 border-t border-[var(--flux-border-muted)] flex justify-end">
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
