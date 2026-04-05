import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { CardData } from "@/app/board/[id]/page";
import { apiGet } from "@/lib/api-client";
import { computeOkrsProgress, type OkrsObjectiveDefinition, type OkrsKeyResultDefinition } from "@/lib/okr-engine";
import type { OkrKrProjection } from "@/lib/okr-projection";
import { useToast } from "@/context/toast-context";
import { useTranslations } from "next-intl";
import {
  useBoardStore,
  registerCsvExportHandler,
  armSkipWipValidationOnce,
  setPendingWipOverrideReason,
  consumeSkipWipValidationOnce,
} from "@/stores/board-store";
import {
  validateBoardWipPutTransition,
  simulateMoveCardsBatch,
  simulateMoveSingleCard,
  simulatePatchBucketMove,
} from "@/lib/board-wip";
import { nextBoardCardId } from "@/lib/card-id";
import { assertDodAllowsCompleting, resolveDoneBucketKeys } from "@/lib/board-scrum";
import { useFilterStore } from "@/stores/filter-store";
import { useKanbanUiStore } from "@/stores/ui-store";
import { useDailySession } from "./useDailySession";
import { COLUMN_COLORS } from "../kanban-constants";
import { daysUntilDueDate } from "../utils/days-until-due";

const EMPTY_LABELS: string[] = [];

function isWipSoftConfig(cfg: unknown): boolean {
  return Boolean(cfg && typeof cfg === "object" && (cfg as { wipEnforcement?: string }).wipEnforcement === "soft");
}

export type WipOverridePending =
  | { mode: "single"; cardId: string; newBucket: string; newIndex: number }
  | { mode: "batch"; orderedIds: string[]; newBucket: string; insertIndex: number };

type UseBoardStateArgs = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  priorities: string[];
  progresses: string[];
  directions: string[];
  /** Colunas afetadas após movimentação de cards — colaboração em tempo real. */
  onAfterCardBucketsChange?: (bucketKeys: string[]) => void;
  onAfterColumnReorder?: () => void;
};

