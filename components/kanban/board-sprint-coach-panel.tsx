"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiPost, ApiError } from "@/lib/api-client";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import type { SprintData } from "@/lib/schemas";

export type BoardSprintCoachPanelProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  sprint: SprintData | null;
  getHeaders: () => Record<string, string>;
};

type CoachPayload = {
  suggestion?: {
    summary?: string;
    reasoning?: string;
    capacityWarning?: string | null;
    okrAlignmentNotes?: string[];
    recommendedCardIds?: string[];
  };
  prediction?: { rationale?: string };
  error?: string;
};

export function BoardSprintCoachPanel({ open, onClose, boardId, sprint, getHeaders }: BoardSprintCoachPanelProps) {
  const t = useTranslations("kanban");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: panelRef, initialFocusRef: closeRef });

  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sprint?.id) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await apiPost<CoachPayload>(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprint.id)}/planning-ai`,
        {},
        getHeaders()
      );
      const sug = data.suggestion;
      if (sug && typeof sug === "object") {
        const parts: string[] = [];
        if (sug.summary) parts.push(String(sug.summary));
        if (sug.reasoning) parts.push("", String(sug.reasoning));
        if (sug.capacityWarning) parts.push("", t("board.sprintCoach.capacity"), String(sug.capacityWarning));
        if (Array.isArray(sug.okrAlignmentNotes) && sug.okrAlignmentNotes.length) {
          parts.push("", t("board.sprintCoach.okrs"));
          parts.push(...sug.okrAlignmentNotes.map((x) => `• ${x}`));
        }
        if (Array.isArray(sug.recommendedCardIds) && sug.recommendedCardIds.length) {
          parts.push("", t("board.sprintCoach.recommendedIds"));
          parts.push(sug.recommendedCardIds.join(", "));
        }
        if (parts.length) setText(parts.join("\n").trim());
        else if (data.prediction?.rationale) setText(String(data.prediction.rationale));
        else setText(t("board.sprintCoach.empty"));
      } else if (data.prediction?.rationale) {
        setText(String(data.prediction.rationale));
      } else {
        setText(t("board.sprintCoach.empty"));
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message || t("board.sprintCoach.error"));
      } else {
        setErr(t("board.sprintCoach.error"));
      }
      setText("");
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, sprint?.id, t]);

  useEffect(() => {
    if (!open || !sprint?.id) return;
    void load();
  }, [open, sprint?.id, load]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex justify-end bg-black/45 backdrop-blur-[1px]"
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className="h-full w-[min(440px,100vw)] border-l border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sprint-coach-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--flux-border-muted)] px-4 py-3">
          <h2 id="sprint-coach-title" className="text-sm font-display font-bold text-[var(--flux-text)]">
            {t("board.sprintCoach.title")}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
              onClick={() => void load()}
              disabled={loading || !sprint?.id}
            >
              {t("board.sprintCoach.refresh")}
            </button>
            <button
              ref={closeRef}
              type="button"
              className="rounded-lg p-2 text-[var(--flux-text-muted)] hover:bg-[var(--flux-surface-hover)]"
              onClick={onClose}
              aria-label={t("board.flowHealth.close")}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-[var(--flux-border-muted)] text-[11px] text-[var(--flux-text-muted)]">
          {sprint?.name ?? "—"}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-kanban">
          {loading ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("board.sprintCoach.loading")}</p>
          ) : err ? (
            <p className="text-sm text-[var(--flux-danger)]">{err}</p>
          ) : (
            <pre className="whitespace-pre-wrap text-[13px] text-[var(--flux-text)] font-sans leading-relaxed">{text}</pre>
          )}
        </div>
      </aside>
    </div>
  );
}
