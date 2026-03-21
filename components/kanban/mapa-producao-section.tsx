"use client";

import { MapaModal } from "./mapa-modal";
import type { BoardData } from "@/app/board/[id]/page";

type MapaRow = NonNullable<BoardData["mapaProducao"]>[number];

type MapaProducaoSectionProps = {
  open: boolean;
  onClose: () => void;
  mapaProducao: MapaRow[];
  onSave: (arr: MapaRow[]) => void;
};

export function MapaProducaoSection({ open, onClose, mapaProducao, onSave }: MapaProducaoSectionProps) {
  if (!open) return null;
  return <MapaModal mapaProducao={mapaProducao} onClose={onClose} onSave={onSave} />;
}
