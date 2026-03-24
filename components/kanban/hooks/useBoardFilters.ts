import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CardData } from "@/app/board/[id]/page";
import type { BucketConfig } from "@/app/board/[id]/page";

function compareByMatrixWeightThenOrder(a: CardData, b: CardData): number {
  const wa = typeof a.matrixWeight === "number" ? a.matrixWeight : -1;
  const wb = typeof b.matrixWeight === "number" ? b.matrixWeight : -1;
  if (wa !== wb) return wb - wa;
  return (a.order ?? 0) - (b.order ?? 0);
}

export function cardMatchesFilters(
  c: CardData,
  activePrio: string,
  activeLabels: Set<string>,
  searchQuery: string,
  matrixWeightFilter: "all" | "critical_high" | "high_plus" | "medium_plus" | "critical" = "all",
  nlqAllowedIds: Set<string> | null = null,
  sprintCardIds: Set<string> | null = null,
  insightFocusCardIds: Set<string> | null = null
): boolean {
  if (insightFocusCardIds && insightFocusCardIds.size > 0 && !insightFocusCardIds.has(c.id)) return false;
  if (sprintCardIds && !sprintCardIds.has(c.id)) return false;
  if (nlqAllowedIds && !nlqAllowedIds.has(c.id)) return false;
  if (activePrio !== "all" && c.priority !== activePrio) return false;
  if (matrixWeightFilter !== "all") {
    const w = typeof c.matrixWeight === "number" ? c.matrixWeight : -1;
    if (matrixWeightFilter === "critical_high" && w < 56) return false;
    if (matrixWeightFilter === "high_plus" && w < 56) return false;
    if (matrixWeightFilter === "medium_plus" && w < 36) return false;
    if (matrixWeightFilter === "critical" && w < 76) return false;
  }
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
  /** Quando definido, só cards cujo id está no sprint ativo passam (toggle no board). */
  sprintCardIdSet?: Set<string> | null;
  matrixWeightFilter?: "all" | "critical_high" | "high_plus" | "medium_plus" | "critical";
  /** Subconjunto imposto pelos chips de fluxo (board intelligence). */
  insightFocusCardIds?: Set<string> | null;
  /** Limpa `insightFocusCardIds` no filter-store (boardId vem do caller). */
  clearInsightFocus?: () => void;
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
  sprintCardIdSet = null,
  matrixWeightFilter = "all",
  insightFocusCardIds = null,
  clearInsightFocus,
}: UseBoardFiltersArgs) {
  const [focusMode, setFocusMode] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [priorityBarVisible, setPriorityBarVisible] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (forceExpandTourFilters) setPriorityBarVisible(true);
  }, [forceExpandTourFilters]);

  const activeLabelsSize = activeLabels.size;
  useEffect(() => {
    const stillFocused = activePrio === "Urgente" && activeLabelsSize === 0 && searchQuery === "andamento";
    if (!stillFocused && focusMode) setFocusMode(false);
  }, [activePrio, activeLabelsSize, searchQuery, focusMode]);

  const clearFilters = useCallback(() => {
    clearInsightFocus?.();
    setActivePrio("all");
    setActiveLabels(new Set());
    setSearchQuery("");
    setFocusMode(false);
  }, [clearInsightFocus, setActiveLabels, setActivePrio, setSearchQuery]);

  const applyFocusMode = useCallback(() => {
    clearInsightFocus?.();
    setActivePrio("Urgente");
    setActiveLabels(new Set());
    setSearchQuery("andamento");
  }, [clearInsightFocus, setActiveLabels, setActivePrio, setSearchQuery]);

  const filterCard = useCallback(
    (c: CardData) =>
      cardMatchesFilters(
        c,
        activePrio,
        activeLabels,
        searchQuery,
        matrixWeightFilter,
        nlqAllowedIds,
        sprintCardIdSet,
        insightFocusCardIds
      ),
    [activePrio, activeLabels, searchQuery, matrixWeightFilter, nlqAllowedIds, sprintCardIdSet, insightFocusCardIds]
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
      map.get(key)!.sort(compareByMatrixWeightThenOrder);
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
      map.get(key)!.sort(compareByMatrixWeightThenOrder);
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
