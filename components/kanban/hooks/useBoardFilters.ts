import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CardData } from "@/app/board/[id]/page";
import type { BucketConfig } from "@/app/board/[id]/page";

export function cardMatchesFilters(
  c: CardData,
  activePrio: string,
  activeLabels: Set<string>,
  searchQuery: string,
  nlqAllowedIds: Set<string> | null = null
): boolean {
  if (nlqAllowedIds && !nlqAllowedIds.has(c.id)) return false;
  if (activePrio !== "all" && c.priority !== activePrio) return false;
  if (activeLabels.size > 0 && !c.tags.some((t) => activeLabels.has(t))) return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.desc || "").toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  return true;
}

type UseBoardFiltersArgs = {
  cards: CardData[];
  buckets: BucketConfig[];
  activePrio: string;
  setActivePrio: Dispatch<SetStateAction<string>>;
  activeLabels: Set<string>;
  setActiveLabels: Dispatch<SetStateAction<Set<string>>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  /** Quando definido, só cards com id neste conjunto passam (consulta NLQ). */
  nlqAllowedIds?: Set<string> | null;
  /** Tour guiado: mantém a barra de filtros expandida (passo Daily Insights). */
  forceExpandTourFilters?: boolean;
};

export function useBoardFilters({
  cards,
  buckets,
  activePrio,
  setActivePrio,
  activeLabels,
  setActiveLabels,
  searchQuery,
  setSearchQuery,
  nlqAllowedIds = null,
  forceExpandTourFilters = false,
}: UseBoardFiltersArgs) {
  const [focusMode, setFocusMode] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [priorityBarVisible, setPriorityBarVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (forceExpandTourFilters) setPriorityBarVisible(true);
  }, [forceExpandTourFilters]);

  useEffect(() => {
    const stillFocused = activePrio === "Urgente" && activeLabels.size === 0 && searchQuery === "andamento";
    if (!stillFocused && focusMode) setFocusMode(false);
  }, [activePrio, activeLabels, searchQuery, focusMode]);

  const clearFilters = useCallback(() => {
    setActivePrio("all");
    setActiveLabels(new Set());
    setSearchQuery("");
    setFocusMode(false);
  }, [setActiveLabels, setActivePrio, setSearchQuery]);

  const applyFocusMode = useCallback(() => {
    setActivePrio("Urgente");
    setActiveLabels(new Set());
    setSearchQuery("andamento");
  }, [setActiveLabels, setActivePrio, setSearchQuery]);

  const filterCard = useCallback(
    (c: CardData) => cardMatchesFilters(c, activePrio, activeLabels, searchQuery, nlqAllowedIds),
    [activePrio, activeLabels, searchQuery, nlqAllowedIds]
  );

  const cardsByBucketSorted = useMemo(() => {
    const bucketKeys = buckets.map((b) => b.key);
    const map = new Map<string, CardData[]>();
    for (const key of bucketKeys) map.set(key, []);

    for (const c of cards) {
      if (!map.has(c.bucket)) continue;
      map.get(c.bucket)!.push(c);
    }

    for (const key of bucketKeys) {
      map.get(key)!.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    return map;
  }, [cards, buckets]);

  const filteredCards = useMemo(() => cards.filter(filterCard), [cards, filterCard]);

  const visibleCardsByBucketMap = useMemo(() => {
    const bucketKeys = buckets.map((b) => b.key);
    const map = new Map<string, CardData[]>();
    for (const key of bucketKeys) map.set(key, []);

    for (const c of filteredCards) {
      if (!map.has(c.bucket)) continue;
      map.get(c.bucket)!.push(c);
    }

    for (const key of bucketKeys) {
      map.get(key)!.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    return map;
  }, [filteredCards, buckets]);

  const getCardsByBucket = useCallback(
    (bucketKey: string) => cardsByBucketSorted.get(bucketKey) ?? [],
    [cardsByBucketSorted]
  );

  const visibleCardsByBucket = useCallback(
    (bucketKey: string) => visibleCardsByBucketMap.get(bucketKey) ?? [],
    [visibleCardsByBucketMap]
  );

  const toggleLabel = useCallback((label: string) => {
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, [setActiveLabels]);

  return {
    focusMode,
    setFocusMode,
    labelsOpen,
    setLabelsOpen,
    priorityBarVisible,
    setPriorityBarVisible,
    searchInputRef,
    clearFilters,
    applyFocusMode,
    filterCard,
    getCardsByBucket,
    visibleCardsByBucket,
    toggleLabel,
  };
}
