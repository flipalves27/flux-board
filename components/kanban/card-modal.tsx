"use client";

import { CardModalProvider, type CardModalProps } from "@/components/kanban/card-modal-context";
import { CardModalLayout, type CardModalTabId } from "@/components/kanban/card-modal-layout";

export type { CardModalProps };
export type { CardModalTabId };

/** Orquestrador: Provider + shell do modal; abas pesadas são lazy em `card-modal-layout.tsx`. */
export function CardModal(props: CardModalProps) {
  return (
    <CardModalProvider {...props}>
      <CardModalLayout />
    </CardModalProvider>
  );
}
