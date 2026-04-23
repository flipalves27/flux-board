"use client";

import { useDroppable } from "@dnd-kit/core";

export function KanbanColumnDroppableSlot({ id, tall }: { id: string; tall?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-tall={tall ? "true" : undefined}
      aria-hidden="true"
      role="presentation"
      className={`flux-kanban-drop-slot min-h-[12px] flex-shrink-0 rounded transition-all duration-200 ease-out ${
        isOver
          ? "bg-[var(--flux-primary)]/20 ring-2 ring-[var(--flux-primary)]/40 scale-[1.01] shadow-[0_0_12px_var(--flux-primary-alpha-25)]"
          : "hover:bg-[var(--flux-surface-hover)]"
      }`}
    />
  );
}
