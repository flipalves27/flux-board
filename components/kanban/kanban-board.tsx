"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { CardModal } from "./card-modal";
import { MapaModal } from "./mapa-modal";
import { DescModal } from "./desc-modal";
import { DailyInsightsPanel } from "./DailyInsightsPanel";
import type { BoardData, CardData } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";
import { useTranslations } from "next-intl";
import { useDailySession } from "./hooks/useDailySession";

interface KanbanBoardProps {
  db: BoardData;
  updateDb: (updater: (prev: BoardData) => BoardData) => void;
  boardName: string;
  boardId: string;
  getHeaders: () => Record<string, string>;
  filterLabels: string[];
  priorities: string[];
  progresses: string[];
  directions: string[];
}

const KANBAN_FILTERS_STORAGE_PREFIX = "flux.kanban.filters:";

const DIR_COLORS: Record<string, string> = {
  manter: "#059669",
  priorizar: "#009E90",
  adiar: "#F59E0B",
  cancelar: "#EF4444",
  reavaliar: "#6B7280",
};

type SavedKanbanFilters = {
  activePrio: string;
  activeLabels: string[];
  searchQuery: string;
};

function daysUntilDueDate(date: string | null): number | null {
  if (!date) return null;
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

export function KanbanBoard({
  db,
  updateDb,
  boardName,
  boardId,
  getHeaders,
  filterLabels,
  priorities,
  progresses,
  directions,
}: KanbanBoardProps) {
  const t = useTranslations("kanban");
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

  const [activePrio, setActivePrio] = useState("all");
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [modalCard, setModalCard] = useState<CardData | null>(null);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [mapaOpen, setMapaOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "card" | "bucket";
    id: string;
    label: string;
  } | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [descModalCard, setDescModalCard] = useState<CardData | null>(null);
  const [priorityBarVisible, setPriorityBarVisible] = useState(true);
  const dailySession = useDailySession({
    db,
    updateDb,
    boardId,
    getHeaders,
    directions,
  });

  const {
    dailyOpen,
    closeDailyModal,
    openDailyModal,
    startNewDaily,
    dailyTab,
    openHistoryTab,
    openStatusTab,
    dailyGenerating,
    dailyStatusPhase,
    statusStepIndex,
    dailyLogs,
    dailyTranscript,
    setDailyTranscript,
    dailyFileName,
    dailySourceFileName,
    dailyInsights,
    filteredDailyInsights,
    activeDailyHistoryId,
    activeCreatedCardsExpandedId,
    dailyHistoryDateFrom,
    setDailyHistoryDateFrom,
    dailyHistoryDateTo,
    setDailyHistoryDateTo,
    dailyHistorySearchQuery,
    setDailyHistorySearchQuery,
    clearDailyHistoryFilters,
    onToggleDailyHistoryExpanded,
    onCollapseDailyHistoryExpanded,
    expandDailyHistoryCreatedCards,
    loadDailyTranscriptFile,
    clearDailyAttachmentAndTranscript,
    onGenerateDailyInsight,
    clearDailyLogs,
    onOpenDailyHistoryFromStatusEntry,
    slugDaily,
    onDownloadDailyContextDoc,
    onCopyDailyContextDoc,
    onCreateCardsFromInsight,
    dailyDeleteConfirmId,
    requestDeleteDailyHistoryEntry,
    cancelDeleteDailyHistoryEntry,
    confirmDeleteDailyHistoryEntry,
  } = dailySession;

  const { pushToast } = useToast();
  const [csvImportMode, setCsvImportMode] = useState<"replace" | "merge">("replace");
  const [csvImportConfirm, setCsvImportConfirm] = useState<{
    count: number;
    cards: CardData[];
    mode: "replace" | "merge";
    sameIdCount: number;
  } | null>(null);
  const anyConfirmOpen = Boolean(dailyDeleteConfirmId || csvImportConfirm);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const addColumnDialogRef = useRef<HTMLDivElement | null>(null);
  const addColumnInputRef = useRef<HTMLInputElement | null>(null);
  useModalA11y({
    open: addColumnOpen,
    onClose: () => setAddColumnOpen(false),
    containerRef: addColumnDialogRef,
    initialFocusRef: addColumnInputRef,
  });

  const confirmDeleteDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmDeleteCancelRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({
    open: Boolean(confirmDelete),
    onClose: () => setConfirmDelete(null),
    containerRef: confirmDeleteDialogRef,
    initialFocusRef: confirmDeleteCancelRef,
  });

  const dailyDialogRef = useRef<HTMLDivElement | null>(null);
  const dailyCloseRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({
    open: dailyOpen && !anyConfirmOpen,
    onClose: closeDailyModal,
    containerRef: dailyDialogRef,
    initialFocusRef: dailyCloseRef,
  });

  const buckets = db.config.bucketOrder;
  const boardLabels =
    db.config.labels && db.config.labels.length > 0 ? db.config.labels : filterLabels;
  const collapsed = new Set(db.config.collapsedColumns || []);
  const cards = db.cards;
  const filtersStorageKey = `${KANBAN_FILTERS_STORAGE_PREFIX}${boardId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(filtersStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedKanbanFilters;
      if (typeof parsed.activePrio === "string") setActivePrio(parsed.activePrio);
      if (Array.isArray(parsed.activeLabels)) {
        setActiveLabels(new Set(parsed.activeLabels.filter((item) => typeof item === "string")));
      }
      if (typeof parsed.searchQuery === "string") setSearchQuery(parsed.searchQuery);
    } catch {
      // ignore storage parsing errors
    }
  }, [filtersStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: SavedKanbanFilters = {
      activePrio,
      activeLabels: [...activeLabels],
      searchQuery,
    };
    window.localStorage.setItem(filtersStorageKey, JSON.stringify(payload));
  }, [activePrio, activeLabels, searchQuery, filtersStorageKey]);

  useEffect(() => {
    const stillFocused = activePrio === "Urgente" && activeLabels.size === 0 && searchQuery === "andamento";
    if (!stillFocused && focusMode) setFocusMode(false);
  }, [activePrio, activeLabels, searchQuery, focusMode]);

  const clearFilters = useCallback(() => {
    setActivePrio("all");
    setActiveLabels(new Set());
    setSearchQuery("");
    setFocusMode(false);
  }, []);

  const applyFocusMode = useCallback(() => {
    setActivePrio("Urgente");
    setActiveLabels(new Set());
    setSearchQuery("andamento");
  }, []);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (ev.key === "/" && !isTypingTarget) {
        ev.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if ((ev.key === "f" || ev.key === "F") && !isTypingTarget) {
        ev.preventDefault();
        setFocusMode((prev) => {
          if (prev) {
            clearFilters();
            return false;
          }
          applyFocusMode();
          return true;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyFocusMode, clearFilters]);

  const filterCard = useCallback(
    (c: CardData) => {
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
    },
    [activePrio, activeLabels, searchQuery]
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

  const COLUMN_COLORS = ["#9B97C2", "#6C5CE7", "#00D2D3", "#FDA7DF", "#FFD93D", "#00E676", "#74B9FF", "#E056A0"];
  const saveColumn = () => {
    const label = newColumnName.trim() || "Nova Coluna";
    if (editingColumnKey) {
      // Renomear coluna existente
      updateDb((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          bucketOrder: prev.config.bucketOrder.map((b) =>
            b.key === editingColumnKey ? { ...b, label } : b
          ),
        },
      }));
    } else {
      // Criar nova coluna
      const key = `col_${Date.now()}`;
      const color = COLUMN_COLORS[buckets.length % COLUMN_COLORS.length];
      updateDb((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          bucketOrder: [...prev.config.bucketOrder, { key, label, color }],
        },
      }));
    }
    setNewColumnName("");
    setAddColumnOpen(false);
    setEditingColumnKey(null);
  };

  const deleteColumn = (key: string) => {
    const fallbackKey = buckets.find((b) => b.key !== key)?.key;
    updateDb((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.bucket === key && fallbackKey ? { ...c, bucket: fallbackKey } : c)),
      config: {
        ...prev.config,
        bucketOrder: prev.config.bucketOrder.filter((b) => b.key !== key),
        collapsedColumns: (prev.config.collapsedColumns || []).filter((k) => k !== key),
      },
    }));
    setConfirmDelete(null);
  };

  const toggleCollapsed = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateDb((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        collapsedColumns: [...next],
      },
    }));
  };

  const toggleLabel = (label: string) => {
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const createLabel = (label: string) => {
    const normalized = label.trim();
    if (!normalized) return;
    updateDb((prev) => {
      const current = prev.config.labels && prev.config.labels.length > 0 ? prev.config.labels : filterLabels;
      if (current.some((l) => l.toLowerCase() === normalized.toLowerCase())) return prev;
      return {
        ...prev,
        config: {
          ...prev.config,
          labels: [...current, normalized],
        },
      };
    });
  };

  const deleteLabel = (label: string) => {
    updateDb((prev) => {
      const current = prev.config.labels && prev.config.labels.length > 0 ? prev.config.labels : filterLabels;
      if (!current.includes(label)) return prev;
      return {
        ...prev,
        cards: prev.cards.map((c) => ({
          ...c,
          tags: c.tags.filter((t) => t !== label),
        })),
        config: {
          ...prev.config,
          labels: current.filter((l) => l !== label),
        },
      };
    });
    setActiveLabels((prev) => {
      const next = new Set(prev);
      next.delete(label);
      return next;
    });
  };

  const moveCard = (cardId: string, newBucket: string, newIndex: number) => {
    updateDb((prev) => {
      const card = prev.cards.find((c) => c.id === cardId);
      if (!card) return prev;
      const withoutCard = prev.cards.filter((c) => c.id !== cardId);
      const bucketCards = withoutCard
        .filter((c) => c.bucket === newBucket)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      bucketCards.splice(newIndex, 0, { ...card, bucket: newBucket });
      bucketCards.forEach((c, i) => (c.order = i));
      const otherBuckets = withoutCard.filter((c) => c.bucket !== newBucket);
      return { ...prev, cards: [...otherBuckets, ...bucketCards] };
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    updateDb((prev) => {
      const newOrder = [...prev.config.bucketOrder];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return { ...prev, config: { ...prev.config, bucketOrder: newOrder } };
    });
  };

  const parseSlotId = (id: string): { bucketKey: string; index: number } | null => {
    if (!id.startsWith("slot-")) return null;
    const rest = id.slice(5);
    const lastDash = rest.lastIndexOf("-");
    if (lastDash === -1) return null;
    const bucketKey = rest.slice(0, lastDash);
    const index = parseInt(rest.slice(lastDash + 1), 10);
    if (isNaN(index) || index < 0) return null;
    return { bucketKey, index };
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const overId = String(over.id);
    const activeId = String(active.id);

    // Coluna sendo arrastada
    const colIndex = buckets.findIndex((b) => b.key === activeId);
    if (colIndex >= 0) {
      const overColIndex = buckets.findIndex((b) => b.key === overId);
      if (overColIndex >= 0 && overColIndex !== colIndex) {
        reorderColumns(colIndex, overColIndex);
      }
      return;
    }

    // Card sendo arrastado
    if (activeId.startsWith("card-")) {
      const cardId = activeId.replace("card-", "");
      const slotInfo = parseSlotId(overId);
      if (slotInfo) {
        const card = cards.find((c) => c.id === cardId);
        const sameBucket = card?.bucket === slotInfo.bucketKey;
        const dragIndex = card ? getCardsByBucket(card.bucket).findIndex((c) => c.id === cardId) : -1;
        let insertIndex = slotInfo.index;
        if (sameBucket && dragIndex >= 0 && dragIndex < insertIndex) insertIndex--;
        moveCard(cardId, slotInfo.bucketKey, insertIndex);
        return;
      }
      if (overId.startsWith("bucket-")) {
        const newBucket = overId.replace("bucket-", "");
        const bucketCards = getCardsByBucket(newBucket).filter((c) => c.id !== cardId);
        moveCard(cardId, newBucket, bucketCards.length);
      }
    }
  };

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
        const count = getCardsByBucket(bucket.key).filter((c) => c.progress === "Em andamento").length;
        return { key: bucket.key, label: bucket.label, count };
      })
      .filter((entry) => entry.count >= 4)
      .sort((a, b) => b.count - a.count);

    return { inProgress, doneRate, urgent, overdue, dueSoon, nextActions, wipRiskColumns };
  }, [cards, buckets, getCardsByBucket]);

  const handleExportCSV = () => {
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
      csv += [
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
    a.download = "backlog_reborn_export.csv";
    a.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const hdr = parseRow(rows[0]).map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const idx: Record<string, number> = {};
      hdr.forEach((h, i) => (idx[h] = i));
      const iT = idx["titulo"] ?? idx["título"] ?? -1;
      if (iT === -1) {
        pushToast({ kind: "error", title: t("csvImport.toasts.missingTitleColumn") });
        return;
      }
      const nc: CardData[] = [];
      for (let i = 1; i < rows.length; i++) {
        const c = parseRow(rows[i]);
        if (c.length < 2) continue;
        const g = (k: number) => (k >= 0 && c[k] !== undefined ? String(c[k]).trim() : "");
        const tagsRaw = g(idx["rotulos"] ?? idx["rótulos"] ?? -1);
        const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [];
        const bucketRaw = g(idx["coluna"] ?? -1) || "Backlog";
        const bucket = buckets.find((b) => b.key === bucketRaw || b.label === bucketRaw)?.key || "Backlog";
        let dirVal = g(idx["direcionamento"] ?? -1);
        dirVal = dirVal && directions.map((d) => d.toLowerCase()).includes(dirVal.toLowerCase()) ? dirVal.toLowerCase() : "";
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
  };

  const activeCard = activeId && activeId.startsWith("card-")
    ? cards.find((c) => c.id === activeId.replace("card-", ""))
    : null;

  const shouldIgnorePanStart = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return true;
    // Não iniciar pan quando o usuário está interagindo com controles ou com elementos do DnD.
    if (
      el.closest(
        'button, a, input, textarea, select, option, [role="button"], [contenteditable="true"], .cursor-grab, .cursor-grabbing'
      )
    ) {
      return true;
    }
    return false;
  };

  const handlePanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const scroller = boardScrollRef.current;
    if (!scroller) return;
    // Só inicia o "pan" quando o clique começa no fundo do board (não dentro de colunas/cards).
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
    // Evita seleção de texto enquanto arrasta.
    e.preventDefault();
  };

  const handlePanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
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
  };

  return (
    <>
      <div
        className="bg-[var(--flux-surface-mid)] border-b border-[rgba(108,92,231,0.15)] sticky top-[42px] z-[150] shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: priorityBarVisible ? "260px" : "44px" }}
      >
        <div className="w-full px-5 sm:px-6 lg:px-8 flex items-center gap-1.5 min-h-[44px] py-1.5 flex-wrap">
          <CustomTooltip
            content={priorityBarVisible ? t("board.filters.hideTooltip") : t("board.filters.showTooltip")}
            position="bottom"
          >
            <button
              type="button"
              onClick={() => setPriorityBarVisible((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--flux-rad-sm)] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.08)] transition-all duration-200 font-display group shrink-0"
              aria-label={priorityBarVisible ? t("board.filters.hideTooltip") : t("board.filters.showTooltip")}
            >
              <span className="text-xs font-semibold uppercase tracking-wider">{t("board.filters.title")}</span>
              <span
                className={`inline-block text-[10px] transition-transform duration-300 ease-out ${priorityBarVisible ? "rotate-0" : "-rotate-90"}`}
                aria-hidden
              >
                ▼
              </span>
            </button>
          </CustomTooltip>
          {priorityBarVisible && (
            <>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider font-display shrink-0">
                  {t("board.filters.priorityLabel")}
                </span>
                {["all", ...priorities].map((p) => (
                  <button
                    key={p}
                    onClick={() => setActivePrio(p)}
                    className={`btn-pill-compact transition-all duration-200 shrink-0 ${
                      activePrio === p
                        ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                        : "bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.1)]"
                    }`}
                  >
                    {p === "all" ? t("board.filters.allLabel") : t(`cardModal.options.priority.${p}`)}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-[rgba(255,255,255,0.1)] shrink-0" />
              <button
                onClick={() => {
                  if (focusMode) clearFilters();
                  else {
                    applyFocusMode();
                    setFocusMode(true);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border transition-all duration-200 font-display shrink-0 ${
                  focusMode
                    ? "border-[var(--flux-secondary)] bg-[rgba(0,210,211,0.14)] text-[var(--flux-secondary)]"
                    : "border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] hover:border-[var(--flux-secondary)] hover:text-[var(--flux-secondary)]"
                }`}
                title={t("board.filters.shortcutTitle")}
              >
                {focusMode ? t("board.filters.focusModeOn") : t("board.filters.focusModeOff")}
              </button>
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 font-display shrink-0"
              >
                {t("board.filters.clear")}
              </button>
              <button
                onClick={() => setLabelsOpen(!labelsOpen)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border transition-all duration-200 border-[var(--flux-primary)] bg-[rgba(108,92,231,0.12)] text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.2)] font-display shrink-0"
              >
                <span>{t("board.filters.labelsButton")}</span>
                <span className={`transition-transform duration-200 ${labelsOpen ? "rotate-180" : ""}`}>▼</span>
              </button>
              <button
                onClick={() => setMapaOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] hover:bg-[var(--flux-surface-elevated)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 font-display shrink-0"
              >
                {t("board.filters.mapButton")}
              </button>
              <button
                onClick={openDailyModal}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] hover:bg-[var(--flux-surface-elevated)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 font-display shrink-0"
              >
                {t("board.filters.dailyButton")}
              </button>
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("board.filters.searchPlaceholder")}
                  className="px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] w-[140px] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[rgba(108,92,231,0.25)] outline-none transition-all duration-200"
                />
                <select
                  value={csvImportMode}
                  onChange={(e) => setCsvImportMode(e.target.value as "replace" | "merge")}
                  className="px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[rgba(108,92,231,0.25)] outline-none transition-all duration-200"
                  aria-label={t("board.toolbar.csvImportModeAria")}
                >
                  <option value="replace">{t("board.toolbar.csvImportMode.replace")}</option>
                  <option value="merge">{t("board.toolbar.csvImportMode.merge")}</option>
                </select>
                <label className="btn-bar cursor-pointer inline-flex items-center justify-center gap-1">
                  {t("board.toolbar.import")}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportCSV}
                  />
                </label>
                <button onClick={handleExportCSV} className="btn-bar">
                  {t("board.toolbar.export")}
                </button>
              </div>
            </>
          )}
        </div>
        {priorityBarVisible && labelsOpen && (
          <div className="w-full px-5 sm:px-6 lg:px-8 py-2 flex gap-1.5 flex-wrap border-t border-[rgba(255,255,255,0.06)]">
            {boardLabels.map((l) => (
              <button
                key={l}
                onClick={() => toggleLabel(l)}
                className={`btn-pill-compact transition-all duration-200 ${
                  activeLabels.has(l)
                    ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                    : "bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.1)]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        {priorityBarVisible && (
          <div className="w-full px-5 sm:px-6 lg:px-8 py-2.5 border-t border-[rgba(255,255,255,0.06)]">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.08)] bg-[var(--flux-surface-card)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("board.stats.totalLabel")}</div>
                <div className="text-sm font-display font-bold text-[var(--flux-text)]">{cards.length}</div>
              </div>
              <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(116,185,255,0.2)] bg-[var(--flux-surface-card)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("board.stats.inProgressLabel")}</div>
                <div className="text-sm font-display font-bold text-[var(--flux-info)]">{executionInsights.inProgress}</div>
              </div>
              <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,107,107,0.24)] bg-[var(--flux-surface-card)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("board.stats.overdueLabel")}</div>
                <div className="text-sm font-display font-bold text-[var(--flux-danger)]">{executionInsights.overdue}</div>
              </div>
              <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,217,61,0.24)] bg-[var(--flux-surface-card)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("board.stats.dueSoonLabel")}</div>
                <div className="text-sm font-display font-bold text-[var(--flux-warning)]">{executionInsights.dueSoon}</div>
              </div>
              <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(0,230,118,0.24)] bg-[var(--flux-surface-card)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("board.stats.completedRateLabel")}</div>
                <div className="text-sm font-display font-bold text-[var(--flux-success)]">{executionInsights.doneRate}%</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={boardScrollRef}
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        className={`w-full px-5 sm:px-6 lg:px-8 py-4 pb-6 flex gap-4 overflow-x-auto items-stretch scrollbar-flux transition-[min-height] duration-300 ease-in-out relative z-[120] ${
          isPanning ? "cursor-grabbing select-none" : "cursor-default"
        } ${priorityBarVisible ? "min-h-[calc(100vh-240px)]" : "min-h-[calc(100vh-140px)]"}`}
        style={{ touchAction: isPanning ? "none" : "pan-y" }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: t("board.dnd.screenReaderInstructions.draggable"),
            },
            announcements: {
              onDragStart: ({ active }) => {
                const activeId = String(active.id);
                if (activeId.startsWith("card-")) {
                  const cardId = activeId.replace("card-", "");
                  const card = cards.find((c) => c.id === cardId);
                  return card
                    ? t("board.dnd.announcements.dragStart.cardWithTitle", { cardTitle: card.title })
                    : t("board.dnd.announcements.dragStart.card");
                }
                const col = buckets.find((b) => b.key === activeId);
                return col
                  ? t("board.dnd.announcements.dragStart.columnWithTitle", { columnLabel: col.label })
                  : t("board.dnd.announcements.dragStart.column");
              },
              onDragOver: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) {
                  const bucketKey = overId.replace("bucket-", "");
                  const col = buckets.find((b) => b.key === bucketKey);
                  return col
                    ? t("board.dnd.announcements.dragOver.dropOnColumnWithTitle", { columnLabel: col.label })
                    : t("board.dnd.announcements.dragOver.dropOnColumn");
                }
                const slotInfo = parseSlotId(overId);
                if (slotInfo) {
                  const col = buckets.find((b) => b.key === slotInfo.bucketKey);
                  const pos = slotInfo.index + 1;
                  return col
                    ? t("board.dnd.announcements.dragOver.dropOnColumnWithPosition", {
                        columnLabel: col.label,
                        pos,
                      })
                    : t("board.dnd.announcements.dragOver.dropOnPositionOnly", { pos });
                }
                return;
              },
              onDragEnd: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) return t("board.dnd.announcements.dragEnd.dropped");
                const slotInfo = parseSlotId(overId);
                if (slotInfo) return t("board.dnd.announcements.dragEnd.dropped");
                return t("board.dnd.announcements.dragEnd.dropped");
              },
              onDragCancel: () => t("board.dnd.announcements.dragCancel"),
            },
          }}
        >
          <SortableContext items={buckets.map((b) => b.key)} strategy={horizontalListSortingStrategy}>
            {buckets.map((b) => (
              <KanbanColumn
                key={b.key}
                bucket={b}
                cards={visibleCardsByBucket(b.key)}
                collapsed={collapsed.has(b.key)}
                onToggleCollapse={() => toggleCollapsed(b.key)}
                onAddCard={() => {
                  setModalCard({
                    id: "",
                    bucket: b.key,
                    priority: "Média",
                    progress: "Não iniciado",
                    title: "",
                    desc: t("board.newCard.defaultDescription"),
                    tags: [],
                    direction: null,
                    dueDate: null,
                    order: getCardsByBucket(b.key).length,
                  });
                  setModalMode("new");
                }}
                onEditCard={(c) => {
                  setModalCard(c);
                  setModalMode("edit");
                }}
                onDeleteCard={(id) => setConfirmDelete({ type: "card", id, label: "" })}
                onRenameColumn={() => {
                  setEditingColumnKey(b.key);
                  setNewColumnName(b.label);
                  setAddColumnOpen(true);
                }}
                onDeleteColumn={buckets.length > 1 ? () => setConfirmDelete({ type: "bucket", id: b.key, label: b.label }) : undefined}
                onSetDirection={(cardId, dir) => {
                  updateDb((prev) => ({
                    ...prev,
                    cards: prev.cards.map((c) =>
                      c.id === cardId ? { ...c, direction: c.direction === dir ? null : dir } : c
                    ),
                  }));
                }}
                onOpenDesc={(c) => setDescModalCard(c)}
                directions={directions}
                dirColors={DIR_COLORS}
              />
            ))}
          </SortableContext>
          <CustomTooltip content={t("addColumnModal.title.new")} position="right">
            <button
              type="button"
              onClick={() => {
                setEditingColumnKey(null);
                setNewColumnName("");
                setAddColumnOpen(true);
              }}
              className="shrink-0 min-w-[44px] w-[44px] h-[80px] rounded-[var(--flux-rad)] border border-dashed border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] flex items-center justify-center text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.08)] transition-all cursor-pointer group opacity-80 hover:opacity-100"
              aria-label={t("addColumnModal.title.new")}
            >
              <span className="text-lg font-light group-hover:scale-110 transition-transform">+</span>
            </button>
          </CustomTooltip>

          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: "cubic-bezier(0.18, 0.67, 0.6, 1.02)",
            }}
          >
            {activeCard ? (
              <div className="scale-[1.02] shadow-[0_12px_32px_rgba(108,92,231,0.3)] ring-2 ring-[var(--flux-primary)]/50 rounded-xl transition-all duration-200 ease-out">
                <KanbanCard
                  card={activeCard}
                  directions={directions}
                  dirColors={DIR_COLORS}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onSetDirection={() => {}}
                  onOpenDesc={undefined}
                  isDragging
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="bg-[var(--flux-surface-mid)]/92 border-t border-x border-[rgba(108,92,231,0.28)] rounded-t-[var(--flux-rad)] py-2.5 px-5 sm:px-6 lg:px-8 z-[80] shadow-[0_-6px_18px_rgba(0,0,0,0.45)] max-w-[1200px] mx-auto">
        <div className="w-full flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 text-center">
          <div className="flex items-center justify-center gap-2 overflow-x-auto flex-wrap min-w-0 scrollbar-flux pb-1">
            {buckets.map((b, i) => {
              const n = visibleCardsByBucket(b.key).length;
              return (
                <div key={b.key} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <div className="w-px h-4 bg-[rgba(255,255,255,0.16)]" />}
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: b.color || "#9B97C2" }}
                    />
                    <span className="text-xs text-[var(--flux-text-muted)] font-medium whitespace-nowrap">
                      {b.label || ""}
                    </span>
                    <span className="font-display font-bold text-xs text-[var(--flux-text)]">
                      {n}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="w-px h-4 bg-[rgba(255,255,255,0.16)] shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs font-bold text-[var(--flux-text-muted)]">{t("board.summary.totalLabel")}</span>
              <span className="font-display font-bold text-xs text-[var(--flux-secondary)]">
                {cards.length}
              </span>
            </div>
          </div>

          {totalWithDir > 0 && (
            <div className="flex items-center justify-center gap-4 flex-wrap text-xs">
              {directions.map((d, i) => (
                <div key={d} className="flex items-center gap-2">
                  {i > 0 && <div className="w-px h-4 bg-[var(--flux-text-muted)]/60" />}
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: DIR_COLORS[d.toLowerCase()] }}
                  />
                  <span className="font-display font-bold text-[var(--flux-text)]">
                    {directionCounts[d.toLowerCase()] || 0}
                  </span>
                  <span className="text-[var(--flux-text-muted)] font-medium">
                    {(() => {
                      const dk = d.toLowerCase();
                      try {
                        return t(`directions.${dk}`);
                      } catch {
                        return d;
                      }
                    })()}
                  </span>
                </div>
              ))}
              <div className="w-px h-4 bg-[var(--flux-text-muted)]/60" />
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-[var(--flux-text-muted)]">
                  {cards.length - totalWithDir}
                </span>
                <span className="text-[var(--flux-text-muted)] font-medium">{t("board.summary.pendingLabel")}</span>
              </div>
            </div>
          )}
        </div>
        {(executionInsights.nextActions.length > 0 || executionInsights.wipRiskColumns.length > 0) && (
          <div className="mt-3 border-t border-[rgba(255,255,255,0.08)] pt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(108,92,231,0.24)] bg-[var(--flux-surface-card)] p-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)] mb-1.5">
                {t("board.nextActions.title")}
              </div>
              <div className="space-y-1.5">
                {executionInsights.nextActions.map((entry) => (
                  <button
                    key={entry.card.id}
                    onClick={() => {
                      setModalCard(entry.card);
                      setModalMode("edit");
                    }}
                    className="w-full text-left rounded-md border border-[rgba(255,255,255,0.08)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 hover:border-[var(--flux-primary)] transition-colors"
                  >
                    <div className="text-xs font-semibold text-[var(--flux-text)] truncate">{entry.card.title}</div>
                    <div className="text-[10px] text-[var(--flux-text-muted)]">
                      {t(`cardModal.options.priority.${entry.card.priority}`)} · {t(`cardModal.options.progress.${entry.card.progress}`)}
                      {entry.due !== null
                        ? ` · ${t("board.nextActions.duePrefix")} ${
                            entry.due < 0
                              ? t("card.due.overdue", { days: Math.abs(entry.due) })
                              : entry.due === 0
                                ? t("card.due.today")
                                : t("card.due.future", { days: entry.due })
                          }`
                        : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,107,107,0.24)] bg-[var(--flux-surface-card)] p-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-danger)] mb-1.5">
                {t("board.wipRisk.title")}
              </div>
              {executionInsights.wipRiskColumns.length === 0 ? (
                <p className="text-xs text-[var(--flux-text-muted)]">{t("board.wipRisk.emptyMessage", { minItems: 4 })}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {executionInsights.wipRiskColumns.map((entry) => (
                    <span
                      key={entry.key}
                      className="rounded-full border border-[rgba(255,107,107,0.4)] bg-[rgba(255,107,107,0.14)] px-2 py-0.5 text-[11px] font-semibold text-[var(--flux-text)]"
                    >
                      {entry.label}: {entry.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modalCard && (
        <CardModal
          card={modalCard}
          mode={modalMode}
          buckets={buckets}
          priorities={priorities}
          progresses={progresses}
          filterLabels={boardLabels}
          boardId={boardId}
          boardName={boardName}
          getHeaders={getHeaders}
          onCreateLabel={createLabel}
          onDeleteLabel={deleteLabel}
          onClose={() => setModalCard(null)}
          onSave={(updated) => {
            updateDb((prev) => {
              if (modalMode === "new") {
                return { ...prev, cards: [...prev.cards, { ...updated, order: prev.cards.filter((c) => c.bucket === updated.bucket).length }] };
              }
              return {
                ...prev,
                cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)),
              };
            });
            setModalCard(null);
          }}
          onDelete={(id) => {
            updateDb((prev) => ({ ...prev, cards: prev.cards.filter((c) => c.id !== id) }));
            setModalCard(null);
          }}
        />
      )}

      {descModalCard && (
        <DescModal
          card={descModalCard}
          onClose={() => setDescModalCard(null)}
          onSave={(cardId, desc) => {
            updateDb((prev) => ({
              ...prev,
              cards: prev.cards.map((c) => (c.id === cardId ? { ...c, desc } : c)),
            }));
            setDescModalCard(null);
          }}
        />
      )}

      {mapaOpen && (
        <MapaModal
          mapaProducao={db.mapaProducao || []}
          onClose={() => setMapaOpen(false)}
          onSave={(arr) => updateDb((prev) => ({ ...prev, mapaProducao: arr }))}
        />
      )}

      {addColumnOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center"
          onClick={() => setAddColumnOpen(false)}
        >
          <div
            className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-6 min-w-[280px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            ref={addColumnDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-column-title"
            tabIndex={-1}
          >
            <h3 id="add-column-title" className="font-display font-bold text-[var(--flux-text)] mb-4">
              {editingColumnKey ? t("addColumnModal.title.rename") : t("addColumnModal.title.new")}
            </h3>
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveColumn()}
              placeholder={t("addColumnModal.placeholder")}
              className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm mb-4 bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
              autoFocus
              ref={addColumnInputRef}
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => { setAddColumnOpen(false); setNewColumnName(""); setEditingColumnKey(null); }}
                className="btn-secondary"
              >
                {t("addColumnModal.cancel")}
              </button>
              <button
                onClick={saveColumn}
                className="btn-primary"
              >
                {editingColumnKey ? t("addColumnModal.save") : t("addColumnModal.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center">
          <div
            className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-6 min-w-[280px] text-center shadow-xl"
            ref={confirmDeleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            tabIndex={-1}
          >
            <p id="confirm-delete-title" className="text-[var(--flux-text)] mb-4 font-medium">
              {confirmDelete.type === "card"
                ? t("confirmDelete.cardTitle", {
                    cardTitle: cards.find((c) => c.id === confirmDelete.id)?.title || "",
                  })
                : t("confirmDelete.columnTitle", {
                    columnLabel: confirmDelete.label,
                  })}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary"
                ref={confirmDeleteCancelRef}
              >
                {t("confirmDelete.cancel")}
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "card") {
                    updateDb((prev) => ({
                      ...prev,
                      cards: prev.cards.filter((c) => c.id !== confirmDelete.id),
                    }));
                  } else {
                    deleteColumn(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="btn-danger-solid"
              >
                {t("confirmDelete.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dailyDeleteConfirmId !== null}
        title={t("dailyDelete.title")}
        description={t("dailyDelete.description")}
        intent="danger"
        confirmText={t("confirmDelete.confirm")}
        cancelText={t("confirmDelete.cancel")}
        onCancel={cancelDeleteDailyHistoryEntry}
        onConfirm={confirmDeleteDailyHistoryEntry}
      />

      <ConfirmDialog
        open={csvImportConfirm !== null}
        title={
          csvImportConfirm
            ? csvImportConfirm.mode === "replace"
              ? t("csvImportConfirm.title.replace", { count: csvImportConfirm.count })
              : t("csvImportConfirm.title.merge", { count: csvImportConfirm.count })
            : ""
        }
        description={
          csvImportConfirm
            ? csvImportConfirm.mode === "replace"
              ? t("csvImportConfirm.description.replace")
              : t("csvImportConfirm.description.merge", {
                  existingCount: csvImportConfirm.sameIdCount,
                  newCount: csvImportConfirm.count - csvImportConfirm.sameIdCount,
                })
            : undefined
        }
        intent="danger"
        confirmText={
          csvImportConfirm?.mode === "merge" ? t("csvImportConfirm.merge") : t("csvImportConfirm.import")
        }
        cancelText={t("confirmDelete.cancel")}
        onCancel={() => setCsvImportConfirm(null)}
        onConfirm={() => {
          if (!csvImportConfirm) return;
          const imported = csvImportConfirm.cards.map((c) => ({ ...c }));
          const count = csvImportConfirm.count;

          if (csvImportConfirm.mode === "replace") {
            const ordByBucket: Record<string, number> = {};
            imported.forEach((card) => {
              const bk = card.bucket;
              ordByBucket[bk] = ordByBucket[bk] || 0;
              card.order = ordByBucket[bk]++;
            });
            updateDb((prev) => ({ ...prev, cards: imported }));
          } else {
            updateDb((prev) => {
              const prevCards = Array.isArray(prev.cards) ? prev.cards : [];
              const configKeys = Array.isArray(prev.config.bucketOrder)
                ? prev.config.bucketOrder.map((b) => b.key)
                : [];
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

                const idxById = new Map<string, number>(
                  existingInBucket.map((c, i) => [c.id, i])
                );

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

              return { ...prev, cards: nextCards };
            });
          }

          setCsvImportConfirm(null);
          pushToast({
            kind: "success",
            title:
              csvImportConfirm.mode === "merge"
                ? t("csvImportConfirm.toasts.mergeSuccess", { count })
                : t("csvImportConfirm.toasts.replaceSuccess", { count }),
          });
        }}
      />

      {dailyOpen && (
        <DailyInsightsPanel
          boardName={boardName}
          dailyTab={dailyTab}
          dailyGenerating={dailyGenerating}
          dailyStatusPhase={dailyStatusPhase}
          statusStepIndex={statusStepIndex}
          dailyLogs={dailyLogs}
          dailyTranscript={dailyTranscript}
          dailyFileName={dailyFileName}
          dailyHistoryDateFrom={dailyHistoryDateFrom}
          dailyHistoryDateTo={dailyHistoryDateTo}
          dailyHistorySearchQuery={dailyHistorySearchQuery}
          dailyInsights={dailyInsights}
          filteredDailyInsights={filteredDailyInsights}
          activeDailyHistoryId={activeDailyHistoryId}
          activeCreatedCardsExpandedId={activeCreatedCardsExpandedId}
          dailyDialogRef={dailyDialogRef}
          dailyCloseRef={dailyCloseRef}
          slugDaily={slugDaily}
          onClose={closeDailyModal}
          onClickNewDaily={startNewDaily}
          onClickHistoryTab={openHistoryTab}
          onClickStatusTab={openStatusTab}
          onLoadDailyTranscriptFile={loadDailyTranscriptFile}
          onClearDailyAttachmentAndTranscript={clearDailyAttachmentAndTranscript}
          onDailyTranscriptChange={(value) => setDailyTranscript(value)}
          onGenerateDailyInsight={onGenerateDailyInsight}
          onClearDailyLogs={clearDailyLogs}
          onOpenDailyHistoryFromStatusEntry={onOpenDailyHistoryFromStatusEntry}
          onSetDailyHistoryDateFrom={(value) => setDailyHistoryDateFrom(value)}
          onSetDailyHistoryDateTo={(value) => setDailyHistoryDateTo(value)}
          onSetDailyHistorySearchQuery={(value) => setDailyHistorySearchQuery(value)}
          onClearDailyHistoryFilters={clearDailyHistoryFilters}
          onToggleDailyHistoryExpanded={onToggleDailyHistoryExpanded}
          onCollapseDailyHistoryExpanded={onCollapseDailyHistoryExpanded}
          onDownloadDailyContextDoc={onDownloadDailyContextDoc}
          onCopyDailyContextDoc={onCopyDailyContextDoc}
          onCreateCardsFromInsight={onCreateCardsFromInsight}
          onDeleteDailyHistoryEntry={requestDeleteDailyHistoryEntry}
          onExpandDailyHistoryCreatedCards={expandDailyHistoryCreatedCards}
        />
      )}
      {/*
        Daily IA modal movido para `DailyInsightsPanel`.
        Mantido removido aqui para evitar duplicação de lógica/JSX.
      */}
    </>
  );
}
