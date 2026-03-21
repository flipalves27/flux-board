"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CardData, BucketConfig, CardLink, CardDocRef } from "@/app/board/[id]/page";
import { useToast } from "@/context/toast-context";
import { useTranslations } from "next-intl";
import {
  parseDescriptionToBlocks,
  serializeDescriptionBlocks,
} from "@/components/kanban/description-blocks";

export type AiContextPhase = "idle" | "preparing" | "requesting" | "processing" | "done" | "error";
export type AiLogStatus = "start" | "success" | "error";
export type AiContextLog = {
  timestamp: string;
  status: AiLogStatus;
  message: string;
  provider?: string;
  model?: string;
  errorKind?: string;
  errorMessage?: string;
  resultSnippet?: string;
};

export interface CardModalProps {
  card: CardData;
  mode: "new" | "edit";
  buckets: BucketConfig[];
  priorities: string[];
  progresses: string[];
  filterLabels: string[];
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
  onCreateLabel?: (label: string) => void;
  onDeleteLabel?: (label: string) => void;
  peerCards?: CardData[];
  onClose: () => void;
  onSave: (card: CardData) => void;
  onDelete?: (cardId: string) => void;
}

export type CardModalContextValue = {
  card: CardData;
  mode: "new" | "edit";
  cardId: string;
  boardId: string;
  boardName: string;
  buckets: BucketConfig[];
  priorities: string[];
  progresses: string[];
  filterLabels: string[];
  peerCards: CardData[];
  getHeaders: () => Record<string, string>;
  onClose: () => void;
  onSave: (card: CardData) => void;
  onDelete?: (cardId: string) => void;
  onCreateLabel?: (label: string) => void;
  onDeleteLabel?: (label: string) => void;

  id: string;
  setId: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  descBlocks: Record<string, string>;
  setDescBlocks: Dispatch<SetStateAction<Record<string, string>>>;
  bucket: string;
  setBucket: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  progress: string;
  setProgress: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  blockedBy: string[];
  setBlockedBy: Dispatch<SetStateAction<string[]>>;
  depSearch: string;
  setDepSearch: (v: string) => void;
  tags: Set<string>;
  setTags: Dispatch<SetStateAction<Set<string>>>;
  newLabel: string;
  setNewLabel: (v: string) => void;
  links: CardLink[];
  setLinks: Dispatch<SetStateAction<CardLink[]>>;
  docRefs: CardDocRef[];
  setDocRefs: Dispatch<SetStateAction<CardDocRef[]>>;
  docQuery: string;
  setDocQuery: (v: string) => void;
  docResults: Array<{ id: string; title: string; excerpt?: string }>;
  setDocResults: Dispatch<SetStateAction<Array<{ id: string; title: string; excerpt?: string }>>>;

  descriptionForSave: string;
  selfId: string;
  selectablePeers: CardData[];
  filteredPeers: CardData[];

  aiContextApplied: { usedLlm: boolean; provider?: string; model?: string; at: string } | null;
  setAiContextApplied: Dispatch<
    SetStateAction<{ usedLlm: boolean; provider?: string; model?: string; at: string } | null>
  >;
  aiContextBusinessSummary: string;
  aiContextObjective: string;
  aiContextOpen: boolean;
  setAiContextOpen: (v: boolean) => void;
  aiContextPhase: AiContextPhase;
  aiContextLogs: AiContextLog[];
  setAiContextLogs: Dispatch<SetStateAction<AiContextLog[]>>;
  aiContextCanGenerate: boolean;
  aiContextBusy: boolean;
  aiContextStatusStepIndex: number;
  generateAiContextForCard: () => Promise<void>;

  toggleTag: (tag: string) => void;
  handleSave: () => void;
  handleCreateLabel: () => void;
  handleDeleteLabel: (label: string) => void;

  confirmDeleteOpen: boolean;
  setConfirmDeleteOpen: (v: boolean) => void;

  dialogRef: RefObject<HTMLDivElement | null>;
  closeBtnRef: RefObject<HTMLButtonElement | null>;

  t: (key: string, values?: Record<string, string | number>) => string;
  pushToast: ReturnType<typeof useToast>["pushToast"];
};

const CardModalContext = createContext<CardModalContextValue | null>(null);

export function useCardModal() {
  const ctx = useContext(CardModalContext);
  if (!ctx) throw new Error("useCardModal must be used within CardModalProvider");
  return ctx;
}