export function useBoardState({
  boardId,
  getHeaders,
  priorities,
  progresses,
  directions,
  onAfterCardBucketsChange,
  onAfterColumnReorder,
}: UseBoardStateArgs) {
  const db = useBoardStore((s) => s.db);
  const updateDb = useBoardStore((s) => s.updateDb);

  const {
    modalCard,
    setModalCard,
    modalMode,
    setModalMode,
    mapaOpen,
    setMapaOpen,
    confirmDelete,
    setConfirmDelete,
    addColumnOpen,
    setAddColumnOpen,
    newColumnName,
    setNewColumnName,
    editingColumnKey,
    setEditingColumnKey,
    descModalCard,
    setDescModalCard,
    csvImportMode,
    setCsvImportMode,
    csvImportConfirm,
    setCsvImportConfirm,
  } = useKanbanUiStore(
    useShallow((s) => ({
      modalCard: s.modalCard,
      setModalCard: s.setModalCard,
      modalMode: s.modalMode,
      setModalMode: s.setModalMode,
      mapaOpen: s.mapaOpen,
      setMapaOpen: s.setMapaOpen,
      confirmDelete: s.confirmDelete,
      setConfirmDelete: s.setConfirmDelete,
      addColumnOpen: s.addColumnOpen,
      setAddColumnOpen: s.setAddColumnOpen,
      newColumnName: s.newColumnName,
      setNewColumnName: s.setNewColumnName,
      editingColumnKey: s.editingColumnKey,
      setEditingColumnKey: s.setEditingColumnKey,
      descModalCard: s.descModalCard,
      setDescModalCard: s.setDescModalCard,
      csvImportMode: s.csvImportMode,
      setCsvImportMode: s.setCsvImportMode,
      csvImportConfirm: s.csvImportConfirm,
      setCsvImportConfirm: s.setCsvImportConfirm,
    }))
  );

  if (!db) {
    throw new Error("useBoardStore.db is null — board must be hydrated before useBoardState.");
  }
  const t = useTranslations("kanban");
  const { pushToast } = useToast();

  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    moved: false,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [wipOverridePending, setWipOverridePending] = useState<WipOverridePending | null>(null);
  const moveCardRef = useRef<(cardId: string, newBucket: string, newIndex: number) => void>(() => {});
  const moveCardsBatchRef = useRef<(orderedIds: string[], newBucket: string, insertIndex: number) => void>(() => {});

  const currentQuarter = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${year}-Q${q}`;
  }, []);

  const [okrObjectives, setOkrObjectives] = useState<OkrsObjectiveDefinition[]>([]);
  const [okrLoadError, setOkrLoadError] = useState<string | null>(null);
  const [okrProjections, setOkrProjections] = useState<OkrKrProjection[] | null>(null);
  const [okrProjectionError, setOkrProjectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!boardId) return;

    async function loadOkrsAndProjections() {
      setOkrLoadError(null);
      setOkrProjectionError(null);
      setOkrProjections(null);
      const q = encodeURIComponent(currentQuarter);
      const bid = encodeURIComponent(boardId);
      const byBoardUrl = `/api/okrs/by-board?boardId=${bid}&quarter=${q}`;
      const projectionUrl = `/api/okrs/projection?boardId=${bid}&quarter=${q}`;
      const headers = getHeaders();

      try {
        const [objOutcome, projOutcome] = await Promise.allSettled([
          apiGet<{
            ok: boolean;
            objectives: Array<{ objective: unknown; keyResults: unknown[] }>;
          }>(byBoardUrl, headers),
          apiGet<{
            ok?: boolean;
            projections?: OkrKrProjection[];
          }>(projectionUrl, headers),
        ]);

        if (cancelled) return;

        if (objOutcome.status === "fulfilled" && objOutcome.value?.ok && Array.isArray(objOutcome.value.objectives)) {
          const defs: OkrsObjectiveDefinition[] = objOutcome.value.objectives
            .map((g) => {
              const obj = g.objective as Record<string, unknown> | null | undefined;
              if (!obj) return null;
              const keyResults: OkrsKeyResultDefinition[] = Array.isArray(g.keyResults)
                ? (g.keyResults as OkrsKeyResultDefinition[])
                : [];
              return {
                id: String(obj.id),
                title: String(obj.title ?? ""),
                owner: obj.owner ?? null,
                quarter: String(obj.quarter ?? currentQuarter),
                keyResults,
              };
            })
            .filter(Boolean) as OkrsObjectiveDefinition[];
          setOkrObjectives(defs);
        } else {
          setOkrObjectives([]);
          if (objOutcome.status === "rejected") {
            setOkrLoadError(
              objOutcome.reason instanceof Error ? objOutcome.reason.message : "Erro ao carregar OKRs"
            );
          }
        }

        if (projOutcome.status === "fulfilled" && Array.isArray(projOutcome.value?.projections)) {
          setOkrProjections(projOutcome.value.projections);
        } else {
          setOkrProjections([]);
          if (projOutcome.status === "rejected") {
            setOkrProjectionError(
              projOutcome.reason instanceof Error ? projOutcome.reason.message : "Erro ao carregar projeções"
            );
          }
        }
      } catch (err) {
        if (cancelled) return;
        setOkrObjectives([]);
        setOkrProjections(null);
        setOkrLoadError(err instanceof Error ? err.message : "Erro ao carregar OKRs");
        setOkrProjectionError(err instanceof Error ? err.message : "Erro ao carregar projeções");
      }
    }

    void loadOkrsAndProjections();
    return () => {
      cancelled = true;
    };
  }, [boardId, currentQuarter, getHeaders]);

  const okrProjectionByKrId = useMemo(() => {
    const m = new Map<string, OkrKrProjection>();
    for (const p of okrProjections ?? []) m.set(p.keyResultId, p);
    return m;
  }, [okrProjections]);

  const dailySession = useDailySession({
    boardId,
    getHeaders,
    directions,
  });

  const buckets = db.config.bucketOrder;
  const boardLabels = db.config.labels ?? EMPTY_LABELS;
  const collapsedArr = db.config.collapsedColumns;
  const collapsed = useMemo(() => new Set(collapsedArr || []), [collapsedArr]);
  const cards = db.cards;

  const moveCard = useCallback(
    (cardId: string, newBucket: string, newIndex: number) => {
      const snap = useBoardStore.getState().db;
      if (!snap) return;
      const card = snap.cards.find((c) => c.id === cardId);
      if (card) {
        const doneKeys = resolveDoneBucketKeys(
          snap.config.bucketOrder,
          snap.config.definitionOfDone?.doneBucketKeys ?? null
        );
        const dod = assertDodAllowsCompleting({
          card,
          nextBucket: newBucket,
          nextProgress: card.progress,
          doneBucketKeys: doneKeys,
          completedProgressLabel: "Concluída",
          def: snap.config.definitionOfDone,
        });
        if (!dod.ok) {
          pushToast({ kind: "error", title: dod.message });
          return;
        }
      }
      const nextCards = simulateMoveSingleCard(snap.cards, cardId, newBucket, newIndex);
      const skipWip = consumeSkipWipValidationOnce();
      if (!skipWip && !isWipSoftConfig(snap.config)) {
        const wip = validateBoardWipPutTransition(snap.config.bucketOrder, snap.cards, nextCards);
        if (!wip.ok) {
          setWipOverridePending({ mode: "single", cardId, newBucket, newIndex });
          return;
        }
      }
      const oldBucket = db.cards.find((c) => c.id === cardId)?.bucket;
      const enteredAt = new Date().toISOString();
      updateDb((d) => {
        const idx = d.cards.findIndex((c) => c.id === cardId);
        if (idx === -1) return;
        const card = d.cards[idx];
        const withoutCard = d.cards.filter((c) => c.id !== cardId);
        const bucketCards = withoutCard
          .filter((c) => c.bucket === newBucket)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        bucketCards.splice(newIndex, 0, { ...card, bucket: newBucket, columnEnteredAt: enteredAt });
        bucketCards.forEach((c, i) => {
          c.order = i;
        });
        const otherBuckets = withoutCard.filter((c) => c.bucket !== newBucket);
        d.cards = [...otherBuckets, ...bucketCards];
      });
      const buckets = [newBucket, ...(oldBucket && oldBucket !== newBucket ? [oldBucket] : [])];
      onAfterCardBucketsChange?.([...new Set(buckets)]);
    },
    [db.cards, onAfterCardBucketsChange, updateDb, pushToast]
  );

  /** Move vários cards na ordem dada para `newBucket` em `insertIndex` (0 = topo). */
  const moveCardsBatch = useCallback(
    (orderedIds: string[], newBucket: string, insertIndex: number) => {
      if (orderedIds.length === 0) return;
      const snap = useBoardStore.getState().db;
      if (!snap) return;
      const doneKeys = resolveDoneBucketKeys(
        snap.config.bucketOrder,
        snap.config.definitionOfDone?.doneBucketKeys ?? null
      );
      const def = snap.config.definitionOfDone;
      for (const id of orderedIds) {
        const card = snap.cards.find((c) => c.id === id);
        if (!card) continue;
        const dod = assertDodAllowsCompleting({
          card,
          nextBucket: newBucket,
          nextProgress: card.progress,
          doneBucketKeys: doneKeys,
          completedProgressLabel: "Concluída",
          def,
        });
        if (!dod.ok) {
          pushToast({ kind: "error", title: dod.message });
          return;
        }
      }
      const nextCards = simulateMoveCardsBatch(snap.cards, orderedIds, newBucket, insertIndex);
      const skipWip = consumeSkipWipValidationOnce();
      if (!skipWip && !isWipSoftConfig(snap.config)) {
        const wip = validateBoardWipPutTransition(snap.config.bucketOrder, snap.cards, nextCards);
        if (!wip.ok) {
          setWipOverridePending({ mode: "batch", orderedIds, newBucket, insertIndex });
          return;
        }
      }
      const idSet = new Set(orderedIds);
      const enteredAt = new Date().toISOString();
      const fromBuckets = [
        ...new Set(
          orderedIds
            .map((id) => db.cards.find((c) => c.id === id)?.bucket)
            .filter((k): k is string => Boolean(k))
        ),
      ];
      updateDb((d) => {
        const moving = orderedIds
          .map((id) => d.cards.find((c) => c.id === id))
          .filter((c): c is CardData => Boolean(c));
        if (moving.length === 0) return;
        const without = d.cards.filter((c) => !idSet.has(c.id));
        const bucketCards = without
          .filter((c) => c.bucket === newBucket)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const toInsert = moving.map((c) => ({ ...c, bucket: newBucket, columnEnteredAt: enteredAt }));
        const safeIdx = Math.max(0, Math.min(insertIndex, bucketCards.length));
        bucketCards.splice(safeIdx, 0, ...toInsert);
        bucketCards.forEach((c, i) => {
          c.order = i;
        });
        const otherBuckets = without.filter((c) => c.bucket !== newBucket);
        d.cards = [...otherBuckets, ...bucketCards];
      });
      onAfterCardBucketsChange?.([...new Set([...fromBuckets, newBucket])]);
    },
    [db.cards, onAfterCardBucketsChange, updateDb, pushToast]
  );

  const reorderColumns = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      updateDb((d) => {
        const newOrder = [...d.config.bucketOrder];
        const [removed] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, removed);
        d.config.bucketOrder = newOrder;
      });
      onAfterColumnReorder?.();
    },
    [onAfterColumnReorder, updateDb]
  );

  const saveColumn = useCallback(
    (opts?: { wipLimit?: number | null; policy?: string | null }) => {
      const wipLimit = opts?.wipLimit;
      const policyRaw = opts?.policy;
      const policyTrim = typeof policyRaw === "string" ? policyRaw.trim().slice(0, 500) : "";
      const label = newColumnName.trim() || "Nova Coluna";
      if (editingColumnKey) {
        updateDb((d) => {
          d.config.bucketOrder = d.config.bucketOrder.map((b) => {
            if (b.key !== editingColumnKey) return b;
            const next = { ...b, label } as typeof b & { policy?: string };
            if (wipLimit === null) {
              delete (next as { wipLimit?: number }).wipLimit;
            } else if (typeof wipLimit === "number" && wipLimit >= 1 && wipLimit <= 999) {
              (next as { wipLimit?: number }).wipLimit = wipLimit;
            }
            if (!policyTrim) {
              delete next.policy;
            } else {
              next.policy = policyTrim;
            }
            return next;
          });
        });
      } else {
        const key = `col_${Date.now()}`;
        const color = COLUMN_COLORS[buckets.length % COLUMN_COLORS.length];
        updateDb((d) => {
          const row: { key: string; label: string; color: string; wipLimit?: number; policy?: string } = {
            key,
            label,
            color,
          };
          if (typeof wipLimit === "number" && wipLimit >= 1 && wipLimit <= 999) row.wipLimit = wipLimit;
          if (policyTrim) row.policy = policyTrim;
          d.config.bucketOrder.push(row);
        });
      }
      setNewColumnName("");
      setAddColumnOpen(false);
      setEditingColumnKey(null);
    },
    [buckets.length, editingColumnKey, newColumnName, updateDb, setAddColumnOpen, setEditingColumnKey, setNewColumnName]
  );

  const deleteColumn = useCallback(
    (key: string) => {
      const fallbackKey = buckets.find((b) => b.key !== key)?.key;
      updateDb((d) => {
        d.cards.forEach((c) => {
          if (c.bucket === key && fallbackKey) c.bucket = fallbackKey;
        });
        d.config.bucketOrder = d.config.bucketOrder.filter((b) => b.key !== key);
        d.config.collapsedColumns = (d.config.collapsedColumns || []).filter((k) => k !== key);
      });
      setConfirmDelete(null);
    },
    [buckets, updateDb, setConfirmDelete]
  );

  const toggleCollapsed = useCallback(
    (key: string) => {
      updateDb((d) => {
        const next = new Set(d.config.collapsedColumns || []);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        d.config.collapsedColumns = [...next];
      });
    },
    [updateDb]
  );

  const createLabel = useCallback(
    (label: string) => {
      const normalized = label.trim();
      if (!normalized) return;
      updateDb((d) => {
        const current = d.config.labels ?? [];
        if (current.some((l) => l.toLowerCase() === normalized.toLowerCase())) return;
        d.config.labels = [...current, normalized];
      });
    },
    [updateDb]
  );

  const deleteLabel = useCallback(
    (label: string) => {
      updateDb((d) => {
        const current = d.config.labels ?? [];
        if (!current.includes(label)) return;
        d.cards.forEach((c) => {
          c.tags = c.tags.filter((t) => t !== label);
        });
        d.config.labels = current.filter((l) => l !== label);
      });
      const prevLabels = useFilterStore.getState().filtersByBoard[boardId]?.activeLabels ?? [];
      useFilterStore.getState().patchFilters(boardId, {
        activeLabels: prevLabels.filter((l) => l !== label),
      });
    },
    [boardId, updateDb]
  );

  const handleTimelineDueDate = useCallback(
    (cardId: string, nextDue: string) => {
      updateDb((d) => {
        const c = d.cards.find((x) => x.id === cardId);
        if (c) c.dueDate = nextDue;
      });
    },
    [updateDb]
  );

  const handleTimelineOpenCard = useCallback((card: CardData) => {
    setModalCard(card);
    setModalMode("edit");
  }, []);

  const duplicateCard = useCallback(
    (cardId: string) => {
      const copySuffix = t("card.quickActions.copyTitleSuffix");
      updateDb((d) => {
        const source = d.cards.find((c) => c.id === cardId);
        if (!source) return;
        const newId = nextBoardCardId(d.cards.map((c) => c.id));
        const titleBase = String(source.title || "").trim();
        const dup: CardData = {
          ...source,
          id: newId,
          title: titleBase ? `${titleBase} ${copySuffix}` : copySuffix,
          blockedBy: [],
        };
        const bucketCards = d.cards
          .filter((c) => c.bucket === source.bucket)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        bucketCards.push(dup);
        bucketCards.forEach((c, i) => {
          c.order = i;
        });
        const otherBuckets = d.cards.filter((c) => c.bucket !== source.bucket);
        d.cards = [...otherBuckets, ...bucketCards];
      });
    },
    [updateDb, t]
  );

  const patchCardFromTable = useCallback(
    (
      cardId: string,
      patch: Partial<Pick<CardData, "title" | "priority" | "dueDate" | "bucket" | "tags">>
    ) => {
      const snap = useBoardStore.getState().db;
      if (!snap) return;
      if (patch.bucket !== undefined) {
        const card = snap.cards.find((c) => c.id === cardId);
        if (card && patch.bucket !== card.bucket) {
          const doneKeys = resolveDoneBucketKeys(
            snap.config.bucketOrder,
            snap.config.definitionOfDone?.doneBucketKeys ?? null
          );
          const dod = assertDodAllowsCompleting({
            card,
            nextBucket: patch.bucket,
            nextProgress: card.progress,
            doneBucketKeys: doneKeys,
            completedProgressLabel: "Concluída",
            def: snap.config.definitionOfDone,
          });
          if (!dod.ok) {
            pushToast({ kind: "error", title: dod.message });
            return;
          }
          const nextCards = simulatePatchBucketMove(snap.cards, cardId, patch.bucket);
          const skipWip = consumeSkipWipValidationOnce();
          if (!skipWip && !isWipSoftConfig(snap.config)) {
            const wip = validateBoardWipPutTransition(snap.config.bucketOrder, snap.cards, nextCards);
            if (!wip.ok) {
              const inTarget = nextCards.filter((c) => c.bucket === patch.bucket).length;
              setWipOverridePending({
                mode: "single",
                cardId,
                newBucket: patch.bucket,
                newIndex: Math.max(0, inTarget - 1),
              });
              return;
            }
          }
        }
      }
      updateDb((d) => {
        const idx = d.cards.findIndex((c) => c.id === cardId);
        if (idx === -1) return;
        const card = d.cards[idx];
        const targetBucket = patch.bucket !== undefined ? patch.bucket : card.bucket;

        if (patch.bucket !== undefined && patch.bucket !== card.bucket) {
          const withoutCard = d.cards.filter((c) => c.id !== cardId);
          const bucketCards = withoutCard
            .filter((c) => c.bucket === targetBucket)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const merged: CardData = { ...card };
          if (patch.title !== undefined) merged.title = patch.title;
          if (patch.priority !== undefined) merged.priority = patch.priority;
          if (patch.dueDate !== undefined) merged.dueDate = patch.dueDate;
          if (patch.tags !== undefined) merged.tags = patch.tags;
          merged.bucket = targetBucket;
          merged.columnEnteredAt = new Date().toISOString();
          const doneKeys = resolveDoneBucketKeys(
            d.config.bucketOrder,
            d.config.definitionOfDone?.doneBucketKeys ?? null
          );
          if (doneKeys.includes(targetBucket)) {
            merged.progress = "Concluída";
            merged.completedAt = new Date().toISOString();
          }
          bucketCards.push(merged);
          bucketCards.forEach((c, i) => {
            c.order = i;
          });
          const otherBuckets = withoutCard.filter((c) => c.bucket !== targetBucket);
          d.cards = [...otherBuckets, ...bucketCards];
          return;
        }

        if (patch.title !== undefined) card.title = patch.title;
        if (patch.priority !== undefined) card.priority = patch.priority;
        if (patch.dueDate !== undefined) card.dueDate = patch.dueDate;
        if (patch.tags !== undefined) card.tags = patch.tags;
      });
    },
    [updateDb, pushToast]
  );

  const pinCardToTop = useCallback(
    (cardId: string) => {
      updateDb((d) => {
        const idx = d.cards.findIndex((c) => c.id === cardId);
        if (idx === -1) return;
        const card = d.cards[idx];
        const bucket = card.bucket;
        const without = d.cards.filter((c) => c.id !== cardId);
        const bucketCards = without
          .filter((c) => c.bucket === bucket)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        bucketCards.unshift({ ...card, bucket });
        bucketCards.forEach((c, i) => {
          c.order = i;
        });
        const otherBuckets = without.filter((c) => c.bucket !== bucket);
        d.cards = [...otherBuckets, ...bucketCards];
      });
    },
    [updateDb]
  );

  const { directionCounts, totalWithDir } = useMemo(() => {
    const acc: Record<string, number> = {};
    let total = 0;
    for (const c of cards) {
      if (!c.direction) continue;
      const key = c.direction.toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
      total += 1;
    }
    return { directionCounts: acc, totalWithDir: total };
  }, [cards]);

  const executionInsights = useMemo(() => {
    const inProgress = cards.filter((c) => c.progress === "Em andamento").length;
    const done = cards.filter((c) => c.progress === "Concluída").length;
    const urgent = cards.filter((c) => c.priority === "Urgente").length;
    const overdue = cards.filter((c) => {
      const days = daysUntilDueDate(c.dueDate);
      return days !== null && days < 0 && c.progress !== "Concluída";
    }).length;
    const dueSoon = cards.filter((c) => {
      const days = daysUntilDueDate(c.dueDate);
      return days !== null && days >= 0 && days <= 3 && c.progress !== "Concluída";
    }).length;
    const doneRate = cards.length > 0 ? Math.round((done / cards.length) * 100) : 0;

    const priorityWeight: Record<string, number> = { Urgente: 4, Importante: 2, "Média": 1 };
    const progressWeight: Record<string, number> = { "Não iniciado": 2, "Em andamento": 3, "Concluída": 0 };
    const nextActions = [...cards]
      .filter((c) => c.progress !== "Concluída")
      .map((c) => {
        const due = daysUntilDueDate(c.dueDate);
        const dueScore = due === null ? 0 : due < 0 ? 5 : due <= 2 ? 4 : due <= 5 ? 2 : 1;
        const score =
          (priorityWeight[c.priority] ?? 1) +
          (progressWeight[c.progress] ?? 1) +
          dueScore +
          (c.direction === "priorizar" ? 2 : 0);
        return { card: c, score, due };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const wipRiskColumns = buckets
      .map((bucket) => {
        const count = cards.filter((c) => c.bucket === bucket.key && c.progress === "Em andamento").length;
        return { key: bucket.key, label: bucket.label, count };
      })
      .filter((entry) => entry.count >= 4)
      .sort((a, b) => b.count - a.count);

    return { inProgress, doneRate, urgent, overdue, dueSoon, nextActions, wipRiskColumns };
  }, [cards, buckets]);

  const okrsComputed = useMemo(() => {
    const bucketKeys = new Set<string>(
      (db.config?.bucketOrder || [])
        .map((b: { key?: string }) => String(b?.key || ""))
        .filter((k) => typeof k === "string" && k.trim().length > 0)
    );

    return computeOkrsProgress({ cards, objectives: okrObjectives, bucketKeys });
  }, [cards, okrObjectives, db.config?.bucketOrder]);

  const handleExportCSV = useCallback(() => {
    const sep = ";";
    const nl = "\r\n";
    const hdr = [
      "ID",
      "Coluna",
      "Prioridade",
      "Progresso",
      "Título",
      "Descrição",
      "Rótulos",
      "Direcionamento",
      "Data de Conclusão",
    ];
    let csv = hdr.join(sep) + nl;
    cards.forEach((c) => {
      csv +=
        [
          c.id,
          c.bucket,
          c.priority,
          c.progress,
          `"${(c.title || "").replace(/"/g, '""')}"`,
          `"${(c.desc || "").replace(/"/g, '""')}"`,
          `"${(c.tags || []).join(", ")}"`,
          c.direction || "",
          c.dueDate || "",
        ].join(sep) + nl;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "flux-board-export.csv";
    a.click();
  }, [cards]);

  const handleExportCsvRef = useRef(handleExportCSV);
  handleExportCsvRef.current = handleExportCSV;

  const handleImportCSV = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        let raw = (ev.target?.result as string) || "";
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
        const rows = raw.split(/\r?\n/).filter((r) => r.trim());
        if (rows.length < 2) {
          pushToast({ kind: "error", title: t("csvImport.toasts.emptyCsv") });
          return;
        }
        const parseRow = (line: string) => {
          const r: string[] = [];
          let c = "";
          let q = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') q = !q;
            else if (!q && (ch === ";" || ch === ",")) {
              r.push(c);
              c = "";
            } else c += ch;
          }
          r.push(c);
          return r;
        };
        const hdr = parseRow(rows[0])
          .map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
        const idx: Record<string, number> = {};
        hdr.forEach((h, i) => (idx[h] = i));
        const iT = idx["titulo"] ?? idx["título"] ?? -1;
        if (iT === -1) {
          pushToast({ kind: "error", title: t("csvImport.toasts.missingTitleColumn") });
          return;
        }
        const nc: CardData[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = parseRow(rows[i]);
          if (row.length < 2) continue;
          const g = (k: number) => (k >= 0 && row[k] !== undefined ? String(row[k]).trim() : "");
          const tagsRaw = g(idx["rotulos"] ?? idx["rótulos"] ?? -1);
          const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];
          const bucketRaw = g(idx["coluna"] ?? -1) || "Backlog";
          const bucket =
            buckets.find((b) => b.key === bucketRaw || b.label === bucketRaw)?.key || "Backlog";
          let dirVal = g(idx["direcionamento"] ?? -1);
          dirVal =
            dirVal && directions.map((d) => d.toLowerCase()).includes(dirVal.toLowerCase())
              ? dirVal.toLowerCase()
              : "";
          const prioVal = g(idx["prioridade"] ?? -1) || "Média";
          const prio = priorities.find((p) => p.toLowerCase() === prioVal.toLowerCase()) || "Média";
          const progVal = g(idx["progresso"] ?? -1) || "Não iniciado";
          const prog = progresses.find((p) => p.toLowerCase() === progVal.toLowerCase()) || "Não iniciado";
          nc.push({
            id: g(idx["id"] ?? -1) || `IMP-${i}`,
            bucket,
            priority: prio,
            progress: prog,
            title: g(iT),
            desc: g(idx["descricao"] ?? idx["descrição"] ?? -1) || "",
            tags,
            direction: dirVal || null,
            dueDate: g(idx["data de conclusao"] ?? idx["data de conclusão"] ?? idx["duedate"] ?? -1) || null,
            order: i - 1,
          });
        }
        if (!nc.length) {
          pushToast({ kind: "error", title: t("csvImport.toasts.noCards") });
          return;
        }
        const mode = csvImportMode;
        let sameIdCount = 0;
        if (mode === "merge") {
          const existingIds = new Set(cards.map((c) => c.id));
          sameIdCount = nc.filter((c) => existingIds.has(c.id)).length;
        }
        setCsvImportConfirm({ count: nc.length, cards: nc, mode, sameIdCount });
      };
      reader.readAsText(file, "UTF-8");
      e.target.value = "";
    },
    [buckets, cards, csvImportMode, directions, priorities, progresses, pushToast, t]
  );

  const confirmCsvImport = useCallback(() => {
    if (!csvImportConfirm) return;
    const imported = csvImportConfirm.cards.map((c) => ({ ...c }));
    const count = csvImportConfirm.count;
    const mode = csvImportConfirm.mode;

    if (mode === "replace") {
      const ordByBucket: Record<string, number> = {};
      imported.forEach((card) => {
        const bk = card.bucket;
        ordByBucket[bk] = ordByBucket[bk] || 0;
        card.order = ordByBucket[bk]++;
      });
      updateDb((d) => {
        d.cards = imported;
      });
    } else {
      updateDb((d) => {
        const prevCards = Array.isArray(d.cards) ? d.cards : [];
        const configKeys = Array.isArray(d.config.bucketOrder) ? d.config.bucketOrder.map((b) => b.key) : [];
        const prevExtraKeys = Array.from(new Set(prevCards.map((c) => c.bucket))).filter(
          (k) => !configKeys.includes(k)
        );
        const importedExtraKeys = Array.from(new Set(imported.map((c) => c.bucket))).filter(
          (k) => !configKeys.includes(k) && !prevExtraKeys.includes(k)
        );
        const bucketKeys = [...configKeys, ...prevExtraKeys, ...importedExtraKeys];

        const nextCards: CardData[] = [];
        bucketKeys.forEach((bucketKey) => {
          const existingInBucket = prevCards
            .filter((c) => c.bucket === bucketKey)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((c) => ({ ...c }));

          const idxById = new Map<string, number>(existingInBucket.map((c, i) => [c.id, i]));

          imported
            .filter((c) => c.bucket === bucketKey)
            .forEach((ic) => {
              const idx = idxById.get(ic.id);
              if (idx !== undefined) {
                existingInBucket[idx] = { ...existingInBucket[idx], ...ic };
              } else {
                existingInBucket.push({ ...ic });
              }
            });

          existingInBucket.forEach((c, i) => {
            c.order = i;
          });

          nextCards.push(...existingInBucket);
        });

        d.cards = nextCards;
      });
    }

    setCsvImportConfirm(null);
    pushToast({
      kind: "success",
      title:
        mode === "merge"
          ? t("csvImportConfirm.toasts.mergeSuccess", { count })
          : t("csvImportConfirm.toasts.replaceSuccess", { count }),
    });
  }, [csvImportConfirm, pushToast, t, updateDb]);

  const shouldIgnorePanStart = useCallback((target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return true;
    if (
      el.closest(
        'button, a, input, textarea, select, option, [role="button"], [contenteditable="true"], .cursor-grab, .cursor-grabbing'
      )
    ) {
      return true;
    }
    return false;
  }, []);

  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const scroller = boardScrollRef.current;
      if (!scroller) return;
      if (e.target !== e.currentTarget) return;
      if (shouldIgnorePanStart(e.target)) return;

      panRef.current.active = true;
      panRef.current.pointerId = e.pointerId;
      panRef.current.startX = e.clientX;
      panRef.current.startY = e.clientY;
      panRef.current.startScrollLeft = scroller.scrollLeft;
      panRef.current.startScrollTop = scroller.scrollTop;
      panRef.current.moved = false;
      setIsPanning(true);

      scroller.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [shouldIgnorePanStart]
  );

  const handlePanPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const scroller = boardScrollRef.current;
    if (!scroller) return;
    if (!panRef.current.active) return;
    if (panRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    if (!panRef.current.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) panRef.current.moved = true;

    scroller.scrollLeft = panRef.current.startScrollLeft - dx;
    scroller.scrollTop = panRef.current.startScrollTop - dy;
    e.preventDefault();
  }, []);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const scroller = boardScrollRef.current;
    if (!scroller) return;
    if (!panRef.current.active) return;
    if (panRef.current.pointerId !== e.pointerId) return;

    panRef.current.active = false;
    panRef.current.pointerId = null;
    setIsPanning(false);
    try {
      scroller.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    registerCsvExportHandler(() => handleExportCsvRef.current());
    return () => registerCsvExportHandler(null);
  }, []);

  moveCardRef.current = moveCard;
  moveCardsBatchRef.current = moveCardsBatch;

  const confirmWipOverride = useCallback(
    (reason: string) => {
      const p = wipOverridePending;
      const trimmed = reason.trim();
      if (!p || trimmed.length < 8) return;
      setPendingWipOverrideReason(trimmed);
      armSkipWipValidationOnce();
      setWipOverridePending(null);
      queueMicrotask(() => {
        if (p.mode === "single") moveCardRef.current(p.cardId, p.newBucket, p.newIndex);
        else moveCardsBatchRef.current(p.orderedIds, p.newBucket, p.insertIndex);
      });
    },
    [wipOverridePending]
  );

  const dismissWipOverride = useCallback(() => setWipOverridePending(null), []);

  return {
    boardScrollRef,
    isPanning,
    handlePanPointerDown,
    handlePanPointerMove,
    endPan,
    buckets,
    boardLabels,
    collapsed,
    cards,
    modalCard,
    setModalCard,
    modalMode,
    setModalMode,
    mapaOpen,
    setMapaOpen,
    confirmDelete,
    setConfirmDelete,
    addColumnOpen,
    setAddColumnOpen,
    newColumnName,
    setNewColumnName,
    editingColumnKey,
    setEditingColumnKey,
    descModalCard,
    setDescModalCard,
    csvImportMode,
    setCsvImportMode,
    csvImportConfirm,
    setCsvImportConfirm,
    confirmCsvImport,
    currentQuarter,
    okrObjectives,
    okrLoadError,
    okrProjectionError,
    okrProjectionByKrId,
    okrsComputed,
    dailySession,
    moveCard,
    moveCardsBatch,
    reorderColumns,
    saveColumn,
    deleteColumn,
    toggleCollapsed,
    createLabel,
    deleteLabel,
    handleTimelineDueDate,
    handleTimelineOpenCard,
    duplicateCard,
    patchCardFromTable,
    pinCardToTop,
    directionCounts,
    totalWithDir,
    executionInsights,
    handleExportCSV,
    handleImportCSV,
    wipOverridePending,
    confirmWipOverride,
    dismissWipOverride,
  };
}
