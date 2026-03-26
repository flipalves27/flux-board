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
import type {
  CardData,
  BucketConfig,
  CardLink,
  CardDocRef,
  CardDorReady,
  BoardDefinitionOfDone,
} from "@/app/board/[id]/page";
import type { BoardMethodology } from "@/lib/board-methodology";
import { computeSubtaskProgress, type CardServiceClass, type SubtaskData } from "@/lib/schemas";
import { useBoardStore } from "@/stores/board-store";
import { assertDodAllowsCompleting } from "@/lib/board-scrum";
import { nextBoardCardId } from "@/lib/card-id";
import { useToast } from "@/context/toast-context";
import { useTranslations } from "next-intl";
import {
  createEmptyDescriptionBlocks,
  parseDescriptionToBlocks,
  serializeDescriptionBlocks,
} from "@/components/kanban/description-blocks";

export type SmartEnrichFieldKey = "description" | "priority" | "column" | "dueDate" | "tags" | "direction";

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
  /** Direcionamento do card (mesmos valores do quadro). */
  directions?: string[];
  onClose: () => void;
  onSave: (card: CardData) => void;
  onDelete?: (cardId: string) => void;
  /** Criação manual: abre o modal em edição para um card já existente (duplicatas). */
  onOpenExistingCard?: (cardId: string) => void;
  /** Anexa o rascunho atual ao card indicado e fecha o modal. */
  onMergeDraftIntoExisting?: (targetCardId: string, payload: { title: string; description: string; tags: string[] }) => void;
  definitionOfDone?: BoardDefinitionOfDone;
  /** Colunas consideradas “feito” para validação DoD (resolvido no pai). */
  doneBucketKeys: string[];
  completedProgressLabel?: string;
  /** Scrum vs Kanban — campos condicionais no formulário. */
  boardMethodology?: BoardMethodology;
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
  directions: string[];

  id: string;
  setId: (v: string) => void;
  generatedCardId: string;
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

  direction: string | null;
  setDirection: (v: string | null) => void;
  dorReady: CardDorReady;
  setDorReady: Dispatch<SetStateAction<CardDorReady>>;
  definitionOfDone?: BoardDefinitionOfDone;
  doneBucketKeys: string[];
  completedProgressLabel: string;
  dodChecks: Record<string, boolean>;
  setDodChecks: Dispatch<SetStateAction<Record<string, boolean>>>;
  boardMethodology: BoardMethodology;
  storyPoints: number | null;
  setStoryPoints: Dispatch<SetStateAction<number | null>>;
  serviceClass: CardServiceClass | null;
  setServiceClass: Dispatch<SetStateAction<CardServiceClass | null>>;
  smartEnrichBusy: boolean;
  smartEnrichPending: Set<SmartEnrichFieldKey> | null;
  smartEnrichMeta: {
    usedLlm: boolean;
    priorityRationale: string;
    dueExplanationKey: "similar" | "none";
    similarSampleCount: number;
    llmModel?: string;
    llmProvider?: string;
  } | null;
  acceptSmartEnrichField: (key: SmartEnrichFieldKey) => void;
  rejectSmartEnrichField: (key: SmartEnrichFieldKey) => void;
  dismissSmartEnrichKey: (key: SmartEnrichFieldKey) => void;
  requestSmartEnrich: (opts?: { immediate?: boolean }) => void;

  toggleTag: (tag: string) => void;
  /** Lista atual da aba Subtasks — usada no Salvar (a prop `card` do modal fica desatualizada). */
  syncSubtasksSnapshot: (cardId: string, subtasks: SubtaskData[]) => void;
  handleSave: () => void;
  handleCreateLabel: () => void;
  handleDeleteLabel: (label: string) => void;

  confirmDeleteOpen: boolean;
  setConfirmDeleteOpen: (v: boolean) => void;

  dialogRef: RefObject<HTMLDivElement | null>;
  closeBtnRef: RefObject<HTMLButtonElement | null>;

  openExistingCard?: (cardId: string) => void;
  mergeDraftIntoExistingCard?: (targetCardId: string) => void;

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
    directions: directionsProp,
    onClose,
    onSave,
    onDelete,
    onOpenExistingCard,
    onMergeDraftIntoExisting,
    definitionOfDone,
    doneBucketKeys,
    completedProgressLabel = "Concluída",
    boardMethodology: boardMethodologyProp,
  } = props;
  const boardMethodology: BoardMethodology = boardMethodologyProp ?? "scrum";
  const directions = directionsProp ?? [];

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
  const [direction, setDirection] = useState<string | null>(() =>
    typeof card.direction === "string" && card.direction.trim() ? card.direction.trim().toLowerCase() : null
  );
  const [dorReady, setDorReady] = useState<CardDorReady>(() => ({ ...(card.dorReady ?? {}) }));
  const [dodChecks, setDodChecks] = useState<Record<string, boolean>>({});
  const [storyPoints, setStoryPoints] = useState<number | null>(() =>
    typeof card.storyPoints === "number" && Number.isInteger(card.storyPoints) ? card.storyPoints : null
  );
  const [serviceClass, setServiceClass] = useState<CardServiceClass | null>(() =>
    card.serviceClass != null ? card.serviceClass : null
  );
  const [blockedBy, setBlockedBy] = useState<string[]>(() =>
    Array.isArray(card.blockedBy) ? [...card.blockedBy] : []
  );
  const [depSearch, setDepSearch] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set(card.tags || []));
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const [newLabel, setNewLabel] = useState("");
  const [links, setLinks] = useState<CardLink[]>(card.links && card.links.length > 0 ? [...card.links] : []);
  const [docRefs, setDocRefs] = useState<CardDocRef[]>(Array.isArray(card.docRefs) ? [...card.docRefs] : []);
  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState<Array<{ id: string; title: string; excerpt?: string }>>([]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const subtasksSnapshotRef = useRef<Map<string, SubtaskData[]>>(new Map());

  useEffect(() => {
    subtasksSnapshotRef.current = new Map();
  }, [card.id, mode]);

  const syncSubtasksSnapshot = useCallback((cid: string, list: SubtaskData[]) => {
    if (!cid) return;
    subtasksSnapshotRef.current.set(cid, list);
  }, []);

  const { pushToast } = useToast();
  const t = useTranslations("kanban");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContextPhase, setAiContextPhase] = useState<AiContextPhase>("idle");
  const [aiContextLogs, setAiContextLogs] = useState<AiContextLog[]>([]);
  const aiContextInFlightRef = useRef(false);
  const aiContextAbortControllerRef = useRef<AbortController | null>(null);
  const aiContextRequestSeqRef = useRef(0);

  const [smartEnrichBusy, setSmartEnrichBusy] = useState(false);
  const [smartEnrichPending, setSmartEnrichPending] = useState<Set<SmartEnrichFieldKey> | null>(null);
  const [smartEnrichMeta, setSmartEnrichMeta] = useState<{
    usedLlm: boolean;
    priorityRationale: string;
    dueExplanationKey: "similar" | "none";
    similarSampleCount: number;
    llmModel?: string;
    llmProvider?: string;
  } | null>(null);
  const smartEnrichTimerRef = useRef<number | null>(null);
  const smartEnrichAbortRef = useRef<AbortController | null>(null);
  const smartEnrichSeqRef = useRef(0);
  const smartEnrichSnapshotRef = useRef<{
    descBlocks: Record<string, string>;
    priority: string;
    bucket: string;
    dueDate: string;
    tags: string[];
    direction: string | null;
  } | null>(null);

  const descriptionForSave = serializeDescriptionBlocks(descBlocks);
  const generatedCardId = useMemo(
    () => nextBoardCardId(peerCards.map((c) => c.id)),
    [peerCards]
  );

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

  /**
   * Evita loop infinito (React #185): `card` pode mudar de referência a cada render
   * (Zustand/immer/pai) com o mesmo conteúdo — `[card]` no effect disparava dezenas de setState.
   */
  const cardSyncKey = useMemo(() => {
    const tags = [...(card.tags || [])].sort().join("\u0001");
    const blocked = [...(card.blockedBy || [])].sort().join("\u0001");
    return [
      card.id,
      card.title,
      card.desc,
      card.bucket,
      card.priority,
      card.progress,
      card.dueDate ?? "",
      card.direction ?? "",
      tags,
      blocked,
      JSON.stringify(card.links || []),
      JSON.stringify(card.docRefs || []),
      JSON.stringify(card.dorReady || {}),
      JSON.stringify(card.dodChecks || {}),
      JSON.stringify(definitionOfDone?.items || []),
      String(card.storyPoints ?? ""),
      String(card.serviceClass ?? ""),
    ].join("\u0002");
  }, [
    card.id,
    card.title,
    card.desc,
    card.bucket,
    card.priority,
    card.progress,
    card.dueDate,
    card.direction,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialização estável previne loop Immer (#185)
    JSON.stringify(card.tags),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(card.blockedBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(card.links),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(card.docRefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(card.dorReady),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(card.dodChecks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(definitionOfDone?.items),
    card.storyPoints,
    card.serviceClass,
  ]);

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
    setDirection(
      typeof card.direction === "string" && card.direction.trim() ? card.direction.trim().toLowerCase() : null
    );
    setDorReady({ ...(card.dorReady ?? {}) });
    setStoryPoints(
      typeof card.storyPoints === "number" && Number.isInteger(card.storyPoints) ? card.storyPoints : null
    );
    setServiceClass(card.serviceClass != null ? card.serviceClass : null);
    {
      const nextDod: Record<string, boolean> = {};
      for (const it of definitionOfDone?.items ?? []) {
        if ((card.dodChecks ?? {})[it.id] === true) nextDod[it.id] = true;
      }
      setDodChecks(nextDod);
    }
    setBlockedBy(Array.isArray(card.blockedBy) ? [...card.blockedBy] : []);
    setDepSearch("");
    setTags(new Set(card.tags || []));
    setNewLabel("");
    setLinks(card.links && card.links.length > 0 ? [...card.links] : []);
    setDocRefs(Array.isArray(card.docRefs) ? [...card.docRefs] : []);
    setDocQuery("");
    setDocResults([]);
    setSmartEnrichPending(null);
    setSmartEnrichMeta(null);
    setSmartEnrichBusy(false);
    smartEnrichSnapshotRef.current = null;
    if (smartEnrichTimerRef.current != null) {
      window.clearTimeout(smartEnrichTimerRef.current);
      smartEnrichTimerRef.current = null;
    }
    smartEnrichAbortRef.current?.abort();
    smartEnrichAbortRef.current = null;
  }, [cardSyncKey]); // eslint-disable-line react-hooks/exhaustive-deps -- cardSyncKey deduplica `card` por conteúdo (evita #185)

  const smartEnrichEligible =
    mode === "new" && !descriptionForSave.trim() && title.trim().length >= 2;

  const latestFormRef = useRef({
    descBlocks,
    priority,
    bucket,
    dueDate,
    tags: [] as string[],
    direction: null as string | null,
  });
  latestFormRef.current = {
    descBlocks,
    priority,
    bucket,
    dueDate,
    tags: [...tags],
    direction,
  };

  const enrichEligibleRef = useRef(false);
  enrichEligibleRef.current = smartEnrichEligible;

  const allSmartEnrichKeys = useMemo(
    () =>
      new Set<SmartEnrichFieldKey>(["description", "priority", "column", "dueDate", "tags", "direction"]),
    []
  );

  const resetSmartEnrichSession = useCallback(() => {
    setSmartEnrichPending(null);
    setSmartEnrichMeta(null);
    smartEnrichSnapshotRef.current = null;
  }, []);

  const dismissSmartEnrichKey = useCallback((key: SmartEnrichFieldKey) => {
    setSmartEnrichPending((prev) => {
      if (!prev?.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next.size ? next : null;
    });
  }, []);

  const acceptSmartEnrichField = useCallback(
    (key: SmartEnrichFieldKey) => {
      dismissSmartEnrichKey(key);
    },
    [dismissSmartEnrichKey]
  );

  const rejectSmartEnrichField = useCallback(
    (key: SmartEnrichFieldKey) => {
      const snap = smartEnrichSnapshotRef.current;
      if (snap) {
        if (key === "description") setDescBlocks({ ...snap.descBlocks });
        if (key === "priority") setPriority(snap.priority);
        if (key === "column") setBucket(snap.bucket);
        if (key === "dueDate") setDueDate(snap.dueDate);
        if (key === "tags") setTags(new Set(snap.tags));
        if (key === "direction") setDirection(snap.direction);
      }
      dismissSmartEnrichKey(key);
    },
    [dismissSmartEnrichKey]
  );

  const runSmartEnrich = useCallback(async () => {
    if (!enrichEligibleRef.current) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;

    const f = latestFormRef.current;
    smartEnrichAbortRef.current?.abort();
    const controller = new AbortController();
    smartEnrichAbortRef.current = controller;

    setSmartEnrichBusy(true);
    const seq = ++smartEnrichSeqRef.current;
    smartEnrichSnapshotRef.current = {
      descBlocks: { ...f.descBlocks },
      priority: f.priority,
      bucket: f.bucket,
      dueDate: f.dueDate,
      tags: [...f.tags],
      direction: f.direction,
    };

    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/smart-card-enrich`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: normalizedTitle, knownTags: filterLabels }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        usedLlm?: boolean;
        llmModel?: string;
        llmProvider?: string;
        bucketKey?: string;
        priority?: string;
        priorityRationale?: string;
        tags?: string[];
        description?: string;
        direction?: string | null;
        dueDate?: string | null;
        dueExplanationKey?: "similar" | "none";
        similarSampleCount?: number;
        error?: string;
      };

      if (seq !== smartEnrichSeqRef.current) return;

      if (!res.ok) {
        pushToast({ kind: "error", title: String(data?.error || t("cardModal.smartEnrich.error")) });
        resetSmartEnrichSession();
        return;
      }

      const bucketKeys = new Set(buckets.map((b) => b.key));
      let nextBucket = String(data.bucketKey || "").trim();
      if (!bucketKeys.has(nextBucket)) nextBucket = buckets[0]?.key || f.bucket;

      setBucket(nextBucket);
      setPriority(String(data.priority || "Média"));
      setDescBlocks((prev) => ({
        ...createEmptyDescriptionBlocks(),
        ...prev,
        businessContext: String(data.description || "").trim() || prev.businessContext,
      }));
      setDueDate(String(data.dueDate || "").trim());
      setTags(new Set(Array.isArray(data.tags) ? data.tags.map((x) => String(x).trim()).filter(Boolean) : []));
      const dirRaw = typeof data.direction === "string" ? data.direction.trim() : "";
      const dirLower = dirRaw.toLowerCase();
      const dirOk = directions.some((d) => d.toLowerCase() === dirLower);
      setDirection(dirOk && dirLower ? dirLower : null);

      setSmartEnrichMeta({
        usedLlm: Boolean(data.usedLlm),
        priorityRationale: String(data.priorityRationale || "").trim(),
        dueExplanationKey: data.dueExplanationKey === "similar" ? "similar" : "none",
        similarSampleCount: typeof data.similarSampleCount === "number" ? data.similarSampleCount : 0,
        llmModel: typeof data.llmModel === "string" ? data.llmModel : undefined,
        llmProvider: typeof data.llmProvider === "string" ? data.llmProvider : undefined,
      });
      setSmartEnrichPending(new Set(allSmartEnrichKeys));
      setAiContextApplied(null);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      pushToast({ kind: "error", title: t("cardModal.smartEnrich.error") });
      resetSmartEnrichSession();
    } finally {
      if (seq === smartEnrichSeqRef.current) setSmartEnrichBusy(false);
    }
  }, [
    title,
    boardId,
    getHeaders,
    filterLabels,
    buckets,
    directions,
    pushToast,
    t,
    resetSmartEnrichSession,
    allSmartEnrichKeys,
  ]);

  const runSmartEnrichRef = useRef(runSmartEnrich);
  runSmartEnrichRef.current = runSmartEnrich;

  const requestSmartEnrich = useCallback((opts?: { immediate?: boolean }) => {
    if (!enrichEligibleRef.current) return;
    if (smartEnrichTimerRef.current != null) {
      window.clearTimeout(smartEnrichTimerRef.current);
      smartEnrichTimerRef.current = null;
    }
    if (opts?.immediate) {
      smartEnrichAbortRef.current?.abort();
      void runSmartEnrichRef.current();
      return;
    }
    smartEnrichTimerRef.current = window.setTimeout(() => {
      smartEnrichTimerRef.current = null;
      void runSmartEnrichRef.current();
    }, 800);
  }, []);

  useEffect(() => {
    if (!smartEnrichEligible) {
      if (smartEnrichTimerRef.current != null) {
        window.clearTimeout(smartEnrichTimerRef.current);
        smartEnrichTimerRef.current = null;
      }
      smartEnrichSeqRef.current += 1;
      smartEnrichAbortRef.current?.abort();
      smartEnrichAbortRef.current = null;
      setSmartEnrichBusy(false);
      resetSmartEnrichSession();
      return;
    }
    const timer = window.setTimeout(() => {
      smartEnrichTimerRef.current = null;
      void runSmartEnrichRef.current();
    }, 800);
    smartEnrichTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      smartEnrichSeqRef.current += 1;
      smartEnrichAbortRef.current?.abort();
    };
  }, [smartEnrichEligible, title, resetSmartEnrichSession]);

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
    const finalId = mode === "new" ? generatedCardId : id.trim() || card.id;
    const validIds = new Set(selectablePeers.map((c) => c.id));
    const nextBlocked = blockedBy.filter((bid) => validIds.has(bid));
    const dorPatch: CardDorReady = {};
    if (dorReady.titleOk) dorPatch.titleOk = true;
    if (dorReady.acceptanceOk) dorPatch.acceptanceOk = true;
    if (dorReady.depsOk) dorPatch.depsOk = true;
    if (dorReady.sizedOk) dorPatch.sizedOk = true;
    const dodChecksOut: Record<string, boolean> = {};
    if (definitionOfDone?.enabled && definitionOfDone.items.length) {
      for (const it of definitionOfDone.items) {
        if (dodChecks[it.id] === true) dodChecksOut[it.id] = true;
      }
    }
    const draftForGate: CardData = {
      ...card,
      id: finalId,
      bucket,
      priority,
      progress,
      dodChecks: Object.keys(dodChecksOut).length > 0 ? dodChecksOut : undefined,
    };
    const gate = assertDodAllowsCompleting({
      card: draftForGate,
      nextBucket: bucket,
      nextProgress: progress,
      doneBucketKeys,
      completedProgressLabel,
      def: definitionOfDone,
    });
    if (!gate.ok) {
      pushToast({ kind: "error", title: gate.message });
      return;
    }
    const saved: CardData = {
      ...card,
      id: finalId,
      title: normalizedTitle,
      desc: descriptionForSave.trim() || "Sem descrição.",
      bucket,
      priority,
      progress,
      dueDate: dueDate || null,
      direction,
      blockedBy: nextBlocked,
      ...(Object.keys(dodChecksOut).length > 0 ? { dodChecks: dodChecksOut } : { dodChecks: undefined }),
      ...(Object.keys(dorPatch).length > 0 ? { dorReady: dorPatch } : { dorReady: undefined }),
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
    };
    if (boardMethodology === "scrum") {
      if (storyPoints != null) saved.storyPoints = storyPoints;
      else delete saved.storyPoints;
    }
    if (boardMethodology === "kanban") {
      if (serviceClass != null) saved.serviceClass = serviceClass;
      else delete saved.serviceClass;
    }
    /**
     * Subtasks: a prop `card` é fixa ao abrir o modal; a aba atualiza o store e/ou este snapshot.
     * `onSave` faz merge `{ ...d.cards[i], ...updated }` — sem isto, `updated` reintroduz subtasks antigas.
     */
    const hasSnap = subtasksSnapshotRef.current.has(finalId);
    const snapList = hasSnap ? subtasksSnapshotRef.current.get(finalId)! : undefined;
    const live = useBoardStore.getState().db?.cards.find((c) => c.id === finalId);
    let subtasksToSave: SubtaskData[] | undefined;
    if (hasSnap) {
      subtasksToSave = snapList;
    } else if (live && Array.isArray(live.subtasks)) {
      subtasksToSave = live.subtasks as SubtaskData[];
    } else if (Array.isArray(card.subtasks)) {
      subtasksToSave = card.subtasks as SubtaskData[];
    }
    if (subtasksToSave !== undefined) {
      const clonedSubtasks = JSON.parse(JSON.stringify(subtasksToSave)) as SubtaskData[];
      saved.subtasks = clonedSubtasks;
      if (clonedSubtasks.length > 0) {
        saved.subtaskProgress = computeSubtaskProgress(clonedSubtasks);
      } else {
        saved.subtasks = [];
        delete saved.subtaskProgress;
      }
    }
    onSave(saved);
  }, [
    title,
    pushToast,
    t,
    id,
    mode,
    generatedCardId,
    card,
    selectablePeers,
    blockedBy,
    descriptionForSave,
    bucket,
    priority,
    progress,
    dueDate,
    direction,
    dorReady,
    dodChecks,
    definitionOfDone,
    doneBucketKeys,
    completedProgressLabel,
    tags,
    links,
    docRefs,
    onSave,
    boardMethodology,
    storyPoints,
    serviceClass,
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

  const openExistingCard = useCallback(
    (cardId: string) => {
      onOpenExistingCard?.(cardId);
    },
    [onOpenExistingCard]
  );

  const mergeDraftIntoExistingCard = useCallback(
    (targetCardId: string) => {
      if (!onMergeDraftIntoExisting) return;
      onMergeDraftIntoExisting(targetCardId, {
        title: title.trim(),
        description: descriptionForSave.trim(),
        tags: [...tagsRef.current],
      });
    },
    [onMergeDraftIntoExisting, title, descriptionForSave]
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
      directions,
      id,
      setId,
      generatedCardId,
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
      direction,
      setDirection,
      dorReady,
      setDorReady,
      definitionOfDone,
      doneBucketKeys,
      completedProgressLabel,
      dodChecks,
      setDodChecks,
      boardMethodology,
      storyPoints,
      setStoryPoints,
      serviceClass,
      setServiceClass,
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
      smartEnrichBusy,
      smartEnrichPending,
      smartEnrichMeta,
      acceptSmartEnrichField,
      rejectSmartEnrichField,
      dismissSmartEnrichKey,
      requestSmartEnrich,
      toggleTag,
      syncSubtasksSnapshot,
      handleSave,
      handleCreateLabel,
      handleDeleteLabel,
      confirmDeleteOpen,
      setConfirmDeleteOpen,
      dialogRef,
      closeBtnRef,
      openExistingCard: onOpenExistingCard ? openExistingCard : undefined,
      mergeDraftIntoExistingCard: onMergeDraftIntoExisting ? mergeDraftIntoExistingCard : undefined,
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
      directions,
      peerCards,
      getHeaders,
      onClose,
      onSave,
      onDelete,
      onCreateLabel,
      onDeleteLabel,
      id,
      generatedCardId,
      title,
      descBlocks,
      bucket,
      priority,
      progress,
      dueDate,
      direction,
      dorReady,
      definitionOfDone,
      doneBucketKeys,
      completedProgressLabel,
      dodChecks,
      boardMethodology,
      storyPoints,
      serviceClass,
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
      smartEnrichBusy,
      smartEnrichPending,
      smartEnrichMeta,
      acceptSmartEnrichField,
      rejectSmartEnrichField,
      dismissSmartEnrichKey,
      requestSmartEnrich,
      toggleTag,
      syncSubtasksSnapshot,
      handleSave,
      handleCreateLabel,
      handleDeleteLabel,
      confirmDeleteOpen,
      onOpenExistingCard,
      onMergeDraftIntoExisting,
      openExistingCard,
      mergeDraftIntoExistingCard,
      t,
      pushToast,
    ]
  );

  return <CardModalContext.Provider value={value}>{children}</CardModalContext.Provider>;
}