export function CardModalProvider({ children, ...props }: CardModalProps & { children: ReactNode }) {
  const {
    card,
    mode,
    buckets,
    priorities,
    progresses,
    filterLabels,
    boardId,
    boardName,
    getHeaders,
    onCreateLabel,
    onDeleteLabel,
    peerCards = [],
    onClose,
    onSave,
    onDelete,
  } = props;

  const [aiContextApplied, setAiContextApplied] = useState<{
    usedLlm: boolean;
    provider?: string;
    model?: string;
    at: string;
  } | null>(null);
  const [aiContextBusinessSummary, setAiContextBusinessSummary] = useState("");
  const [aiContextObjective, setAiContextObjective] = useState("");

  const [id, setId] = useState(card.id);
  const [title, setTitle] = useState(card.title);
  const [descBlocks, setDescBlocks] = useState(() => parseDescriptionToBlocks(card.desc));
  const [bucket, setBucket] = useState(card.bucket);
  const [priority, setPriority] = useState(card.priority);
  const [progress, setProgress] = useState(card.progress);
  const [dueDate, setDueDate] = useState(card.dueDate || "");
  const [blockedBy, setBlockedBy] = useState<string[]>(() =>
    Array.isArray(card.blockedBy) ? [...card.blockedBy] : []
  );
  const [depSearch, setDepSearch] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set(card.tags || []));
  const [newLabel, setNewLabel] = useState("");
  const [links, setLinks] = useState<CardLink[]>(card.links && card.links.length > 0 ? [...card.links] : []);
  const [docRefs, setDocRefs] = useState<CardDocRef[]>(Array.isArray(card.docRefs) ? [...card.docRefs] : []);
  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState<Array<{ id: string; title: string; excerpt?: string }>>([]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const { pushToast } = useToast();
  const t = useTranslations("kanban");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContextPhase, setAiContextPhase] = useState<AiContextPhase>("idle");
  const [aiContextLogs, setAiContextLogs] = useState<AiContextLog[]>([]);
  const aiContextInFlightRef = useRef(false);
  const aiContextAbortControllerRef = useRef<AbortController | null>(null);
  const aiContextRequestSeqRef = useRef(0);

  const descriptionForSave = serializeDescriptionBlocks(descBlocks);

  const selfId = useMemo(() => id.trim() || card.id, [id, card.id]);

  const selectablePeers = useMemo(() => {
    return peerCards.filter((c) => c.id && c.id !== selfId);
  }, [peerCards, selfId]);

  const filteredPeers = useMemo(() => {
    const q = depSearch.trim().toLowerCase();
    if (!q) return selectablePeers;
    return selectablePeers.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [selectablePeers, depSearch]);

  const aiContextCanGenerate = Boolean(title.trim() && descriptionForSave.trim());
  const aiContextBusy =
    aiContextPhase === "preparing" || aiContextPhase === "requesting" || aiContextPhase === "processing";
  const aiContextStatusStepIndex =
    aiContextPhase === "preparing"
      ? 1
      : aiContextPhase === "requesting"
        ? 2
        : aiContextPhase === "processing"
          ? 3
          : aiContextPhase === "done"
            ? 4
            : aiContextPhase === "error"
              ? 0
              : 0;

  useEffect(() => {
    setId(card.id);
    setTitle(card.title);
    setDescBlocks(parseDescriptionToBlocks(card.desc));
    setAiContextApplied(null);
    setAiContextBusinessSummary("");
    setAiContextObjective("");
    setBucket(card.bucket);
    setPriority(card.priority);
    setProgress(card.progress);
    setDueDate(card.dueDate || "");
    setBlockedBy(Array.isArray(card.blockedBy) ? [...card.blockedBy] : []);
    setDepSearch("");
    setTags(new Set(card.tags || []));
    setNewLabel("");
    setLinks(card.links && card.links.length > 0 ? [...card.links] : []);
    setDocRefs(Array.isArray(card.docRefs) ? [...card.docRefs] : []);
    setDocQuery("");
    setDocResults([]);
  }, [card]);

  useEffect(() => {
    const q = docQuery.trim();
    if (!q) {
      setDocResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/search?q=${encodeURIComponent(q)}&limit=8`, { headers: getHeaders() });
        const data = (await res.json().catch(() => ({}))) as {
          docs?: Array<{ id: string; title: string; excerpt?: string }>;
        };
        setDocResults(Array.isArray(data.docs) ? data.docs : []);
      } catch {
        setDocResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [docQuery, getHeaders]);

  const toggleTag = useCallback((tag: string) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      pushToast({ kind: "error", title: t("cardModal.toasts.missingTitle") });
      return;
    }
    const finalId = id.trim() || (mode === "new" ? `NEW-${Date.now()}` : card.id);
    const validIds = new Set(selectablePeers.map((c) => c.id));
    const nextBlocked = blockedBy.filter((bid) => validIds.has(bid));
    onSave({
      ...card,
      id: finalId,
      title: normalizedTitle,
      desc: descriptionForSave.trim() || "Sem descrição.",
      bucket,
      priority,
      progress,
      dueDate: dueDate || null,
      blockedBy: nextBlocked,
      tags: [...tags],
      links: links.filter((l) => {
        const u = l.url.trim();
        if (!u) return false;
        try {
          const parsed = new URL(u);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      }),
      docRefs,
      order: card.order ?? 0,
    });
  }, [
    title,
    pushToast,
    t,
    id,
    mode,
    card,
    selectablePeers,
    blockedBy,
    descriptionForSave,
    bucket,
    priority,
    progress,
    dueDate,
    tags,
    links,
    docRefs,
    onSave,
  ]);

  const handleCreateLabel = useCallback(() => {
    const normalized = newLabel.trim();
    if (!normalized) return;
    onCreateLabel?.(normalized);
    setTags((prev) => new Set([...prev, normalized]));
    setNewLabel("");
  }, [newLabel, onCreateLabel]);

  const handleDeleteLabel = useCallback(
    (label: string) => {
      onDeleteLabel?.(label);
      setTags((prev) => {
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    },
    [onDeleteLabel]
  );

  const generateAiContextForCard = useCallback(async () => {
    const normalizedTitle = title.trim();
    const d = descriptionForSave.trim();
    if (!normalizedTitle || !d) {
      pushToast({
        kind: "error",
        title: t("cardModal.toasts.missingTitleAndDescription"),
      });
      return;
    }
    if (aiContextInFlightRef.current) return;

    const CARD_CONTEXT_TIMEOUT_MS = 60000;
    aiContextInFlightRef.current = true;
    const requestSeq = ++aiContextRequestSeqRef.current;
    const controller = new AbortController();
    aiContextAbortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), CARD_CONTEXT_TIMEOUT_MS);

    const startedAt = new Date().toISOString();
    setAiContextOpen(true);
    setAiContextPhase("preparing");
    setAiContextBusinessSummary("");
    setAiContextObjective("");
    setAiContextApplied(null);
    setAiContextLogs([
      {
        timestamp: startedAt,
        status: "start",
        message: t("cardModal.logs.preparingContext"),
      },
    ]);

    try {
      setAiContextPhase("requesting");
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/card-context`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ title: normalizedTitle, description: d }),
        signal: controller.signal,
      });
      setAiContextPhase("processing");

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        titulo?: string;
        descricao?: string;
        resumoNegocio?: string;
        objetivo?: string;
        generatedWithAI?: boolean;
        provider?: string;
        model?: string;
        llmDebug?: {
          generatedWithAI?: boolean;
          provider?: string;
          model?: string;
          errorKind?: string;
          errorMessage?: string;
        };
      };

      if (!response.ok) {
        const message = String(data?.error || t("cardModal.logs.contextGenerationErrorFallback"));
        setAiContextPhase("error");
        setAiContextLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            status: "error",
            message,
            provider: String(data?.provider || data?.llmDebug?.provider || "").trim() || undefined,
            model: String(data?.model || data?.llmDebug?.model || "").trim() || undefined,
            errorKind: String(data?.llmDebug?.errorKind || "").trim() || undefined,
            errorMessage: String(data?.llmDebug?.errorMessage || "").trim() || undefined,
          },
          ...prev,
        ]);
        pushToast({ kind: "error", title: message });
        return;
      }

      const nextTitle = String(data?.titulo || "").trim();
      const nextDesc = String(data?.descricao || "").trim();

      if (nextTitle) setTitle(nextTitle);
      if (nextDesc) setDescBlocks(parseDescriptionToBlocks(nextDesc));

      const usedLlm =
        Boolean(data?.generatedWithAI) ||
        Boolean(data?.llmDebug?.generatedWithAI) ||
        Boolean((data as { usedLlm?: boolean }).usedLlm);

      const providerName = String(data?.provider || data?.llmDebug?.provider || "").trim() || undefined;
      const modelName = String(data?.model || data?.llmDebug?.model || "").trim() || undefined;

      setAiContextApplied({
        usedLlm,
        provider: providerName,
        model: modelName,
        at: new Date().toISOString(),
      });
      setAiContextBusinessSummary(String(data?.resumoNegocio || "").trim());
      setAiContextObjective(String(data?.objetivo || "").trim());

      setAiContextPhase("done");
      setAiContextLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "success",
          message: usedLlm ? t("cardModal.logs.contextGeneratedByAI") : t("cardModal.logs.contextStructuredFallback"),
          provider: providerName,
          model: modelName,
          resultSnippet: String(data?.objetivo || data?.resumoNegocio || "").trim().slice(0, 180) || undefined,
        },
        ...prev,
      ]);
    } catch (err) {
      const isAbort = err instanceof Error && (err as unknown as { name?: string }).name === "AbortError";
      setAiContextPhase("error");
      setAiContextLogs((prev) => [
        {
          timestamp: new Date().toISOString(),
          status: "error",
          message: isAbort ? t("cardModal.logs.contextTimeout") : t("cardModal.logs.contextError"),
        },
        ...prev,
      ]);
      pushToast({
        kind: isAbort ? "warning" : "error",
        title: isAbort ? t("cardModal.logs.contextTimeout") : t("cardModal.logs.contextError"),
      });
    } finally {
      window.clearTimeout(timeoutId);
      aiContextInFlightRef.current = false;
      if (aiContextAbortControllerRef.current === controller) aiContextAbortControllerRef.current = null;
      if (aiContextRequestSeqRef.current === requestSeq) {
        // keep modal open for result
      }
    }
  }, [title, descriptionForSave, pushToast, t, boardId, getHeaders]);

  const value = useMemo<CardModalContextValue>(
    () => ({
      card,
      mode,
      cardId: card.id,
      boardId,
      boardName,
      buckets,
      priorities,
      progresses,
      filterLabels,
      peerCards,
      getHeaders,
      onClose,
      onSave,
      onDelete,
      onCreateLabel,
      onDeleteLabel,
      id,
      setId,
      title,
      setTitle,
      descBlocks,
      setDescBlocks,
      bucket,
      setBucket,
      priority,
      setPriority,
      progress,
      setProgress,
      dueDate,
      setDueDate,
      blockedBy,
      setBlockedBy,
      depSearch,
      setDepSearch,
      tags,
      setTags,
      newLabel,
      setNewLabel,
      links,
      setLinks,
      docRefs,
      setDocRefs,
      docQuery,
      setDocQuery,
      docResults,
      setDocResults,
      descriptionForSave,
      selfId,
      selectablePeers,
      filteredPeers,
      aiContextApplied,
      setAiContextApplied,
      aiContextBusinessSummary,
      aiContextObjective,
      aiContextOpen,
      setAiContextOpen,
      aiContextPhase,
      aiContextLogs,
      setAiContextLogs,
      aiContextCanGenerate,
      aiContextBusy,
      aiContextStatusStepIndex,
      generateAiContextForCard,
      toggleTag,
      handleSave,
      handleCreateLabel,
      handleDeleteLabel,
      confirmDeleteOpen,
      setConfirmDeleteOpen,
      dialogRef,
      closeBtnRef,
      t,
      pushToast,
    }),
    [
      card,
      mode,
      boardId,
      boardName,
      buckets,
      priorities,
      progresses,
      filterLabels,
      peerCards,
      getHeaders,
      onClose,
      onSave,
      onDelete,
      onCreateLabel,
      onDeleteLabel,
      id,
      title,
      descBlocks,
      bucket,
      priority,
      progress,
      dueDate,
      blockedBy,
      depSearch,
      tags,
      newLabel,
      links,
      docRefs,
      docQuery,
      docResults,
      descriptionForSave,
      selfId,
      selectablePeers,
      filteredPeers,
      aiContextApplied,
      aiContextBusinessSummary,
      aiContextObjective,
      aiContextOpen,
      aiContextPhase,
      aiContextLogs,
      aiContextCanGenerate,
      aiContextBusy,
      aiContextStatusStepIndex,
      generateAiContextForCard,
      toggleTag,
      handleSave,
      handleCreateLabel,
      handleDeleteLabel,
      confirmDeleteOpen,
      t,
      pushToast,
    ]
  );

  return <CardModalContext.Provider value={value}>{children}</CardModalContext.Provider>;
}
