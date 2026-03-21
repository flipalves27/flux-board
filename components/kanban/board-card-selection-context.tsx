"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";

type BoardCardSelectionContextValue = {
  selectedIds: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  onCtrlClick: (cardId: string, bucketKey: string) => void;
  onShiftClick: (cardId: string, bucketKey: string) => void;
  clearSelection: () => void;
  getOrderedDragIds: (draggedCardId: string) => string[];
  /** Ordem estável dos selecionados (colunas esq.→dir., topo→baixo). */
  getOrderedSelectionIds: () => string[];
};

const BoardCardSelectionContext = createContext<BoardCardSelectionContextValue | null>(null);

export function useBoardCardSelection(): BoardCardSelectionContextValue {
  const ctx = useContext(BoardCardSelectionContext);
  if (!ctx) {
    throw new Error("useBoardCardSelection must be used within BoardCardSelectionProvider");
  }
  return ctx;
}

export function useOptionalBoardCardSelection(): BoardCardSelectionContextValue | null {
  return useContext(BoardCardSelectionContext);
}

function buildOrderedSelection(
  selected: ReadonlySet<string>,
  buckets: BucketConfig[],
  visibleCardsByBucket: (key: string) => CardData[]
): string[] {
  const ordered: string[] = [];
  for (const b of buckets) {
    for (const c of visibleCardsByBucket(b.key)) {
      if (selected.has(c.id)) ordered.push(c.id);
    }
  }
  return ordered;
}

type ProviderProps = {
  children: ReactNode;
  buckets: BucketConfig[];
  visibleCardsByBucket: (key: string) => CardData[];
};

export function BoardCardSelectionProvider({ children, buckets, visibleCardsByBucket }: ProviderProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [anchorBucket, setAnchorBucket] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
    setAnchorBucket(null);
  }, []);

  const getOrderedSelectionIds = useCallback(() => {
    return buildOrderedSelection(selectedIds, buckets, visibleCardsByBucket);
  }, [selectedIds, buckets, visibleCardsByBucket]);

  const getOrderedDragIds = useCallback(
    (draggedCardId: string) => {
      const ordered = buildOrderedSelection(selectedIds, buckets, visibleCardsByBucket);
      if (!selectedIds.has(draggedCardId)) return [draggedCardId];
      return ordered.length > 0 ? ordered : [draggedCardId];
    },
    [selectedIds, buckets, visibleCardsByBucket]
  );

  const onCtrlClick = useCallback((cardId: string, bucketKey: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    setAnchorId(cardId);
    setAnchorBucket(bucketKey);
  }, []);

  const onShiftClick = useCallback(
    (cardId: string, bucketKey: string) => {
      const list = visibleCardsByBucket(bucketKey);
      const idx = list.findIndex((c) => c.id === cardId);
      if (idx < 0) return;

      if (!anchorId || anchorBucket !== bucketKey) {
        setSelectedIds(new Set([cardId]));
        setAnchorId(cardId);
        setAnchorBucket(bucketKey);
        return;
      }

      const anchorIdx = list.findIndex((c) => c.id === anchorId);
      if (anchorIdx < 0) {
        setSelectedIds(new Set([cardId]));
        setAnchorId(cardId);
        setAnchorBucket(bucketKey);
        return;
      }

      const lo = Math.min(anchorIdx, idx);
      const hi = Math.max(anchorIdx, idx);
      const next = new Set<string>();
      for (let i = lo; i <= hi; i++) {
        next.add(list[i].id);
      }
      setSelectedIds(next);
    },
    [anchorId, anchorBucket, visibleCardsByBucket]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds.size, clearSelection]);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const value = useMemo<BoardCardSelectionContextValue>(
    () => ({
      selectedIds,
      isSelected,
      onCtrlClick,
      onShiftClick,
      clearSelection,
      getOrderedDragIds,
      getOrderedSelectionIds,
    }),
    [selectedIds, isSelected, onCtrlClick, onShiftClick, clearSelection, getOrderedDragIds, getOrderedSelectionIds]
  );

  return <BoardCardSelectionContext.Provider value={value}>{children}</BoardCardSelectionContext.Provider>;
}
