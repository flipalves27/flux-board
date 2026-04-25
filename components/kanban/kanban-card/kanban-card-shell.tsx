"use client";

import type { ReactNode } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

export type KanbanCardShellProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  tourFirstCard?: boolean;
  ariaLabel: string;
  selected: boolean;
  isOpening?: boolean;
  rootClassName: string;
  selectionOverlay: ReactNode;
  topOverlayBadges: ReactNode;
  children: ReactNode;
};

/** Outer draggable shell + overlay slots (selection count, risk / AI badges). */
export function KanbanCardShell({
  setNodeRef,
  listeners,
  attributes,
  tourFirstCard,
  ariaLabel,
  selected,
  isOpening,
  rootClassName,
  selectionOverlay,
  topOverlayBadges,
  children,
}: KanbanCardShellProps) {
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-tour={tourFirstCard ? "board-card" : undefined}
      aria-label={ariaLabel}
      data-selected={selected ? "true" : undefined}
      data-opening={isOpening ? "true" : undefined}
      className={rootClassName}
    >
      {selectionOverlay}
      {topOverlayBadges}
      {children}
    </div>
  );
}
