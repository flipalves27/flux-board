"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { KanbanCadencePanel } from "@/components/ceremonies/kanban-cadence-panel";

export type BoardKanbanCadencePanelProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardLabel: string;
  getHeaders: () => Record<string, string>;
};

export function BoardKanbanCadencePanel({
  open,
  onClose,
  boardId,
  boardLabel,
  getHeaders,
}: BoardKanbanCadencePanelProps) {
  const t = useTranslations("ceremonies");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: panelRef, initialFocusRef: closeRef });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex justify-end bg-black/40">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-labelledby="kanban-cadence-panel-title"
        className="h-full w-full max-w-lg overflow-y-auto border-l border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] shadow-2xl scrollbar-kanban"
      >
        <div className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-[var(--flux-border-muted)] bg-[var(--flux-surface-card)]/95 px-4 py-3 backdrop-blur-sm">
          <h2 id="kanban-cadence-panel-title" className="sr-only">
            {t("cadenceTitle")}
          </h2>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-10)] hover:text-[var(--flux-text)]"
            aria-label={t("closeCadencePanelAria")}
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <KanbanCadencePanel boardId={boardId} boardLabel={boardLabel} getHeaders={getHeaders} />
        </div>
      </div>
    </div>
  );
}
