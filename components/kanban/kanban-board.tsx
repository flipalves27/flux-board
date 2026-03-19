"use client";

import { useRef, useState, useCallback } from "react";
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
import type { BoardData, CardData, DailyInsightEntry } from "@/app/board/[id]/page";

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

const DIR_COLORS: Record<string, string> = {
  manter: "#059669",
  priorizar: "#009E90",
  adiar: "#F59E0B",
  cancelar: "#EF4444",
  reavaliar: "#6B7280",
};

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
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyTranscript, setDailyTranscript] = useState("");
  const [dailyFileName, setDailyFileName] = useState("Nenhum arquivo anexado");
  const [dailySourceFileName, setDailySourceFileName] = useState("");
  const [dailyGenerating, setDailyGenerating] = useState(false);
  const [dailyTab, setDailyTab] = useState<"entrada" | "historico">("entrada");
  const [dailyHistoryExpandedId, setDailyHistoryExpandedId] = useState<string | null>(null);
  const [dailyHistoryCreatedCardsExpandedId, setDailyHistoryCreatedCardsExpandedId] = useState<string | null>(null);
  const [dailyHistoryDateFrom, setDailyHistoryDateFrom] = useState("");
  const [dailyHistoryDateTo, setDailyHistoryDateTo] = useState("");
  const [dailyHistorySearchQuery, setDailyHistorySearchQuery] = useState("");

  const buckets = db.config.bucketOrder;
  const boardLabels =
    db.config.labels && db.config.labels.length > 0 ? db.config.labels : filterLabels;
  const collapsed = new Set(db.config.collapsedColumns || []);
  const cards = db.cards;
  const dailyInsights = Array.isArray(db.dailyInsights) ? db.dailyInsights : [];

  const normalizeSearchText = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const toLocalDateInputValue = (isoDate: string | undefined) => {
    if (!isoDate) return "";
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return "";
    const tzOffsetMs = dt.getTimezoneOffset() * 60000;
    return new Date(dt.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  };

  const normDailyPrio = (value: string | undefined) => {
    const v = String(value || "").trim().toLowerCase();
    if (v === "urgente") return "Urgente";
    if (v === "importante") return "Importante";
    return "Média";
  };

  const normDailyProg = (value: string | undefined) => {
    const v = String(value || "").trim().toLowerCase();
    if (v === "em andamento") return "Em andamento";
    if (v === "concluída" || v === "concluida") return "Concluída";
    return "Não iniciado";
  };

  const slugDaily = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const getDailyCreateSuggestions = (entry?: DailyInsightEntry) => {
    const insight = entry?.insight;
    if (!insight) return [];
    const detailed = Array.isArray(insight.criarDetalhes)
      ? insight.criarDetalhes
          .map((item) => {
            const titulo = String(item?.titulo || "").trim();
            if (!titulo) return null;
            return {
              titulo,
              prioridade: normDailyPrio(item?.prioridade),
              progresso: normDailyProg(item?.progresso),
              coluna: String(item?.coluna || "").trim(),
            };
          })
          .filter(Boolean) as Array<{
          titulo: string;
          prioridade: string;
          progresso: string;
          coluna: string;
        }>
      : [];
    if (detailed.length > 0) return detailed;
    const fallback = Array.isArray(insight.criar) ? insight.criar : [];
    return fallback
      .map((txt) => {
        const titulo = String(txt || "").trim();
        if (!titulo) return null;
        return { titulo, prioridade: "Média", progresso: "Não iniciado", coluna: "" };
      })
      .filter(Boolean) as Array<{
      titulo: string;
      prioridade: string;
      progresso: string;
      coluna: string;
    }>;
  };

  const createCardsFromInsight = (entryId?: string) => {
    const entry = entryId ? dailyInsights.find((x) => x?.id === entryId) : dailyInsights[0];
    if (!entry?.insight) {
      alert("Resumo não encontrado.");
      return;
    }
    const suggestions = getDailyCreateSuggestions(entry);
    if (!suggestions.length) {
      alert("Não há itens em 'Criar' para transformar em card.");
      return;
    }
    const nowIso = new Date().toISOString();
    updateDb((prev) => {
      const bucketOrder = prev.config.bucketOrder || [];
      const backlogKey =
        bucketOrder.find((b) => String(b.label || "").toLowerCase() === "backlog")?.key ||
        bucketOrder[0]?.key ||
        "Backlog";
      const created = suggestions.map((s, idx) => {
        const lowerCol = String(s.coluna || "").trim().toLowerCase();
        const mapped = lowerCol
          ? bucketOrder.find(
              (b) =>
                String(b.key || "").toLowerCase() === lowerCol ||
                String(b.label || "").toLowerCase() === lowerCol
            )
          : null;
        const bucketKey = mapped ? mapped.key : backlogKey;
        const nextOrd = prev.cards.filter((c) => c.bucket === bucketKey).length;
        return {
          id: `AI-${Date.now()}-${idx + 1}`,
          bucket: bucketKey,
          priority: normDailyPrio(s.prioridade),
          progress: normDailyProg(s.progresso),
          title: s.titulo,
          desc: "Criado automaticamente a partir da Daily IA.",
          tags: ["Reborn"],
          links: [],
          direction: null,
          dueDate: null,
          order: nextOrd,
        } as CardData;
      });
      const nextDailyInsights = Array.isArray(prev.dailyInsights)
        ? prev.dailyInsights.map((insightEntry) => {
            if (!entryId || insightEntry?.id !== entryId) return insightEntry;
            const previousCreated = Array.isArray(insightEntry.createdCards) ? insightEntry.createdCards : [];
            const createdCardsPayload = created.map((card) => ({
              cardId: card.id,
              title: card.title,
              bucket: card.bucket,
              priority: card.priority,
              progress: card.progress,
              desc: card.desc,
              tags: card.tags,
              direction: card.direction,
              dueDate: card.dueDate,
              createdAt: nowIso,
            }));
            return {
              ...insightEntry,
              createdCards: [...createdCardsPayload, ...previousCreated].slice(0, 100),
            };
          })
        : prev.dailyInsights;
      return { ...prev, cards: [...prev.cards, ...created], dailyInsights: nextDailyInsights };
    });
    if (entryId) {
      setDailyHistoryCreatedCardsExpandedId(entryId);
    }
    alert(`${suggestions.length} card(s) criados automaticamente.`);
  };

  const loadDailyTranscriptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || "");
      setDailyTranscript(text.slice(0, 40000));
      setDailyFileName(`${file.name} carregado`);
      setDailySourceFileName(file.name);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const clearDailyAttachmentAndTranscript = () => {
    setDailyTranscript("");
    setDailyFileName("Nenhum arquivo anexado");
    setDailySourceFileName("");
  };

  const deleteDailyHistoryEntry = (entryId: string) => {
    if (!confirm("Excluir este resumo do histórico da Daily IA?")) return;
    updateDb((prev) => ({
      ...prev,
      dailyInsights: (Array.isArray(prev.dailyInsights) ? prev.dailyInsights : []).filter((entry) => entry?.id !== entryId),
    }));
    if (dailyHistoryExpandedId === entryId) setDailyHistoryExpandedId(null);
    if (dailyHistoryCreatedCardsExpandedId === entryId) setDailyHistoryCreatedCardsExpandedId(null);
  };

  const buildDailyContextDoc = (entry: DailyInsightEntry) => {
    const insight = entry?.insight;
    const dt = entry?.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
    const createItems = getDailyCreateSuggestions(entry);
    const ajustar = Array.isArray(insight?.ajustar) ? insight?.ajustar : [];
    const corrigir = Array.isArray(insight?.corrigir) ? insight?.corrigir : [];
    const pendencias = Array.isArray(insight?.pendencias) ? insight?.pendencias : [];
    const curated = String(insight?.contextoOrganizado || "").trim();
    const blocks = [
      `Resumo Daily IA${dt ? ` - ${dt}` : ""}`,
      "",
      `Arquivo de origem: ${String(entry?.sourceFileName || "Transcrição colada no modal")}`,
      "",
      "Resumo executivo:",
      String(insight?.resumo || "Sem resumo."),
      "",
      "Contexto reorganizado e revisado:",
      curated || "Sem conteúdo estruturado para este resumo.",
      "",
      "Ações para criar:",
      ...(createItems.length ? createItems.map((x, i) => `${i + 1}. ${x.titulo}`) : ["- Sem itens identificados."]),
      "",
      "Ajustes:",
      ...(ajustar.length ? ajustar.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
      "",
      "Correções:",
      ...(corrigir.length ? corrigir.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
      "",
      "Pendências:",
      ...(pendencias.length ? pendencias.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
    ];
    return blocks.join("\n");
  };

  const downloadDailyContextDoc = (entry: DailyInsightEntry) => {
    const a = document.createElement("a");
    const created = entry?.createdAt ? new Date(entry.createdAt) : new Date();
    const stamp = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(
      created.getDate()
    ).padStart(2, "0")}_${String(created.getHours()).padStart(2, "0")}-${String(created.getMinutes()).padStart(2, "0")}`;
    const content = buildDailyContextDoc(entry);
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    a.download = `daily-contexto-${stamp}.txt`;
    a.click();
  };

  const copyDailyContextDoc = async (entry: DailyInsightEntry) => {
    const content = buildDailyContextDoc(entry);
    if (!content.trim()) {
      alert("Não há contexto para copiar.");
      return;
    }
    if (!navigator?.clipboard?.writeText) {
      alert("Seu navegador não suporta cópia automática.");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      alert("Contexto copiado para a área de transferência.");
    } catch {
      alert("Não foi possível copiar o contexto.");
    }
  };

  const generateDailyInsight = async () => {
    const transcript = dailyTranscript.trim();
    if (!transcript) {
      alert("Informe ou anexe a transcrição da daily.");
      return;
    }
    setDailyGenerating(true);
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/daily-insights`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ transcript, fileName: dailySourceFileName || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error || "Erro ao gerar resumo.");
        return;
      }
      updateDb((prev) => {
        const current = Array.isArray(prev.dailyInsights) ? prev.dailyInsights : [];
        const next = [data.entry, ...current.filter((x) => x?.id !== data.entry?.id)].slice(0, 20);
        return { ...prev, dailyInsights: next };
      });
      setDailyHistoryExpandedId(String(data?.entry?.id || ""));
    } catch {
      alert("Erro ao gerar resumo com IA.");
    } finally {
      setDailyGenerating(false);
    }
  };

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

  const getCardsByBucket = (bucketKey: string) =>
    cards
      .filter((c) => c.bucket === bucketKey)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const visibleCardsByBucket = (bucketKey: string) =>
    getCardsByBucket(bucketKey).filter(filterCard);

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

  const directionCounts = directions.reduce(
    (acc, d) => {
      const key = d.toLowerCase();
      acc[key] = cards.filter((c) => c.direction === key).length;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalWithDir = cards.filter((c) => c.direction).length;

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
        alert("CSV vazio.");
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
        alert("Coluna 'Título' não encontrada.");
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
        alert("Nenhum card.");
        return;
      }
      if (confirm(`Importar ${nc.length} cards? Substitui os atuais.`)) {
        const ordByBucket: Record<string, number> = {};
        nc.forEach((card) => {
          const bk = card.bucket;
          ordByBucket[bk] = ordByBucket[bk] || 0;
          card.order = ordByBucket[bk]++;
        });
        updateDb((prev) => ({ ...prev, cards: nc }));
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const activeCard = activeId && activeId.startsWith("card-")
    ? cards.find((c) => c.id === activeId.replace("card-", ""))
    : null;

  const normalizedDailyHistorySearchQuery = normalizeSearchText(dailyHistorySearchQuery);
  const filteredDailyInsights = dailyInsights.filter((entry) => {
    const entryDate = toLocalDateInputValue(entry?.createdAt);
    if (dailyHistoryDateFrom && (!entryDate || entryDate < dailyHistoryDateFrom)) return false;
    if (dailyHistoryDateTo && (!entryDate || entryDate > dailyHistoryDateTo)) return false;
    if (!normalizedDailyHistorySearchQuery) return true;
    const insight = entry?.insight;
    const searchable = [
      insight?.resumo,
      insight?.contextoOrganizado,
      ...(Array.isArray(insight?.criar) ? insight.criar : []),
      ...(Array.isArray(insight?.ajustar) ? insight.ajustar : []),
      ...(Array.isArray(insight?.corrigir) ? insight.corrigir : []),
      ...(Array.isArray(insight?.pendencias) ? insight.pendencias : []),
      ...(Array.isArray(insight?.criarDetalhes) ? insight.criarDetalhes.map((item) => String(item?.titulo || "")) : []),
      entry?.transcript,
      entry?.sourceFileName,
    ]
      .map((item) => String(item || ""))
      .join(" \n ");
    return normalizeSearchText(searchable).includes(normalizedDailyHistorySearchQuery);
  });

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
          <button
            type="button"
            onClick={() => setPriorityBarVisible((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--flux-rad-sm)] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.08)] transition-all duration-200 font-display group shrink-0"
            title={priorityBarVisible ? "Ocultar filtros" : "Mostrar filtros"}
          >
            <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
            <span
              className={`inline-block text-[10px] transition-transform duration-300 ease-out ${priorityBarVisible ? "rotate-0" : "-rotate-90"}`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          {priorityBarVisible && (
            <>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider font-display shrink-0">
                  Prioridade
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
                    {p === "all" ? "Todas" : p}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-[rgba(255,255,255,0.1)] shrink-0" />
              <button
                onClick={() => setLabelsOpen(!labelsOpen)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border transition-all duration-200 border-[var(--flux-primary)] bg-[rgba(108,92,231,0.12)] text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.2)] font-display shrink-0"
              >
                <span>Rótulos</span>
                <span className={`transition-transform duration-200 ${labelsOpen ? "rotate-180" : ""}`}>▼</span>
              </button>
              <button
                onClick={() => setMapaOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] hover:bg-[var(--flux-surface-elevated)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 font-display shrink-0"
              >
                Mapa de Produção
              </button>
              <button
                onClick={() => setDailyOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] hover:bg-[var(--flux-surface-elevated)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 font-display shrink-0"
              >
                Daily IA
              </button>
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] w-[140px] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[rgba(108,92,231,0.25)] outline-none transition-all duration-200"
                />
                <label className="btn-bar cursor-pointer inline-flex items-center justify-center gap-1">
                  Importar
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportCSV}
                  />
                </label>
                <button onClick={handleExportCSV} className="btn-bar">
                  Exportar
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
                    desc: "Sem descrição.",
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
          <button
            type="button"
            onClick={() => {
              setEditingColumnKey(null);
              setNewColumnName("");
              setAddColumnOpen(true);
            }}
            className="shrink-0 min-w-[44px] w-[44px] h-[80px] rounded-[var(--flux-rad)] border border-dashed border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] flex items-center justify-center text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.08)] transition-all cursor-pointer group opacity-80 hover:opacity-100"
            title="Nova coluna"
          >
            <span className="text-lg font-light group-hover:scale-110 transition-transform">+</span>
          </button>

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
              <span className="text-xs font-bold text-[var(--flux-text-muted)]">Total</span>
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
                  <span className="text-[var(--flux-text-muted)] font-medium">{d}</span>
                </div>
              ))}
              <div className="w-px h-4 bg-[var(--flux-text-muted)]/60" />
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-[var(--flux-text-muted)]">
                  {cards.length - totalWithDir}
                </span>
                <span className="text-[var(--flux-text-muted)] font-medium">Pendentes</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalCard && (
        <CardModal
          card={modalCard}
          mode={modalMode}
          buckets={buckets}
          priorities={priorities}
          progresses={progresses}
          filterLabels={boardLabels}
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
          >
            <h3 className="font-display font-bold text-[var(--flux-text)] mb-4">
              {editingColumnKey ? "Renomear coluna" : "Nova coluna"}
            </h3>
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveColumn()}
              placeholder="Ex: Backlog, Em progresso..."
              className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm mb-4 bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => { setAddColumnOpen(false); setNewColumnName(""); setEditingColumnKey(null); }}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={saveColumn}
                className="btn-primary"
              >
                {editingColumnKey ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center">
          <div className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-6 min-w-[280px] text-center shadow-xl">
            <p className="text-[var(--flux-text)] mb-4 font-medium">
              {confirmDelete.type === "card"
                ? `Excluir "${cards.find((c) => c.id === confirmDelete.id)?.title}"?`
                : `Excluir a coluna "${confirmDelete.label}"?`}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary"
              >
                Cancelar
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
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {dailyOpen && (
        <div className="fixed inset-0 bg-black/50 z-[410] flex items-center justify-center p-4" onClick={() => setDailyOpen(false)}>
          <div
            className="w-full max-w-5xl h-[90vh] bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] p-5 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display font-bold text-[var(--flux-text)] text-base">Daily IA</h3>
                <p className="text-xs text-[var(--flux-text-muted)]">Board: {boardName || "Board"}</p>
              </div>
              <button className="btn-secondary" onClick={() => setDailyOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="flex items-center gap-2 mb-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
              <button
                type="button"
                className={`btn-bar ${dailyTab === "entrada" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
                onClick={() => setDailyTab("entrada")}
              >
                Nova Daily
              </button>
              <button
                type="button"
                className={`btn-bar ${dailyTab === "historico" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
                onClick={() => setDailyTab("historico")}
              >
                Histórico ({dailyInsights.length})
              </button>
            </div>
            {dailyTab === "entrada" ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <p className="text-xs text-[var(--flux-text-muted)] mb-3">
                  Cole a transcrição da daily (ou anexe arquivo .txt/.md) para gerar uma visão prática dos próximos passos.
                </p>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <label className="btn-bar cursor-pointer">
                    Anexar transcrição
                    <input type="file" accept=".txt,.md,.log,.csv" className="hidden" onChange={loadDailyTranscriptFile} />
                  </label>
                  <button type="button" className="btn-secondary" onClick={clearDailyAttachmentAndTranscript}>
                    Excluir anexo e conteúdo
                  </button>
                  <span className="text-xs text-[var(--flux-text-muted)]">{dailyFileName}</span>
                </div>
                <textarea
                  value={dailyTranscript}
                  onChange={(e) => setDailyTranscript(e.target.value)}
                  placeholder="Ex: ontem finalizamos... hoje vamos... bloqueio em..."
                  className="w-full min-h-[260px] p-3 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-sm outline-none focus:border-[var(--flux-primary)]"
                />
                <div className="flex items-center gap-2 justify-end mt-3">
                  <button className="btn-secondary" onClick={() => setDailyOpen(false)}>
                    Fechar
                  </button>
                  <button className="btn-primary" onClick={generateDailyInsight} disabled={dailyGenerating}>
                    {dailyGenerating ? "Gerando..." : "Gerar resumo prático"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto space-y-3">
                {dailyInsights.length ? (
                <>
                  <div className="bg-[var(--flux-surface-mid)] border border-[rgba(255,255,255,0.08)] rounded-[12px] p-3">
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="min-w-[160px]">
                        <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                          De
                        </label>
                        <input
                          type="date"
                          value={dailyHistoryDateFrom}
                          onChange={(e) => setDailyHistoryDateFrom(e.target.value)}
                          className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                        />
                      </div>
                      <div className="min-w-[160px]">
                        <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                          Até
                        </label>
                        <input
                          type="date"
                          value={dailyHistoryDateTo}
                          onChange={(e) => setDailyHistoryDateTo(e.target.value)}
                          className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                        />
                      </div>
                      <div className="flex-1 min-w-[220px]">
                        <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                          Busca textual
                        </label>
                        <input
                          type="text"
                          value={dailyHistorySearchQuery}
                          onChange={(e) => setDailyHistorySearchQuery(e.target.value)}
                          placeholder="Buscar em resumo, contexto e listas..."
                          className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)]"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setDailyHistoryDateFrom("");
                          setDailyHistoryDateTo("");
                          setDailyHistorySearchQuery("");
                        }}
                      >
                        Limpar filtros
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                      Exibindo {filteredDailyInsights.length} de {dailyInsights.length} resumo(s).
                    </p>
                  </div>
                  {filteredDailyInsights.map((entry, idx) => {
                  const insight = entry.insight;
                  if (!insight) return null;
                  const dt = entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                  const title = idx === 0 ? "Resumo mais recente" : `Histórico #${filteredDailyInsights.length - idx}`;
                  const createItems = getDailyCreateSuggestions(entry);
                  const isExpanded = dailyHistoryExpandedId
                    ? dailyHistoryExpandedId === entry.id
                    : idx === 0;
                  const sourceName = String(entry.sourceFileName || "Transcrição manual");
                  return (
                    <div key={entry.id || idx} className="bg-[var(--flux-surface-mid)] border border-[rgba(255,255,255,0.08)] rounded-[12px] p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left"
                          onClick={() => setDailyHistoryExpandedId(isExpanded ? null : String(entry.id || ""))}
                        >
                          <span className="w-2 h-2 rounded-full bg-[var(--flux-primary)] shadow-[0_0_10px_rgba(108,92,231,0.6)]" />
                          <h4 className="font-display font-bold text-sm text-[var(--flux-text)]">
                            {title}
                            {dt ? ` • ${dt}` : ""}
                          </h4>
                        </button>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button className="btn-bar" onClick={() => downloadDailyContextDoc(entry)}>
                            Baixar contexto
                          </button>
                          <button className="btn-bar" onClick={() => copyDailyContextDoc(entry)}>
                            Copiar contexto
                          </button>
                          <button className="btn-bar" onClick={() => createCardsFromInsight(entry.id)}>
                            Criar cards do "Criar"
                          </button>
                          <button className="btn-danger-solid" onClick={() => deleteDailyHistoryEntry(String(entry.id || ""))}>
                            Excluir resumo
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                        Fonte: {sourceName}
                        {entry.transcript ? ` • ${entry.transcript.length} caracteres processados` : ""}
                      </p>
                      <p className="text-xs text-[var(--flux-text-muted)] mt-2">{insight.resumo || ""}</p>
                      {isExpanded && (
                        <>
                          <div className="mt-2 mb-2 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2">
                            <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1">
                              Contexto organizado
                            </div>
                            <p className="text-xs text-[var(--flux-text)] whitespace-pre-line leading-relaxed">
                              {String(insight.contextoOrganizado || "Sem contexto organizado para este resumo.")}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {[
                              { key: "criar", label: "Criar", values: createItems.map((x) => x.titulo) },
                              { key: "ajustar", label: "Ajustar", values: Array.isArray(insight.ajustar) ? insight.ajustar : [] },
                              { key: "corrigir", label: "Corrigir", values: Array.isArray(insight.corrigir) ? insight.corrigir : [] },
                              { key: "pendencias", label: "Pendências", values: Array.isArray(insight.pendencias) ? insight.pendencias : [] },
                            ].map((list) => (
                              <div key={list.key} className="bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2">
                                <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1">
                                  {list.label}
                                </div>
                                {list.values.length ? (
                                  list.key === "criar" ? (
                                    <ul className="space-y-1 pl-4 list-disc">
                                      {createItems.map((item, i) => {
                                        const prioSlug = slugDaily(item.prioridade);
                                        const progSlug = slugDaily(item.progresso);
                                        const prioClass =
                                          prioSlug === "urgente"
                                            ? "bg-[rgba(255,107,107,0.12)] text-[#EF4444] border-[rgba(255,107,107,0.3)]"
                                            : prioSlug === "importante"
                                              ? "bg-[rgba(255,217,61,0.12)] text-[#F59E0B] border-[rgba(255,217,61,0.3)]"
                                              : "bg-[rgba(116,185,255,0.12)] text-[#74B9FF] border-[rgba(116,185,255,0.3)]";
                                        const progClass =
                                          progSlug === "em-andamento"
                                            ? "bg-[rgba(0,201,183,0.12)] text-[#009E90] border-[rgba(0,201,183,0.35)]"
                                            : progSlug === "concluida"
                                              ? "bg-[rgba(16,185,129,0.12)] text-[#00E676] border-[rgba(16,185,129,0.35)]"
                                              : "bg-[var(--flux-surface-mid)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)]";
                                        return (
                                          <li key={`${list.key}-${i}`}>
                                            <div className="flex items-start justify-between gap-2">
                                              <span className="flex-1 min-w-0 text-xs text-[var(--flux-text)] leading-[1.4]">
                                                {String(item.titulo || "")}
                                              </span>
                                              <span className="flex gap-1 flex-wrap justify-end">
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${prioClass}`}
                                                >
                                                  Prio: {item.prioridade}
                                                </span>
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${progClass}`}
                                                >
                                                  Progresso: {item.progresso}
                                                </span>
                                              </span>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : (
                                    <ul className="text-xs text-[var(--flux-text)] space-y-1 list-disc pl-4">
                                      {list.values.map((item, i) => (
                                        <li key={`${list.key}-${i}`}>{String(item || "")}</li>
                                      ))}
                                    </ul>
                                  )
                                ) : (
                                  <p className="text-xs text-[var(--flux-text-muted)]">Sem itens identificados.</p>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                                Cards criados a partir desta transcrição
                              </div>
                              <button
                                type="button"
                                className="btn-bar"
                                onClick={() =>
                                  setDailyHistoryCreatedCardsExpandedId(
                                    dailyHistoryCreatedCardsExpandedId === entry.id ? null : String(entry.id || "")
                                  )
                                }
                              >
                                {dailyHistoryCreatedCardsExpandedId === entry.id ? "Ocultar detalhes" : "Ver todas as informações"}
                              </button>
                            </div>
                            <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                              {(Array.isArray(entry.createdCards) ? entry.createdCards.length : 0)} card(s) registrados.
                            </p>
                            {dailyHistoryCreatedCardsExpandedId === entry.id && (
                              <div className="mt-2 space-y-2">
                                {(Array.isArray(entry.createdCards) ? entry.createdCards : []).length ? (
                                  (entry.createdCards || []).map((createdCard, createdIdx) => (
                                    <div
                                      key={`${createdCard.cardId || "card"}-${createdIdx}`}
                                      className="border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2 bg-[var(--flux-surface-mid)]"
                                    >
                                      <div className="text-xs font-semibold text-[var(--flux-text)]">
                                        {createdCard.title || "Sem título"}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        ID: {createdCard.cardId} • Coluna: {createdCard.bucket} • Prioridade: {createdCard.priority} •
                                        Progresso: {createdCard.progress}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        Direcionamento: {createdCard.direction || "-"} • Data: {createdCard.createdAt ? new Date(createdCard.createdAt).toLocaleString("pt-BR") : "-"}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        Tags: {(Array.isArray(createdCard.tags) && createdCard.tags.length ? createdCard.tags.join(", ") : "-")}
                                      </div>
                                      <p className="text-xs text-[var(--flux-text)] mt-1 whitespace-pre-line">
                                        {createdCard.desc || "Sem descrição."}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-[var(--flux-text-muted)]">Nenhum card criado para este resumo até o momento.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                  {!filteredDailyInsights.length && (
                    <p className="text-xs text-[var(--flux-text-muted)]">
                      Nenhum resumo encontrado com os filtros informados.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--flux-text-muted)]">Ainda não existe resumo salvo para este board.</p>
              )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
