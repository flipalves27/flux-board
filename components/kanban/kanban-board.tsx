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
import type { BoardData, CardData, DailyCreatedCard, DailyInsightEntry } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";

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

type DailyLogStatus = "start" | "success" | "error";

interface DailyLog {
  timestamp: string;
  status: DailyLogStatus;
  message: string;
  model?: string;
  provider?: string;
  // Texto opcional com o resultado retornado pela IA (resumo) ou JSON bruto truncado
  resultSnippet?: string;
  // Informações de erro de integração com IA (quando houver)
  errorKind?: string;
  errorMessage?: string;
}

type DailyStatusPhase = "idle" | "preparing" | "requesting" | "processing" | "done" | "error";

type DailySessionState = {
  transcript: string;
  fileName: string;
  sourceFileName: string;
  generating: boolean;
  tab: "entrada" | "historico" | "status";
  logs: DailyLog[];
  statusPhase: DailyStatusPhase;
  historyExpandedId: string | null;
  historyCreatedCardsExpandedId: string | null;
  historyDateFrom: string;
  historyDateTo: string;
  historySearchQuery: string;
};

const DAILY_SESSION_STORAGE_KEY = "flux.daily-ia.session.v1";
const DAILY_SESSION_MAX_TRANSCRIPT_CHARS = 15000;
const DAILY_SESSION_MAX_JSON_CHARS = 120000;
const DAILY_SESSION_WRITE_DEBOUNCE_MS = 400;

const DIR_COLORS: Record<string, string> = {
  manter: "#059669",
  priorizar: "#009E90",
  adiar: "#F59E0B",
  cancelar: "#EF4444",
  reavaliar: "#6B7280",
};

type OrganizedContextSection = {
  title: string;
  items: string[];
  text: string;
};

function stripMarkdownDecorations(input: string): string {
  return String(input || "")
    .replace(/\r/g, "\n")
    // Remove common markdown bold/italic markers.
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    // Remove leading bullet-ish markers that can leak into text.
    .replace(/^\s*[-•]\s+/g, "")
    .trim();
}

function parseOrganizedContext(raw: string): OrganizedContextSection[] {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((l) => String(l ?? "").trim())
    .filter(Boolean)
    .slice(0, 250);

  const sections: OrganizedContextSection[] = [];
  let current: OrganizedContextSection | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const title = stripMarkdownDecorations(current.title || "").replace(/:\s*$/g, "").trim();
    const items = current.items.map((x) => stripMarkdownDecorations(x)).filter(Boolean);
    const sectionText = stripMarkdownDecorations(current.text || "");
    const hasContent = items.length > 0 || sectionText.length > 0;
    if (title && hasContent) sections.push({ title, items, text: sectionText });
    current = null;
  };

  const isHeading = (line: string): string | null => {
    const t = line.trim();
    if (!t) return null;

    // Example: **Resumo:** or **Cards em Andamento:**
    const boldHeading = t.match(/^\*{2,}\s*([^*]+?)\s*\*{2,}\s*:?\s*$/);
    if (boldHeading?.[1]) return boldHeading[1];

    // Example: ## Título
    const hashHeading = t.match(/^#{1,3}\s*(.+?)\s*$/);
    if (hashHeading?.[1]) return hashHeading[1];

    // Example: Resumo executivo:
    // Keep this conservative to avoid treating sentences with colons as headings.
    if (t.length <= 70) {
      const plainHeading = t.match(/^([^:]{2,70}?)\s*:\s*$/);
      if (plainHeading?.[1]) return plainHeading[1];
    }

    // Example: "Resumo" alone on its own line.
    if (t.length <= 70 && !t.startsWith("-") && !t.startsWith("•") && !/^[0-9]+[.)]\s+/.test(t)) {
      const looksLikeShortLabel = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s-]+$/.test(t) && !t.includes("http");
      if (looksLikeShortLabel && !t.includes(",")) return t;
    }

    return null;
  };

  const bulletItem = (line: string): string | null => {
    const t = line.trim();
    const bullet = t.match(/^[-•*]\s+(.*)$/);
    if (bullet?.[1]) return bullet[1];
    const numbered = t.match(/^\d+[.)]\s+(.*)$/);
    if (numbered?.[1]) return numbered[1];
    return null;
  };

  for (const rawLine of lines) {
    const heading = isHeading(rawLine);
    if (heading) {
      pushCurrent();
      current = { title: heading, items: [], text: "" };
      continue;
    }

    const item = bulletItem(rawLine);
    if (item) {
      if (!current) current = { title: "Conteúdo organizado", items: [], text: "" };
      current.items.push(stripMarkdownDecorations(item));
      continue;
    }

    if (!current) current = { title: "Conteúdo organizado", items: [], text: "" };

    // If we already have items, treat non-bullet lines as a continuation of the previous item.
    if (current.items.length > 0) {
      const prevIdx = current.items.length - 1;
      current.items[prevIdx] = `${current.items[prevIdx]} ${stripMarkdownDecorations(rawLine)}`.trim();
    } else {
      current.text = `${current.text}${current.text ? "\n" : ""}${stripMarkdownDecorations(rawLine)}`.trim();
    }
  }

  pushCurrent();

  // Fallback: if parsing produced nothing usable, return a single section.
  if (!sections.length) {
    return [{ title: "Conteúdo organizado", items: [], text: text.slice(0, 4000) }];
  }

  // Avoid rendering unbounded sections.
  return sections.slice(0, 6);
}

