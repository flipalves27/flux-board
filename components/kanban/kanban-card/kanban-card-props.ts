import type { BucketConfig } from "@/app/board/[id]/page";

export interface KanbanCardProps {
  cardId: string;
  /** Coluna atual (lista visível) — seleção com Shift. */
  bucketKey: string;
  directions: string[];
  dirColors: Record<string, string>;
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc?: (cardId: string) => void;
  isDragging?: boolean;
  tourFirstCard?: boolean;
  /** Colunas do board — mover card sem modal. */
  buckets?: BucketConfig[];
  priorities?: string[];
  onPatchCard?: (
    cardId: string,
    patch: Partial<{ priority: string; bucket: string }>
  ) => void;
  onDuplicateCard?: (cardId: string) => void;
  onPinToTop?: (cardId: string) => void;
  /** Desativa a barra (ex.: preview no DragOverlay). */
  quickActionsDisabled?: boolean;
  /** Preview no DragOverlay — não registra segundo draggable. */
  dragOverlayPreview?: boolean;
  /** IDs do arrasto em curso (opacidade nos cards de origem). */
  activeDragIds?: string[] | null;
  /** Menu rápido: incluir/remover do sprint (board com sprint_engine). */
  sprintBoardQuickActions?: { boardId: string; getHeaders: () => Record<string, string> };
  /** Historical cycle times from completed cards on this board (days). */
  historicalCycleDays?: number[];
  /** Whether this card lives in the last (done) column. */
  isFinalColumn?: boolean;
}