function renderOrganizedContext(raw: string) {
  const sections = parseOrganizedContext(raw);
  if (!sections.length) {
    return <p className="text-xs text-[var(--flux-text-muted)]">Sem contexto organizado para este resumo.</p>;
  }

  return (
    <div className="space-y-2">
      {sections.map((section, idx) => (
        <div key={`${section.title}-${idx}`} className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
            {section.title}
          </div>
          {section.items.length ? (
            <ul className="list-disc pl-4 space-y-1">
              {section.items.map((it, i) => (
                <li key={`${idx}-${i}`} className="text-xs text-[var(--flux-text)] leading-relaxed">
                  {it}
                </li>
              ))}
            </ul>
          ) : section.text ? (
            <p className="text-xs text-[var(--flux-text)] whitespace-pre-line leading-relaxed">{section.text}</p>
          ) : (
            <p className="text-xs text-[var(--flux-text-muted)]">Sem itens.</p>
          )}
        </div>
      ))}
    </div>
  );
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
  const [dailyTab, setDailyTab] = useState<"entrada" | "historico" | "status">("entrada");
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [dailyStatusPhase, setDailyStatusPhase] = useState<DailyStatusPhase>("idle");
  const [dailyHistoryExpandedId, setDailyHistoryExpandedId] = useState<string | null>(null);
  const [dailyHistoryCreatedCardsExpandedId, setDailyHistoryCreatedCardsExpandedId] = useState<string | null>(null);
  const [dailyHistoryDateFrom, setDailyHistoryDateFrom] = useState("");
  const [dailyHistoryDateTo, setDailyHistoryDateTo] = useState("");
  const [dailyHistorySearchQuery, setDailyHistorySearchQuery] = useState("");

  const { pushToast } = useToast();

  const [dailyDeleteConfirmId, setDailyDeleteConfirmId] = useState<string | null>(null);
  const [csvImportMode, setCsvImportMode] = useState<"replace" | "merge">("replace");
  const [csvImportConfirm, setCsvImportConfirm] = useState<{
    count: number;
    cards: CardData[];
    mode: "replace" | "merge";
    sameIdCount: number;
  } | null>(null);
  const anyConfirmOpen = Boolean(dailyDeleteConfirmId || csvImportConfirm);

  const dailyRequestSeqRef = useRef(0);
  const dailyAbortControllerRef = useRef<AbortController | null>(null);
  const dailyInFlightRef = useRef(false);
  const DAILY_INSIGHT_TIMEOUT_MS = 60000;

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
    onClose: () => setDailyOpen(false),
    containerRef: dailyDialogRef,
    initialFocusRef: dailyCloseRef,
  });

  const buckets = db.config.bucketOrder;
  const boardLabels =
    db.config.labels && db.config.labels.length > 0 ? db.config.labels : filterLabels;
  const collapsed = new Set(db.config.collapsedColumns || []);
  const cards = db.cards;
  const dailyInsights = Array.isArray(db.dailyInsights) ? db.dailyInsights : [];

  const normalizeSearchText = useCallback((value: string) => {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }, []);

  const toLocalDateInputValue = useCallback((isoDate: string | undefined) => {
    if (!isoDate) return "";
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return "";
    const tzOffsetMs = dt.getTimezoneOffset() * 60000;
    return new Date(dt.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  }, []);

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
              descricao: String(item?.descricao || "").trim(),
              prioridade: normDailyPrio(item?.prioridade),
              progresso: normDailyProg(item?.progresso),
              coluna: String(item?.coluna || "").trim(),
              tags: Array.isArray(item?.tags)
                ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 6)
                : [],
              dataConclusao: String(item?.dataConclusao || "").trim(),
              direcionamento: String(item?.direcionamento || "").trim().toLowerCase(),
            };
          })
          .filter(Boolean) as Array<{
          titulo: string;
          descricao: string;
          prioridade: string;
          progresso: string;
          coluna: string;
          tags: string[];
          dataConclusao: string;
          direcionamento: string;
        }>
      : [];
    if (detailed.length > 0) return detailed;
    const fallback = Array.isArray(insight.criar) ? insight.criar : [];
    return fallback
      .map((txt) => {
        const titulo = String(txt || "").trim();
        if (!titulo) return null;
        return {
          titulo,
          descricao: "Detalhar escopo, impacto esperado e critérios de aceite.",
          prioridade: "Média",
          progresso: "Não iniciado",
          coluna: "",
          tags: [],
          dataConclusao: "",
          direcionamento: "",
        };
      })
      .filter(Boolean) as Array<{
      titulo: string;
      descricao: string;
      prioridade: string;
      progresso: string;
      coluna: string;
      tags: string[];
      dataConclusao: string;
      direcionamento: string;
    }>;
  };

  const createCardsFromInsight = (entryId?: string) => {
    const entry = entryId ? dailyInsights.find((x) => x?.id === entryId) : dailyInsights[0];
    if (!entry?.insight) {
      pushToast({ kind: "error", title: "Resumo não encontrado." });
      return;
    }
    const suggestions = getDailyCreateSuggestions(entry);
    if (!suggestions.length) {
      pushToast({ kind: "error", title: "Não há itens em 'Criar' para transformar em card." });
      return;
    }
    const nowIso = new Date().toISOString();
    updateDb((prev) => {
      const bucketOrder = prev.config.bucketOrder || [];
      const normalizeCardTitle = (value: string) =>
        String(value || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const existingCardTitles = new Set(prev.cards.map((c) => normalizeCardTitle(c.title)));
      const backlogKey =
        bucketOrder.find((b) => String(b.label || "").toLowerCase() === "backlog")?.key ||
        bucketOrder[0]?.key ||
        "Backlog";
      const nextOrderByBucket: Record<string, number> = {};
      const created: CardData[] = [];
      const createdCardsPayload: DailyCreatedCard[] = [];
      let createdCount = 0;
      let existingCount = 0;

      suggestions.forEach((s, idx) => {
        const normalizedTitle = normalizeCardTitle(s.titulo);
        const alreadyExists = existingCardTitles.has(normalizedTitle);
        const lowerCol = String(s.coluna || "").trim().toLowerCase();
        const mapped = lowerCol
          ? bucketOrder.find(
              (b) =>
                String(b.key || "").toLowerCase() === lowerCol ||
                String(b.label || "").toLowerCase() === lowerCol
            )
          : null;
        const bucketKey = mapped ? mapped.key : backlogKey;
        if (!(bucketKey in nextOrderByBucket)) {
          nextOrderByBucket[bucketKey] = prev.cards.filter((c) => c.bucket === bucketKey).length;
        }
        const cardPayload: DailyCreatedCard = {
          cardId: alreadyExists ? `EXISTENTE-${idx + 1}` : `AI-${Date.now()}-${idx + 1}`,
          title: s.titulo,
          bucket: bucketKey,
          priority: normDailyPrio(s.prioridade),
          progress: normDailyProg(s.progresso),
          desc: s.descricao || "Criado automaticamente a partir da Daily IA.",
          tags: s.tags?.length ? s.tags : ["Reborn"],
          direction: directions.map((d) => d.toLowerCase()).includes(String(s.direcionamento || "").toLowerCase())
            ? String(s.direcionamento).toLowerCase()
            : null,
          dueDate: s.dataConclusao || null,
          createdAt: nowIso,
          status: alreadyExists ? "existing" : "created",
        };
        if (!alreadyExists) {
          created.push({
            id: cardPayload.cardId,
            bucket: cardPayload.bucket,
            priority: cardPayload.priority,
            progress: cardPayload.progress,
            title: cardPayload.title,
            desc: cardPayload.desc,
            tags: cardPayload.tags,
            links: [],
            direction: cardPayload.direction,
            dueDate: cardPayload.dueDate,
            order: nextOrderByBucket[bucketKey]++,
          } as CardData);
          existingCardTitles.add(normalizedTitle);
          createdCount++;
        } else {
          existingCount++;
        }
        createdCardsPayload.push(cardPayload);
      });
      const nextDailyInsights = Array.isArray(prev.dailyInsights)
        ? prev.dailyInsights.map((insightEntry) => {
            if (!entryId || insightEntry?.id !== entryId) return insightEntry;
            const previousCreated = Array.isArray(insightEntry.createdCards) ? insightEntry.createdCards : [];
            return {
              ...insightEntry,
              createdCards: [...createdCardsPayload, ...previousCreated].slice(0, 100),
            };
          })
        : prev.dailyInsights;
      window.setTimeout(() => {
        if (createdCount > 0 && existingCount > 0) {
          pushToast({
            kind: "success",
            title: `${createdCount} card(s) criado(s) com sucesso.`,
            description: `${existingCount} item(ns) já existia(m) no board e foram apenas sinalizados.`,
          });
          return;
        }
        if (createdCount > 0) {
          pushToast({ kind: "success", title: `${createdCount} card(s) criado(s) com sucesso.` });
          return;
        }
        pushToast({
          kind: "info",
          title: "Nenhum novo card criado.",
          description: "Todos os itens sugeridos já existem no board.",
        });
      }, 0);
      return { ...prev, cards: [...prev.cards, ...created], dailyInsights: nextDailyInsights };
    });
    if (entryId) {
      setDailyHistoryCreatedCardsExpandedId(entryId);
    }
  };

  const loadDailyTranscriptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || "");
      setDailyTranscript(text.slice(0, DAILY_SESSION_MAX_TRANSCRIPT_CHARS));
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

  const performDeleteDailyHistoryEntry = (entryId: string) => {
    const nextEntry = dailyInsights.find((entry) => entry?.id && entry.id !== entryId);
    updateDb((prev) => ({
      ...prev,
      dailyInsights: (Array.isArray(prev.dailyInsights) ? prev.dailyInsights : []).filter((entry) => entry?.id !== entryId),
    }));
    if (dailyHistoryExpandedId === entryId) setDailyHistoryExpandedId(nextEntry?.id ? String(nextEntry.id) : null);
    if (dailyHistoryCreatedCardsExpandedId === entryId) {
      setDailyHistoryCreatedCardsExpandedId(nextEntry?.id ? String(nextEntry.id) : null);
    }
  };

  const deleteDailyHistoryEntry = (entryId: string) => {
    setDailyDeleteConfirmId(entryId);
  };

  const buildDailyContextDoc = (entry: DailyInsightEntry) => {
    const insight = entry?.insight;
    const dt = entry?.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
    const createItems = getDailyCreateSuggestions(entry);
    const ajustar = Array.isArray(insight?.ajustar) ? insight?.ajustar : [];
    const corrigir = Array.isArray(insight?.corrigir) ? insight?.corrigir : [];
    const pendencias = Array.isArray(insight?.pendencias) ? insight?.pendencias : [];
    const curated = String(insight?.contextoOrganizado || "").trim();
    const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
    const modelName = String(entry?.generationMeta?.model || "").trim();
    const blocks = [
      `Resumo Daily IA${dt ? ` - ${dt}` : ""}`,
      "",
      generatedWithAi ? `Texto aprimorado por IA${modelName ? ` (${modelName})` : ""}` : "Texto estruturado automaticamente",
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
      ...(createItems.length
        ? createItems.map((x, i) =>
            `${i + 1}. ${x.titulo}${
              x.descricao ? `\n   Descrição: ${x.descricao}` : ""
            }${x.coluna ? `\n   Coluna sugerida: ${x.coluna}` : ""}${
              x.dataConclusao ? `\n   Prazo sugerido: ${x.dataConclusao}` : ""
            }`
          )
        : ["- Sem itens identificados."]),
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
      pushToast({ kind: "error", title: "Não há contexto para copiar." });
      return;
    }
    if (!navigator?.clipboard?.writeText) {
      pushToast({ kind: "warning", title: "Seu navegador não suporta cópia automática." });
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      pushToast({ kind: "success", title: "Contexto copiado para a área de transferência." });
    } catch {
      pushToast({ kind: "error", title: "Não foi possível copiar o contexto." });
    }
  };

  const generateDailyInsight = async () => {
    const transcript = dailyTranscript.trim();
    if (!transcript) {
      pushToast({ kind: "error", title: "Informe ou anexe a transcrição da daily." });
      return;
    }
    // Evita reentrância / cliques duplos durante a geração.
    if (dailyInFlightRef.current) return;
    dailyInFlightRef.current = true;
    const requestSeq = ++dailyRequestSeqRef.current;
    const controller = new AbortController();
    dailyAbortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), DAILY_INSIGHT_TIMEOUT_MS);

    const startedAt = new Date().toISOString();
    setDailyGenerating(true);
    setDailyTab("status");
    setDailyStatusPhase("preparing");
    setDailyLogs((prev) => [
      {
        timestamp: startedAt,
        status: "start" as DailyLogStatus,
        message: "Iniciando geração do resumo prático...",
      },
      ...prev,
    ].slice(0, 50));
    try {
      setDailyStatusPhase("requesting");
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/daily-insights`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ transcript, fileName: dailySourceFileName || undefined }),
        signal: controller.signal,
      });
      setDailyStatusPhase("processing");
      const data = await response.json();
      if (!response.ok) {
        setDailyStatusPhase("error");
        setDailyLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            status: "error" as DailyLogStatus,
            message: String(data?.error || "Erro ao gerar resumo."),
            errorKind: data?.llmDebug?.errorKind,
            errorMessage: data?.llmDebug?.errorMessage,
            provider: data?.llmDebug?.provider,
            model: data?.llmDebug?.model,
          } as DailyLog,
          ...prev,
        ].slice(0, 50));
        pushToast({ kind: "error", title: String(data?.error || "Erro ao gerar resumo.") });
        return;
      }
      updateDb((prev) => {
        const current = Array.isArray(prev.dailyInsights) ? prev.dailyInsights : [];
        const next = [data.entry, ...current.filter((x) => x?.id !== data.entry?.id)].slice(0, 20);
        return { ...prev, dailyInsights: next };
      });
      setDailyHistoryExpandedId(String(data?.entry?.id || ""));
      const modelName = String(
        data?.llmDebug?.model || data?.entry?.generationMeta?.model || ""
      ).trim();
      const providerName = String(
        data?.llmDebug?.provider || data?.entry?.generationMeta?.provider || ""
      ).trim();
      const generatedWithAI = Boolean(
        data?.llmDebug?.generatedWithAI ?? data?.entry?.generationMeta?.usedLlm
      );
      const errorKind = String(
        data?.llmDebug?.errorKind || data?.entry?.generationMeta?.errorKind || ""
      ).trim();
      const errorMessage = String(data?.llmDebug?.errorMessage || "").trim();
      const hasRealLlmFailure = Boolean(errorKind) || !generatedWithAI;
      const insightResumo = String(data?.entry?.insight?.resumo || "").trim();
      setDailyStatusPhase("done");

      // Log de sucesso / fallback, explicitando conectividade com IA
      setDailyLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "success" as DailyLogStatus,
          message: generatedWithAI
            ? "Modelo gerado com sucesso."
            : "Resumo estruturado sem uso efetivo da IA (modo heurístico).",
          model: modelName || undefined,
          provider: providerName || undefined,
          resultSnippet: insightResumo
            ? `Resumo: ${insightResumo.slice(0, 200)}${insightResumo.length > 200 ? "..." : ""}`
            : undefined,
        } as DailyLog,
        // Quando existir erro de integração com IA, logar claramente mesmo com fallback bem-sucedido
        ...(hasRealLlmFailure
          ? ([
              {
                timestamp: new Date().toISOString(),
                status: "error" as DailyLogStatus,
                message: `Falha na integração com IA${
                  providerName ? ` (${providerName})` : ""
                }${modelName ? ` - modelo: ${modelName}` : ""}${
                  errorKind ? ` [${errorKind}]` : ""
                }. Conteúdo tratado em modo heurístico.`,
                errorKind,
                errorMessage: errorMessage || undefined,
                provider: providerName || undefined,
                model: modelName || undefined,
              } as DailyLog,
            ] as DailyLog[])
          : []),
        ...prev,
      ].slice(0, 50));
    } catch (err) {
      const isAbort = err instanceof Error && (err as unknown as { name?: string }).name === "AbortError";
      setDailyStatusPhase("error");
      setDailyLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "error" as DailyLogStatus,
          message: isAbort ? "Tempo esgotado ao gerar a Daily IA." : "Erro ao gerar resumo com IA.",
        },
        ...prev,
      ].slice(0, 50));
      pushToast({
        kind: isAbort ? "warning" : "error",
        title: isAbort ? "Tempo esgotado ao gerar a Daily IA." : "Erro ao gerar resumo com IA.",
      });
    } finally {
      window.clearTimeout(timeoutId);
      dailyInFlightRef.current = false;
      if (dailyAbortControllerRef.current === controller) dailyAbortControllerRef.current = null;
      if (dailyRequestSeqRef.current === requestSeq) {
        setDailyGenerating(false);
      }
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
        pushToast({ kind: "error", title: "CSV vazio." });
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
        pushToast({ kind: "error", title: "Coluna 'Título' não encontrada." });
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
        pushToast({ kind: "error", title: "Nenhum card." });
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

  const normalizedDailyHistorySearchQuery = useMemo(
    () => normalizeSearchText(dailyHistorySearchQuery),
    [dailyHistorySearchQuery, normalizeSearchText]
  );

  const filteredDailyInsights = useMemo(() => {
    return dailyInsights.filter((entry) => {
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
        ...(Array.isArray(insight?.criarDetalhes)
          ? insight.criarDetalhes.map((item) => String(item?.titulo || ""))
          : []),
        entry?.transcript,
        entry?.sourceFileName,
      ]
        .map((item) => String(item || ""))
        .join(" \n ");

      return normalizeSearchText(searchable).includes(normalizedDailyHistorySearchQuery);
    });
  }, [
    dailyInsights,
    dailyHistoryDateFrom,
    dailyHistoryDateTo,
    normalizedDailyHistorySearchQuery,
    toLocalDateInputValue,
    normalizeSearchText,
  ]);

  const activeDailyHistoryId = useMemo(() => {
    return (
      (dailyHistoryExpandedId &&
        filteredDailyInsights.some((entry) => String(entry?.id || "") === dailyHistoryExpandedId)
        ? dailyHistoryExpandedId
        : String(filteredDailyInsights[0]?.id || "")) || null
    );
  }, [dailyHistoryExpandedId, filteredDailyInsights]);

  const activeCreatedCardsExpandedId = useMemo(() => {
    return (
      (dailyHistoryCreatedCardsExpandedId &&
      filteredDailyInsights.some((entry) => String(entry?.id || "") === dailyHistoryCreatedCardsExpandedId)
        ? dailyHistoryCreatedCardsExpandedId
        : activeDailyHistoryId) || null
    );
  }, [dailyHistoryCreatedCardsExpandedId, filteredDailyInsights, activeDailyHistoryId]);

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

  const statusStepIndex =
    dailyStatusPhase === "preparing"
      ? 1
      : dailyStatusPhase === "requesting"
        ? 2
        : dailyStatusPhase === "processing"
          ? 3
          : dailyStatusPhase === "done"
            ? 4
            : dailyStatusPhase === "error"
              ? 0
              : 0;

  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    if (!storage) return;
    try {
      const raw = storage.getItem(DAILY_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<DailySessionState>;
      if (typeof parsed.transcript === "string") setDailyTranscript(parsed.transcript.slice(0, DAILY_SESSION_MAX_TRANSCRIPT_CHARS));
      if (typeof parsed.fileName === "string") setDailyFileName(parsed.fileName || "Nenhum arquivo anexado");
      if (typeof parsed.sourceFileName === "string") setDailySourceFileName(parsed.sourceFileName);
      if (parsed.tab === "entrada" || parsed.tab === "historico" || parsed.tab === "status") setDailyTab(parsed.tab);
      if (Array.isArray(parsed.logs)) setDailyLogs(parsed.logs.slice(0, 50));
      if (
        parsed.statusPhase === "idle" ||
        parsed.statusPhase === "preparing" ||
        parsed.statusPhase === "requesting" ||
        parsed.statusPhase === "processing" ||
        parsed.statusPhase === "done" ||
        parsed.statusPhase === "error"
      ) {
        setDailyStatusPhase(parsed.statusPhase);
      }
      if (typeof parsed.historyExpandedId === "string" || parsed.historyExpandedId === null) {
        setDailyHistoryExpandedId(parsed.historyExpandedId ?? null);
      }
      if (
        typeof parsed.historyCreatedCardsExpandedId === "string" ||
        parsed.historyCreatedCardsExpandedId === null
      ) {
        setDailyHistoryCreatedCardsExpandedId(parsed.historyCreatedCardsExpandedId ?? null);
      }
      if (typeof parsed.historyDateFrom === "string") setDailyHistoryDateFrom(parsed.historyDateFrom);
      if (typeof parsed.historyDateTo === "string") setDailyHistoryDateTo(parsed.historyDateTo);
      if (typeof parsed.historySearchQuery === "string") setDailyHistorySearchQuery(parsed.historySearchQuery);
      if (parsed.generating) {
        setDailyGenerating(true);
        setDailyOpen(true);
        setDailyTab("status");
      }
    } catch {
      // Se houver lixo no storage, ignora silenciosamente.
    }
  }, []);

  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    if (!storage) return;

    const timeoutId = window.setTimeout(() => {
      // Limitar tamanho para reduzir chance de quota estourar.
      const transcriptToStore = dailyTranscript.slice(0, DAILY_SESSION_MAX_TRANSCRIPT_CHARS);

      let payload: DailySessionState = {
        transcript: transcriptToStore,
        fileName: dailyFileName,
        sourceFileName: dailySourceFileName,
        generating: dailyGenerating,
        tab: dailyTab,
        logs: dailyLogs.slice(0, 50),
        statusPhase: dailyStatusPhase,
        historyExpandedId: dailyHistoryExpandedId,
        historyCreatedCardsExpandedId: dailyHistoryCreatedCardsExpandedId,
        historyDateFrom: dailyHistoryDateFrom,
        historyDateTo: dailyHistoryDateTo,
        historySearchQuery: dailyHistorySearchQuery,
      };

      try {
        // Guard adicional: se o JSON estiver grande demais, reduz/transfoma transcript.
        let json = JSON.stringify(payload);
        if (json.length > DAILY_SESSION_MAX_JSON_CHARS) {
          const hardTranscript = transcriptToStore.slice(0, Math.min(3500, DAILY_SESSION_MAX_TRANSCRIPT_CHARS));
          payload = { ...payload, transcript: hardTranscript };
          json = JSON.stringify(payload);
          if (json.length > DAILY_SESSION_MAX_JSON_CHARS) {
            payload = { ...payload, transcript: "" };
          }
        }

        storage.setItem(DAILY_SESSION_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Falha de quota/permissão não deve interromper o fluxo.
        // Remover a chave é melhor do que ficar tentando gravar repetidamente.
        try {
          storage.removeItem(DAILY_SESSION_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }, DAILY_SESSION_WRITE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    dailyTranscript,
    dailyFileName,
    dailySourceFileName,
    dailyGenerating,
    dailyTab,
    dailyLogs,
    dailyStatusPhase,
    dailyHistoryExpandedId,
    dailyHistoryCreatedCardsExpandedId,
    dailyHistoryDateFrom,
    dailyHistoryDateTo,
    dailyHistorySearchQuery,
  ]);

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
          <CustomTooltip content={priorityBarVisible ? "Ocultar filtros" : "Mostrar filtros"} position="bottom">
            <button
              type="button"
              onClick={() => setPriorityBarVisible((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--flux-rad-sm)] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.08)] transition-all duration-200 font-display group shrink-0"
              aria-label={priorityBarVisible ? "Ocultar filtros" : "Mostrar filtros"}
            >
              <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
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
                onClick={() => {
                  setDailyOpen(true);
                  if (dailyGenerating) setDailyTab("status");
                }}
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
                <select
                  value={csvImportMode}
                  onChange={(e) => setCsvImportMode(e.target.value as "replace" | "merge")}
                  className="px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[rgba(108,92,231,0.25)] outline-none transition-all duration-200"
                  aria-label="Modo de importação CSV"
                >
                  <option value="replace">Substituir</option>
                  <option value="merge">Mesclar</option>
                </select>
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
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Arraste e solte cards usando teclado. Use Tab para focar um card. Pressione Enter/Espaço para iniciar o arrasto. Use as setas para alternar entre as colunas/posições e pressione Enter/Espaço para soltar.",
            },
            announcements: {
              onDragStart: ({ active }) => {
                const activeId = String(active.id);
                if (activeId.startsWith("card-")) {
                  const cardId = activeId.replace("card-", "");
                  const card = cards.find((c) => c.id === cardId);
                  return card ? `Iniciando arrasto do card: ${card.title}.` : "Iniciando arrasto do card.";
                }
                const col = buckets.find((b) => b.key === activeId);
                return col ? `Iniciando arrasto da coluna: ${col.label}.` : "Iniciando arrasto da coluna.";
              },
              onDragOver: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) {
                  const bucketKey = overId.replace("bucket-", "");
                  const col = buckets.find((b) => b.key === bucketKey);
                  return col ? `Soltar na coluna: ${col.label}.` : "Soltar na coluna.";
                }
                const slotInfo = parseSlotId(overId);
                if (slotInfo) {
                  const col = buckets.find((b) => b.key === slotInfo.bucketKey);
                  const pos = slotInfo.index + 1;
                  return col
                    ? `Soltar na coluna: ${col.label}, posição ${pos}.`
                    : `Soltar na coluna, posição ${pos}.`;
                }
                return;
              },
              onDragEnd: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) return "Card/coluna solto.";
                const slotInfo = parseSlotId(overId);
                if (slotInfo) return "Card/coluna solto.";
                return "Card/coluna solto.";
              },
              onDragCancel: () => "Arrasto cancelado.",
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
          <CustomTooltip content="Nova coluna" position="right">
            <button
              type="button"
              onClick={() => {
                setEditingColumnKey(null);
                setNewColumnName("");
                setAddColumnOpen(true);
              }}
              className="shrink-0 min-w-[44px] w-[44px] h-[80px] rounded-[var(--flux-rad)] border border-dashed border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] flex items-center justify-center text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.08)] transition-all cursor-pointer group opacity-80 hover:opacity-100"
              aria-label="Nova coluna"
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
            ref={addColumnDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-column-title"
            tabIndex={-1}
          >
            <h3 id="add-column-title" className="font-display font-bold text-[var(--flux-text)] mb-4">
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
              ref={addColumnInputRef}
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
                ? `Excluir "${cards.find((c) => c.id === confirmDelete.id)?.title}"?`
                : `Excluir a coluna "${confirmDelete.label}"?`}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary"
                ref={confirmDeleteCancelRef}
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

      <ConfirmDialog
        open={dailyDeleteConfirmId !== null}
        title="Excluir este resumo do histórico da Daily IA?"
        description="Esta ação não pode ser desfeita."
        intent="danger"
        confirmText="Excluir"
        cancelText="Cancelar"
        onCancel={() => setDailyDeleteConfirmId(null)}
        onConfirm={() => {
          if (!dailyDeleteConfirmId) return;
          performDeleteDailyHistoryEntry(dailyDeleteConfirmId);
          setDailyDeleteConfirmId(null);
          pushToast({ kind: "success", title: "Resumo excluído." });
        }}
      />

      <ConfirmDialog
        open={csvImportConfirm !== null}
        title={
          csvImportConfirm
            ? csvImportConfirm.mode === "replace"
              ? `Importar ${csvImportConfirm.count} cards? Substitui os atuais.`
              : `Mesclar ${csvImportConfirm.count} cards?`
            : ""
        }
        description={
          csvImportConfirm
            ? csvImportConfirm.mode === "replace"
              ? "Confirme para substituir o conteúdo atual do board."
              : `Atualizará ${csvImportConfirm.sameIdCount} card(s) existentes e adicionará ${
                  csvImportConfirm.count - csvImportConfirm.sameIdCount
                }.`
            : undefined
        }
        intent="danger"
        confirmText={csvImportConfirm?.mode === "merge" ? "Mesclar" : "Importar"}
        cancelText="Cancelar"
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
            title: csvImportConfirm.mode === "merge" ? `Mesclagem concluída (${count} cards).` : `Importação concluída (${count} cards).`,
          });
        }}
      />

      {dailyOpen && (
        <div className="fixed inset-0 bg-black/50 z-[410] flex items-center justify-center p-4" onClick={() => setDailyOpen(false)}>
          <div
            className="w-full max-w-5xl h-[90vh] bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] p-5 flex flex-col"
            onClick={(e) => e.stopPropagation()}
            ref={dailyDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-ia-title"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 id="daily-ia-title" className="font-display font-bold text-[var(--flux-text)] text-base">
                  Daily IA
                </h3>
                <p className="text-xs text-[var(--flux-text-muted)]">Board: {boardName || "Board"}</p>
              </div>
              <button ref={dailyCloseRef} type="button" className="btn-secondary" onClick={() => setDailyOpen(false)}>
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
              <button
                type="button"
                className={`btn-bar ${dailyTab === "status" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
                onClick={() => setDailyTab("status")}
              >
                Status {dailyGenerating ? "• em andamento" : ""}
              </button>
            </div>
            {dailyTab === "entrada" ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <p className="text-xs text-[var(--flux-text-muted)] mb-3">
                  Cole a transcrição da daily (ou anexe arquivo .txt/.md) para gerar uma visão prática dos próximos passos.
                </p>
                {dailyGenerating && (
                  <div className="mb-3 rounded-[10px] border border-[rgba(108,92,231,0.35)] bg-[rgba(108,92,231,0.12)] px-3 py-2">
                    <p className="text-xs text-[var(--flux-primary-light)] font-semibold">
                      Geracao em andamento. Acompanhe pela guia Status.
                    </p>
                    <p className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                      Voce pode fechar e reabrir este modal sem perder o progresso atual.
                    </p>
                  </div>
                )}
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
                    {dailyGenerating ? "Analisando e gerando com IA..." : "Gerar resumo prático"}
                  </button>
                </div>
              </div>
            ) : dailyTab === "status" ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <div className="mb-3 rounded-[10px] border border-[rgba(108,92,231,0.28)] bg-[var(--flux-surface-mid)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-xs font-semibold text-[var(--flux-primary-light)]">
                      Acompanhamento da geração
                    </div>
                    <div className="text-[11px] text-[var(--flux-text-muted)]">
                      {dailyGenerating ? "Processando..." : dailyStatusPhase === "done" ? "Concluído" : dailyStatusPhase === "error" ? "Falha" : "Aguardando"}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                    <div
                      className="h-full bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(6, Math.min(100, statusStepIndex * 25))}%`,
                        opacity: dailyGenerating ? 0.95 : 0.8,
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
                    {["Preparando", "Enviando", "Processando", "Concluído"].map((step, idx) => {
                      const stepPos = idx + 1;
                      const active = statusStepIndex >= stepPos;
                      return (
                        <div
                          key={step}
                          className={`text-[10px] rounded-[6px] px-2 py-1 border ${
                            active
                              ? "border-[rgba(108,92,231,0.45)] text-[var(--flux-primary-light)] bg-[rgba(108,92,231,0.12)]"
                              : "border-[rgba(255,255,255,0.1)] text-[var(--flux-text-muted)]"
                          }`}
                        >
                          {step}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {dailyLogs.length > 0 ? (
                  <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[rgba(108,92,231,0.35)] rounded-[10px] p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                        Log de conectividade com IA
                      </div>
                      <button
                        type="button"
                        className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                        onClick={() => setDailyLogs([])}
                      >
                        Limpar log
                      </button>
                    </div>
                    <div className="max-h-40 overflow-auto space-y-1 scrollbar-flux">
                      {dailyLogs.map((log, index) => {
                        const dt = new Date(log.timestamp).toLocaleTimeString("pt-BR");
                        const baseClass =
                          log.status === "success"
                            ? "text-[var(--flux-primary-light)]"
                            : log.status === "error"
                              ? "text-[#F97373]"
                              : "text-[var(--flux-text-muted)]";
                        return (
                          <div
                            key={`${log.timestamp}-${index}`}
                            className="text-[11px] flex items-start gap-2"
                          >
                            <span className="text-[10px] text-[var(--flux-text-muted)] min-w-[54px]">
                              {dt}
                            </span>
                            <div className={`flex-1 ${baseClass} space-y-0.5`}>
                              <div>{log.message}</div>
                              {(log.provider || log.model) && (
                                <div className="text-[10px] text-[var(--flux-text-muted)]">
                                  {log.provider && <span>LLM: {log.provider}</span>}
                                  {log.provider && log.model && <span> • </span>}
                                  {log.model && <span>Modelo: {log.model}</span>}
                                </div>
                              )}
                              {log.errorKind && (
                                <div className="text-[10px] text-[var(--flux-text-muted)]">
                                  Erro IA: {log.errorKind}
                                  {log.errorMessage ? ` - ${log.errorMessage}` : ""}
                                </div>
                              )}
                              {log.resultSnippet && (
                                <div className="text-[10px] text-[var(--flux-text-muted)] whitespace-pre-wrap">
                                  {log.resultSnippet}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--flux-text-muted)]">
                    O status aparecerá aqui assim que a geração for iniciada.
                  </p>
                )}
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
                  {filteredDailyInsights.length > 0 && (
                    <div className="mt-3 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[10px] p-2">
                      <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1">
                        Lista de históricos
                      </div>
                      <div className="max-h-40 overflow-auto scrollbar-flux divide-y divide-[rgba(255,255,255,0.06)]">
                        {filteredDailyInsights.map((entry, idx) => {
                          const insight = entry.insight;
                          if (!insight) return null;
                          const dt = entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                          const createItems = getDailyCreateSuggestions(entry);
                          const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                          const isActive = activeDailyHistoryId === String(entry.id || "");
                          return (
                            <button
                              key={entry.id || idx}
                              type="button"
                              onClick={() => setDailyHistoryExpandedId(String(entry.id || ""))}
                              className={`w-full flex items-center justify-between gap-2 py-1.5 px-1.5 text-left transition-colors ${
                                isActive
                                  ? "bg-[rgba(108,92,231,0.16)]"
                                  : "hover:bg-[rgba(108,92,231,0.08)]"
                              }`}
                            >
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                                  {insight.resumo || "Resumo sem título"}
                                </span>
                                <span className="text-[10px] text-[var(--flux-text-muted)]">
                                  {dt || "Sem data"} • {createItems.length} item(ns) em "Criar"
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {generatedWithAi && (
                                  <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(108,92,231,0.5)] text-[var(--flux-primary-light)]">
                                    IA
                                  </span>
                                )}
                                <span className="text-[10px] text-[var(--flux-text-muted)]">
                                  #{filteredDailyInsights.length - idx}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {filteredDailyInsights.map((entry, idx) => {
                  const insight = entry.insight;
                  if (!insight) return null;
                  const dt = entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                  const title = idx === 0 ? "Resumo mais recente" : `Histórico #${filteredDailyInsights.length - idx}`;
                  const createItems = getDailyCreateSuggestions(entry);
                  const isExpanded = activeDailyHistoryId === String(entry.id || "");
                  const sourceName = String(entry.sourceFileName || "Transcrição manual");
                  const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                  const aiModel = String(entry?.generationMeta?.model || "").trim();
                  return (
                    <div
                      key={entry.id || idx}
                      className={`bg-[var(--flux-surface-mid)] border rounded-[12px] p-3 transition-colors ${
                        isExpanded
                          ? "border-[rgba(108,92,231,0.35)]"
                          : "border-[rgba(255,255,255,0.08)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left"
                          onClick={() => setDailyHistoryExpandedId(String(entry.id || ""))}
                        >
                          <span className="w-2 h-2 rounded-full bg-[var(--flux-primary)] shadow-[0_0_10px_rgba(108,92,231,0.6)]" />
                          <h4 className="font-display font-bold text-sm text-[var(--flux-text)]">
                            {title}
                            {dt ? ` • ${dt}` : ""}
                          </h4>
                          <span className="text-[10px] text-[var(--flux-text-muted)]">
                            {isExpanded ? "▲ Aberto" : "▼ Expandir"}
                          </span>
                        </button>
                        {!isExpanded && (
                          <span className="text-[10px] text-[var(--flux-text-muted)]">
                            {sourceName}
                          </span>
                        )}
                      </div>
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          isExpanded ? "max-h-[2400px] opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
                        }`}
                        aria-hidden={!isExpanded}
                      >
                        <div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
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
                          <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                            Fonte: {sourceName}
                            {entry.transcript ? ` • ${entry.transcript.length} caracteres processados` : ""}
                          </p>
                          {generatedWithAi && (
                            <CustomTooltip content="Conteudo reescrito e estruturado por IA a partir da transcricao.">
                              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[rgba(108,92,231,0.35)] bg-[rgba(108,92,231,0.14)] px-2 py-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--flux-primary)] shadow-[0_0_8px_rgba(108,92,231,0.6)]" />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
                                  Texto gerado com IA{aiModel ? ` • ${aiModel}` : ""}
                                </span>
                              </div>
                            </CustomTooltip>
                          )}
                          <p className="text-xs text-[var(--flux-text-muted)] mt-2">{insight.resumo || ""}</p>
                          <div className="mt-2 mb-2 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                                Contexto organizado
                              </div>
                              {generatedWithAi && (
                                <div className="text-[10px] font-semibold text-[var(--flux-primary-light)]/90">
                                  Organizado por IA
                                </div>
                              )}
                            </div>
                            {renderOrganizedContext(String(insight.contextoOrganizado || ""))}
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
                                            <div className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[var(--flux-surface-mid)] p-2">
                                              <div className="flex items-start justify-between gap-2">
                                                <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--flux-text)] leading-[1.35]">
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
                                              {item.descricao && (
                                                <p className="mt-1 text-[11px] text-[var(--flux-text-muted)] leading-relaxed whitespace-pre-line">
                                                  {item.descricao}
                                                </p>
                                              )}
                                              <div className="mt-1 flex flex-wrap gap-1">
                                                {item.coluna && (
                                                  <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(255,255,255,0.14)] text-[var(--flux-text-muted)]">
                                                    Coluna: {item.coluna}
                                                  </span>
                                                )}
                                                {item.dataConclusao && (
                                                  <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(255,255,255,0.14)] text-[var(--flux-text-muted)]">
                                                    Prazo: {item.dataConclusao}
                                                  </span>
                                                )}
                                                {item.tags?.map((tag) => (
                                                  <span
                                                    key={`${item.titulo}-${tag}`}
                                                    className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
                                                  >
                                                    {tag}
                                                  </span>
                                                ))}
                                              </div>
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
                                onClick={() => setDailyHistoryCreatedCardsExpandedId(String(entry.id || ""))}
                              >
                                {activeCreatedCardsExpandedId === String(entry.id || "")
                                  ? "Detalhes abertos"
                                  : "Ver todas as informações"}
                              </button>
                            </div>
                            <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                              {(Array.isArray(entry.createdCards) ? entry.createdCards.length : 0)} card(s) registrados.
                            </p>
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                activeCreatedCardsExpandedId === String(entry.id || "")
                                  ? "max-h-[1400px] opacity-100 mt-2"
                                  : "max-h-0 opacity-0 mt-0"
                              }`}
                              aria-hidden={activeCreatedCardsExpandedId !== String(entry.id || "")}
                            >
                              <div className="space-y-2">
                                {(Array.isArray(entry.createdCards) ? entry.createdCards : []).length ? (
                                  (entry.createdCards || []).map((createdCard, createdIdx) => (
                                    <div
                                      key={`${createdCard.cardId || "card"}-${createdIdx}`}
                                      className="border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2 bg-[var(--flux-surface-mid)]"
                                    >
                                      <div className="text-xs font-semibold text-[var(--flux-text)]">
                                        {createdCard.title || "Sem título"}
                                        {createdCard.status === "existing" && (
                                          <span className="ml-2 text-[10px] font-bold px-1.5 py-[1px] rounded-full border border-[rgba(255,217,61,0.3)] text-[#F59E0B] bg-[rgba(255,217,61,0.12)]">
                                            Card ja existente
                                          </span>
                                        )}
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
                            </div>
                          </div>
                        </div>
                      </div>
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
